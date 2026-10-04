import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES } from '../constants/examples/index.js';
import { traceExample } from './testkit.js';
import { buildModel } from './model.js';
import { recognize } from './recognize.js';

// Every example, through the real tracer of its language, through the recogniser: it must run clean and the
// structures it is *about* must show up as panels at some point of the run. This is the executable answer to
// "which data structures and algorithms does AlgoLens understand?".

const FAMILY = {
  dp: ['dp1', 'grid'],
  array: ['array', 'dp1', 'bars'],
};
const satisfied = (lens, seen) => (FAMILY[lens] || [lens]).some((l) => seen.has(l));

function lensesOver(model, n) {
  const seen = new Set();
  const step = Math.max(1, Math.floor(n / 50));
  for (let idx = 0; idx < n; idx += step) recognize(model, idx).panels.forEach((p) => seen.add(p.lens));
  recognize(model, n - 1).panels.forEach((p) => seen.add(p.lens));
  return seen;
}

for (const language of ['python', 'javascript']) {
  for (const example of EXAMPLES) {
    if (!example[language]) continue;
    test(`${language}: ${example.title}`, async () => {
      const { built, job } = await traceExample(example, language);
      assert.equal(built.error, null, built.error ? `${built.error.type}: ${built.error.message}` : '');
      assert.ok(built.frames.length > 2, 'the run produced frames');
      const model = buildModel(built.frames, { code: job.code, language });
      const seen = lensesOver(model, built.frames.length);
      const missing = (example.expects || []).filter((l) => !satisfied(l, seen));
      assert.deepEqual(missing, [], `expected ${example.expects} but only saw ${[...seen].join(', ')}`);
    });
  }
}

test('recognition is stable: the same frame always gives the same panels', async () => {
  const example = EXAMPLES.find((e) => e.id === 'dijkstra');
  const { built, job } = await traceExample(example, 'python');
  const model = buildModel(built.frames, { code: job.code, language: 'python' });
  const idx = Math.floor(built.frames.length / 2);
  const a = recognize(model, idx).panels.map((p) => `${p.id}`);
  const b = recognize(model, idx).panels.map((p) => `${p.id}`);
  assert.deepEqual(a, b);
});

test('a variable is shown by one panel only', async () => {
  for (const id of ['bfs-shortest-path', 'dijkstra', 'kruskal', 'lcs', 'union-find']) {
    const example = EXAMPLES.find((e) => e.id === id);
    const { built, job } = await traceExample(example, 'python');
    const model = buildModel(built.frames, { code: job.code, language: 'python' });
    for (let idx = 0; idx < built.frames.length; idx += 7) {
      const owners = new Map();
      for (const p of recognize(model, idx).panels) {
        for (const name of p.vars) {
          if (p.lens === 'scalars') continue;
          assert.ok(!owners.has(name) || owners.get(name) === p.id, `${id}@${idx}: ${name} is drawn by ${owners.get(name)} and ${p.id}`);
          owners.set(name, p.id);
        }
      }
    }
  }
});

test('graph roles: BFS marks visited nodes, distances and the queue', async () => {
  const example = EXAMPLES.find((e) => e.id === 'bfs-shortest-path');
  const { built, job } = await traceExample(example, 'python');
  const model = buildModel(built.frames, { code: job.code, language: 'python' });
  const last = built.frames.findLastIndex((f) => f.eventType === 'line');
  const graph = recognize(model, last).panels.find((p) => p.lens === 'graph');
  assert.ok(graph, 'a graph panel');
  const o = graph.data.overlays;
  assert.ok(o.visited.length >= 4, `visited ${o.visited}`);
  assert.ok(Object.keys(o.dist).length >= 4, 'distances');
  assert.ok(Object.keys(o.parent).length >= 3, 'parents');
  assert.equal(graph.data.directed, true);
});

test('Dijkstra: weighted graph, distances with infinity, heap as its own panel', async () => {
  const example = EXAMPLES.find((e) => e.id === 'dijkstra');
  const { built, job } = await traceExample(example, 'python');
  const model = buildModel(built.frames, { code: job.code, language: 'python' });
  const mid = built.frames.findIndex((f) => f.line === 18 && f.eventType === 'line');
  const panels = recognize(model, mid >= 0 ? mid : Math.floor(built.frames.length / 2)).panels;
  const graph = panels.find((p) => p.lens === 'graph');
  assert.equal(graph.data.weighted, true);
  assert.ok(panels.some((p) => p.lens === 'heap'));
});

