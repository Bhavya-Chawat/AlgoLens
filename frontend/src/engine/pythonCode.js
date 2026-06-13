// ============================================================
// PYTHON TRACER — runs inside Pyodide
//
// Defines `algolens_run(user_code, test_input)` which:
//  1. Compiles + defines user functions (no trace)
//  2. Parses testcase → builds call expression
//  3. Executes with sys.settrace → captures every line/call/return/exception
//  4. Runs a bug detection pass
//  5. Returns JSON string of { frames, bugs, error, result }
// ============================================================

export const PYTHON_TRACER = `
import sys as _sys
import json as _json
import ast as _ast

def algolens_run(user_code, test_input):
    frames   = []
    cs       = []          # call stack
    lp       = {}          # local-prev per frame id

    src = user_code.split("\\n")

    def src_line(n):
        try:
            return src[n - 1].strip()
        except Exception:
            return ""

    # ── Event type classifier ─────────────────────────────────
    def classify(s):
        if not s or s.startswith("#"):
            return None
        if s.startswith(("for ", "while ")):
            return "loop_start"
        if s.startswith(("if ", "elif ")):
            return "branch"
        if s.startswith("return "):
            return "return"
        if s.startswith("raise "):
            return "exception"
        # comparison check before assignment (= can appear in ==)
        for op in ("==", "!=", "<=", ">=", " in ", " not in", " is "):
            if op in s:
                return "comparison"
        if "=" in s:
            return "assignment"
        return "line"

    # ── Value serialiser ──────────────────────────────────────
    def ser(v, d=0):
        if v is None:
            return None
        if isinstance(v, bool):
            return bool(v)
        if isinstance(v, int):
            return v
        if isinstance(v, float):
            return v if abs(v) < 1e15 else str(v)
        if isinstance(v, str):
            return v if len(v) <= 200 else v[:200] + "\\u2026"
        if d >= 2:
            r = repr(v)
            return (r[:80] + "\\u2026") if len(r) > 80 else r
        if isinstance(v, (list, tuple)):
            items = [ser(x, d + 1) for x in list(v)[:60]]
            if len(v) > 60:
                items.append(f"+{len(v) - 60} more")
            return items
        if isinstance(v, dict):
            out = {}
            for i, (k, vv) in enumerate(v.items()):
                if i >= 25:
                    break
                try:
                    out[str(k)] = ser(vv, d + 1)
                except Exception:
                    pass
            return out
        if isinstance(v, (set, frozenset)):
            try:
                lst = sorted(v, key=str)[:40]
            except Exception:
                lst = list(v)[:40]
            return [ser(x, d + 1) for x in lst]
        try:
            r = repr(v)
            return (r[:120] + "\\u2026") if len(r) > 120 else r
        except Exception:
            return "<obj>"

    def tname(v):
        if v is None: return "NoneType"
        if isinstance(v, bool): return "bool"
        if isinstance(v, int): return "int"
        if isinstance(v, float): return "float"
        if isinstance(v, str): return "str"
        if isinstance(v, list): return "list"
        if isinstance(v, tuple): return "tuple"
        if isinstance(v, dict): return "dict"
        if isinstance(v, (set, frozenset)): return "set"
        return type(v).__name__

    SKIP = frozenset(["self", "cls", "__doc__", "__module__", "__qualname__"])
    CALLABLE_TYPES = frozenset(["function", "method", "builtin_function_or_method",
                                 "method-wrapper", "classmethod", "staticmethod"])

    def cap(f_locals, prev):
        out = {}
        for k, v in f_locals.items():
            if k.startswith("_") or k in SKIP:
                continue
            vtype = type(v).__name__
            if vtype in CALLABLE_TYPES or isinstance(v, type):
                continue
            try:
                sv = ser(v)
                pv = prev.get(k)
                changed   = pv is not None and pv != sv
                new_var   = pv is None and len(prev) > 0
                out[k] = {
                    "value":           sv,
                    "type":            tname(v),
                    "changedThisFrame": changed or new_var,
                    "prevValue":       pv if changed else None,
                }
            except Exception:
                pass
        return out

    # ── sys.settrace callback ─────────────────────────────────
    USER_FILE = "<user_code>"

    def tracer(frame, event, arg):
        if len(frames) >= 10000:
            _sys.settrace(None)
            return None
        if frame.f_code.co_filename != USER_FILE:
            return tracer

        lineno = frame.f_lineno
        fn     = frame.f_code.co_name
        lt     = src_line(lineno)
        fid    = id(frame)
        prev   = lp.get(fid, {})

        if event == "call":
            cs.append({"name": fn, "line": lineno, "depth": len(cs)})
            loc = cap(frame.f_locals, {})
            arg_parts = []
            for k, v in frame.f_locals.items():
                if not k.startswith("_") and k not in SKIP:
                    try:
                        arg_parts.append(f"{k}={repr(v)[:40]}")
                    except Exception:
                        pass
            frames.append({
                "id": len(frames),
                "line": lineno,
                "eventType": "function_call",
                "variables": loc,
                "callStack": [dict(c) for c in cs],
                "description": f"{fn}({', '.join(arg_parts[:6])})",
                "isBugFrame": False,
            })
            return tracer

        if event == "line":
            loc = cap(frame.f_locals, prev)
            lp[fid] = {k: v["value"] for k, v in loc.items()}
            et = classify(lt)
            if et is None:
                return tracer
            frames.append({
                "id": len(frames),
                "line": lineno,
                "eventType": et,
                "variables": loc,
                "callStack": [dict(c) for c in cs],
                "description": lt,
                "isBugFrame": False,
            })
            return tracer

        if event == "return":
            loc = cap(frame.f_locals, prev)
            try:
                ret_str = repr(arg)[:120]
            except Exception:
                ret_str = str(arg)[:120]
            frames.append({
                "id": len(frames),
                "line": lineno,
                "eventType": "return",
                "variables": loc,
                "callStack": [dict(c) for c in cs],
                "description": f"\\u21a9 return {ret_str}",
                "isBugFrame": False,
            })
            if cs and cs[-1]["name"] == fn:
                cs.pop()
            lp.pop(fid, None)
            return tracer

        if event == "exception":
            exc_type, exc_val, _ = arg
            loc = cap(frame.f_locals, prev)
            frames.append({
                "id": len(frames),
                "line": lineno,
                "eventType": "exception",
                "variables": loc,
                "callStack": [dict(c) for c in cs],
                "description": f"\\u26a0 {exc_type.__name__}: {str(exc_val)[:200]}",
                "isBugFrame": True,
            })
            return tracer

        return tracer

    # ── Analyse user code structure ───────────────────────────
    main_func    = None
    func_params  = []
    is_class     = False
    class_name   = None
    class_method = None

    try:
        tree = _ast.parse(user_code)
        for node in tree.body:
            if isinstance(node, _ast.ClassDef):
                is_class   = True
                class_name = node.name
                for item in node.body:
                    if isinstance(item, _ast.FunctionDef) and item.name not in ("__init__",):
                        class_method = item.name
                        func_params  = [a.arg for a in item.args.args
                                        if a.arg not in ("self", "cls")]
                        break
                break
            if isinstance(node, _ast.FunctionDef):
                main_func   = node.name
                func_params = [a.arg for a in node.args.args
                               if a.arg not in ("self", "cls")]
                break
    except Exception:
        pass

    # ── Compile + define user code (no trace) ─────────────────
    exec_ns = {"__builtins__": __builtins__}
    try:
        exec(compile(user_code, USER_FILE, "exec"), exec_ns)
    except SyntaxError as e:
        return _json.dumps({
            "frames": [], "bugs": [],
            "error": f"SyntaxError: {e.msg} (line {e.lineno})",
            "result": None,
        })
    except Exception as e:
        return _json.dumps({
            "frames": [], "bugs": [],
            "error": f"{type(e).__name__}: {e}",
            "result": None,
        })

    # ── Parse test input ──────────────────────────────────────
    test_ns  = {}
    test_str = (test_input or "").strip()

    if test_str:
        try:
            exec(compile(test_str, "<testcase>", "exec"), test_ns)
        except Exception:
            test_ns = {}

    # ── Build call expression ─────────────────────────────────
    effective = class_method or main_func
    call_expr = None

    if is_class and effective and class_name and class_name in exec_ns:
        exec_ns["__sol__"] = exec_ns[class_name]()
        call_target = f"__sol__.{effective}"
    elif effective:
        call_target = effective
    else:
        call_target = None

    if call_target:
        if func_params and all(p in test_ns for p in func_params):
            args = ", ".join(repr(test_ns[p]) for p in func_params)
            call_expr = f"__result__ = {call_target}({args})"
        elif func_params and test_ns:
            vals = [v for k, v in test_ns.items() if not k.startswith("_")]
            args = ", ".join(repr(v) for v in vals[:max(len(func_params), 1)])
            call_expr = f"__result__ = {call_target}({args})"
        elif test_str and not test_ns:
            if "(" in test_str and test_str.rstrip().endswith(")"):
                call_expr = f"__result__ = {test_str}"
            else:
                try:
                    val = eval(test_str, {"__builtins__": {}})
                    call_expr = f"__result__ = {call_target}({repr(val)})"
                except Exception:
                    call_expr = f"__result__ = {call_target}()"
        else:
            call_expr = f"__result__ = {call_target}()"

    if not call_expr:
        return _json.dumps({
            "frames": [], "bugs": [],
            "error": "Could not determine how to call your function. Check your function definition and testcase format.",
            "result": None,
        })

    # Inject test vars into exec namespace
    for k, v in test_ns.items():
        if not k.startswith("_"):
            exec_ns[k] = v
    exec_ns["__result__"] = None

    # ── Execute with tracing ──────────────────────────────────
    err_msg = None
    try:
        cc = compile(call_expr, "<call_entry>", "exec")
        _sys.settrace(tracer)
        exec(cc, exec_ns)
    except Exception as e:
        err_msg = f"{type(e).__name__}: {str(e)[:400]}"
        frames.append({
            "id": len(frames),
            "line": 1,
            "eventType": "exception",
            "variables": {},
            "callStack": [dict(c) for c in cs],
            "description": f"\\u26a0 Runtime Error: {err_msg}",
            "isBugFrame": True,
        })
    finally:
        _sys.settrace(None)

    # ── Bug detection pass ────────────────────────────────────
    bugs = []

    if len(frames) >= 10000:
        bugs.append({
            "frameId": 9999,
            "type": "infinite_loop",
            "description": "Execution exceeded 10,000 steps. Likely an infinite loop.",
            "severity": "error",
        })

    for f in frames:
        if f.get("isBugFrame") and f["eventType"] == "exception":
            d = f["description"]
            btype = "runtime_error"
            if "IndexError" in d:   btype = "index_out_of_bounds"
            elif "KeyError" in d:   btype = "index_out_of_bounds"
            elif "NameError" in d or "UnboundLocalError" in d: btype = "uninitialized"
            elif "RecursionError" in d: btype = "infinite_loop"
            elif "TypeError" in d:  btype = "wrong_return"
            bugs.append({
                "frameId": f["id"],
                "type": btype,
                "description": d.replace("\\u26a0 ", ""),
                "severity": "error",
            })

    max_depth = max((len(f["callStack"]) for f in frames), default=0)
    if max_depth > 50 and not any(b["type"] == "infinite_loop" for b in bugs):
        for f in frames:
            if len(f["callStack"]) >= 50:
                bugs.append({
                    "frameId": f["id"],
                    "type": "infinite_loop",
                    "description": f"Call stack depth reached {max_depth}. Possible infinite recursion.",
                    "severity": "warning",
                })
                break

    try:
        result_val = ser(exec_ns.get("__result__"))
    except Exception:
        result_val = None

    return _json.dumps({
        "frames": frames,
        "bugs": bugs,
        "error": err_msg,
        "result": result_val,
    }, default=str)
`;
