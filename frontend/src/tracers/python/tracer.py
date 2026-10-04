"""AlgoLens Python tracer.

Runs inside Pyodide (in the browser) and under plain CPython (in the test-suite).
It executes the user's code under ``sys.settrace`` and returns an "AlgoTrace v1" JSON
document: a flat list of steps. ``core/frameBuilder.js`` turns those steps into UI frames.
Nothing here is simulated - every value was produced by really running the code.

Public entry points (called from JavaScript):
    algolens_run(job_json)      -> json string (AlgoTrace)
    algolens_inspect(code)      -> json string (entry-point candidates)

Step kinds (short keys keep the payload small):
    call   a new frame was entered        k, l(line), f(frame id), n(name), v(args), m(module frame)
    line   about to execute a line         k, l, f, v(changed vars), d(deleted vars), o(stdout length)
    ret    the frame is returning          k, l, f, v, r([type, value])
    exc    an exception was raised         k, l, f, x(text), e(exception id)
Variables are ``{name: [type, value]}``; only variables that changed since the previous
step *of the same frame* are included.
"""
import ast
import builtins
import io
import json
import sys
import types

USER_FILE = "<solution>"
HELPER_FILE = "<algolens-helpers>"

MAX_ITEMS = 60      # list/tuple/set elements kept per value
MAX_KEYS = 40       # dict keys kept per value
MAX_DEPTH = 4       # nesting depth for containers
MAX_NODES = 80      # nodes kept per linked list / tree variable
MAX_STR = 200
MAX_INT = 2 ** 53   # beyond this JavaScript would silently lose precision
COMPREHENSION_FRAMES = ("<listcomp>", "<dictcomp>", "<setcomp>", "<genexpr>")


class StepLimit(BaseException):
    """Stops a runaway program. BaseException so a user's `except Exception` cannot swallow it."""


# ── LeetCode conveniences ───────────────────────────────────────────────────────────────────
HELPER_SOURCE = '''
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right
'''

# LeetCode pre-imports these, so pasted solutions rely on them without importing.
PRELUDE_SOURCE = '''
from typing import *
import collections, heapq, bisect, math, itertools, functools, string, re, random, operator
from collections import deque, defaultdict, Counter, OrderedDict
from heapq import heappush, heappop, heapify, heappushpop, heapreplace, nlargest, nsmallest
from bisect import bisect_left, bisect_right, insort
from math import inf, gcd, sqrt, floor, ceil
from functools import lru_cache, cache, reduce
from itertools import accumulate, permutations, combinations, product, zip_longest
'''


def list_to_tree(values):
    """LeetCode level-order list -> TreeNode graph."""
    if not values:
        return None
    nodes = [None if v is None else TreeNode_(v) for v in values]
    kids = nodes[::-1]
    root = kids.pop()
    for node in nodes:
        if node is not None:
            if kids:
                node.left = kids.pop()
            if kids:
                node.right = kids.pop()
    return root


def list_to_linked(values):
    head = None
    for v in reversed(values or []):
        head = ListNode_(v, head)
    return head


def tree_to_list(root):
    out, queue = [], [root]
    while queue:
        node = queue.pop(0)
        if node is None:
            out.append(None)
            continue
        out.append(node.val)
        queue.append(node.left)
        queue.append(node.right)
    while out and out[-1] is None:
        out.pop()
    return out


def linked_to_list(head):
    out, seen = [], set()
    while head is not None and id(head) not in seen and len(out) < 10000:
        seen.add(id(head))
        out.append(head.val)
        head = head.next
    return out


# The helper classes live in their own file name so the tracer never records their frames.
_helper_ns = {}
exec(compile(HELPER_SOURCE, HELPER_FILE, "exec"), _helper_ns)
ListNode_ = _helper_ns["ListNode"]
TreeNode_ = _helper_ns["TreeNode"]


