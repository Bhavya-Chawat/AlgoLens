// End-to-end: real C++ -> g++ -> gdb tracer (inside the Docker sandbox) -> the same frame builder the UI uses.
// Skipped when Docker or the cpp runner image is not available.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildTrace } from '../../../frontend/src/core/frameBuilder.js';

const require = createRequire(import.meta.url);
const { runTrace, runnerStatus } = require('../../../backend/services/exec');

const status = await runnerStatus();
const skip = status.state === 'ready' && status.images.cpp ? false : 'Docker or the cpp runner image is not available';

async function trace(code, job = {}) {
  const wire = await runTrace({ language: 'cpp', code, ...job });
  return { wire, built: buildTrace(wire, code) };
}
const entry = (name, className = 'Solution') => ({ entry: { className, name } });

const TWO_SUM = `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> seen;
        for (int i = 0; i < nums.size(); i++) {
            int complement = target - nums[i];
            if (seen.count(complement)) {
                return {seen[complement], i};
            }
            seen[nums[i]] = i;
        }
        return {};
    }
};`;

describe('C++ tracer (gdb in a sandbox)', { concurrency: 4, skip }, () => {
  it('LeetCode style: class Solution, args by name, STL containers as real values', async () => {
    const { wire, built } = await trace(TWO_SUM, { args: { target: 9, nums: [2, 7, 11, 15] }, ...entry('twoSum') });
    assert.equal(built.error, null, JSON.stringify(wire.output));
    assert.deepEqual(built.resultRaw, [0, 1]);
    assert.equal(built.frames[0].eventType, 'function_call');
    assert.equal(built.frames[0].description, 'twoSum(nums=[2, 7, 11, 15], target=9)');
    const withSeen = built.frames.find((f) => f.variables.seen && Object.keys(f.variables.seen.value).length === 1);
    assert.ok(withSeen, 'unordered_map shows its contents');
    assert.deepEqual(withSeen.variables.seen.value, { 2: 0 });
    assert.equal(withSeen.variables.seen.type, 'dict');
    const iFrames = built.frames.filter((f) => f.variables.i);
    assert.deepEqual([...new Set(iFrames.map((f) => f.variables.i.value))], [0, 1]);
    // the generated driver (main) never appears in the trace
    assert.ok(built.frames.every((f) => f.callStack[0].name === 'twoSum'));
  });

  it('a variable appears only after its declaration ran (no garbage values)', async () => {
    const { built } = await trace(TWO_SUM, { args: { nums: [2, 7, 11, 15], target: 9 }, ...entry('twoSum') });
    const first = built.frames.find((f) => 'complement' in f.variables);
    assert.ok(first.line >= 7, `complement first shown at line ${first.line}`);
    assert.equal(first.variables.complement.value, 7);
  });

  it('recursion: a call and a return per call, real stack depth', async () => {
    const code = 'class Solution {\npublic:\n    int fib(int n) {\n        if (n < 2) return n;\n        return fib(n - 1) + fib(n - 2);\n    }\n};';
    const { built } = await trace(code, { args: { n: 5 }, ...entry('fib') });
    assert.equal(built.resultRaw, 5);
    assert.equal(built.frames.filter((f) => f.eventType === 'function_call').length, 15);
    assert.equal(built.frames.filter((f) => f.eventType === 'return').length, 15);
    assert.equal(Math.max(...built.frames.map((f) => f.callStack.length)), 5);
  });

  it('a vector passed by reference is mutated in front of you (bubble sort)', async () => {
    const code = `class Solution {
public:
    vector<int> sortArray(vector<int>& a) {
        for (int i = 0; i < a.size(); i++) {
            for (int j = 0; j + 1 < a.size() - i; j++) {
                if (a[j] > a[j + 1]) {
                    swap(a[j], a[j + 1]);
                }
            }
        }
        return a;
    }
};`;
    const { built } = await trace(code, { args: { a: [4, 2, 7, 1] }, ...entry('sortArray') });
    assert.deepEqual(built.resultRaw, [1, 2, 4, 7]);
    const states = new Set(built.frames.filter((f) => f.variables.a).map((f) => JSON.stringify(f.variables.a.value)));
    assert.ok(states.has('[4,2,7,1]') && states.has('[1,2,4,7]') && states.size >= 4);
  });

  it('binary tree: TreeNode* built from a LeetCode list, nodes keep their shape', async () => {
    const code = `class Solution {
public:
    int maxDepth(TreeNode* root) {
        if (root == nullptr) return 0;
        return 1 + max(maxDepth(root->left), maxDepth(root->right));
    }
};`;
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

  it('linked list reverse round-trips to plain-list form', async () => {
    const code = `class Solution {
public:
    ListNode* reverseList(ListNode* head) {
        ListNode* prev = nullptr;
        ListNode* cur = head;
        while (cur != nullptr) {
            ListNode* nxt = cur->next;
            cur->next = prev;
            prev = cur;
            cur = nxt;
        }
        return prev;
    }
};`;
    const { built } = await trace(code, { args: { head: [1, 2, 3] }, ...entry('reverseList') });
    assert.deepEqual(built.resultPlain, [3, 2, 1]);
    const mid = built.frames.find((f) => f.variables.prev?.value?.val === 2);
    assert.ok(mid);
    assert.equal(mid.variables.prev.value.__class__, 'ListNode');
  });

  it('uncaught std exception: reported as a bug at the throwing line', async () => {
    const code = `class Solution {
public:
    int get(vector<int>& a, int i) {
        int x = 1;
        return a.at(i);
    }
};`;
    const { built } = await trace(code, { args: { a: [1, 2, 3], i: 9 }, ...entry('get') });
    assert.equal(built.error.type, 'std::out_of_range');
    assert.match(built.error.message, /out_of_range|vector::at|range/i);
    const bug = built.frames.find((f) => f.isBugFrame);
    assert.ok(bug);
    assert.equal(bug.line, 5);
    assert.equal(bug.variables.x.value, 1);
    assert.equal(built.resultRaw, null);
  });

  it('segmentation fault: the line and the values that caused it', async () => {
    const code = `class Solution {
public:
    int deref(int k) {
        int* p = nullptr;
        if (k > 0) {
            return *p;
        }
        return 0;
    }
};`;
    const { built } = await trace(code, { args: { k: 1 }, ...entry('deref') });
    assert.equal(built.error.type, 'SegmentationFault');
    assert.equal(built.frames.find((f) => f.isBugFrame)?.line, 6);
  });

  it('division by zero is reported as an arithmetic error', async () => {
    const code = 'class Solution {\npublic:\n    int div(int a, int b) {\n        return a / b;\n    }\n};';
    const { built } = await trace(code, { args: { a: 1, b: 0 }, ...entry('div') });
    assert.equal(built.error.type, 'ArithmeticException');
  });

  it('a caught exception is an event, not a bug', async () => {
    const code = `class Solution {
public:
    string f(vector<int>& a) {
        try {
            a.at(10);
        } catch (const std::out_of_range& e) {
            return "recovered";
        }
        return "fine";
    }
};`;
    const { built } = await trace(code, { args: { a: [1] }, ...entry('f') });
    assert.equal(built.error, null);
    assert.equal(built.resultRaw, 'recovered');
  });

  it('infinite loop stops at the step limit, in reasonable time', async () => {
    const code = `class Solution {
public:
    int spin() {
        int x = 0;
        while (x >= 0) {
            x++;
        }
        return x;
    }
};`;
    const started = Date.now();
    const { built } = await trace(code, { ...entry('spin'), limits: { steps: 300 } });
    assert.ok(Date.now() - started < 40_000);
    assert.equal(built.truncated, true);
    assert.equal(built.bugs[0].type, 'infinite_loop');
    assert.ok(built.frames.at(-1).variables.x.value > 20);
  });

  it('an endless loop that changes nothing still hits the step limit (identical re-stops count, they are just not shown)', async () => {
    const code = `class Solution {
public:
    int stuck() {
        int x = 0;
        while (x == 0) { }
        return x;
    }
};`;
    const started = Date.now();
    const { built } = await trace(code, { ...entry('stuck'), limits: { steps: 300 } });
    assert.ok(Date.now() - started < 20_000, 'it ran until the idle timeout instead of the step limit');
    assert.equal(built.truncated, true);
    assert.ok(built.frames.length < 300, 'identical steps were not repeated');
  });

  it('compile errors carry the user\'s own line numbers', async () => {
    const { built } = await trace('class Solution {\npublic:\n    int f() {\n        return "text" + ;\n    }\n};', entry('f'));
    assert.equal(built.error.type, 'CompileError');
    assert.equal(built.error.line, 4);
    assert.equal(built.frames.length, 0);
  });

  it('type errors are explained, not hidden', async () => {
    const { built } = await trace('class Solution {\npublic:\n    int f() {\n        string s = 5;\n        return 1;\n    }\n};', entry('f'));
    assert.equal(built.error.type, 'CompileError');
    assert.equal(built.error.line, 4);
  });

  it('program mode: main(), cout and stdin (cin)', async () => {
    const code = `int main() {
    int total = 0, x;
    while (cin >> x) {
        total += x;
    }
    cout << "sum = " << total << endl;
    return 0;
}`;
    const { built } = await trace(code, { mode: 'script', stdin: '3 4 5\n' });
    assert.equal(built.error, null);
    assert.equal(built.stdout.trim(), 'sum = 12');
    assert.ok(built.frames.some((f) => f.variables.total?.value === 12));
  });

  it('a user main() does not clash with the generated driver in function mode', async () => {
    const code = 'int twice(int x) {\n    return x * 2;\n}\nint main() {\n    return twice(1);\n}';
    const { built } = await trace(code, { args: { x: 21 }, entry: { name: 'twice' } });
    assert.equal(built.error, null);
    assert.equal(built.resultRaw, 42);
  });

  it('member variables (this) are shown: memoisation is what students debug', async () => {
    const code = `class Solution {
    unordered_map<int, int> memo;
public:
    int climb(int n) {
        if (n <= 2) return n;
        if (memo.count(n)) return memo[n];
        int r = climb(n - 1) + climb(n - 2);
        memo[n] = r;
        return r;
    }
};`;
    const { built } = await trace(code, { args: { n: 6 }, ...entry('climb') });
    assert.equal(built.resultRaw, 13);
    const sizes = built.frames.filter((f) => f.variables.memo).map((f) => Object.keys(f.variables.memo.value).length);
    assert.ok(Math.max(...sizes) >= 3);
  });

  it('strings, maps, sets, pairs, 2D vectors, doubles and bools', async () => {
    const code = `class Solution {
public:
    string f(string s, vector<vector<int>>& grid, double d, bool flag) {
        map<string, int> counts;
        set<char> letters;
        pair<int, string> p = {7, "seven"};
        for (char c : s) { letters.insert(c); counts[string(1, c)]++; }
        return s + to_string(grid[1][0]) + (flag ? "T" : "F");
    }
};`;
    const { built } = await trace(code, { args: { s: 'abca', grid: [[1, 2], [3, 4]], d: 2.5, flag: true }, ...entry('f') });
    assert.equal(built.resultRaw, 'abca3T');
    const last = built.frames.filter((f) => f.variables.counts && f.variables.letters).at(-1);
    assert.deepEqual(last.variables.counts.value, { a: 2, b: 1, c: 1 });
    assert.deepEqual(last.variables.letters.value, ['a', 'b', 'c']);
    assert.equal(last.variables.counts.type, 'dict');
    assert.equal(last.variables.letters.type, 'set');
    assert.equal(built.frames[0].variables.d.value, 2.5);
    assert.equal(built.frames[0].variables.flag.value, true);
    assert.deepEqual(built.frames[0].variables.grid.value, [[1, 2], [3, 4]]);
  });

  it('a nested braced list: pairs are tuples and the closing brace is not a first step', async () => {
    // GCC files the code that builds the temporaries of `{{1, 4}, {2, 1}}` under the line of the function's final `}`
    const code = `class Solution {
public:
    int f(int source) {
        vector<vector<pair<int, int>>> graph = {
            {{1, 4}, {2, 1}}, {{4, 4}}
        };
        int n = graph.size();
        pair<int, int> edge = graph[0][1];
        return n + edge.first + source;
    }
};`;
    const { built } = await trace(code, { args: { source: 3 }, ...entry('f') });
    assert.equal(built.resultRaw, 7);
    const firstN = built.frames.findIndex((f) => 'n' in f.variables);
    assert.ok(firstN > 0);
    assert.ok(built.frames.slice(0, firstN).every((f) => f.line < 10), 'the closing brace (line 10) ran before the first statement');
    assert.equal(built.frames[firstN].variables.n.value, 2, 'n is shown with its real value, not garbage');
    assert.equal(built.frames[firstN].line, 8);
    // the cleanup loop for the temporaries re-stops on the statement's last line without changing anything
    assert.ok(built.frames.filter((f) => f.line === 6).length <= 2, 'identical steps on line 6 were repeated');
    const last = built.frames.filter((f) => f.variables.edge).at(-1);
    assert.deepEqual(last.variables.edge.value, [2, 1]);
    assert.equal(last.variables.edge.type, 'tuple');
    assert.deepEqual(last.variables.graph.value, [[[1, 4], [2, 1]], [[4, 4]]]);
  });

  it('a loop written on one line still shows every iteration', async () => {
    const code = 'class Solution {\npublic:\n    int sum(int n) {\n        int total = 0;\n        for (int i = 0; i < n; i++) total += i;\n        return total;\n    }\n};';
    const { built } = await trace(code, { args: { n: 4 }, ...entry('sum') });
    assert.equal(built.resultRaw, 6);
    const onLoop = built.frames.filter((f) => f.line === 5 && f.variables.i);
    assert.deepEqual(onLoop.map((f) => f.variables.i.value), [0, 1, 2, 3]);
    assert.deepEqual(onLoop.map((f) => f.variables.total.value), [0, 0, 1, 3]);
  });

  it('range-for: elements that are not assigned yet are never shown as garbage', async () => {
    const code = 'class Solution {\npublic:\n    int total(vector<int>& v) {\n        int sum = 0;\n        for (int x : v) {\n            sum += x;\n        }\n        return sum;\n    }\n};';
    const { built } = await trace(code, { args: { v: [5, 6, 7] }, ...entry('total') });
    assert.equal(built.resultRaw, 18);
    const xs = built.frames.filter((f) => f.variables.x).map((f) => f.variables.x.value);
    assert.ok(xs.length >= 3);
    assert.ok(xs.every((x) => [5, 6, 7].includes(x)), `unexpected x values: ${xs}`);
    // a one-line range-for: the element is hidden at the loop head, but the iterations and their effect show
    const oneLine = 'class Solution {\npublic:\n    int total(vector<int>& v) {\n        int sum = 0;\n        for (int x : v) sum += x;\n        return sum;\n    }\n};';
    const second = await trace(oneLine, { args: { v: [5, 6, 7] }, ...entry('total') });
    assert.equal(second.built.resultRaw, 18);
    assert.ok(second.built.frames.filter((f) => f.line === 5).length >= 3);
    assert.ok(second.built.frames.every((f) => !f.variables.x || [5, 6, 7].includes(f.variables.x.value)));
  });

  it('two calls in a row from the same line are two calls (memoised recursion)', async () => {
    const code = 'class Solution {\npublic:\n    int add(int a, int b) { return a + b; }\n    int run(int n) {\n        return add(n, 1) + add(n, 2);\n    }\n};';
    const { built } = await trace(code, { args: { n: 10 }, ...entry('run') });
    assert.equal(built.resultRaw, 23);
    const calls = built.frames.filter((f) => f.eventType === 'function_call').map((f) => f.description);
    assert.deepEqual(calls, ['run(n=10)', 'add(a=10, b=1)', 'add(a=10, b=2)']);
  });

  it('a lambda passed to a library algorithm is traced when the library calls it', async () => {
    const code = `class Solution {
public:
    vector<int> order(vector<int>& v) {
        sort(v.begin(), v.end(), [](int a, int b) {
            return a > b;
        });
        return v;
    }
};`;
    const { built } = await trace(code, { args: { v: [3, 1, 2] }, ...entry('order') });
    assert.deepEqual(built.resultRaw, [3, 2, 1]);
    assert.ok(built.frames.some((f) => f.eventType === 'function_call' && /operator\(\)|lambda/.test(f.description) || f.callStack.length > 1),
      'the comparator shows up as a call');
  });

  it('void functions that modify a reference parameter', async () => {
    const code = 'class Solution {\npublic:\n    void doubleAll(vector<int>& v) {\n        for (int i = 0; i < v.size(); i++) {\n            v[i] *= 2;\n        }\n    }\n};';
    const { built } = await trace(code, { args: { v: [1, 2, 3] }, ...entry('doubleAll') });
    assert.equal(built.error, null);
    assert.deepEqual(built.frames.at(-1).variables.v.value, [2, 4, 6]);
  });

  it('missing arguments are reported clearly', async () => {
    const { built } = await trace(TWO_SUM, { args: { nums: [1, 2] }, ...entry('twoSum') });
    assert.ok(built.error);
    assert.match(`${built.error.type} ${built.error.message}`, /target|argument|invalid/i);
  });

  it('the sandbox: no network, no secrets from the host', async () => {
    process.env.GROQ_API_KEY = 'gsk_must_not_leak';
    const code = `class Solution {
public:
    string f() {
        const char* k = getenv("GROQ_API_KEY");
        FILE* fp = fopen("/etc/algolens-pwn", "w");
        return string(k ? "LEAK" : "no-secret") + (fp ? "-writable" : "-readonly");
    }
};`;
    const { built } = await trace(code, entry('f'));
    assert.equal(built.resultRaw, 'no-secret-readonly');
  });
});
