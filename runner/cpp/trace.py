"""gdb script: single-steps the user's C++ program and records every line, call, return and exception.

Run by run.py as:  gdb -q -batch -nx -x trace.py ./prog

Everything comes from the debugger and the binary's DWARF debug info: the locals visible at each
line, the call stack, return values (gdb.FinishBreakpoint) and fatal signals. gdb's own libstdc++
pretty-printers turn std::vector / map / string / ... into plain lists and dicts, so no
instrumentation and no custom C++ serializer are needed.

Records are written to ALGOLENS_TRACE as JSON lines in the shared "AlgoTrace" step format.
"""
import json
import os
import re

import gdb

JOB = json.load(open(os.environ["ALGOLENS_JOB"]))
TRACE = open(os.environ["ALGOLENS_TRACE"], "a", buffering=1, encoding="utf-8")
FINAL = os.environ["ALGOLENS_FINAL"]
WORK = "/work"
STDOUT_FILE = WORK + "/stdout.txt"
ERR_FILE = WORK + "/stderr.txt"
LIMIT = int((JOB.get("limits") or {}).get("steps", 5000))
USER_FILE = "solution.cpp"

MAX_ITEMS, MAX_KEYS, MAX_DEPTH, MAX_NODES, MAX_STR = 60, 40, 4, 80, 200
ROW_BUDGET = 900   # elements kept per 2-D value: every row gets budget / rows columns, so a table stays rectangular
NEST = [MAX_ITEMS]  # columns allowed per row while one value is being encoded
MAX_SAFE = 2 ** 53

FATAL = {"SIGSEGV", "SIGABRT", "SIGFPE", "SIGBUS", "SIGILL", "SIGTRAP_X"}


def emit(obj):
    TRACE.write(json.dumps(obj, separators=(",", ":"), ensure_ascii=False) + "\n")


# ── value encoding ──────────────────────────────────────────────────────────────────────────
PATH = set()
CONTAINERS = (
    # adaptors keep their kind (the UI draws a stack, a queue, a heap); their pretty-printer shows the storage in order
    ("std::priority_queue", "priority_queue"), ("std::stack", "stack"), ("std::queue", "queue"), ("std::deque", "deque"),
    ("std::vector", "list"), ("std::list", "list"), ("std::__cxx11::list", "list"), ("std::array", "list"), ("std::pair", "tuple"),
    ("std::map", "dict"), ("std::unordered_map", "dict"), ("std::multimap", "dict"),
    ("std::set", "set"), ("std::unordered_set", "set"), ("std::multiset", "set"),
    ("std::__cxx11::basic_string", "str"), ("std::basic_string", "str"), ("std::string", "str"),
)


def clip(s):
    return s if len(s) <= MAX_STR else s[:MAX_STR] + "…"


def is_char(t):
    return t.code == gdb.TYPE_CODE_INT and t.sizeof == 1 and (t.name or "") in ("char", "signed char", "unsigned char")


def simple_name(t):
    name = t.name or str(t)
    name = re.sub(r"<.*", "", name)
    return name.split("::")[-1] or name


def real(value):
    v = value
    t = v.type.strip_typedefs()
    if t.code in (gdb.TYPE_CODE_REF, gdb.TYPE_CODE_RVALUE_REF):
        v = v.referenced_value()
        t = v.type.strip_typedefs()
    return v, t


def field_names(t):
    out = []
    try:
        for f in t.fields():
            if hasattr(f, "bitpos") and f.name:
                out.append(f.name)
    except (TypeError, gdb.error):
        pass
    return out


NODE_CACHE = {}


def links_to_self(t):
    """A struct with a pointer to its own type, bare or inside an array / vector / map: a trie node
    (`Node* children[26]`, `unordered_map<char, Node*>`), a graph node (`vector<Node*> neighbors`)."""
    name = t.name or str(t)
    if name.startswith(("std::", "__gnu", "_")):
        return False
    if name in NODE_CACHE:
        return NODE_CACHE[name]
    found = False
    try:
        pointer = re.compile(r"\b%s\s*\*" % re.escape(simple_name(t)))
        for f in t.fields():
            if hasattr(f, "bitpos") and not f.is_base_class and pointer.search(str(f.type)):
                found = True
                break
    except (gdb.error, TypeError, RuntimeError):
        pass
    NODE_CACHE[name] = found
    return found