def convert_arg(value, type_text):
    """Turn LeetCode's JSON-ish inputs into the objects the solution expects."""
    t = type_text or ""
    if "TreeNode" in t:
        many = t.startswith(("List[", "list[")) or t.endswith("[]")
        if many and isinstance(value, list):
            return [list_to_tree(v) if isinstance(v, list) else v for v in value]
        if isinstance(value, list):
            return list_to_tree(value)
    if "ListNode" in t:
        many = t.startswith(("List[", "list[")) or t.endswith("[]")
        if many and isinstance(value, list):
            return [list_to_linked(v) if isinstance(v, list) else v for v in value]
        if isinstance(value, list):
            return list_to_linked(value)
    return value


def plain_result(value):
    """Result in LeetCode's own notation (so it can be compared with the expected output)."""
    try:
        if hasattr(value, "left") or hasattr(value, "right"):
            return tree_to_list(value)
        if hasattr(value, "next") and hasattr(value, "val"):
            return linked_to_list(value)
    except Exception:
        pass
    return None


# ── Value serialisation ─────────────────────────────────────────────────────────────────────
def type_name(v):
    if v is None:
        return "NoneType"
    if isinstance(v, bool):
        return "bool"
    if isinstance(v, int):
        return "int"
    if isinstance(v, float):
        return "float"
    if isinstance(v, str):
        return "str"
    if isinstance(v, list):
        return "list"
    if isinstance(v, tuple):
        return "tuple"
    if isinstance(v, dict):
        return "dict"
    if isinstance(v, (set, frozenset)):
        return "set"
    return type(v).__name__


def points_at_own_class(v, d):
    """An object holding objects of its own class (a trie node's `children`, a graph node's `neighbors`)."""
    cls = type(v)
    for x in d.values():
        if type(x) is cls:
            return True
        if isinstance(x, (list, tuple)) and any(type(i) is cls for i in x[:8]):
            return True
        if isinstance(x, dict) and any(type(i) is cls for i in list(x.values())[:8]):
            return True
    return False


NODE_CLASSES = set()  # once one instance proves a class is a node (has children / neighbours), all of them are
LINK_FIELDS = ("children", "neighbors", "neighbours", "kids")


def is_node(v):
    d = getattr(v, "__dict__", None)
    if d is None or isinstance(v, (type, types.ModuleType)):
        return False
    if "val" in d and ("next" in d or "left" in d or "right" in d):
        return True
    if type(v) in NODE_CLASSES:
        return True
    # a leaf has an empty `children`: the field itself is the evidence
    if any(isinstance(d.get(f), (list, tuple, dict)) for f in LINK_FIELDS) or points_at_own_class(v, d):
        NODE_CLASSES.add(type(v))
        return True
    return False


