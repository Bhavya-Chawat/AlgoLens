import test from 'node:test';
import assert from 'node:assert/strict';
import { runJs, inspectJs } from './run.js';
import { buildTrace } from '../../core/frameBuilder.js';

function trace(code, job = {}) {
  const wire = runJs({ code, ...job });
  return { wire, built: buildTrace(wire, code) };
}

const TWO_SUM = `/**
 * @param {number[]} nums
 * @param {number} target
 * @return {number[]}
 */
var twoSum = function(nums, target) {
    const seen = new Map();
    for (let i = 0; i < nums.length; i++) {
        const complement = target - nums[i];
        if (seen.has(complement)) {
            return [seen.get(complement), i];
        }
        seen.set(nums[i], i);
    }
    return [];
};
`;

test('LeetCode style: var f = function, args matched by name', () => {
  const { wire, built } = trace(TWO_SUM, { args: { target: 9, nums: [2, 7, 11, 15] } });
  assert.equal(wire.mode, 'function');
  assert.equal(wire.entry.name, 'twoSum');
  assert.equal(built.error, null);
  assert.deepEqual(built.resultRaw, [0, 1]);
  assert.equal(built.frames[0].eventType, 'function_call');
  assert.equal(built.frames[0].description, 'twoSum(nums=[2, 7, 11, 15], target=9)');
  const last = built.frames.at(-1);
  assert.equal(last.eventType, 'return');
  assert.deepEqual(last.returnValue, [0, 1]);
});

test('loop variables appear step by step, and are flagged when they change', () => {
  const { built } = trace(TWO_SUM, { args: { nums: [2, 7, 11, 15], target: 9 } });
  const iFrames = built.frames.filter((f) => f.variables.i);
  assert.ok(iFrames.length >= 2);
  assert.equal(iFrames[0].variables.i.value, 0);
  const second = iFrames.find((f) => f.variables.i.value === 1);
  assert.ok(second, 'i reaches 1');
  assert.equal(second.variables.i.changedThisFrame, true);
  // `complement` is not shown before its declaration ran (no temporal-dead-zone crash either)
  const firstComplement = built.frames.findIndex((f) => 'complement' in f.variables);
  const firstLoopBody = built.frames.findIndex((f) => f.line === 9); // `const complement = ...`
  assert.ok(firstComplement > firstLoopBody);
});

test('Map and Set values are shown as dict / set', () => {
  const { built } = trace(TWO_SUM, { args: { nums: [2, 7, 11, 15], target: 9 } });
  const withSeen = built.frames.find((f) => f.variables.seen && Object.keys(f.variables.seen.value).length === 1);
  assert.ok(withSeen);
  assert.deepEqual(withSeen.variables.seen.value, { 2: 0 });
  assert.equal(withSeen.variables.seen.type, 'dict');
});

test('function declarations and recursion: a call and a return per call', () => {
  const code = 'function fib(n) {\n  if (n < 2) return n;\n  return fib(n - 1) + fib(n - 2);\n}\n';
  const { built } = trace(code, { args: { n: 5 } });
  assert.equal(built.frames.filter((f) => f.eventType === 'function_call').length, 15);
  assert.equal(built.frames.filter((f) => f.eventType === 'return').length, 15);
  assert.equal(Math.max(...built.frames.map((f) => f.callStack.length)), 5);
  assert.equal(built.resultRaw, 5);
});

test('arrow functions with expression bodies are traced as calls', () => {
  const code = 'const double = (x) => x * 2;\nconst run = (xs) => xs.map(double);\n';
  const { built } = trace(code, { args: { xs: [1, 2, 3] }, entry: { name: 'run' } });
  assert.deepEqual(built.resultRaw, [2, 4, 6]);
  assert.equal(built.frames.filter((f) => f.fn === 'double' && f.eventType === 'function_call').length, 3);
});

test('uncaught exception: bug frame at the right line, with the values that explain it', () => {
  const code = 'function f(a) {\n  let total = 0;\n  for (let i = 0; i <= a.length; i++) {\n    total += a[i].value;\n  }\n  return total;\n}\n';
  const { built } = trace(code, { args: { a: [{ value: 1 }, { value: 2 }] } });
  assert.equal(built.error.type, 'TypeError');
  const bug = built.frames.find((f) => f.isBugFrame);
  assert.ok(bug);
  assert.equal(bug.line, 4);
  assert.equal(bug.variables.i.value, 2);
  assert.equal(built.bugs[0].frameId, bug.id);
  assert.equal(built.resultRaw, null);
});