def is_node_struct(t):
    if t.code != gdb.TYPE_CODE_STRUCT:
        return False
    names = field_names(t)
    if "val" in names and ("next" in names or "left" in names or "right" in names):
        return True
    return links_to_self(t)


def text_of(s):
    """Text of whatever a pretty-printer's to_string() returned (libstdc++ gives a gdb.LazyString)."""
    try:
        if isinstance(s, gdb.Value):
            return s.string(errors="replace")
        if hasattr(s, "length") and hasattr(s, "encoding") and callable(getattr(s, "value", None)):  # gdb.LazyString
            return s.value().string(encoding=s.encoding or "utf-8", errors="replace", length=s.length)
    except (gdb.error, ValueError, TypeError):
        pass
    return str(s)


def label_of(v, t):
    code = t.code
    if code == gdb.TYPE_CODE_BOOL:
        return "bool"
    if code == gdb.TYPE_CODE_INT:
        return "str" if is_char(t) else "int"
    if code == gdb.TYPE_CODE_ENUM:
        return "str"
    if code == gdb.TYPE_CODE_FLT:
        return "float"
    if code == gdb.TYPE_CODE_ARRAY:
        return "list"
    if code == gdb.TYPE_CODE_PTR:
        if int(v) == 0:
            return "NoneType"
        target = t.target().strip_typedefs()
        if is_char(target):
            return "str"
        return simple_name(target) if is_node_struct(target) else "ptr"
    text = str(t)
    for prefix, label in CONTAINERS:
        if text.startswith(prefix):
            return label
    return simple_name(t)