class Serializer:
    """JSON-safe, size-bounded view of a value. Nodes keep their shape ({val,left,right,next})
    because the visualisers draw trees and linked lists straight from that."""

    def __init__(self):
        self.ids = {}
        self.keep = []     # keeps objects alive so id() values stay unique for the whole run
        self.path = set()

    def oid(self, obj):
        key = id(obj)
        if key not in self.ids:
            self.ids[key] = len(self.ids) + 1
            self.keep.append(obj)
        return self.ids[key]

    def short(self, v, limit=80):
        try:
            r = repr(v)
        except Exception:
            return "<unprintable>"
        return r if len(r) <= limit else r[:limit] + "…"

    def ser(self, v, depth=0):
        if v is None or isinstance(v, bool):
            return v
        if isinstance(v, int):
            return v if -MAX_INT <= v <= MAX_INT else str(v)
        if isinstance(v, float):
            if v != v:
                return "NaN"
            if v in (float("inf"), float("-inf")):
                return "Infinity" if v > 0 else "-Infinity"
            return v
        if isinstance(v, str):
            return v if len(v) <= MAX_STR else v[:MAX_STR] + "…"
        if is_node(v):
            return self.node(v, [MAX_NODES])
        if depth >= MAX_DEPTH:
            return self.short(v)
        if isinstance(v, (list, tuple)) or type(v).__name__ == "deque":
            items = [self.ser(x, depth + 1) for x in list(v)[:MAX_ITEMS]]
            if len(v) > MAX_ITEMS:
                items.append("+%d more" % (len(v) - MAX_ITEMS))
            return items
        if isinstance(v, dict):
            out = {}
            for i, (k, x) in enumerate(v.items()):
                if i >= MAX_KEYS:
                    out["…"] = "+%d more" % (len(v) - MAX_KEYS)
                    break
                out[str(k)] = self.ser(x, depth + 1)
            return out
        if isinstance(v, (set, frozenset)):
            try:
                items = sorted(v, key=lambda x: (type(x).__name__, x))
            except Exception:
                items = list(v)
            out = [self.ser(x, depth + 1) for x in items[:MAX_ITEMS]]
            if len(v) > MAX_ITEMS:
                out.append("+%d more" % (len(v) - MAX_ITEMS))
            return out
        d = getattr(v, "__dict__", None)
        if d is not None and not isinstance(v, (type, types.ModuleType)):
            out = {"__class__": type(v).__name__, "__id__": self.oid(v)}
            for i, (k, x) in enumerate(d.items()):
                if i >= 20:
                    break
                if not str(k).startswith("_"):
                    out[str(k)] = self.ser(x, depth + 1)
            return out
        return self.short(v)

    def node(self, v, budget):
        key = id(v)
        if key in self.path:
            return {"__cycle__": self.oid(v)}
        if budget[0] <= 0:
            return "…"
        budget[0] -= 1
        self.path.add(key)
        try:
            d = v.__dict__
            out = {"__class__": type(v).__name__, "__id__": self.oid(v)}
            for name in ("val", "left", "right", "next"):
                if name in d:
                    out[name] = self.child(d[name], budget)
            # a node with no left/right/next is held together by its children (trie, n-ary tree): those are
            # structure and are embedded; elsewhere other node attributes (random pointer, neighbours) are references
            structural = not ("left" in d or "right" in d or "next" in d)
            for name, x in d.items():
                if name in out or str(name).startswith("_"):
                    continue
                if is_node(x):
                    out[name] = {"__ref__": self.oid(x)}
                elif isinstance(x, (list, tuple)) and any(is_node(i) for i in x):
                    if structural:
                        out[name] = [self.child(i, budget) if is_node(i) else self.ser(i, 1) for i in x[:MAX_ITEMS]]
                    else:
                        out[name] = [{"__ref__": self.oid(i)} if is_node(i) else self.ser(i, MAX_DEPTH - 1) for i in x[:MAX_ITEMS]]
                elif structural and isinstance(x, dict) and any(is_node(i) for i in x.values()):
                    out[name] = {str(k): (self.child(i, budget) if is_node(i) else self.ser(i, 1)) for k, i in list(x.items())[:MAX_KEYS]}
                else:
                    out[name] = self.ser(x, MAX_DEPTH - 1)
            return out
        finally:
            self.path.discard(key)

    def child(self, x, budget):
        if x is None:
            return None
        return self.node(x, budget) if is_node(x) else self.ser(x, 1)


# ── Variable capture ────────────────────────────────────────────────────────────────────────
_SKIP_TYPES = (types.ModuleType, types.FunctionType, types.BuiltinFunctionType, types.MethodType, type)


class FrameState:
    __slots__ = ("fid", "last", "pending_exc")

    def __init__(self, fid):
        self.fid = fid
        self.last = {}
        self.pending_exc = False   # an exception was raised and no line has run since


