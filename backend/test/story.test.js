const test = require('node:test');
const assert = require('node:assert/strict');
const story = require('../services/story');

const body = (extra = {}) => ({
  language: 'python',
  code: 'def best(nums, k):\n    s = sum(nums[:k])\n    return s',
  problem: { title: 'Max sum', description: 'Find the best window.' },
  digest: {
    structures: [{ name: 'nums', lens: 'array' }],
    variables: [{ name: 'k', type: 'int', sample: 4 }],
    beats: [{ i: 0, line: 2, vals: 'k=4' }, { i: 5, line: 4, vals: 'i=5 window_sum=42' }],
    steps: 6,
    result: '51',
  },
  ...extra,
});

test('the request is trimmed and validated', () => {
  const input = story.cleanInput(body());
  assert.equal(input.digest.structures[0].name, 'nums');
  assert.equal(input.digest.beats.length, 2);
  assert.throws(() => story.cleanInput(body({ language: 'cobol' })), /language/i);
  assert.throws(() => story.cleanInput(body({ code: '   ' })), /code/i);
  assert.throws(() => story.cleanInput(body({ digest: null })), /summary/i);
  assert.throws(() => story.cleanInput(body({ digest: { structures: [], beats: [], variables: [] } })), /nothing to explain/i);
  assert.throws(() => story.cleanInput(body({ digest: { ...body().digest, junk: 'x'.repeat(20000) } })), /too large/i);
});

test('code and the run list are capped before they reach the model', () => {
  const big = body({ code: 'x = 1\n'.repeat(5000) });
  big.digest.beats = Array.from({ length: 80 }, (_, i) => ({ i, line: 1, vals: 'y'.repeat(150) }));
  const input = story.cleanInput(big);
  assert.ok(input.code.length <= story.LIMITS.code);
  assert.ok(input.digest.beats.length <= story.LIMITS.beats);
  assert.ok(input.digest.beats.every((b) => b.vals.length <= story.LIMITS.beatText));
  const user = story.buildMessages(input)[1].content;
  assert.ok(user.length < 10000, `the user message is ${user.length} chars`);
});

test('a digest bigger than the limit is refused outright', () => {
  const huge = body();
  huge.digest.beats = Array.from({ length: 80 }, (_, i) => ({ i, line: 1, vals: 'y'.repeat(400) }));
  assert.throws(() => story.cleanInput(huge), /too large/i);
});

test('only safe names may appear in an expression', () => {
  const ok = (e) => story.parseStory(JSON.stringify({ algorithm: 'x', marks: [{ on: 'nums', kind: 'cell', at: e }] })).marks.length === 1;
  for (const e of ['i', 'i-k+1', 'len(nums)-1', 'nums.length-1', 'self.k', 'this.k - 1', 'Math.floor((l+r)/2)', 'min(i, j)', '(lo+hi)//2']) assert.equal(ok(e), true, e);
  const none = (e) => story.parseStory(JSON.stringify({ algorithm: 'x', marks: [{ on: 'nums', kind: 'cell', at: e }] })).marks.length === 0;
  for (const e of ['process.exit(1)', 'window.location', 'a.b.c', 'i;j', 'i`x`', 'i = 5', '']) assert.equal(none(e), true, e);
});

test('the prompt names the structures the model may use, and the same run has the same cache key', () => {
  const a = story.cleanInput(body());
  const b = story.cleanInput(body());
  assert.equal(story.cacheKey(a), story.cacheKey(b));
  assert.notEqual(story.cacheKey(a), story.cacheKey(story.cleanInput(body({ code: 'def other(): pass' }))));
  const [system, user] = story.buildMessages(a);
  assert.equal(system.role, 'system');
  assert.match(user.content, /Structures on screen: nums \(array\)/);
  assert.match(user.content, /#5 L4 i=5 window_sum=42/);
  assert.match(user.content, /Result: 51/);
});

test('a good answer becomes a clean story', () => {
  const raw = '```json\n' + JSON.stringify({
    algorithm: 'Sliding window',
    idea: 'Keep the sum of k neighbours.',
    marks: [
      { on: 'nums', kind: 'range', from: 'i-k+1', to: 'i', label: 'window', tone: 'accent' },
      { on: 'nums', kind: 'cell', at: 'i-k', label: 'leaves', tone: 'danger' },
      { on: 'dp', kind: 'cell', at: ['i-1', 'j-1'], label: 'from', tone: 'accent' },
      { on: 'graph', kind: 'node', at: 'node', label: 'current', tone: 'success' },
    ],
    series: ['window_sum'],
    steps: [{ at: 5, text: 'Sum falls to 42' }],
  }) + '\n```';
  const parsed = story.parseStory(raw);
  assert.equal(parsed.algorithm, 'Sliding window');
  assert.equal(parsed.marks.length, 4);
  assert.deepEqual(parsed.marks[2].at, ['i-1', 'j-1']);
  assert.deepEqual(parsed.series, ['window_sum']);
  assert.deepEqual(parsed.steps, [{ at: 5, text: 'Sum falls to 42' }]);
});

test('anything unsafe or malformed is dropped, never repaired', () => {
  const parsed = story.parseStory(JSON.stringify({
    algorithm: 'A'.repeat(200),
    idea: 'ok',
    marks: [
      { on: 'nums; drop table', kind: 'cell', at: 'i' },
      { on: 'nums', kind: 'cell', at: 'process.exit(1)' },
      { on: 'nums', kind: 'cell', at: 'i`ls`' },
      { on: 'nums', kind: 'teleport', at: 'i' },
      { on: 'nums', kind: 'range', from: 'i' },
      { on: 'nums', kind: 'cell', at: 'i', label: 'L'.repeat(50), tone: 'rainbow' },
      'nonsense',
      null,
    ],
    series: ['good_name', 'bad name', 42],
    steps: [{ at: -1, text: 'no' }, { at: 3, text: '' }, { at: 4, text: 'fine' }],
  }));
  assert.equal(parsed.algorithm.length, story.LIMITS.algorithm);
  assert.equal(parsed.marks.length, 1, 'only the harmless mark survives');
  assert.equal(parsed.marks[0].tone, 'accent', 'an unknown tone falls back');
  assert.equal(parsed.marks[0].label.length, story.LIMITS.label);
  assert.deepEqual(parsed.series, ['good_name']);
  assert.deepEqual(parsed.steps, [{ at: 4, text: 'fine' }]);
});

test('text that is not a story gives null', () => {
  assert.equal(story.parseStory('I cannot help with that.'), null);
  assert.equal(story.parseStory('{"marks": 5}'), null);
  assert.equal(story.parseStory(''), null);
  assert.equal(story.parseStory('{broken json'), null);
});

test('marks and milestones are capped', () => {
  const marks = Array.from({ length: 20 }, (_, i) => ({ on: 'nums', kind: 'cell', at: `i+${i}`, label: 'x' }));
  const steps = Array.from({ length: 20 }, (_, i) => ({ at: i, text: `s${i}` }));
  const parsed = story.parseStory(JSON.stringify({ algorithm: 'x', marks, steps, series: ['a', 'b', 'c', 'd'] }));
  assert.equal(parsed.marks.length, story.LIMITS.marks);
  assert.equal(parsed.steps.length, story.LIMITS.steps);
  assert.equal(parsed.series.length, story.LIMITS.series);
});