test('DSU: forest and rewired parents after a union', async () => {
  const example = EXAMPLES.find((e) => e.id === 'union-find');
  const { built, job } = await traceExample(example, 'python');
  const model = buildModel(built.frames, { code: job.code, language: 'python' });
  let rewired = 0;
  let maxDepthComponents = 8;
  for (let idx = 0; idx < built.frames.length; idx++) {
    const dsu = recognize(model, idx).panels.find((p) => p.lens === 'dsu');
    if (!dsu) continue;
    rewired += dsu.data.rewired.length;
    maxDepthComponents = Math.min(maxDepthComponents, dsu.data.components);
  }
  assert.ok(rewired >= 4, 'unions rewire parents');
  assert.equal(maxDepthComponents, 1, 'ends with one component');
});

test('DP table: headers come from the strings, cells touched by the line are marked', async () => {
  const example = EXAMPLES.find((e) => e.id === 'lcs');
  const { built, job } = await traceExample(example, 'python');
  const model = buildModel(built.frames, { code: job.code, language: 'python' });
  const idx = built.frames.findIndex((f) => f.line === 9 && f.variables.i?.value === 2 && f.variables.j?.value === 3);
  assert.ok(idx > 0);
  const grid = recognize(model, idx).panels.find((p) => p.lens === 'grid');
  assert.equal(grid.data.kind, 'dp');
  assert.deepEqual(grid.data.rowLabels.map((l) => l.name), ['text1']);
  assert.deepEqual(grid.data.colLabels.map((l) => l.name), ['text2']);
  assert.deepEqual(grid.data.cursor && [grid.data.cursor.r, grid.data.cursor.c], [2, 3]);
  assert.ok(grid.data.marks.writes.some(([r, c]) => r === 2 && c === 3), 'the cell about to be written');
  assert.ok(grid.data.marks.reads.some(([r, c]) => r === 1 && c === 3), 'the cell above, which the line reads');
  assert.ok(grid.data.marks.reads.some(([r, c]) => r === 2 && c === 2), 'the cell to the left, which the line reads');
});

async function panelsAt(id, pick) {
  const example = EXAMPLES.find((e) => e.id === id);
  const { built, job } = await traceExample(example, 'python');
  const model = buildModel(built.frames, { code: job.code, language: 'python' });
  return { built, model, at: (idx) => recognize(model, idx).panels, idx: pick(built.frames) };
}

test('two heaps: both are drawn as heaps, not one heap and one array', async () => {
  const { at, idx } = await panelsAt('median-stream', (f) => Math.floor(f.length / 2));
  assert.deepEqual(at(idx).filter((p) => p.lens === 'heap').map((p) => p.title).sort(), ['high', 'low']);
});

test("Tarjan: disc/low ride on the graph's nodes, and disc is not mistaken for a union-find", async () => {
  const { built, model } = await panelsAt('tarjan-scc', () => 0);
  const lastLine = built.frames.findLastIndex((f) => f.eventType === 'line');
  const panels = recognize(model, lastLine).panels;
  assert.ok(!panels.some((p) => p.lens === 'dsu'));
  const graph = panels.find((p) => p.lens === 'graph');
  assert.deepEqual(Object.keys(graph.data.overlays.extra).sort(), ['disc', 'low']);
});

test('a flow network (mutated capacity matrix) is a weighted directed graph', async () => {
  const { at, idx } = await panelsAt('max-flow', (f) => Math.floor(f.length / 2));
  const graph = at(idx).find((p) => p.lens === 'graph');
  assert.ok(graph && graph.data.weighted && graph.data.directed);
});

test('a trie built from node objects is followed to every level', async () => {
  const { built, model } = await panelsAt('trie', () => 0);
  const lastLine = built.frames.findLastIndex((f) => f.eventType === 'line' && f.line >= 28);
  const trie = recognize(model, lastLine).panels.find((p) => p.lens === 'trie');
  assert.ok(trie, 'a trie panel');
  assert.ok(Object.keys(trie.data.nodes).length >= 8, `only ${Object.keys(trie.data.nodes).length} trie nodes`);
});

test('nodes that hold their neighbours are drawn as a graph labelled by value', async () => {
  const { at, idx } = await panelsAt('clone-graph', (f) => f.length - 2);
  const graph = at(idx).find((p) => p.lens === 'graph');
  assert.ok(graph, 'a graph panel');
  assert.ok(graph.data.nodes.length >= 4 && graph.data.edges.length >= 8);
  assert.deepEqual([...new Set(Object.values(graph.data.labels))].sort(), ['1', '2', '3', '4']);
});