class Tracer:
    def __init__(self, limit, prelude, stdout):
        self.limit = limit
        self.prelude = prelude
        self.stdout = stdout
        self.steps = []
        self.frames = {}
        self.next_fid = 1
        self.ser = Serializer()
        self.truncated = False
        self.exc_ids = {}
        self.exc_keep = []
        self.last_out = 0
        self.global_names = {}
        self.comp_transparent = sys.version_info < (3, 12)  # 3.12+ inlines comprehensions

    # -- plumbing ---------------------------------------------------------------------------
    def emit(self, step):
        if len(self.steps) >= self.limit:
            self.truncated = True
            sys.settrace(None)
            raise StepLimit()
        out = self.stdout.length()
        if out != self.last_out:
            step["o"] = out
            self.last_out = out
        self.steps.append(step)

    def is_data(self, name, value):
        if name.startswith("_") or isinstance(value, _SKIP_TYPES):
            return False
        return not (name in self.prelude and self.prelude[name] is value)

    def visible(self, frame):
        """(name, value) pairs worth showing: locals, fields of `self`, and globals the code touches."""
        locs = frame.f_locals
        out = {}
        for name, value in list(locs.items()):
            if name in ("self", "cls"):
                continue
            if self.is_data(name, value):
                out[name] = value
        owner = locs.get("self")
        d = getattr(owner, "__dict__", None)
        if d is not None and not isinstance(owner, type):
            for name, value in list(d.items()):
                if self.is_data(name, value):
                    out[name if name not in out else "self." + name] = value
        code = frame.f_code
        if code.co_name != "<module>":
            names = self.global_names.get(code)
            if names is None:
                names = [n for n in code.co_names if n in frame.f_globals]
                self.global_names[code] = names
            for name in names:
                if name not in out and name in frame.f_globals and self.is_data(name, frame.f_globals[name]):
                    out[name] = frame.f_globals[name]
        return out

    def snapshot(self, frame, state):
        """Diff of the frame's variables against the previous step of the same frame."""
        current, changed = {}, {}
        for name, value in self.visible(frame).items():
            t = type_name(value)
            s = self.ser.ser(value)
            current[name] = (t, s)
            before = state.last.get(name)
            if before is None or before[0] != t or before[1] != s:
                changed[name] = [t, s]
        deleted = [n for n in state.last if n not in current]
        state.last = current
        return changed, deleted

    # -- sys.settrace callbacks ---------------------------------------------------------------
    def on_call(self, frame, event, arg):
        code = frame.f_code
        if code.co_filename != USER_FILE:
            return None                       # never trace library code (also makes it fast)
        if self.comp_transparent and code.co_name in COMPREHENSION_FRAMES:
            return None
        state = FrameState(self.next_fid)
        self.next_fid += 1
        self.frames[id(frame)] = state
        changed, _ = self.snapshot(frame, state)
        step = {"k": "call", "l": frame.f_lineno, "f": state.fid, "n": code.co_name}
        if changed:
            step["v"] = changed
        if code.co_name == "<module>":
            step["m"] = 1
        self.emit(step)
        return self.on_event

    def on_event(self, frame, event, arg):
        state = self.frames.get(id(frame))
        if state is None:
            return self.on_event
        if event == "line":
            state.pending_exc = False
            changed, deleted = self.snapshot(frame, state)
            step = {"k": "line", "l": frame.f_lineno, "f": state.fid}
            if changed:
                step["v"] = changed
            if deleted:
                step["d"] = deleted
            self.emit(step)
        elif event == "return":
            changed, deleted = self.snapshot(frame, state)
            step = {"k": "ret", "l": frame.f_lineno, "f": state.fid, "r": [type_name(arg), self.ser.ser(arg)]}
            if changed:
                step["v"] = changed
            if deleted:
                step["d"] = deleted
            if state.pending_exc:
                step["u"] = 1                 # unwinding because of an exception, not a real return
            self.frames.pop(id(frame), None)
            self.emit(step)
        elif event == "exception":
            exc_type, exc_value, _tb = arg
            state.pending_exc = True
            key = id(exc_value)
            if key not in self.exc_ids:           # the same exception re-fires in every frame it unwinds
                self.exc_ids[key] = len(self.exc_ids) + 1
                self.exc_keep.append(exc_value)
                text = "%s: %s" % (exc_type.__name__, exc_value)
                self.emit({"k": "exc", "l": frame.f_lineno, "f": state.fid, "x": text[:300], "e": self.exc_ids[key]})
        return self.on_event


