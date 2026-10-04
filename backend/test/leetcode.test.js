const test = require('node:test');
const assert = require('node:assert/strict');
const lc = require('../services/leetcode');

const TWO_SUM = {
  title: 'Two Sum',
  titleSlug: 'two-sum',
  difficulty: 'Easy',
  exampleTestcaseList: ['[2,7,11,15]\n9', '[3,2,4]\n6', '[3,3]\n6'],
  metaData: JSON.stringify({
    name: 'twoSum',
    params: [{ name: 'nums', type: 'integer[]' }, { name: 'target', type: 'integer' }],
    return: { type: 'integer[]', size: 2 },
  }),
  content: [
    '<pre><strong>Input:</strong> nums = [2,7,11,15], target = 9\n<strong>Output:</strong> [0,1]\nExplanation: x</pre>',
    '<pre><strong>Input:</strong> nums = [3,2,4], target = 6\n<strong>Output:</strong> [1,2]</pre>',
    '<pre><strong>Input:</strong> nums = [3,3], target = 6\n<strong>Output:</strong> [0,1]</pre>',
  ].join(''),
  topicTags: [{ name: 'Array' }],
  codeSnippets: [{ langSlug: 'python3', code: 'class Solution: ...' }],
};

test('extractSlug accepts URLs and bare slugs', () => {
  assert.equal(lc.extractSlug('https://leetcode.com/problems/two-sum/description/'), 'two-sum');
  assert.equal(lc.extractSlug('leetcode.com/problems/valid-parentheses'), 'valid-parentheses');
  assert.equal(lc.extractSlug('Two-Sum'), 'two-sum');
  assert.equal(lc.extractSlug(''), null);
});

test('parseQuestion builds named testcases and expected outputs locally', () => {
  const p = lc.parseQuestion(TWO_SUM);
  assert.deepEqual(p.testcases[0], { nums: [2, 7, 11, 15], target: 9 });
  assert.deepEqual(p.testcases[2], { nums: [3, 3], target: 6 });
  assert.deepEqual(p.expected, [[0, 1], [1, 2], [0, 1]]);
  assert.equal(p.signature.name, 'twoSum');
  assert.deepEqual(p.signature.params.map((x) => x.type), ['integer[]', 'integer']);
  assert.equal(p.timeComplexity, null); // never guessed by an LLM
});

test('string, bool and tree-style parameters survive parsing', () => {
  const meta = lc.parseMeta(JSON.stringify({ params: [{ name: 's', type: 'string' }, { name: 'root', type: 'TreeNode' }, { name: 'ok', type: 'boolean' }] }));
  const [t] = lc.parseTestcases(['"abc"\n[1,null,2]\ntrue'], meta);
  assert.deepEqual(t, { s: 'abc', root: [1, null, 2], ok: true });
});

test('mismatched example lines yield no testcases instead of wrong ones', () => {
  const meta = lc.parseMeta(TWO_SUM.metaData);
  assert.deepEqual(lc.parseTestcases(['[1,2]'], meta), []);
});

test('expected outputs are dropped when they do not line up with examples', () => {
  const p = lc.parseQuestion({ ...TWO_SUM, content: TWO_SUM.content.split('</pre>')[0] + '</pre>' });
  assert.deepEqual(p.expected, [null, null, null]);
});

test('system-design problems are not parsed as function testcases', () => {
  const meta = lc.parseMeta(JSON.stringify({ classname: 'LRUCache', systemdesign: true, params: [] }));
  assert.deepEqual(lc.parseTestcases(['x'], meta), []);
});
