import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLooseValue, argsFromInputs, chooseRun, parseEntryChoice } from './buildJob.js';

test('JSON values parse as-is', () => {
  assert.deepEqual(parseLooseValue('[2, 7, 11, 15]'), [2, 7, 11, 15]);
  assert.equal(parseLooseValue('9'), 9);
  assert.equal(parseLooseValue('"abc"'), 'abc');
  assert.equal(parseLooseValue('true'), true);
  assert.deepEqual(parseLooseValue('[3,9,20,null,null,15,7]'), [3, 9, 20, null, null, 15, 7]);
});

test('Python / JS style literals are understood', () => {
  assert.deepEqual(parseLooseValue("['a', 'b']"), ['a', 'b']);
  assert.equal(parseLooseValue('True'), true);
  assert.equal(parseLooseValue('None'), null);
  assert.deepEqual(parseLooseValue('[1, None, 3,]'), [1, null, 3]);
  assert.deepEqual(parseLooseValue("{'k': True, 'n': [None]}"), { k: true, n: [null] });
});

test('text inside strings is never rewritten', () => {
  assert.deepEqual(parseLooseValue("['True story', 'None of it']"), ['True story', 'None of it']);
  assert.equal(parseLooseValue("'it\\'s'"), "it's");
  assert.equal(parseLooseValue('say "hi"'), 'say "hi"'); // not a literal: stays text
});

test('plain text and empty stay strings', () => {
  assert.equal(parseLooseValue('hello world'), 'hello world');
  assert.equal(parseLooseValue(''), '');
  assert.equal(parseLooseValue('2,7,11,15'), '2,7,11,15');
});

test('argsFromInputs ignores blank names and trims keys', () => {
  assert.deepEqual(argsFromInputs([{ key: ' nums ', val: '[1,2]' }, { key: '', val: '5' }, { key: 'k', val: "'x'" }]), { nums: [1, 2], k: 'x' });
});

const fn = (name, className = null) => ({ name, className, params: [], isHelper: false });

test('chooseRun: arguments + function means call the function', () => {
  const info = { entries: [fn('twoSum', 'Solution')], scriptLike: false };
  assert.deepEqual(chooseRun({ info, args: { nums: [1] }, entryChoice: 'auto' }), { mode: 'function', entry: { className: 'Solution', name: 'twoSum' } });
});

test('chooseRun: a script without arguments runs top to bottom', () => {
  const info = { entries: [fn('helper')], scriptLike: true };
  assert.deepEqual(chooseRun({ info, args: {}, entryChoice: 'auto' }), { mode: 'script', entry: null });
});

test('chooseRun: explicit user choices always win', () => {
  const info = { entries: [fn('a'), fn('b')], scriptLike: true };
  assert.deepEqual(chooseRun({ info, args: { x: 1 }, entryChoice: 'script' }), { mode: 'script', entry: null });
  assert.deepEqual(chooseRun({ info, args: {}, entryChoice: 'Solution.b' }), { mode: 'function', entry: { className: 'Solution', name: 'b' } });
  assert.deepEqual(parseEntryChoice('go'), { className: null, name: 'go' });
});

test('chooseRun: no functions at all falls back to script', () => {
  assert.deepEqual(chooseRun({ info: { entries: [], scriptLike: false }, args: {}, entryChoice: 'auto' }), { mode: 'script', entry: null });
});
