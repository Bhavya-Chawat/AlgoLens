#!/usr/bin/env python3
"""AlgoLens C++ runner (entrypoint of the container).

stdin : the job  { code, driver, args, mode, entry, breakSpec, stdin, limits:{steps,stdout,timeMs,idleMs} }
stdout: protocol lines, one JSON document per line
          {"t":"p","m":"..."}        progress
          {"t":"s","k":"call|line|ret|exc", ...}   a trace step (same shape as every other tracer)
          {"t":"e", ...}             the end: stdout, result, error, truncated, timedOut

Steps: compile with GCC -> run the program under gdb with trace.py -> relay what gdb records.
Nothing is instrumented: gdb observes the real binary through its debug information.
"""
import json
import os
import re
import signal
import subprocess
import sys
import threading
import time

WORK = "/work"
LIB = "/opt/algolens"
TRACE = os.path.join(WORK, "trace.jsonl")
FINAL = os.path.join(WORK, "final.json")
OUT_FILE = os.path.join(WORK, "stdout.txt")
ERR_FILE = os.path.join(WORK, "stderr.txt")
RESULT = os.path.join(WORK, "result.json")


def emit(obj):
    sys.stdout.write(json.dumps(obj, separators=(",", ":"), ensure_ascii=False) + "\n")
    sys.stdout.flush()


def progress(message):
    emit({"t": "p", "m": message})


def read(path, cap=None):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read() if cap is None else f.read(cap + 1)
    except OSError:
        return ""


TIMING = {}


def finish(error=None, result=None, truncated=False, timed_out=False, stdout="", clipped=False):
    emit({"t": "e", "truncated": truncated, "timedOut": timed_out, "stdout": stdout, "stdoutClipped": clipped,
          "result": result, "error": error, "timing": TIMING})


def build_source(job):
    code = job["code"]
    # prelude.h is precompiled and MUST be the first thing in the file; everything the user's code can
    # influence (node types, a clashing main) comes after it. In function mode the generated driver
    # supplies main(): a main() the user also wrote is renamed. `#line 1` makes the user's first line
    # number 1 again, so every line the debugger reports is the user's own.
    function_mode = job.get("mode") != "script"
    lines = ['#include "prelude.h"']
    if re.search(r"\b(struct|class)\s+TreeNode\b", code):
        lines.append("#define ALGOLENS_NO_TREENODE")
    if re.search(r"\b(struct|class)\s+ListNode\b", code):
        lines.append("#define ALGOLENS_NO_LISTNODE")
    lines.append('#include "algolens_nodes.h"')
    if function_mode:
        lines.append("#define main algolens_user_main")
    lines.append('#line 1 "solution.cpp"')
    head = "\n".join(lines) + "\n"

    if not function_mode:
        return head + code + "\n"  # a program with its own main(): no generated driver at all
    tail = ["", "#undef main", '#include "algolens_driver.h"', '#line 1 "algolens_driver.cpp"', job.get("driver", "")]
    return head + code + "\n".join(tail)


def compile_program(source, function_mode):
    path = os.path.join(WORK, "solution.cpp")
    with open(path, "w", encoding="utf-8") as f:
        f.write(source)
    cmd = ["g++", "-std=c++20", "-g", "-O0", "-fno-omit-frame-pointer", "-pipe", "-w", "-I" + LIB, path]
    if function_mode:
        cmd.append(os.path.join(LIB, "algolens_rt.o"))  # the prebuilt JSON reader/writer the generated main() uses
    cmd += ["-o", os.path.join(WORK, "prog")]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=90, cwd=WORK)
    except subprocess.TimeoutExpired:
        return {"type": "CompileError", "message": "Compilation took too long.", "line": None}
    if proc.returncode == 0:
        return None
    errors = re.findall(r"^solution\.cpp:(\d+):\d+: (?:fatal )?error: (.+)$", proc.stderr, re.M)
    if errors:
        lines = ["line %s: %s" % (n, m) for n, m in errors[:4]]
        return {"type": "CompileError", "message": "\n".join(lines), "line": int(errors[0][0])}
    other = re.findall(r"error: (.+)", proc.stderr)
    return {"type": "CompileError", "message": (other[0] if other else proc.stderr.strip()[-400:]) or "compilation failed", "line": None}


