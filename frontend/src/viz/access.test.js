import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from './expr.js';
import { accessesOnLine, subscripts } from './access.js';

const env = (scalars = {}, arrays = {}) => ({
  lookup: (n) => scalars[n],
  lengthOf: (n) => arrays[n]?.length,
  valueAt: (n, i) => arrays[n]?.[i],
});

test('expressions: arithmetic, floor division, len, Math.floor, bit tricks', () => {
  const look = (n) => ({ i: 3, j: 5, lo: 2, hi: 9, n: 10 })[n];
  const len = (n) => (n === 'nums' ? 7 : undefined);
  assert.equal(evaluate('i - 1', look), 2);
  assert.equal(evaluate('(lo + hi) // 2', look), 5);
  assert.equal(evaluate('Math.floor((lo + hi) / 2)', look), 5);
  assert.equal(evaluate('(lo + hi) / 2', look), 5); // integer division in C-like languages
  assert.equal(evaluate('n - 1 - i', look), 6);
  assert.equal(evaluate('len(nums) - 1', look, len), 6);
  assert.equal(evaluate('nums.length - 1', look, len), 6);
  assert.equal(evaluate('i & -i', look), 1);
  assert.equal(evaluate('j * 2 + 1', look), 11);
  assert.equal(evaluate('-1', look), -1);
});

test('expressions: unknown names or calls give null, never a guess', () => {
  const look = (n) => ({ i: 3 })[n];
  assert.equal(evaluate('i + unknown', look), null);
  assert.equal(evaluate('foo(i)', look), null);
  assert.equal(evaluate('i +', look), null);
});

test('subscripts are found in nested and chained form', () => {
  const subs = subscripts('dp[i][j] = dp[i - 1][j] + dp[i][j - 1]');
  assert.deepEqual(subs.map((s) => [s.name, s.exprs]), [['dp', ['i', 'j']], ['dp', ['i - 1', 'j']], ['dp', ['i', 'j - 1']]]);
  const nested = subscripts('while stack and nums[stack[-1]] < v:');
  assert.deepEqual(nested.map((s) => s.name), ['nums', 'stack']);
});

test('DP line: one write, the cells it reads', () => {
  const acc = accessesOnLine('dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])', env({ i: 2, j: 3 }));
  assert.deepEqual(acc.filter((a) => a.kind === 'write').map((a) => a.index), [[2, 3]]);
  assert.deepEqual(acc.filter((a) => a.kind === 'read').map((a) => a.index), [[1, 3], [2, 2]]);
});

test('a swap writes both cells and reads both', () => {
  const acc = accessesOnLine('arr[j], arr[j + 1] = arr[j + 1], arr[j]', env({ j: 4 }));
  assert.deepEqual(acc.filter((a) => a.kind === 'write').map((a) => a.index[0]).sort(), [4, 5]);
  assert.deepEqual(acc.filter((a) => a.kind === 'read').map((a) => a.index[0]).sort(), [4, 5]);
});

test('comparisons are reads; compound assignment is a write', () => {
  const read = accessesOnLine('if arr[j] > arr[j + 1]:', env({ j: 1 }));
  assert.ok(read.every((a) => a.kind === 'read') && read.length === 2);
  const compound = accessesOnLine('count[x] += 1', env({ x: 3 }));
  assert.deepEqual(compound.map((a) => [a.kind, a.index]), [['write', [3]]]);
});

test('call arguments are not assignment targets', () => {
  const acc = accessesOnLine("print(arr[i], end=' ')", env({ i: 2 }));
  assert.deepEqual(acc.map((a) => [a.kind, a.index]), [['read', [2]]]);
});

test('negative indexes count from the end; nested indexes resolve through the array', () => {
  const env1 = env({ v: 3 }, { stack: [0, 2, 5], nums: [9, 8, 7, 6, 5, 4] });
  const acc = accessesOnLine('while stack and nums[stack[-1]] < v:', env1);
  assert.deepEqual(acc.map((a) => [a.name, a.index[0]]), [['nums', 5], ['stack', 2]]);
});

test('slices and unknown indexes are left out', () => {
  assert.deepEqual(accessesOnLine('part = nums[lo:hi]', env({ lo: 1, hi: 3 })), []);
  assert.deepEqual(accessesOnLine('x = arr[foo(i)]', env({ i: 1 })), []);
});

test('strings in the line are ignored', () => {
  assert.deepEqual(accessesOnLine("msg = 'a[1] = b[2]'", env({})), []);
});
