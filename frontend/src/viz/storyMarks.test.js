import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES } from '../constants/examples/index.js';
import { traceExample } from './testkit.js';
import { buildModel } from './model.js';
import { recognize } from './recognize.js';
import {
  applyStory, marksThatHold, resolveMark, sampleSteps, scopeLookup, seriesFor,
} from './storyMarks.js';

// The AI only says WHERE to point ("the window is i-k+1 .. i"); these tests check that the pointing is worked out
// from the real values of the real run, for arrays, DP tables, graphs and union-find, and that anything that does
// not hold up simply draws nothing.

const entry = (value) => ({ value, type: 'x', changedThisFrame: true });
function modelOf(vars) {
  const frame = { line: 1, fid: 1, callerFid: null, eventType: 'line', variables: Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, entry(v)])) };
  return buildModel([frame], { code: '', language: 'python' });
}
const look = (vars) => scopeLookup(modelOf(vars), 0);
const example = (id) => EXAMPLES.find((e) => e.id === id);
const mark = (m) => ({ label: '', tone: 'accent', ...m });

test('a range is clamped to the structure and an empty or backwards one is not drawn', () => {
  const l = look({ nums: [1, 2, 3, 4, 5, 6], i: 5, k: 4 });
  assert.deepEqual(resolveMark(mark({ on: 'nums', kind: 'range', from: 'i-k+1', to: 'i', label: 'window' }), l), { kind: 'range', lo: 2, hi: 5, label: 'window', tone: 'accent' });
  assert.equal(resolveMark(mark({ on: 'nums', kind: 'range', from: 'i', to: 'i-k' }), l), null);
  assert.deepEqual(resolveMark(mark({ on: 'nums', kind: 'range', from: '-3', to: '99' }), l)?.lo, 0);
  assert.equal(resolveMark(mark({ on: 'nums', kind: 'range', from: '10', to: '12' }), l), null);
});

test('a cell is a cell, a row of a table is a row, a pair of indexes is one cell of a table', () => {
  const l = look({ dp: [[0, 0, 0], [0, 5, 0]], v: [7, 8, 9], i: 1, j: 2 });
  assert.deepEqual(resolveMark(mark({ on: 'v', kind: 'cell', at: ['i+1'] }), l), { kind: 'cell', i: 2, label: '', tone: 'accent' });
  assert.deepEqual(resolveMark(mark({ on: 'dp', kind: 'cell', at: ['i'] }), l), { kind: 'row', r: 1, label: '', tone: 'accent' });
  assert.deepEqual(resolveMark(mark({ on: 'dp', kind: 'cell', at: ['i-1', 'j-1'] }), l), { kind: 'grid', r: 0, c: 1, label: '', tone: 'accent' });
  assert.equal(resolveMark(mark({ on: 'dp', kind: 'cell', at: ['i+1', 'j'] }), l), null, 'row 2 does not exist');
  assert.equal(resolveMark(mark({ on: 'dp', kind: 'cell', at: ['i', 'j+1'] }), l), null, 'column 3 does not exist');
  assert.equal(resolveMark(mark({ on: 'v', kind: 'cell', at: ['-1'] }), l), null);
});

test('a node is a variable holding a node id, or an expression for a numbered node', () => {
  const l = look({ graph: { A: ['B'], B: [] }, node: 'B', x: 3 });
  assert.equal(resolveMark(mark({ on: 'graph', kind: 'node', at: 'node' }), l).id, 'B');
  assert.equal(resolveMark(mark({ on: 'graph', kind: 'node', at: 'x+1' }), l).id, '4');
  assert.equal(resolveMark(mark({ on: 'graph', kind: 'node', at: 'missing' }), l), null);
  assert.equal(resolveMark(mark({ on: 'graph', kind: 'node', at: 'graph' }), l), null, 'a whole structure is not a node');
});