test('a caught exception is an event, not a bug; unwinding frames do not fake a return value', () => {
  const code = 'function risky() { throw new Error("boom"); }\nfunction f() {\n  try { risky(); } catch (e) { return "recovered"; }\n}\n';
  const { built } = trace(code, { entry: { name: 'f' } });
  assert.equal(built.error, null);
  assert.ok(built.frames.some((f) => f.eventType === 'exception' && !f.isBugFrame));
  assert.equal(built.resultRaw, 'recovered');
  const unwound = built.frames.find((f) => f.unwinding);
  assert.ok(unwound, 'risky() exits by exception');
  assert.equal(unwound.returnValue, undefined);
});

test('infinite loop stops at the step limit, quickly, and says so', () => {
  const code = 'function spin() {\n  let x = 0;\n  while (true) { x++; }\n}\n';
  const started = Date.now();
  const { built } = trace(code, { limits: { steps: 800 } });
  assert.ok(Date.now() - started < 3000);
  assert.equal(built.truncated, true);
  assert.equal(built.bugs[0].type, 'infinite_loop');
  assert.ok(built.frames.at(-1).variables.x.value > 50);
});

test('a catch block cannot swallow the step limit', () => {
  const code = 'function spin() {\n  while (true) {\n    try { for (;;) {} } catch (e) { }\n  }\n}\n';
  const started = Date.now();
  const { built } = trace(code, { limits: { steps: 300 } });
  assert.ok(Date.now() - started < 3000);
  assert.equal(built.truncated, true);
});

test('script mode: runs top to bottom, console.log is captured per step', () => {
  const code = 'let total = 0;\nfor (let i = 0; i < 3; i++) {\n  total += i;\n  console.log("i =", i);\n}\nconsole.log("done", total);\n';
  const { wire, built } = trace(code, { mode: 'script' });
  assert.equal(wire.mode, 'script');
  assert.equal(built.stdout, 'i = 0\ni = 1\ni = 2\ndone 3\n');
  const outs = built.frames.map((f) => f.outLen);
  assert.deepEqual([...outs].sort((a, b) => a - b), outs);
  assert.equal(built.frames.at(-1).variables.total.value, 3);
});

test('syntax errors are reported with a line number and no frames', () => {
  const { built } = trace('function (:\n');
  assert.equal(built.error.type, 'SyntaxError');
  assert.equal(built.error.line, 1);
  assert.equal(built.frames.length, 0);
});

test('missing argument gives an actionable message', () => {
  const { built } = trace(TWO_SUM, { args: { nums: [1, 2] } });
  assert.match(built.error.message, /missing argument 'target'/);
});

test('binary tree from a LeetCode list, TreeNode defined by the harness, JSDoc types used', () => {
  const code = `/**
 * @param {TreeNode} root
 * @return {number}
 */
var maxDepth = function(root) {
    if (!root) return 0;
    return 1 + Math.max(maxDepth(root.left), maxDepth(root.right));
};
`;
  const { built } = trace(code, { args: { root: [3, 9, 20, null, null, 15, 7] } });
  assert.equal(built.resultRaw, 3);
  const root = built.frames[0].variables.root.value;
  assert.equal(root.__class__, 'TreeNode');
  assert.equal(root.val, 3);
  assert.equal(root.left.val, 9);
  assert.equal(root.right.right.val, 7);
  assert.equal(root.left.left, null);
  assert.equal(Math.max(...built.frames.map((f) => f.callStack.length)), 4);
});

test('a TreeNode the user defined themselves is respected (no redeclaration clash)', () => {
  const code = `class TreeNode { constructor(val, left, right) { this.val = val; this.left = left || null; this.right = right || null; } }
function size(root) { return root ? 1 + size(root.left) + size(root.right) : 0; }
`;
  const { built } = trace(code, { args: { root: [1, 2, 3] }, entry: { name: 'size' }, paramTypes: { root: 'TreeNode' } });
  assert.equal(built.error, null);
  assert.equal(built.resultRaw, 3);
});

test('linked list reverse round-trips through plain-list form', () => {
  const code = `/** @param {ListNode} head */
function reverseList(head) {
  let prev = null, cur = head;
  while (cur) { const nxt = cur.next; cur.next = prev; prev = cur; cur = nxt; }
  return prev;
}
`;
  const { built } = trace(code, { args: { head: [1, 2, 3] } });
  assert.deepEqual(built.resultPlain, [3, 2, 1]);
  const mid = built.frames.find((f) => f.variables.prev?.value?.val === 2);
  assert.ok(mid);
  assert.equal(mid.variables.prev.value.__class__, 'ListNode');
});

