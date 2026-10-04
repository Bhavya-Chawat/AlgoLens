import test from 'node:test';
import assert from 'node:assert/strict';
import { traceExample } from '../viz/testkit.js';
import { buildModel } from '../viz/model.js';
import { buildDigest, checkStory, requestStory } from './story.js';

const WINDOW = `def best_window(nums, k):
    window_sum = sum(nums[:k])
    max_sum = window_sum
    for i in range(k, len(nums)):
        window_sum = window_sum - nums[i - k] + nums[i]
        max_sum = max(max_sum, window_sum)
    return max_sum
`;

async function windowModel() {
  const { built, job } = await traceExample({ python: { code: WINDOW, args: { nums: [1, 12, -5, -6, 50, 3], k: 4 } } }, 'python');
  return buildModel(built.frames, { code: job.code, language: 'python' });
}

test('the digest is a few hundred tokens: structures, variables, sampled steps and the result', async () => {
  const model = await windowModel();
  const n = model.frames.length;
  const digest = buildDigest(model, { result: 51 });
  assert.ok(digest.structures.some((s) => s.name === 'nums' && ['array', 'dp1'].includes(s.lens)), 'the array on screen is named');
  assert.ok(digest.structures.every((s) => s.lens !== 'scalars' && s.lens !== 'calltree'));
  assert.ok(digest.variables.some((v) => v.name === 'window_sum'));
  assert.ok(digest.beats.length <= 24);
  assert.equal(digest.beats[0].i, 0);
  assert.equal(digest.beats.at(-1).i, n - 1);
  assert.ok(digest.beats.every((b) => b.vals.length <= 120));
  assert.ok(digest.beats.some((b) => /window_sum=\d+/.test(b.vals)), 'steps carry real values');
  assert.equal(digest.steps, n);
  assert.equal(digest.result, '51');
  assert.ok(JSON.stringify(digest).length < 6000, `the digest is ${JSON.stringify(digest).length} characters`);
});

test('the digest of a run with no structures still works', async () => {
  const { built, job } = await traceExample({ python: { code: 'def f(a, b):\n    c = a + b\n    return c\n', args: { a: 1, b: 2 } } }, 'python');
  const digest = buildDigest(buildModel(built.frames, { code: job.code, language: 'python' }), {});
  assert.deepEqual(digest.structures, []);
  assert.ok(digest.beats.length > 0);
  assert.equal(digest.result, '');
});

test('checkStory keeps the marks, chart variables and milestones that hold up against the run', async () => {
  const model = await windowModel();
  const n = model.frames.length;
  const mark = (m) => ({ label: 'x', tone: 'accent', ...m });
  const { story, dropped } = checkStory({
    algorithm: 'Sliding window',
    idea: 'Keep the sum of k neighbours.',
    marks: [
      mark({ on: 'nums', kind: 'range', from: 'i-k+1', to: 'i' }),
      mark({ on: 'nums', kind: 'cell', at: ['i'] }),
      mark({ on: 'ghost', kind: 'cell', at: ['i'] }), // no such structure on screen
      mark({ on: 'nums', kind: 'cell', at: ['i+100'] }), // never inside the array
      mark({ on: 'nums', kind: 'cell', at: ['nothing_like_this'] }), // unknown name
    ],
    series: ['window_sum', 'not_a_variable', 'k'], // k never changes: a chart of one point says nothing
    steps: [{ at: 2, text: 'first window' }, { at: n + 50, text: 'beyond the run' }],
  }, model);
  assert.deepEqual(story.marks.map((m) => m.kind), ['range', 'cell']);
  assert.deepEqual(story.series, ['window_sum']);
  assert.deepEqual(story.steps, [{ at: 2, text: 'first window' }]);
  assert.deepEqual(dropped, { marks: 3, series: 2, steps: 1 });
  assert.equal(story.algorithm, 'Sliding window');
});

test('one request: the right route, the run summary and the run id in the body, and the answer comes back as is', async () => {
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url, init });
    return { ok: true, json: async () => ({ story: { algorithm: 'Binary search', idea: '', marks: [], series: [], steps: [] }, cached: false }) };
  };
  try {
    const digest = { structures: [{ name: 'nums', lens: 'array' }], variables: [], beats: [{ i: 0, line: 1, vals: 'k=1' }], steps: 1, result: '' };
    const out = await requestStory({ language: 'python', code: 'x = 1', problem: { title: 'T', description: 'D' }, digest, runId: 7 });
    assert.equal(out.story.algorithm, 'Binary search');
    assert.equal(seen.length, 1, 'exactly one request');
    assert.equal(seen[0].url, '/api/ai/story');
    assert.equal(seen[0].init.method, 'POST');
    const body = JSON.parse(seen[0].init.body);
    assert.deepEqual(Object.keys(body).sort(), ['code', 'digest', 'language', 'problem', 'runId']);
    assert.equal(body.runId, 7);
    assert.deepEqual(body.digest, digest);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a failed request is a readable error, not a crash', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({ error: 'You have used today\'s 40 AI explanations.', code: 'daily_limit' }) });
  try {
    await assert.rejects(
      requestStory({ language: 'python', code: 'x', problem: null, digest: { structures: [], variables: [], beats: [], steps: 0, result: '' } }),
      (e) => e.code === 'daily_limit' && /40 AI explanations/.test(e.message),
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});