class OutputCapture(io.TextIOBase):
    """stdout replacement with a hard size cap (a print-in-a-loop must not eat the browser)."""

    def __init__(self, cap):
        self.cap = cap
        self.parts = []
        self.size = 0
        self.clipped = False

    def writable(self):
        return True

    def write(self, text):
        text = str(text)
        room = self.cap - self.size
        if room <= 0:
            self.clipped = True
            return len(text)
        if len(text) > room:
            text, self.clipped = text[:room], True
        self.parts.append(text)
        self.size += len(text)
        return len(text)

    def length(self):
        return self.size

    def getvalue(self):
        return "".join(self.parts)


# ── Entry-point discovery ───────────────────────────────────────────────────────────────────
def describe_function(node, class_name=None):
    params = []
    args = node.args
    positional = list(args.posonlyargs) + list(args.args)
    defaults = [None] * (len(positional) - len(args.defaults)) + list(args.defaults)
    for arg, default in zip(positional, defaults):
        if arg.arg in ("self", "cls"):
            continue
        params.append({
            "name": arg.arg,
            "type": ast.unparse(arg.annotation) if arg.annotation is not None else None,
            "hasDefault": default is not None,
        })
    return {
        "name": node.name,
        "className": class_name,
        "params": params,
        "returnType": ast.unparse(node.returns) if node.returns is not None else None,
        "line": node.lineno,
    }


def find_entries(tree):
    entries, called = [], set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for sub in ast.walk(node):
                if isinstance(sub, ast.Call):
                    f = sub.func
                    if isinstance(f, ast.Name):
                        called.add(f.id)
                    elif isinstance(f, ast.Attribute):
                        called.add(f.attr)
    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            for item in node.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)) and not item.name.startswith("__"):
                    entries.append(describe_function(item, node.name))
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            entries.append(describe_function(node))
    for e in entries:
        e["isHelper"] = e["name"] in called
    # Solution-class methods first (LeetCode), then functions nobody else calls, then helpers.
    entries.sort(key=lambda e: (e["isHelper"], e["className"] != "Solution"))
    return entries


def script_like(tree):
    """True when the module itself does work (calls your functions, prints, loops) rather than
    only defining things. An incidental `memo = defaultdict(int)` does not make it a script."""
    defined = {n.name for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))}

    def does_work(call):
        func = call.func
        if isinstance(func, ast.Name) and func.id in ("print", "input", "exit", "quit"):
            return True
        return any(isinstance(n, ast.Name) and n.id in defined for n in ast.walk(func))

    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Import, ast.ImportFrom, ast.Pass)):
            continue
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant):
            continue                          # docstring
        if isinstance(node, (ast.If, ast.For, ast.While, ast.With, ast.Try)):
            return True
        if any(isinstance(sub, ast.Call) and does_work(sub) for sub in ast.walk(node)):
            return True
    return False


def algolens_inspect(code):
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return json.dumps({"error": {"type": "SyntaxError", "message": e.msg, "line": e.lineno}})
    return json.dumps({"entries": find_entries(tree), "scriptLike": script_like(tree)})


# ── Runner ──────────────────────────────────────────────────────────────────────────────────
def _fail(kind, message, line=None):
    return {"type": kind, "message": message, "line": line}


def _build_namespace():
    ns = {"__name__": "__main__", "__builtins__": builtins}
    exec(compile(PRELUDE_SOURCE, HELPER_FILE, "exec"), ns)
    ns["ListNode"], ns["TreeNode"] = ListNode_, TreeNode_
    return ns