test('names come from the step, the callers and the fields of self', () => {
  const l = look({ self: { __class__: 'Solution', k: 3, parent: [0, 1] }, nums: [1, 2, 3, 4], i: 3 });
  assert.equal(resolveMark(mark({ on: 'nums', kind: 'cell', at: ['i-self.k'] }), l).i, 0);
  assert.equal(resolveMark(mark({ on: 'self.parent', kind: 'cell', at: ['1'] }), l).i, 1);
  assert.equal(resolveMark(mark({ on: 'nums', kind: 'cell', at: ['len(nums)-1'] }), l).i, 3);
});

test('unknown names and calls give nothing, never a guess', () => {
  const l = look({ nums: [1, 2, 3], i: 1 });
  assert.equal(resolveMark(mark({ on: 'nums', kind: 'cell', at: ['j'] }), l), null);
  assert.equal(resolveMark(mark({ on: 'nums', kind: 'cell', at: ['process.exit(1)'] }), l), null);
  assert.equal(resolveMark(mark({ on: 'nums', kind: 'cell', at: ['foo(i)'] }), l), null);
  assert.equal(resolveMark(mark({ on: 'absent', kind: 'cell', at: ['i'] }), l), null);
  assert.equal(resolveMark(mark({ on: 'nums', kind: 'teleport', at: ['i'] }), l), null);
});

test('steps are sampled evenly, always including the first and the last', () => {
  assert.deepEqual(sampleSteps(0, 5), []);
  assert.deepEqual(sampleSteps(3, 5), [0, 1, 2]);
  const s = sampleSteps(1000, 24);
  assert.equal(s[0], 0);
  assert.equal(s.at(-1), 999);
  assert.ok(s.length <= 24 && s.every((v, i) => i === 0 || v > s[i - 1]));
});

// ── a real run of the sliding-window problem ─────────────────────────────────────────────────────
const WINDOW = `def best_window(nums, k):
    window_sum = sum(nums[:k])
    max_sum = window_sum
    for i in range(k, len(nums)):
        window_sum = window_sum - nums[i - k] + nums[i]
        max_sum = max(max_sum, window_sum)
    return max_sum
`;
const STORY = {
  algorithm: 'Sliding window',
  idea: 'Keep the sum of k neighbours.',
  marks: [
    mark({ on: 'nums', kind: 'range', from: 'i-k+1', to: 'i', label: 'window' }),
    mark({ on: 'nums', kind: 'cell', at: ['i-k'], label: 'leaves', tone: 'danger' }),
    mark({ on: 'nums', kind: 'cell', at: ['i'], label: 'enters', tone: 'success' }),
    mark({ on: 'nope', kind: 'cell', at: ['i'], label: 'ghost' }),
    mark({ on: 'nums', kind: 'cell', at: ['i+100'], label: 'far away', tone: 'warn' }),
  ],
  series: ['window_sum'],
  steps: [],
};

test('sliding window: the window, the number leaving and the number entering come from the real values', async () => {
  const { built, job } = await traceExample({ python: { code: WINDOW, args: { nums: [1, 12, -5, -6, 50, 3], k: 4 } } }, 'python');
  assert.equal(built.error, null);
  assert.equal(built.resultRaw, 51);
  const model = buildModel(built.frames, { code: job.code, language: 'python' });

  // the moment before the last slide: i = 5, the update line is about to run
  const idx = model.frames.findIndex((f) => f.line === 5 && f.variables.i?.value === 5);
  assert.ok(idx > 0, 'found the step');
  const shown = applyStory(recognize(model, idx), STORY, model, idx);
  const nums = shown.panels.find((p) => p.vars.includes('nums'));
  assert.ok(nums.story, 'marks were attached to the nums panel');
  assert.deepEqual(nums.story.range, { lo: 2, hi: 5, label: 'window', tone: 'accent' });
  assert.deepEqual(nums.story.cells.map((c) => [c.i, c.label, c.tone]).sort(), [[1, 'leaves', 'danger'], [5, 'enters', 'success']]);
  assert.equal(nums.data.items[1], 12, 'the cell that leaves holds 12');
  assert.equal(nums.data.items[5], 3, 'the cell that enters holds 3');

  // marks that point nowhere are dropped when the story is checked, the others stay
  const kept = marksThatHold(STORY.marks, model, sampleSteps(model.frames.length, 60));
  assert.deepEqual(kept.map((m) => m.label), ['window', 'leaves', 'enters']);

  // the whole run in one chart: the sum of each window
  assert.deepEqual(seriesFor('window_sum', model).map((p) => p.v), [2, 51, 42]);
  assert.deepEqual(seriesFor('not_a_variable', model), []);
});