def ser(v, t, depth, budget):
    code = t.code
    if code == gdb.TYPE_CODE_BOOL:
        return bool(v)
    if code == gdb.TYPE_CODE_INT:
        if is_char(t):
            ch = int(v) & 0xFF
            return chr(ch) if 32 <= ch < 127 else "\\x%02x" % ch
        n = int(v)
        return n if abs(n) <= MAX_SAFE else str(n)
    if code == gdb.TYPE_CODE_ENUM:
        return str(v)
    if code == gdb.TYPE_CODE_FLT:
        f = float(v)
        if f != f:
            return "NaN"
        if f in (float("inf"), float("-inf")):
            return "Infinity" if f > 0 else "-Infinity"
        return f
    if code == gdb.TYPE_CODE_PTR:
        return ser_ptr(v, t, depth, budget)
    if code in (gdb.TYPE_CODE_STRUCT, gdb.TYPE_CODE_UNION):
        if str(t).startswith("std::pair"):  # before the printer lookup: a pair has one, and it would give {first, second}
            return [child(v["first"], depth + 1, budget), child(v["second"], depth + 1, budget)]  # a tuple, like Python's
        printer = gdb.default_visualizer(v)
        if printer is not None:
            return ser_printer(printer, v, t, depth, budget)
        if is_node_struct(t):
            return ser_node(v, t, int(v.address) if v.address is not None else id(v), budget)
        return ser_struct(v, t, depth, budget)
    if code == gdb.TYPE_CODE_ARRAY:
        lo, hi = t.range()
        n = hi - lo + 1
        cap = MAX_ITEMS if depth == 0 else min(MAX_ITEMS, NEST[0])
        shown = min(n, cap)
        if depth == 0 and shown > 1:
            NEST[0] = max(8, ROW_BUDGET // shown)  # every row of a 2-D array gets the same number of columns
        items = [child(v[lo + i], depth + 1, budget) for i in range(shown)]
        if n > shown:
            items.append("+%d more" % (n - shown))
        return items
    return clip(str(v))


def child(value, depth, budget):
    """Encode a child produced by a printer or a field: gdb.Value or a plain Python scalar."""
    if isinstance(value, gdb.Value):
        v, t = real(value)
        if depth >= MAX_DEPTH and t.code in (gdb.TYPE_CODE_STRUCT, gdb.TYPE_CODE_ARRAY):
            return clip(str(v))
        return ser(v, t, depth, budget)
    if isinstance(value, (bool, int, float, str)) or value is None:
        return value
    return clip(str(value))


def ser_printer(printer, v, t, depth, budget):
    hint = printer.display_hint() if hasattr(printer, "display_hint") else None
    if hint == "string" or not hasattr(printer, "children"):
        text = text_of(printer.to_string()) if hasattr(printer, "to_string") else str(v)
        return clip(text)
    if depth >= MAX_DEPTH:
        return clip(text_of(printer.to_string())) if hasattr(printer, "to_string") else "…"
    kids = []
    more = False
    cap = MAX_KEYS * 2 if hint == "map" else MAX_ITEMS
    if depth > 0:
        cap = min(cap, NEST[0])
    it = iter(printer.children())
    for _ in range(cap):
        try:
            kids.append(next(it))
        except StopIteration:
            break
    else:
        try:
            next(it)
            more = True
        except StopIteration:
            pass
    if hint == "map":
        out = {}
        for i in range(0, len(kids) - 1, 2):
            key = child(kids[i][1], depth + 1, budget)
            out[key if isinstance(key, str) else json.dumps(key)] = child(kids[i + 1][1], depth + 1, budget)
        if more:
            out["…"] = "+ more"
        return out
    # std::set / multiset / bitset have no display hint: their children are just named [0], [1], ...
    if hint is None and kids and all(re.fullmatch(r"\[\d+\]", str(c[0])) for c in kids):
        hint = "array"
    if hint == "array":
        if depth == 0 and len(kids) > 1:
            NEST[0] = max(8, ROW_BUDGET // len(kids))  # keep a vector<vector<T>> rectangular and bounded
        items = [child(c[1], depth + 1, budget) for c in kids]
        if more:
            items.append("+ more")
        return items
    out = {"__class__": simple_name(t)}
    for name, c in kids:
        out[str(name)] = child(c, depth + 1, budget)
    return out


def ser_struct(v, t, depth, budget):
    out = {"__class__": simple_name(t)}
    shown = 0
    for f in t.fields():
        if not hasattr(f, "bitpos"):
            continue  # static member
        if shown >= 20:
            break
        try:
            if f.is_base_class:
                continue
            out[f.name] = child(v[f], depth + 1, budget)
            shown += 1
        except gdb.error:
            continue
    return out


def ser_ptr(v, t, depth, budget):
    addr = int(v)
    if addr == 0:
        return None
    target = t.target().strip_typedefs()
    if is_char(target):
        try:
            return clip(v.string(length=MAX_STR))
        except gdb.error:
            return "0x%x" % addr
    if is_node_struct(target):
        try:
            return ser_node(v.dereference(), target, addr, budget)
        except gdb.error:
            return "0x%x" % addr
    return "0x%x" % addr


def ser_node(sv, st, addr, budget):
    """val/left/right/next shaped objects, followed through pointers, cycle- and budget-safe."""
    if addr in PATH:
        return {"__cycle__": addr}
    if budget[0] <= 0:
        return "…"
    budget[0] -= 1
    PATH.add(addr)
    try:
        out = {"__class__": simple_name(st), "__id__": addr}
        names = field_names(st)
        for name in ("val", "left", "right", "next"):
            if name in names:
                value = sv[name]
                v, t = real(value)
                if t.code == gdb.TYPE_CODE_PTR and name != "val":
                    out[name] = None if int(v) == 0 else (
                        ser_node(v.dereference(), t.target().strip_typedefs(), int(v), budget)
                        if is_node_struct(t.target().strip_typedefs()) else "0x%x" % int(v))
                else:
                    out[name] = ser(v, t, MAX_DEPTH - 1, budget)
        if not any(n in names for n in ("left", "right", "next")):
            ser_links(sv, st, out, budget)
        return out
    finally:
        PATH.discard(addr)


def ser_links(sv, st, out, budget):
    """A node held together by children (trie, n-ary tree, graph node): follow the pointers inside its arrays
    and containers, and keep its small scalar fields (`end`, `count`)."""
    pointer = re.compile(r"\b%s\s*\*" % re.escape(simple_name(st)))
    scalars = 0
    for f in st.fields():
        if not hasattr(f, "bitpos") or f.is_base_class or not f.name or f.name == "val":
            continue
        try:
            ft = f.type.strip_typedefs()
            if pointer.search(str(f.type)):
                value = sv[f.name]
                v, t = real(value)
                if t.code == gdb.TYPE_CODE_ARRAY and t.target().strip_typedefs().code == gdb.TYPE_CODE_PTR:
                    lo, hi = t.range()
                    n = hi - lo + 1
                    # an array of 26 child pointers is the classic trie: key the children by letter
                    letters = n == 26
                    kids = {}
                    for i in range(min(n, 64)):
                        c = child(v[lo + i], MAX_DEPTH - 1, budget)
                        if c is not None:
                            kids[chr(97 + i) if letters else str(i)] = c
                    out[f.name] = kids
                else:
                    out[f.name] = ser(v, t, MAX_DEPTH - 1, budget)
            elif scalars < 8 and ft.code in (gdb.TYPE_CODE_BOOL, gdb.TYPE_CODE_INT, gdb.TYPE_CODE_FLT, gdb.TYPE_CODE_ENUM):
                v, t = real(sv[f.name])
                out[f.name] = ser(v, t, MAX_DEPTH - 1, budget)
                scalars += 1
        except gdb.error:
            continue


def enc(value):
    """(display type, json-able value) for a gdb.Value; None when its memory cannot be read right now
    (e.g. a container that is halfway through its destructor) - callers then keep the previous value."""
    try:
        PATH.clear()
        NEST[0] = MAX_ITEMS
        v, t = real(value)
        return label_of(v, t), ser(v, t, 0, [MAX_NODES])
    except gdb.error:
        return None
    except Exception:
        return "str", "<unprintable>"


# ── frames ──────────────────────────────────────────────────────────────────────────────────
class Fr(object):
    __slots__ = ("fid", "fp", "name", "line", "last", "active", "ret", "rb", "arrivals", "prev_pc")

    def __init__(self, fid, fp, name, line):
        self.fid, self.fp, self.name, self.line = fid, fp, name, line
        self.last = {}
        self.active = set()  # variables seen after their declaration line (loop headers re-visit it)
        self.ret = {}  # filled by Ret when this call returns: {"val": (type, value)}
        self.rb = None  # the Ret breakpoint of this call
        self.arrivals = {line: 1}  # how many times execution arrived at a line (a jump back counts, a re-stop does not)
        self.prev_pc = None


class Ret(gdb.FinishBreakpoint):
    """Fires when its call returns: records the return value and stops, so the return is seen the moment
    it happens. Only the innermost call has one at a time (see enter / ensure_ret): on every stop gdb
    walks the stack once per live FinishBreakpoint to see whether its frame still exists, so one per
    live frame made deep recursion quadratic - and then cubic."""

    def __init__(self, frame, holder):
        gdb.FinishBreakpoint.__init__(self, frame, internal=True)
        self.holder = holder

    def stop(self):
        try:
            if self.return_value is not None:
                self.holder["val"] = enc(self.return_value) or ("str", "<unavailable>")
            else:
                self.holder["val"] = ("NoneType", None)
        except Exception:
            self.holder["val"] = ("str", "<unavailable>")
        return True

    def out_of_scope(self):
        self.holder["gone"] = True  # unwound by an exception / longjmp: it never returned


STACK = []
NEXT_FID = [1]
STEPS = [0]
LAST_OUT = [0]
SIGNAL = {"name": None}
STATE = {"truncated": False, "error": None}


def frame_pc(frame):
    try:
        return frame.pc()
    except gdb.error:
        return None


def frame_id(frame):
    """Stack identity of a frame: its frame pointer (the code is built with -fno-omit-frame-pointer).
    The stack grows down, so a callee's value is below its caller's, and two calls one after the other
    from the same caller share it."""
    reg = FRAME_REG.get("name")
    if reg is None:
        reg = FRAME_REG["name"] = "x29" if "aarch64" in frame.architecture().name() else "rbp"
    try:
        return int(frame.read_register(reg))
    except (gdb.error, ValueError):
        return 0


FRAME_REG = {}


def short_name(frame):
    name = frame.name() or "?"
    return name.split("::")[-1]


def user_line(frame):
    """Line number in the user's file when the frame is user code, else None."""
    try:
        sal = frame.find_sal()
        if sal.symtab is not None and sal.symtab.filename.endswith(USER_FILE):
            return sal.line
    except gdb.error:
        pass
    return None


GLOBALS = []
GLOBALS_READY = [False]


def user_globals(frame):
    """File-scope variables of the user's file (`int dp[100]; vector<int> adj[N];`), found once per run."""
    if not GLOBALS_READY[0]:
        GLOBALS_READY[0] = True
        try:
            block = frame.block()
            for blk in (block.static_block, block.global_block):
                for sym in blk:
                    if not sym.is_variable or sym.name.startswith("__") or sym.symtab is None:
                        continue
                    if sym.symtab.filename.endswith(USER_FILE):
                        GLOBALS.append(sym)
        except (gdb.error, RuntimeError):
            pass
    return GLOBALS


def capture(frame, line, fr):
    out = {}
    this_val = None
    block = frame.block()
    pc = frame_pc(frame)
    seen = set()
    while block is not None:
        # a range-for keeps its machinery (__for_range, ...) in the scope of the loop variable
        range_scope = any(s.name == "__for_range" for s in block)
        for sym in block:
            if not (sym.is_variable or sym.is_argument) or sym.name in seen or sym.name.startswith("__"):
                continue
            seen.add(sym.name)
            if sym.name == "this":
                try:
                    this_val = sym.value(frame)
                except gdb.error:
                    pass
                continue
            if not sym.is_argument:
                decl = sym.line or 0
                if decl > line:
                    continue
                if decl == line:
                    if sym.name not in fr.active:
                        if fr.arrivals.get(line, 0) < 2:
                            continue  # about to be initialised by this very line
                        if range_scope and pc in LOOP_HEADS:
                            continue  # the loop head runs before `c = *it`: the slot still holds the last element
                        fr.active.add(sym.name)  # arrived here again (single-line loop): it holds a real value now
                else:
                    fr.active.add(sym.name)
            try:
                keep(out, fr, sym.name, enc(sym.value(frame)))
            except gdb.error:
                keep(out, fr, sym.name, None)
        if block.function is not None:
            break
        block = block.superblock
    for sym in user_globals(frame):
        if sym.name in seen:
            continue  # a local shadows it
        seen.add(sym.name)
        try:
            keep(out, fr, sym.name, enc(sym.value()))
        except (gdb.error, RuntimeError):
            keep(out, fr, sym.name, None)
    if this_val is not None:
        try:
            dv = this_val.dereference()
            st = dv.type.strip_typedefs()
            for fname in field_names(st):
                key = fname if fname not in out else "this." + fname
                keep(out, fr, key, enc(dv[fname]))
        except gdb.error:
            pass
    return out


def keep(out, fr, name, encoded):
    """Record a variable; an unreadable one keeps the value it had (it did not vanish, we just can't see it)."""
    if encoded is not None:
        out[name] = encoded
    elif name in fr.last:
        out[name] = fr.last[name]


def diff(fr, now):
    changed = {k: v for k, v in now.items() if fr.last.get(k) != v}
    deleted = [k for k in fr.last if k not in now]
    fr.last = now
    return changed, deleted


def out_size():
    try:
        return os.path.getsize(STDOUT_FILE)
    except OSError:
        return 0


def send(step, fr_vars=None, deleted=None):
    if fr_vars:
        step["v"] = {k: [t, v] for k, (t, v) in fr_vars.items()}
    if deleted:
        step["d"] = deleted
    size = out_size()
    if size != LAST_OUT[0]:
        step["o"] = size
        LAST_OUT[0] = size
    emit(dict(step, t="s"))
    STEPS[0] += 1


def enter(frame, line):
    fr = Fr(NEXT_FID[0], frame_id(frame), short_name(frame), line)
    fr.prev_pc = frame_pc(frame)
    NEXT_FID[0] += 1
    if STACK:
        drop_ret(STACK[-1])  # the caller's Ret comes back (ensure_ret) once this call is over
    STACK.append(fr)
    try:
        fr.rb = Ret(frame, fr.ret)
    except (gdb.error, ValueError, RuntimeError):
        pass
    changed, _ = diff(fr, capture(frame, line, fr))
    send({"k": "call", "l": line, "f": fr.fid, "n": fr.name}, changed)
    return fr


def drop_ret(fr):
    if fr.rb is not None:
        try:
            fr.rb.delete()
        except (gdb.error, RuntimeError):
            pass
        fr.rb = None


def in_user_code(frame):
    return user_line(frame) is not None


def ensure_ret():
    """Give the innermost tracked call its Ret, found among the frames of the current stop."""
    top = STACK[-1] if STACK else None
    if top is None or top.rb is not None or returned(top):
        return
    try:
        frame = gdb.selected_frame()
        for _ in range(256):
            if frame is None:
                return
            # (library frames compiled without a frame pointer report their caller's value: user frames only)
            if in_user_code(frame) and frame_id(frame) == top.fp:
                top.rb = Ret(frame, top.ret)
                return
            frame = frame.older()
    except (gdb.error, ValueError, RuntimeError):
        pass


def leave(fr):
    """Emit the return of a call that is no longer on the stack (STACK.pop() already ran)."""
    value = fr.ret.get("val")
    step = {"k": "ret", "l": fr.line, "f": fr.fid}
    if value is None:
        step["r"] = ["NoneType", None]
        step["u"] = 1  # no return value was seen: an exception unwound this call
    else:
        step["r"] = [value[0], value[1]]
    send(step)
    drop_ret(fr)


def returned(fr):
    return "val" in fr.ret or fr.ret.get("gone", False)


# ── errors ──────────────────────────────────────────────────────────────────────────────────
def describe_signal(name):
    err = ""
    try:
        with open(ERR_FILE, encoding="utf-8", errors="replace") as f:
            err = f.read(4000)
    except OSError:
        pass
    if name == "SIGSEGV":
        return "SegmentationFault", "Invalid memory access (null pointer, out-of-bounds, or runaway recursion)."
    if name == "SIGFPE":
        return "ArithmeticException", "Division by zero (or an arithmetic overflow)."
    if name == "SIGABRT":
        m = re.search(r"instance of '([^']+)'", err)
        w = re.search(r"what\(\):\s*(.*)", err)
        if m:
            return m.group(1), (w.group(1).strip() if w else "uncaught exception")
        a = re.search(r"Assertion `(.*)' failed", err)
        return "Abort", ("Assertion failed: " + a.group(1)) if a else "The program aborted."
    return name, "The program was stopped by signal " + name + "."


def report_signal(name):
    kind, message = describe_signal(name)
    line = None
    f = gdb.newest_frame()
    while f is not None and line is None:
        line = user_line(f)
        f = f.older() if line is None else f
    top = STACK[-1] if STACK else None
    if line is None and top is not None:
        line = top.line
    send({"k": "exc", "l": line or 0, "f": top.fid if top else 0, "x": ("%s: %s" % (kind, message))[:300], "e": 1})
    STATE["error"] = {"type": kind, "message": message[:300], "line": line, "e": 1}


def on_stop(event):
    if isinstance(event, gdb.SignalEvent):
        SIGNAL["name"] = event.stop_signal


# ── the trace loop ──────────────────────────────────────────────────────────────────────────
def alive():
    try:
        return gdb.selected_inferior().pid != 0
    except gdb.error:
        return False


ENTRY_PCS = set()  # where each function of the user's file starts running its body
LOOP_HEADS = set()  # targets of backward jumps: where a loop starts its next iteration
LINE_PCS = set()  # every address that has a line breakpoint
MISFILED = set()  # line-table rows GCC files under a function's closing line (see misfiled): never a stop
ARMED = []


def function_block(pc):
    block = gdb.block_for_pc(pc)
    while block is not None and block.function is None:
        block = block.superblock
    return block


def find_loop_heads(block, arch):
    """Backward branch targets inside a function. A loop written on one line (`for (...) sum += i;`) has a
    single line-table entry, so only the jump back to its body can tell the iterations apart."""
    heads = set()
    try:
        for ins in arch.disassemble(block.start, block.end - 1):
            text = ins["asm"].split(None, 1)
            if not text:
                continue
            mnemonic = text[0]
            is_branch = mnemonic.startswith("j") or mnemonic == "b" or mnemonic.startswith("b.") or mnemonic in ("cbz", "cbnz", "tbz", "tbnz")
            if not is_branch:
                continue
            m = re.search(r"0x([0-9a-fA-F]+)", text[1] if len(text) > 1 else "")
            if m:
                target = int(m.group(1), 16)
                if block.start <= target < ins["addr"]:
                    heads.add(target)
    except (gdb.error, RuntimeError, ValueError):
        pass
    return heads


def misfiled(rows):
    """pcs of the rows GCC files under a function's closing line although they run before its statements.

    The temporary arrays behind a nested braced list (`vector<vector<int>> g = {{1, 2}, {3}};`) are built
    by code that gets the line of the function's final `}`. Stopping there would show the end of the
    function before it has begun (and, by line number, declare every local). Only the last run of
    closing-line rows, the shared epilogue at the highest addresses, is the real end; the destructor
    calls before it are not worth a stop (the call's own return step follows)."""
    if not rows:
        return set()
    closing = max(line for _, line in rows)
    last_other = max((pc for pc, line in rows if line != closing), default=None)
    if last_other is None:
        return set()
    return {pc for pc, line in rows if line == closing and pc < last_other}


def arm(symtab, arch):
    """Internal breakpoints on every line of the user's file, then `continue` runs at full speed between them.

    Nothing steps through the standard library: map/sort/string internals execute natively, and only the
    user's own lines (including lambdas that library code calls back) stop the program. Function starts
    themselves are skipped (the frame is not set up yet): the first line of the body is the "call" stop."""
    try:
        listing = gdb.execute("rbreak " + USER_FILE + ":.", to_string=True)
    except gdb.error:
        listing = ""
    resolved = []  # where `break function` puts each function's first body line
    for number, address in re.findall(r"Breakpoint (\d+) at (0x[0-9a-fA-F]+)", listing):
        resolved.append(int(address, 16))
        try:
            gdb.execute("delete " + number, to_string=True)
        except gdb.error:
            pass

    pcs = set()
    blocks = {}
    rows = {}  # function start -> [(pc, line)] of its line-table rows
    for entry in symtab.linetable():
        if entry.line <= 0:
            continue
        block = function_block(entry.pc)
        if block is not None:
            blocks[block.start] = block
            if block.start == entry.pc:
                continue
            rows.setdefault(block.start, []).append((entry.pc, entry.line))
        pcs.add(entry.pc)
    for pc in resolved:  # (rbreak also lists template code from the headers: keep only the user's functions)
        block = function_block(pc)
        if block is not None and block.start in blocks:
            ENTRY_PCS.add(pc)
    for start, block in blocks.items():
        LOOP_HEADS.update(find_loop_heads(block, arch))
        MISFILED.update(misfiled(rows.get(start, [])))
    MISFILED.difference_update(ENTRY_PCS)  # (the call stop always stays)
    pcs |= ENTRY_PCS | LOOP_HEADS
    pcs -= MISFILED
    LINE_PCS.update(pcs)
    for pc in pcs:
        try:
            ARMED.append(gdb.Breakpoint("*0x%x" % pc, internal=True))
        except gdb.error:
            pass


def disarm():
    for bp in ARMED:
        try:
            bp.delete()
        except (gdb.error, RuntimeError):
            pass
    del ARMED[:]


def resume():
    try:
        gdb.execute("continue", to_string=True)
    except gdb.error:
        pass


def trace():
    frame = gdb.selected_frame()
    line = user_line(frame)
    if line is None:
        return
    symtab = frame.find_sal().symtab
    arm(symtab, frame.architecture())
    enter(frame, line)

    while STACK:
        if STEPS[0] >= LIMIT:
            STATE["truncated"] = True
            return
        ensure_ret()
        resume()
        if SIGNAL["name"] in FATAL:
            report_signal(SIGNAL["name"])
            return
        if not alive():
            break
        try:
            frame = gdb.selected_frame()
        except gdb.error:
            break
        pc = frame_pc(frame)

        # calls that have returned (their Ret fired) are over, whatever the stack addresses say
        done = False
        while STACK and returned(STACK[-1]):
            leave(STACK.pop())
            done = True
        if not STACK:
            break  # the entry function has returned
        if done and pc not in LINE_PCS:
            continue  # stopped only to see a return, in the middle of the caller's line
        line = user_line(frame)
        if line is None:
            continue  # stopped inside code we do not show
        fp = frame_id(frame)
        fresh = pc in ENTRY_PCS

        # frames deeper than this one (or, for a fresh call, as deep: a sibling call) were unwound
        while STACK and (STACK[-1].fp < fp or (fresh and STACK[-1].fp == fp)):
            leave(STACK.pop())
        if not STACK:
            return
        top = STACK[-1]
        if fresh or fp < top.fp:
            enter(frame, line)
            continue

        backward = pc is not None and top.prev_pc is not None and pc <= top.prev_pc
        top.prev_pc = pc
        if line == top.line and not backward and pc not in LOOP_HEADS:
            continue  # another line-table entry of the same line (a loop condition, ...): not a new step
        again = line == top.line  # the same line once more: a loop head, or compiler-generated cleanup in a loop
        top.arrivals[line] = top.arrivals.get(line, 0) + 1
        top.line = line
        changed, deleted = diff(top, capture(frame, line, top))
        if again and not changed and not deleted and out_size() == LAST_OUT[0]:
            STEPS[0] += 1  # nothing to show, but it still counts: an endless one-line loop must reach the step limit
            continue
        send({"k": "line", "l": line, "f": top.fid}, changed, deleted)

    # the program ended or the entry function returned: close whatever is still open
    while STACK:
        leave(STACK.pop())


def setup():
    for command in ("set pagination off", "set confirm off", "set width 0", "set height 0",
                    "set auto-load safe-path /", "set print elements 200", "set breakpoint pending off",
                    "set disable-randomization off"):
        try:
            gdb.execute(command, to_string=True)
        except gdb.error:
            pass
    gdb.events.stop.connect(on_stop)


def write_final():
    with open(FINAL, "w", encoding="utf-8") as f:
        json.dump({"truncated": STATE["truncated"], "error": STATE["error"]}, f)


def main():
    setup()
    try:
        gdb.execute("break " + (JOB.get("breakSpec") or "main"), to_string=True)
    except gdb.error as e:
        STATE["error"] = {"type": "RunnerError", "message": "Could not find the entry function: %s" % e, "line": None}
        write_final()
        return
    redirect = "run /work/args.json /work/result.json > %s 2> %s < /work/stdin.txt" % (STDOUT_FILE, ERR_FILE)
    try:
        gdb.execute(redirect, to_string=True)
        if alive() and SIGNAL["name"] not in FATAL:
            trace()
        elif SIGNAL["name"] in FATAL:
            report_signal(SIGNAL["name"])
    except gdb.error:
        pass
    except Exception as e:  # a bug in this script must be visible, not a silently short trace
        STATE["error"] = {"type": "RunnerError", "message": "internal tracer error: %s: %s" % (type(e).__name__, e), "line": None}
    finally:
        if alive():
            if STATE["truncated"] or STATE["error"]:
                try:
                    gdb.execute("kill", to_string=True)
                except gdb.error:
                    pass
            else:
                try:
                    disarm()
                    gdb.execute("delete", to_string=True)
                    gdb.execute("continue", to_string=True)
                except gdb.error:
                    pass
        # a fatal signal can also arrive while the program runs on after the entry function returned
        if SIGNAL["name"] in FATAL and STATE["error"] is None:
            kind, message = describe_signal(SIGNAL["name"])
            STATE["error"] = {"type": kind, "message": message[:300], "line": None}
        write_final()


main()