def _pick_entry(entries, wanted):
    if wanted and wanted.get("name"):
        for e in entries:
            if e["name"] == wanted["name"] and (not wanted.get("className") or e["className"] == wanted["className"]):
                return e
        return None
    return entries[0] if entries else None


def _resolve_args(entry, supplied, param_types):
    args = []
    names = [p["name"] for p in entry["params"]]
    positional = list(supplied.values()) if len(supplied) == len(names) and not set(names) <= set(supplied) else None
    for i, p in enumerate(entry["params"]):
        if p["name"] in supplied:
            value = supplied[p["name"]]
        elif positional is not None:
            value = positional[i]
        elif p["hasDefault"]:
            continue
        else:
            raise TypeError("missing argument '%s' - add it in Function Arguments" % p["name"])
        args.append(convert_arg(value, p["type"] or (param_types or {}).get(p["name"])))
    return args


def algolens_run(job_json):
    NODE_CLASSES.clear()
    job = json.loads(job_json)
    code = job["code"]
    limit = int((job.get("limits") or {}).get("steps", 20000))
    out_cap = int((job.get("limits") or {}).get("stdout", 65536))
    result = {"v": 1, "language": "python", "steps": [], "truncated": False, "limit": limit,
              "output": {"stdout": "", "result": None, "resultPlain": None, "error": None}}

    try:
        compiled = compile(code, USER_FILE, "exec")
        tree = ast.parse(code)
    except SyntaxError as e:
        result["output"]["error"] = _fail("SyntaxError", e.msg, e.lineno)
        return json.dumps(result)

    ns = _build_namespace()
    prelude = dict(ns)
    stdout = OutputCapture(out_cap)
    tracer = Tracer(limit, prelude, stdout)

    entries = find_entries(tree)
    mode = job.get("mode") or "function"
    entry = _pick_entry(entries, job.get("entry"))
    if mode == "function" and entry is None:
        mode = "script"
    result["mode"] = mode
    result["entry"] = entry

    saved = (sys.stdout, sys.stdin, sys.stderr)
    sys.stdout = stdout
    sys.stderr = stdout
    sys.stdin = io.StringIO(job.get("stdin") or "")
    error = None
    returned = None
    try:
        try:
            if mode == "script":
                sys.settrace(tracer.on_call)
                try:
                    exec(compiled, ns)
                finally:
                    sys.settrace(None)
            else:
                exec(compiled, ns)            # definitions only - untraced
                target = ns.get(entry["className"]) if entry["className"] else ns.get(entry["name"])
                if target is None:
                    raise NameError("entry point '%s' was not defined" % entry["name"])
                fn = getattr(target(), entry["name"]) if entry["className"] else target
                args = _resolve_args(entry, job.get("args") or {}, job.get("paramTypes"))
                sys.settrace(tracer.on_call)
                try:
                    returned = fn(*args)
                finally:
                    sys.settrace(None)
        except StepLimit:
            pass
        except BaseException as e:            # the user's program failed: that is a result, not a crash
            line = None
            tb = e.__traceback__
            while tb is not None:
                if tb.tb_frame.f_code.co_filename == USER_FILE:
                    line = tb.tb_lineno
                tb = tb.tb_next
            error = _fail(type(e).__name__, str(e)[:300], line)
            error["e"] = tracer.exc_ids.get(id(e))
    finally:
        sys.settrace(None)
        sys.stdout, sys.stdin, sys.stderr = saved

    result["steps"] = tracer.steps
    result["truncated"] = tracer.truncated
    out = result["output"]
    out["stdout"] = stdout.getvalue()
    out["stdoutClipped"] = stdout.clipped
    out["error"] = error
    if error is None and not tracer.truncated and mode == "function":
        out["result"] = [type_name(returned), tracer.ser.ser(returned)]
        out["resultPlain"] = plain_result(returned)
    return json.dumps(result, ensure_ascii=False, separators=(",", ":"), default=str)
