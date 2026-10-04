import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPyodide } from 'pyodide';
import { buildTrace } from '../../core/frameBuilder.js';

// The very same tracer.py that ships in the browser worker, executed by Pyodide in Node.
const TRACER = readFileSync(new URL('./tracer.py', import.meta.url), 'utf8');
const py = await loadPyodide();
py.runPython(TRACER);

function trace(code, job = {}) {
  const raw = py.globals.get('algolens_run')(JSON.stringify({ code, ...job }));
  const wire = JSON.parse(raw);
  return { wire, built: buildTrace(wire, code) };
}

const TWO_SUM = `class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, num in enumerate(nums):
            complement = target - num
            if complement in seen:
                return [seen[complement], i]
            seen[num] = i
        return []
`;

test('LeetCode function mode: Solution class, args matched by name', () => {
  const { wire, built } = trace(TWO_SUM, { args: { target: 9, nums: [2, 7, 11, 15] } }); // key order swapped on purpose
  assert.equal(wire.mode, 'function');
  assert.equal(wire.entry.name, 'twoSum');
  assert.equal(built.error, null);
  assert.deepEqual(built.resultRaw, [0, 1]);
  assert.equal(built.result, '[0, 1]');

  const first = built.frames[0];
  assert.equal(first.eventType, 'function_call');
  assert.equal(first.description, 'twoSum(nums=[2, 7, 11, 15], target=9)');
  assert.deepEqual(first.callStack.map((c) => c.name), ['twoSum']);

  const last = built.frames[built.frames.length - 1];
  assert.equal(last.eventType, 'return');
  assert.deepEqual(last.returnValue, [0, 1]);
});

test('variables are diffed per step and flagged when they change', () => {
  const { built } = trace(TWO_SUM, { args: { nums: [2, 7, 11, 15], target: 9 } });
  const withSeen = built.frames.find((f) => f.variables.seen && Object.keys(f.variables.seen.value).length === 1);
  assert.ok(withSeen, 'seen should grow to one key');
  assert.deepEqual(withSeen.variables.seen.value, { 2: 0 });
  assert.equal(withSeen.variables.seen.changedThisFrame, true);

  // The step *after* the change shows the same value, no longer flagged.
  const next = built.frames[withSeen.id + 1];
  assert.equal(next.variables.seen.changedThisFrame, false);
  // ...and the very same entry object is reused (structural sharing = cheap memory).
  assert.equal(next.variables.nums, built.frames[withSeen.id].variables.nums);

  // complement is only defined after its assignment executed.
  const complementFrames = built.frames.filter((f) => 'complement' in f.variables);
  assert.ok(complementFrames[0].line > 4);
});

test('recursion: a call and a return per call, depth tracked, result correct', () => {
  const code = 'def fib(n):\n    if n < 2:\n        return n\n    return fib(n - 1) + fib(n - 2)\n';
  const { built } = trace(code, { args: { n: 5 } });
  const calls = built.frames.filter((f) => f.eventType === 'function_call');
  const rets = built.frames.filter((f) => f.eventType === 'return');
  assert.equal(calls.length, 15);
  assert.equal(rets.length, 15);
  assert.equal(Math.max(...built.frames.map((f) => f.callStack.length)), 5);
  assert.equal(built.resultRaw, 5);
  assert.equal(built.frames[built.frames.length - 1].callStack.length, 1); // outermost return still shows itself
});

test('uncaught exception: flagged as the bug frame and classified', () => {
  const code = 'def f(a):\n    total = 0\n    for i in range(len(a) + 1):\n        total += a[i]\n    return total\n';
  const { built } = trace(code, { args: { a: [1, 2, 3] } });
  assert.equal(built.error.type, 'IndexError');
  const bug = built.frames.find((f) => f.isBugFrame);
  assert.ok(bug);
  assert.equal(bug.line, 4);
  assert.equal(built.bugs[0].type, 'index_out_of_bounds');
  assert.equal(built.bugs[0].frameId, bug.id);
  // the failing frame still shows the values that explain the bug
  assert.equal(bug.variables.i.value, 3);
  assert.equal(built.resultRaw, null);
});

test('a caught exception is an event, not a bug', () => {
  const code = 'def f():\n    try:\n        {}["x"]\n    except KeyError:\n        return "recovered"\n';
  const { built } = trace(code, {});
  assert.equal(built.error, null);
  assert.ok(built.frames.some((f) => f.eventType === 'exception' && !f.isBugFrame));
  assert.equal(built.bugs.length, 0);
  assert.equal(built.resultRaw, 'recovered');
});

test('infinite loop stops at the step limit, quickly, and says so', () => {
  const code = 'def spin():\n    x = 0\n    while True:\n        x += 1\n';
  const started = Date.now();
  const { built } = trace(code, { limits: { steps: 800 } });
  assert.ok(Date.now() - started < 3000);
  assert.equal(built.truncated, true);
  assert.equal(built.frames.length <= 800, true);
  assert.equal(built.bugs[0].type, 'infinite_loop');
  assert.ok(built.frames[built.frames.length - 1].variables.x.value > 100);
});

test('script mode runs the module top to bottom and captures print output per step', () => {
  const code = 'total = 0\nfor i in range(3):\n    total += i\n    print("i =", i)\nprint("done", total)\n';
  const { wire, built } = trace(code, { mode: 'script' });
  assert.equal(wire.mode, 'script');
  assert.equal(built.stdout, 'i = 0\ni = 1\ni = 2\ndone 3\n');
  const outs = built.frames.map((f) => f.outLen);
  assert.deepEqual([...outs].sort((a, b) => a - b), outs, 'stdout length never goes backwards');
  assert.ok(outs[outs.length - 1] > outs[0]);
  assert.equal(built.frames[built.frames.length - 1].variables.total.value, 3);
});