def result_object(job):
    raw = read(RESULT)
    if not raw:
        return None
    try:
        value = json.loads(raw).get("value")
    except ValueError:
        return None
    ret = ((job.get("entry") or {}).get("returnType") or "")
    if "TreeNode" in ret and "*" in ret:
        kind = "TreeNode"
    elif "ListNode" in ret and "*" in ret:
        kind = "ListNode"
    elif isinstance(value, bool):
        kind = "bool"
    elif isinstance(value, int):
        kind = "int"
    elif isinstance(value, float):
        kind = "float"
    elif isinstance(value, str):
        kind = "str"
    elif isinstance(value, list):
        kind = "list"
    elif isinstance(value, dict):
        kind = "dict"
    else:
        kind = "NoneType"
    plain = value if kind in ("TreeNode", "ListNode") else None
    return {"type": kind, "value": value, "plain": plain}


def main():
    job = json.loads(sys.stdin.read())
    limits = job.get("limits") or {}
    time_ms = int(limits.get("timeMs", 30000))
    idle_ms = int(limits.get("idleMs", 6000))
    stdout_cap = int(limits.get("stdout", 65536))

    progress("Compiling…")
    t0 = time.time()
    problem = compile_program(build_source(job), job.get("mode") != "script")
    TIMING["compileMs"] = int((time.time() - t0) * 1000)
    if problem:
        finish(error=problem)
        return

    with open(os.path.join(WORK, "args.json"), "w", encoding="utf-8") as f:
        json.dump(job.get("args") or {}, f)
    with open(os.path.join(WORK, "stdin.txt"), "w", encoding="utf-8") as f:
        f.write(job.get("stdin") or "")
    with open(os.path.join(WORK, "job.json"), "w", encoding="utf-8") as f:
        json.dump(job, f)
    open(TRACE, "w").close()

    progress("Running…")
    t_run = time.time()
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": "/home/runner", "LANG": "C.UTF-8",
           "ALGOLENS_JOB": os.path.join(WORK, "job.json"), "ALGOLENS_TRACE": TRACE, "ALGOLENS_FINAL": FINAL}
    gdb = subprocess.Popen(["gdb", "-q", "-batch", "-nx", "-x", os.path.join(LIB, "trace.py"), os.path.join(WORK, "prog")],
                           stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, env=env,
                           cwd=WORK, start_new_session=True, text=True)
    gdb_errors = []
    threading.Thread(target=lambda: gdb_errors.append(gdb.stderr.read()), daemon=True).start()

    started = time.time()
    last_progress = time.time()
    timed_out = False
    offset = 0
    seen_step = False
    while True:
        try:
            with open(TRACE, "r", encoding="utf-8") as f:
                f.seek(offset)
                chunk = f.read()
        except OSError:
            chunk = ""
        if chunk:
            complete = chunk[: chunk.rfind("\n") + 1]
            if complete:
                offset += len(complete.encode("utf-8"))
                sys.stdout.write(complete)
                sys.stdout.flush()
                last_progress = time.time()
                seen_step = True
        done = gdb.poll() is not None
        if done and not chunk:
            break
        now = time.time()
        if (now - started) * 1000 > time_ms or (seen_step and (now - last_progress) * 1000 > idle_ms):
            timed_out = True
            try:
                os.killpg(gdb.pid, signal.SIGKILL)
            except OSError:
                pass
            gdb.wait()
            break
        if not chunk:
            time.sleep(0.02)

    TIMING["traceMs"] = int((time.time() - t_run) * 1000)
    final = {}
    try:
        final = json.loads(read(FINAL) or "{}")
    except ValueError:
        pass
    out_text = read(OUT_FILE, stdout_cap)
    clipped = len(out_text) > stdout_cap
    err_text = read(ERR_FILE, 4000)
    error = final.get("error")
    if error is None and gdb.returncode not in (0, None) and not timed_out and not final:
        tail = (gdb_errors[0] if gdb_errors else "").strip().splitlines()[-1:] or ["the debugger stopped unexpectedly"]
        error = {"type": "RunnerError", "message": tail[0][:300], "line": None}
    stdout_text = out_text[:stdout_cap] + (("\n" + err_text.strip()) if err_text.strip() and error else "")
    finish(error=error, result=None if error else result_object(job), truncated=bool(final.get("truncated")),
           timed_out=timed_out, stdout=stdout_text[: stdout_cap + 2000], clipped=clipped)


if __name__ == "__main__":
    main()
