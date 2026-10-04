// End-to-end: real Java -> JDK debugger tracer -> collector -> the same frame builder the UI uses.
// Uses the local (unsandboxed) dev runner, which is only enabled by these two env vars.
process.env.ALGOLENS_UNSAFE_LOCAL_RUN = '1';
process.env.RUNNER_MODE = 'local';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { buildTrace } from '../../../frontend/src/core/frameBuilder.js';

const require = createRequire(import.meta.url);
const { runTrace } = require('../../../backend/services/exec');

if (!existsSync(new URL('../dist/algolens-java.jar', import.meta.url))) {
  execFileSync(process.execPath, [new URL('../build.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], { stdio: 'inherit' });
}

async function trace(code, job = {}) {
  const wire = await runTrace({ language: 'java', code, ...job });
  return { wire, built: buildTrace(wire, code) };
}

const TWO_SUM = `class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int complement = target - nums[i];
            if (seen.containsKey(complement)) {
                return new int[]{ seen.get(complement), i };
            }
            seen.put(nums[i], i);
        }
        return new int[]{};
    }
}
`;
const entry = (name, className = 'Solution') => ({ entry: { className, name } });

test('LeetCode style: Solution class, args matched by name, real result', async () => {
  const { wire, built } = await trace(TWO_SUM, { args: { target: 9, nums: [2, 7, 11, 15] }, ...entry('twoSum') });
  assert.equal(built.error, null, JSON.stringify(wire.output));
  assert.deepEqual(built.resultRaw, [0, 1]);
  assert.equal(built.frames[0].eventType, 'function_call');
  assert.equal(built.frames[0].description, 'twoSum(nums=[2, 7, 11, 15], target=9)');
  assert.equal(built.frames.at(-1).eventType, 'return');
  assert.deepEqual(built.frames.at(-1).returnValue, [0, 1]);
  // the harness (constructor, reflection, Gson) is not part of the trace
  assert.ok(built.frames.every((f) => f.callStack.length >= 1 && f.callStack[0].name === 'twoSum'));
});

test('locals appear as they are assigned; collections show their real contents', async () => {
  const { built } = await trace(TWO_SUM, { args: { nums: [2, 7, 11, 15], target: 9 }, ...entry('twoSum') });
  const withSeen = built.frames.find((f) => f.variables.seen && Object.keys(f.variables.seen.value).length === 1);
  assert.ok(withSeen);
  assert.deepEqual(withSeen.variables.seen.value, { 2: 0 });
  assert.equal(withSeen.variables.seen.type, 'dict');
  const iFrames = built.frames.filter((f) => f.variables.i);
  assert.deepEqual([...new Set(iFrames.map((f) => f.variables.i.value))], [0, 1]);
  const firstComplement = built.frames.findIndex((f) => 'complement' in f.variables);
  assert.ok(built.frames[firstComplement].line >= 6, 'complement is shown only after its declaration ran');
});

test('recursion: a call and a return per call, call stack depth, result', async () => {
  const code = 'class Solution {\n    int fib(int n) {\n        if (n < 2) return n;\n        return fib(n - 1) + fib(n - 2);\n    }\n}\n';
  const { built } = await trace(code, { args: { n: 5 }, ...entry('fib') });
  assert.equal(built.resultRaw, 5);
  assert.equal(built.frames.filter((f) => f.eventType === 'function_call').length, 15);
  assert.equal(built.frames.filter((f) => f.eventType === 'return').length, 15);
  assert.equal(Math.max(...built.frames.map((f) => f.callStack.length)), 5);
});

test('arrays are mutated in front of you (bubble sort)', async () => {
  const code = `class Solution {
    public int[] sort(int[] a) {
        for (int i = 0; i < a.length; i++) {
            for (int j = 0; j < a.length - i - 1; j++) {
                if (a[j] > a[j + 1]) { int t = a[j]; a[j] = a[j + 1]; a[j + 1] = t; }
            }
        }
        return a;
    }
}`;
  const { built } = await trace(code, { args: { a: [4, 2, 7, 1] }, ...entry('sort') });
  assert.deepEqual(built.resultRaw, [1, 2, 4, 7]);
  const states = new Set(built.frames.filter((f) => f.variables.a).map((f) => JSON.stringify(f.variables.a.value)));
  assert.ok(states.has('[4,2,7,1]') && states.has('[1,2,4,7]'));
  assert.ok(states.size >= 4, 'the array goes through several intermediate states');
});

test('binary tree input is built from a LeetCode list; nodes keep their shape', async () => {
  const code = `class Solution {
    public int maxDepth(TreeNode root) {
        if (root == null) return 0;
        return 1 + Math.max(maxDepth(root.left), maxDepth(root.right));
    }
}`;
  const { built } = await trace(code, { args: { root: [3, 9, 20, null, null, 15, 7] }, ...entry('maxDepth') });
  assert.equal(built.resultRaw, 3);
  const root = built.frames[0].variables.root.value;
  assert.equal(root.__class__, 'TreeNode');
  assert.equal(root.val, 3);
  assert.equal(root.left.val, 9);
  assert.equal(root.right.right.val, 7);
  assert.equal(root.left.left, null);
  assert.equal(Math.max(...built.frames.map((f) => f.callStack.length)), 4);
});

test('linked list reverse round-trips to plain-list form', async () => {
  const code = `class Solution {
    public ListNode reverseList(ListNode head) {
        ListNode prev = null, cur = head;
        while (cur != null) {
            ListNode nxt = cur.next;
            cur.next = prev;
            prev = cur;
            cur = nxt;
        }
        return prev;
    }
}`;
  const { built } = await trace(code, { args: { head: [1, 2, 3] }, ...entry('reverseList') });
  assert.deepEqual(built.resultPlain, [3, 2, 1]);
  const mid = built.frames.find((f) => f.variables.prev?.value?.val === 2);
  assert.ok(mid);
  assert.equal(mid.variables.prev.value.__class__, 'ListNode');
});

test('uncaught exception: flagged at the throwing line with the values that explain it', async () => {
  const code = 'class Solution {\n    int sum(int[] a) {\n        int total = 0;\n        for (int i = 0; i <= a.length; i++) {\n            total += a[i];\n        }\n        return total;\n    }\n}\n';
  const { built } = await trace(code, { args: { a: [1, 2, 3] }, ...entry('sum') });
  assert.equal(built.error.type, 'ArrayIndexOutOfBoundsException');
  const bug = built.frames.find((f) => f.isBugFrame);
  assert.ok(bug, 'a bug frame exists');
  assert.equal(bug.line, 5);
  assert.equal(bug.variables.i.value, 3);
  assert.equal(built.bugs[0].type, 'index_out_of_bounds');
  assert.equal(built.resultRaw, null);
});

test('null pointer: reported as a bug at the right line', async () => {
  const code = 'class Solution {\n    int len(String s) {\n        return s.length();\n    }\n}\n';
  const { built } = await trace(code, { args: { s: null }, ...entry('len') });
  assert.equal(built.error.type, 'NullPointerException');
  assert.equal(built.frames.find((f) => f.isBugFrame)?.line, 3);
});

test('a caught exception is an event, not a bug', async () => {
  const code = 'class Solution {\n    String f(String s) {\n        try {\n            Integer.parseInt(s);\n        } catch (NumberFormatException e) {\n            return "recovered";\n        }\n        return "number";\n    }\n}\n';
  const { built } = await trace(code, { args: { s: 'abc' }, ...entry('f') });
  assert.equal(built.error, null);
  assert.equal(built.resultRaw, 'recovered');
  assert.ok(built.frames.some((f) => f.eventType === 'exception' && !f.isBugFrame));
  assert.equal(built.bugs.length, 0);
});

test('infinite loop stops at the step limit, in reasonable time', async () => {
  const code = `class Solution {
    int spin() {
        int x = 0;
        while (x >= 0) { // javac drops the condition of while(true), leaving no line to step on
            x++;
        }
        return x;
    }
}
`;
  const started = Date.now();
  const { built } = await trace(code, { ...entry('spin'), limits: { steps: 300 } });
  assert.ok(Date.now() - started < 25_000, `took ${Date.now() - started} ms`);
  assert.equal(built.truncated, true);
  assert.equal(built.bugs[0].type, 'infinite_loop');
  assert.ok(built.frames.at(-1).variables.x.value > 20);
});

test('a loop that never leaves ONE source line is caught by the no-progress watchdog', async () => {
  const code = `class Solution {
    int spin() {
        int x = 0;
        while (true) { x++; }
    }
}
`;
  const started = Date.now();
  const { built } = await trace(code, { ...entry('spin'), limits: { steps: 5000, idleMs: 2500 } });
  assert.ok(Date.now() - started < 20_000, `took ${Date.now() - started} ms`);
  assert.equal(built.error.type, 'Timeout');
});

test('null arguments reach the program as null (not as a missing argument)', async () => {
  const code = `class Solution {
    String f(String s) {
        return String.valueOf(s);
    }
}
`;
  const { built } = await trace(code, { args: { s: null }, ...entry('f') });
  assert.equal(built.error, null);
  assert.equal(built.resultRaw, 'null');
});

test('compile errors are reported with the right line and no frames', async () => {
  const { built } = await trace('class Solution {\n    int f() {\n        return "text" + ;\n    }\n}\n', entry('f'));
  assert.equal(built.error.type, 'CompileError');
  assert.equal(built.error.line, 3);
  assert.equal(built.frames.length, 0);
});

test('type errors the compiler finds are explained, not hidden', async () => {
  const { built } = await trace('class Solution {\n    int f() {\n        String s = 5;\n        return 1;\n    }\n}\n', entry('f'));
  assert.equal(built.error.type, 'CompileError');
  assert.match(built.error.message, /incompatible types/);
});

test('program mode: main(), System.out and stdin (Scanner)', async () => {
  const code = `public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int total = 0;
        while (in.hasNextInt()) { total += in.nextInt(); }
        System.out.println("sum = " + total);
    }
}`;
  const { built } = await trace(code, { mode: 'script', stdin: '3 4 5\n' });
  assert.equal(built.error, null);
  assert.equal(built.stdout.trim(), 'sum = 12');
  assert.ok(built.frames.some((f) => f.variables.total?.value === 12));
});

test('fields of the object are shown (memoisation is what students debug)', async () => {
  const code = `class Solution {
    private Map<Integer, Integer> memo = new HashMap<>();
    int climb(int n) {
        if (n <= 2) return n;
        if (memo.containsKey(n)) return memo.get(n);
        int r = climb(n - 1) + climb(n - 2);
        memo.put(n, r);
        return r;
    }
}`;
  const { built } = await trace(code, { args: { n: 6 }, ...entry('climb') });
  assert.equal(built.resultRaw, 13);
  const sizes = built.frames.filter((f) => f.variables.memo).map((f) => Object.keys(f.variables.memo.value).length);
  assert.ok(Math.max(...sizes) >= 3);
});

test('strings, chars and char[] parameters convert from JSON', async () => {
  const code = 'class Solution {\n    String f(String s, char[] cs, long big) {\n        return s + new String(cs) + big;\n    }\n}\n';
  const { built } = await trace(code, { args: { s: 'ab', cs: ['c', 'd'], big: 7 }, ...entry('f') });
  assert.equal(built.resultRaw, 'abcd7');
});

test('missing argument gives an actionable message', async () => {
  const { built } = await trace(TWO_SUM, { args: { nums: [1, 2] }, ...entry('twoSum') });
  assert.match(built.error.message, /nums|target|argument/i);
});

test('lambdas and streams in the solution do not break tracing', async () => {
  const code = 'class Solution {\n    int f(int[] a) {\n        return Arrays.stream(a).map(x -> x * 2).sum();\n    }\n}\n';
  const { built } = await trace(code, { args: { a: [1, 2, 3] }, ...entry('f') });
  assert.equal(built.error, null);
  assert.equal(built.resultRaw, 12);
});

test('the traced program cannot see the user environment (no leaked secrets)', async () => {
  process.env.GROQ_API_KEY = 'gsk_must_not_leak';
  const code = 'class Solution {\n    String f() { return String.valueOf(System.getenv("GROQ_API_KEY")); }\n}\n';
  const { built } = await trace(code, entry('f'));
  assert.equal(built.resultRaw, 'null');
});
