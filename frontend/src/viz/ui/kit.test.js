import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtCell, infinityIn, isHuge, isInfinity, isSentinel } from './kit.js';

test('the well-known infinity constants read as ∞ even on their own', () => {
  for (const x of [1e9, 2147483647, 1073741823, 1061109567, 'Infinity', '1000000000000000000', '9223372036854775807', '4611686018427387903']) {
    assert.ok(isInfinity(x), String(x));
    assert.equal(fmtCell(x, 'cpp', 4, false), '∞', String(x));
  }
  assert.equal(fmtCell('-Infinity', 'python', 4, false), '-∞');
  assert.equal(fmtCell(-2147483647, 'java', 4, false), '-∞');
});

test('ordinary numbers and strings are never turned into ∞', () => {
  for (const x of [0, 7, -3, 999999999, 1.5, 'abc', '1234567890', '1000000000', null, true]) {
    assert.equal(isInfinity(x, true), false, String(x));
  }
  assert.equal(fmtCell(42, 'cpp', 4, true), '42');
  assert.equal(fmtCell(null, 'python', 4, true), 'None');
});

test('another huge value is ∞ only next to everyday numbers (a dist array), not when the whole table is huge', () => {
  const dist = [0, 3, 1500000000, 2];
  assert.equal(infinityIn(dist), true);
  assert.equal(fmtCell(1500000000, 'cpp', 4, infinityIn(dist)), '∞');
  assert.equal(isSentinel(1500000000), false);

  const allHuge = [1500000000, 2500000000];
  assert.equal(infinityIn(allHuge), false);
  assert.equal(fmtCell(1500000000, 'cpp', 4, infinityIn(allHuge)), '1500000000');
});

test('answers modulo 1e9+7 stay numbers unless they are the sentinel itself', () => {
  const dp = [1, 5, 999999937, 42, 1000000006 - 7];
  assert.equal(infinityIn(dp), false);
  assert.equal(dp.some((x) => isInfinity(x, infinityIn(dp))), false);
});

test('only exact integers beyond 2^53 count as huge when they arrive as strings', () => {
  assert.equal(isHuge('9007199254740993'), true);
  assert.equal(isHuge('123456789012345'), false);
  assert.equal(isHuge(Infinity), false);
});
