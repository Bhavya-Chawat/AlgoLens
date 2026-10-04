const test = require('node:test');
const assert = require('node:assert/strict');
const { inspect } = require('../services/inspect');

const names = (info) => info.entries.map((e) => (e.className ? `${e.className}.${e.name}` : e.name));

test('Java: LeetCode Solution class, parameter names and types, helpers last', async () => {
  const info = await inspect('java', `class Solution {
    public int[] twoSum(int[] nums, int target) { return helper(nums); }
    private int[] helper(int[] a) { return a; }
    public List<List<Integer>> group(Map<String, Integer> m, TreeNode root) { return null; }
}`);
  assert.deepEqual(names(info), ['Solution.twoSum', 'Solution.group', 'Solution.helper']);
  const two = info.entries[0];
  assert.deepEqual(two.params.map((p) => [p.name, p.type]), [['nums', 'int[]'], ['target', 'int']]);
  assert.equal(two.returnType, 'int[]');
  assert.equal(info.entries.at(-1).isHelper, true);
  assert.deepEqual(info.entries[1].params.map((p) => p.type), ['Map<String, Integer>', 'TreeNode']);
  assert.equal(info.scriptLike, false);
});

test('Java: a program with main() is script-like and main is not offered as an entry', async () => {
  const info = await inspect('java', 'public class Main {\n  public static void main(String[] args) { System.out.println(1); }\n  static int sq(int x) { return x * x; }\n}');
  assert.equal(info.scriptLike, true);
  assert.deepEqual(names(info), ['Main.sq']);
});

test('Java: recursion alone does not make a method a helper', async () => {
  const info = await inspect('java', 'class Solution {\n  int fib(int n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }\n}');
  assert.equal(info.entries[0].isHelper, false);
});

test('Java: broken code still yields what can be read (the real error comes from the compiler)', async () => {
  const info = await inspect('java', 'class Solution {\n  public int f(int a) { return a + ; }\n}');
  assert.deepEqual(names(info), ['Solution.f']);
});

test('C++: LeetCode class, reference/const/pointer parameters keep their full types', async () => {
  const info = await inspect('cpp', `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) { return nums; }
    int count(const string& s, char* p, int k = 3) { return k; }
private:
    int hidden(int x) { return x; }
};`);
  assert.deepEqual(names(info), ['Solution.twoSum', 'Solution.count']);
  assert.deepEqual(info.entries[0].params.map((p) => [p.name, p.type]), [['nums', 'vector<int>&'], ['target', 'int']]);
  assert.deepEqual(info.entries[1].params.map((p) => [p.name, p.type, p.hasDefault]), [['s', 'const string&', false], ['p', 'char*', false], ['k', 'int', true]]);
  assert.equal(info.entries[0].returnType, 'vector<int>');
});

test('C++: free functions, main marks a program, helpers detected', async () => {
  const info = await inspect('cpp', `int helper(int x) { return x; }
int solve(int a) { return helper(a); }
int main() { return solve(1); }`);
  assert.equal(info.scriptLike, true);
  assert.deepEqual(names(info), ['solve', 'helper']);
});

test('C++: out-of-class definitions and struct members (public by default)', async () => {
  const info = await inspect('cpp', `struct Box { int area(int w, int h) { return w * h; } };
int Solution::run(int x) { return x; }`);
  assert.deepEqual(names(info).sort(), ['Box.area', 'run']);
});

test('only Java and C++ are inspected on the server', async () => {
  await assert.rejects(inspect('python', 'x = 1'), /browser/);
});