test('the same step, no story: nothing changes', async () => {
  const { built, job } = await traceExample({ python: { code: WINDOW, args: { nums: [1, 2, 3, 4, 5], k: 2 } } }, 'python');
  const model = buildModel(built.frames, { code: job.code, language: 'python' });
  const base = recognize(model, 3);
  assert.equal(applyStory(base, null, model, 3), base);
  assert.equal(applyStory(base, { marks: [] }, model, 3), base);
});

// ── a DP table, a graph, a union-find forest ─────────────────────────────────────────────────────
test('DP table: the cell being written and the diagonal cell it reads', async () => {
  const { built, job } = await traceExample(example('lcs'), 'python');
  const model = buildModel(built.frames, { code: job.code, language: 'python' });
  const idx = model.frames.findIndex((f) => f.variables.i?.value === 2 && f.variables.j?.value === 3);
  assert.ok(idx > 0);
  const story = { marks: [
    mark({ on: 'dp', kind: 'cell', at: ['i', 'j'], label: 'writing', tone: 'warn' }),
    mark({ on: 'dp', kind: 'cell', at: ['i-1', 'j-1'], label: 'diagonal' }),
    mark({ on: 'dp', kind: 'cell', at: ['i-1'], label: 'previous row', tone: 'success' }),
  ] };
  const panel = applyStory(recognize(model, idx), story, model, idx).panels.find((p) => p.vars.includes('dp'));
  assert.deepEqual(panel.story.grid.map((c) => [c.r, c.c, c.label]).sort(), [[1, 2, 'diagonal'], [2, 3, 'writing']]);
  assert.deepEqual(panel.story.rows.map((r) => [r.r, r.label]), [[1, 'previous row']]);
});

test('graph: the current node is ringed on the graph', async () => {
  const { built, job } = await traceExample(example('dijkstra'), 'python');
  const model = buildModel(built.frames, { code: job.code, language: 'python' });
  const idx = model.frames.findIndex((f, i) => i > 8 && typeof f.variables.node?.value === 'string' && f.variables.node.value.length === 1);
  assert.ok(idx > 0);
  const node = model.frames[idx].variables.node.value;
  const story = { marks: [mark({ on: 'graph', kind: 'node', at: 'node', label: 'current' })] };
  const panel = applyStory(recognize(model, idx), story, model, idx).panels.find((p) => p.lens === 'graph');
  assert.deepEqual(panel.story.nodes, [{ id: node, label: 'current', tone: 'accent' }]);
});

test('union-find: the roots being merged are marked on the forest', async () => {
  const { built, job } = await traceExample(example('union-find'), 'python');
  const model = buildModel(built.frames, { code: job.code, language: 'python' });
  const idx = model.frames.findIndex((f) => typeof f.variables.ra?.value === 'number');
  assert.ok(idx > 0);
  const ra = model.frames[idx].variables.ra.value;
  const story = { marks: [mark({ on: 'parent', kind: 'node', at: 'ra', label: 'root a' })] };
  const panel = applyStory(recognize(model, idx), story, model, idx).panels.find((p) => p.lens === 'dsu');
  assert.deepEqual(panel.story.nodes, [{ id: String(ra), label: 'root a', tone: 'accent' }]);
});
