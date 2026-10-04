import test from 'node:test';
import assert from 'node:assert/strict';
import { EDGE_THEMES, edgeCase, edgeCases, kindFromValue, parseType } from './edgeCases.js';

const P = (name, type) => ({ name, type });

test('declared types of every language are understood', () => {
  const cases = {
    'vector<int>&': [1, 'int'], 'const vector<vector<int>>&': [2, 'int'], 'int[]': [1, 'int'], 'int[][]': [2, 'int'],
    'List<Integer>': [1, 'int'], 'List<List<String>>': [2, 'text'], 'List[int]': [1, 'int'], 'list[list[float]]': [2, 'float'],
    'integer[]': [1, 'int'], 'list<list<integer>>': [2, 'int'], 'number[]': [1, 'int'], 'string[]': [1, 'text'], 'char[][]': [2, 'text'],
    int: [0, 'int'], integer: [0, 'int'], 'long long': [0, 'int'], double: [0, 'float'], string: [0, 'text'], 'std::string': [0, 'text'],
    str: [0, 'text'], boolean: [0, 'bool'], bool: [0, 'bool'], 'vector<bool>': [1, 'bool'],
  };
  for (const [type, [depth, base]] of Object.entries(cases)) {
    const k = parseType(type);
    assert.ok(k, type);
    assert.deepEqual([k.depth, k.base], [depth, base], type);
  }
  assert.equal(parseType('TreeNode*').base, 'tree');
  assert.equal(parseType('Optional[TreeNode]').base, 'tree');
  assert.equal(parseType('ListNode*').base, 'linked');
  assert.equal(parseType('unsigned int').unsigned, true);
  assert.equal(parseType('dict'), null);
  assert.equal(parseType(null), null);
});

test('a missing type falls back to the shape of the value typed in', () => {
  assert.deepEqual(kindFromValue([1, 2, 3]), { depth: 1, base: 'int', unsigned: false });
  assert.deepEqual(kindFromValue([[1.5]]), { depth: 2, base: 'float', unsigned: false });
  assert.deepEqual(kindFromValue(['a', 'b']), { depth: 1, base: 'text', unsigned: false });
  assert.deepEqual(kindFromValue('hello'), { depth: 0, base: 'text', unsigned: false });
  assert.deepEqual(kindFromValue([]), { depth: 1, base: 'int', unsigned: false });
  assert.equal(kindFromValue(null), null);
});

test('the cases follow the function\'s parameters, whatever they are called', () => {
  const params = [P('arr', 'vector<int>&'), P('k', 'int'), P('word', 'string')];
  const c = (id) => edgeCase(id, params).data;
  assert.deepEqual(c('empty'), { arr: [], k: 0, word: '' });
  assert.deepEqual(c('single'), { arr: [1], k: 1, word: 'a' });
  assert.deepEqual(c('equal').arr, [3, 3, 3, 3, 3]);
  assert.deepEqual(c('sorted').arr, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(c('reversed').arr, [8, 7, 6, 5, 4, 3, 2, 1]);
  assert.equal(c('reversed').word, 'hgfedcba');
  assert.ok(c('negative').arr.some((x) => x < 0));
  assert.ok(c('extreme').arr.includes(2147483647) && c('extreme').arr.includes(-2147483648));
  assert.equal(c('extreme').k, 2147483647);
});

test('grids, trees, linked lists, bools and floats get proper shapes', () => {
  const p = [P('grid', 'int[][]'), P('root', 'TreeNode*'), P('head', 'ListNode*'), P('flag', 'bool'), P('x', 'double')];
  const sorted = edgeCase('sorted', p).data;
  assert.deepEqual(sorted.grid, [[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
  assert.deepEqual(sorted.root, [4, 2, 6, 1, 3, 5, 7]);
  assert.deepEqual(sorted.head, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(typeof sorted.flag, 'boolean');
  assert.equal(sorted.x, 3.5);
  const empty = edgeCase('empty', p).data;
  assert.deepEqual([empty.grid, empty.root, empty.head, empty.flag], [[], [], [], false]);
  assert.deepEqual(edgeCase('reversed', p).data.root, [1, null, 2, null, 3, null, 4]);
});

test('unannotated parameters use what was typed in; with nothing typed they are left out and reported', () => {
  const params = [P('a', null), P('b', null), P('c', null)];
  const made = edgeCase('single', params, { sample: { a: [5, 6], b: 'text' } });
  assert.deepEqual(made.data, { a: [1], b: 'a' });
  assert.deepEqual(made.unknown, ['c']);
});

test('random cases are seeded: the same seed gives the same case, another seed another one', () => {
  const params = [P('xs', 'int[]')];
  const a = edgeCase('random', params, { seed: 7 }).data.xs;
  assert.deepEqual(edgeCase('random', params, { seed: 7 }).data.xs, a);
  assert.notDeepEqual(edgeCase('random', params, { seed: 8 }).data.xs, a);
  assert.equal(a.length, 8);
  assert.ok(a.every((x) => Number.isInteger(x) && x >= 0 && x < 50));
});

test('unsigned parameters never receive negative values', () => {
  const params = [P('n', 'unsigned int'), P('xs', 'vector<unsigned>')];
  for (const t of EDGE_THEMES) {
    const d = edgeCase(t.id, params).data;
    assert.ok(d.n >= 0, `${t.id} n=${d.n}`);
    assert.ok(d.xs.every((x) => x >= 0), `${t.id} xs=${d.xs}`);
  }
});

test('every theme produces JSON-safe data for every kind', () => {
  const params = [P('a', 'int[]'), P('b', 'string[]'), P('c', 'double[][]'), P('d', 'bool[]'), P('e', 'TreeNode*'), P('f', 'int[][][]')];
  for (const c of edgeCases(params)) {
    assert.deepEqual(JSON.parse(JSON.stringify(c.data)), c.data, c.theme);
    assert.equal(c.unknown.length, 0);
  }
  assert.equal(edgeCases(params).length, EDGE_THEMES.length);
  assert.throws(() => edgeCase('nope', params), /Unknown edge-case theme/);
});