test('class methods: fields of this are shown (memoisation)', () => {
  const code = `class Solution {
  constructor() { this.memo = {}; }
  climb(n) {
    if (n <= 2) return n;
    if (this.memo[n] !== undefined) return this.memo[n];
    this.memo[n] = this.climb(n - 1) + this.climb(n - 2);
    return this.memo[n];
  }
}
`;
  const { built } = trace(code, { args: { n: 5 }, entry: { name: 'climb', className: 'Solution' } });
  assert.equal(built.resultRaw, 8);
  const grown = built.frames.filter((f) => f.variables.memo).map((f) => Object.keys(f.variables.memo.value).length);
  assert.ok(Math.max(...grown) >= 3);
});

test('derived-class constructors do not crash on this-before-super', () => {
  const code = `class A { constructor() { this.a = 1; } }
class B extends A { constructor() { super(); this.b = 2; } }
function make() { return new B(); }
`;
  const { built } = trace(code, { entry: { name: 'make' } });
  assert.equal(built.error, null);
  assert.equal(built.resultRaw.__class__, 'B');
});

test('outer variables appear only when the function really uses them', () => {
  const code = 'const cache = {};\nconst unused = [1];\nfunction f(n) {\n  cache[n] = n * 2;\n  return cache[n];\n}\n';
  const { built } = trace(code, { args: { n: 4 } });
  assert.ok(built.frames.some((f) => f.variables.cache));
  assert.ok(!built.frames.some((f) => f.variables.unused));
});

test('a loop that never runs still shows its header step (an edge case worth seeing)', () => {
  const code = 'function f(a) {\n  let s = 0;\n  for (const x of a) {\n    s += x;\n  }\n  return s;\n}\n';
  const { built } = trace(code, { args: { a: [] } });
  assert.equal(built.resultRaw, 0);
  assert.ok(built.frames.some((f) => f.line === 3 && f.eventType === 'loop_start'));
  assert.ok(!built.frames.some((f) => f.line === 4));
});

test('switch, labelled loops, destructuring and default params all run correctly', () => {
  const code = `function f({ a, b }, k = 2) {
  let out = 0;
  outer: for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      switch (j) {
        case 0: out += a; break;
        case 1: out += b * k; break;
        default: continue outer;
      }
    }
  }
  return out;
}
`;
  const { built } = trace(code, { args: { arg1: { a: 1, b: 10 } } });
  assert.equal(built.error, null);
  assert.equal(built.resultRaw, 63); // 3 * (1 + 10*2)
});

test('instrumented code returns exactly what the original returns', () => {
  const code = 'function f(n) { let s = 0; for (let i = 1; i <= n; i++) { if (i % 3 === 0) continue; s += i * i; } return s; }';
  const native = new Function(`${code}; return f(20);`)();
  const { built } = trace(code, { args: { n: 20 } });
  assert.equal(built.resultRaw, native);
});

test('big structures are truncated, huge numbers stay safe', () => {
  const { built } = trace('function f() { const xs = Array.from({length: 500}, (_, i) => i); const big = 10n ** 20n; return xs.length; }');
  const frame = built.frames.find((f) => f.variables.xs);
  assert.equal(frame.variables.xs.value.length, 61);
  assert.equal(frame.variables.xs.value[60], '+440 more');
});

test('inspect lists entry points, JSDoc types, helpers last; script detection', () => {
  const info = inspectJs(`/** @param {number[]} nums @param {number} t */
function solve(nums, t = 1) { return helper(nums); }
function helper(a) { return a; }
class Solution { run(x, y) { return x; } }
Solution.prototype.extra = function (q) { return q; };
`);
  const names = info.entries.map((e) => (e.className ? `${e.className}.${e.name}` : e.name));
  assert.equal(names.at(-1), 'helper');
  assert.deepEqual(info.entries.find((e) => e.name === 'solve').params.map((p) => [p.name, p.type, p.hasDefault]), [['nums', 'number[]', false], ['t', 'number', true]]);
  assert.ok(names.includes('Solution.run') && names.includes('Solution.extra'));
  assert.equal(info.scriptLike, false);
  assert.equal(inspectJs('console.log(1)').scriptLike, true);
  assert.equal(inspectJs('const dp = new Array(5).fill(0);\nfunction f(){}').scriptLike, false);
  assert.equal(inspectJs('function f(').error.type, 'SyntaxError');
});
