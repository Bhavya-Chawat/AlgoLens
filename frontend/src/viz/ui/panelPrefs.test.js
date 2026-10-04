import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_OPEN, codeKey, isFolded, isOpen, patch, readAll, sizeOf, store, withSize, writeAll,
} from './panelPrefs.js';

const memory = () => {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
};

test('the first few panels start open, the rest start in the tray', () => {
  for (let rank = 0; rank < 8; rank += 1) assert.equal(isOpen({}, 'graph:g', rank), rank < DEFAULT_OPEN);
});

test('what the person chose wins over the default, both ways', () => {
  let p = patch({}, 'a', { open: false });
  assert.equal(isOpen(p, 'a', 0), false, 'a top panel the person closed stays closed');
  p = patch(p, 'b', { open: true });
  assert.equal(isOpen(p, 'b', 7), true, 'a panel from the tray they opened stays open');
});

test('closing a panel is not forgotten by a later change to it', () => {
  let p = patch({}, 'a', { open: false });
  p = patch(p, 'a', { folded: true });
  p = withSize(p, 'a', { w: 400, h: 300 });
  assert.equal(p.a.open, false);
  assert.equal(isFolded(p, 'a'), true);
  p = patch(p, 'a', { folded: false });
  assert.equal(isFolded(p, 'a'), false);
  assert.ok(!('folded' in p.a), 'the default is not stored');
});

test('sizes: set, read back, reset, and a half-set size is kept as it is', () => {
  let p = withSize({}, 'a', { w: 480, h: null });
  assert.deepEqual(sizeOf(p, 'a'), { w: 480, h: null });
  p = withSize(p, 'a', { w: 480, h: 260 });
  assert.deepEqual(sizeOf(p, 'a'), { w: 480, h: 260 });
  p = withSize(p, 'a', null);
  assert.equal(sizeOf(p, 'a'), null);
  assert.equal(sizeOf({}, 'nothing'), null);
});

test('the arrangement belongs to the program: same code, same key; different code, different key', () => {
  assert.equal(codeKey('x = 1'), codeKey('x = 1'));
  assert.notEqual(codeKey('x = 1'), codeKey('x = 2'));
  assert.match(codeKey(''), /^[0-9a-z]+$/);
});

test('only the last 30 programs are remembered, newest last', () => {
  let all = {};
  for (let i = 0; i < 40; i += 1) all = store(all, `p${i}`, { a: { open: false } });
  assert.equal(Object.keys(all).length, 30);
  assert.ok(!('p0' in all) && 'p39' in all);
  all = store(all, 'p20', { a: { open: true } });
  assert.equal(Object.keys(all).at(-1), 'p20', 'touching a program moves it to the end');
});

test('storage that is missing, full or corrupt never breaks the page', () => {
  assert.deepEqual(readAll(null), {});
  assert.deepEqual(readAll({ getItem: () => '{not json' }), {});
  assert.deepEqual(readAll({ getItem: () => '[1,2]' }), {});
  assert.doesNotThrow(() => writeAll({ a: 1 }, { setItem: () => { throw new Error('quota'); } }));
  const s = memory();
  writeAll({ k: { a: { open: false } } }, s);
  assert.deepEqual(readAll(s), { k: { a: { open: false } } });
});