test('stdin works for scripts that call input()', () => {
  const { built } = trace('name = input()\nprint("hi " + name)\n', { mode: 'script', stdin: 'Ada\n' });
  assert.equal(built.stdout, 'hi Ada\n');
});

test('syntax errors are reported with a line number and no frames', () => {
  const { built } = trace('def broken(:\n    pass\n');
  assert.equal(built.error.type, 'SyntaxError');
  assert.equal(built.error.line, 1);
  assert.equal(built.frames.length, 0);
});

test('missing argument gives an actionable message', () => {
  const { built } = trace(TWO_SUM, { args: { nums: [1, 2] } });
  assert.match(built.error.message, /missing argument 'target'/);
});

test('binary tree input is built from a LeetCode list and traced as real nodes', () => {
  const code = `class Solution:
    def maxDepth(self, root: Optional[TreeNode]) -> int:
        if not root:
            return 0
        return 1 + max(self.maxDepth(root.left), self.maxDepth(root.right))
`;
  const { built } = trace(code, { args: { root: [3, 9, 20, null, null, 15, 7] } });
  assert.equal(built.resultRaw, 3);
  const root = built.frames[0].variables.root.value;
  assert.equal(root.__class__, 'TreeNode');
  assert.equal(root.val, 3);
  assert.equal(root.left.val, 9);
  assert.equal(root.right.right.val, 7);
  assert.equal(root.left.left, null);
  assert.equal(built.frames[0].variables.root.type, 'TreeNode');
  // 3 -> 20 -> 15 -> (call on the None child) = 4 nested frames
  assert.equal(Math.max(...built.frames.map((f) => f.callStack.length)), 4);
});

test('linked list input and output round-trip', () => {
  const code = `class Solution:
    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        prev = None
        cur = head
        while cur:
            nxt = cur.next
            cur.next = prev
            prev = cur
            cur = nxt
        return prev
`;
  const { built } = trace(code, { args: { head: [1, 2, 3] } });
  assert.deepEqual(built.resultPlain, [3, 2, 1]);
  const mid = built.frames.find((f) => f.variables.prev && f.variables.prev.value && f.variables.prev.value.val === 2);
  assert.ok(mid, 'prev should walk through the list');
  assert.equal(mid.variables.prev.value.__class__, 'ListNode');
});

test('fields of self are shown (memoisation is the thing students debug)', () => {
  const code = `class Solution:
    def __init__(self):
        self.memo = {}
    def climb(self, n):
        if n <= 2:
            return n
        if n in self.memo:
            return self.memo[n]
        self.memo[n] = self.climb(n - 1) + self.climb(n - 2)
        return self.memo[n]
`;
  const { built } = trace(code, { args: { n: 5 }, entry: { name: 'climb', className: 'Solution' } });
  assert.equal(built.resultRaw, 8);
  const grown = built.frames.filter((f) => f.variables.memo).map((f) => Object.keys(f.variables.memo.value).length);
  assert.ok(Math.max(...grown) >= 3);
});

test('library frames are never traced', () => {
  const code = 'def f(xs):\n    return sorted(xs, key=lambda v: -v)\n';
  const { built, wire } = trace(code, { args: { xs: [3, 1, 2] } });
  assert.deepEqual(built.resultRaw, [3, 2, 1]);
  assert.ok(wire.steps.length < 40, `expected a small trace, got ${wire.steps.length}`);
});

test('huge integers are kept exact as strings; big lists are truncated, not exploded', () => {
  const { built } = trace('def f():\n    big = 2 ** 80\n    xs = list(range(500))\n    return len(xs)\n', {});
  const frame = built.frames.find((f) => f.variables.xs);
  assert.equal(frame.variables.big.value, String(2n ** 80n));
  assert.equal(frame.variables.xs.value.length, 61);
  assert.equal(frame.variables.xs.value[60], '+440 more');
});

test('globals the function really uses are shown, unrelated ones are not', () => {
  const code = 'cache = {}\nunused = [1]\ndef f(n):\n    cache[n] = n * 2\n    return cache[n]\n';
  const { built } = trace(code, { args: { n: 4 } });
  const frame = built.frames.find((f) => f.variables.cache);
  assert.ok(frame);
  assert.ok(!built.frames.some((f) => f.variables.unused));
});

test('inspect lists entry points, Solution methods first, helpers last', () => {
  const code = 'class Solution:\n    def solve(self, a: int, b: str = "x"):\n        return self.helper(a)\n    def helper(self, a):\n        return a\n\ndef standalone(x):\n    return x\n';
  const info = JSON.parse(py.globals.get('algolens_inspect')(code));
  assert.equal(info.entries[0].name, 'solve');
  assert.deepEqual(info.entries[0].params.map((p) => [p.name, p.type, p.hasDefault]), [['a', 'int', false], ['b', 'str', true]]);
  assert.equal(info.entries.at(-1).isHelper, true);
  assert.equal(info.scriptLike, false);
  assert.equal(JSON.parse(py.globals.get('algolens_inspect')('print(1)')).scriptLike, true);
});

test('frames unwound by an exception do not pretend to return a value', () => {
  const code = 'def boom():\n    raise ValueError("bad")\n\ndef f():\n    try:\n        boom()\n    except ValueError:\n        return "ok"\n';
  const { built } = trace(code, { entry: { name: 'f' } });
  assert.equal(built.resultRaw, 'ok');
  const unwound = built.frames.find((fr) => fr.unwinding);
  assert.ok(unwound, 'boom() exits by exception');
  assert.equal(unwound.returnValue, undefined);
  // f() itself caught it and returned normally
  assert.equal(built.frames.at(-1).returnValue, 'ok');
});
