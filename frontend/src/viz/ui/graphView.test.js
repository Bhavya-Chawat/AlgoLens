import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES } from '../../constants/examples/index.js';
import { traceExample } from '../testkit.js';
import { buildModel } from '../model.js';
import { recognize } from '../recognize.js';
import {
  chain, chosenSummary, graphChanges, keyOf, orderList, pathCost, pathEdgeKeys, pathToRoot, radiusFor,
} from './graphView.js';

const O = (extra = {}) => ({ visited: [], frontier: [], dist: {}, parent: {}, colors: {}, names: {}, ...extra });
const example = (id) => EXAMPLES.find((e) => e.id === id);

test('a distance that drops is a change; the first time a distance table appears is not', () => {
  const prev = O({ dist: { A: 0, B: 'Infinity', C: 'Infinity' }, names: { dist: 'dist' } });
  const now = O({ dist: { A: 0, B: 4, C: 'Infinity' }, names: { dist: 'dist' } });
  assert.deepEqual([...graphChanges(prev, now).dist], ['B']);
  const init = graphChanges(O(), O({ dist: { A: 0, B: 'Infinity' }, names: { dist: 'dist' } }));
  assert.equal(init.dist.size, 0, 'an initial table must not light up every node');
});

test('newly visited and newly waiting nodes are changes', () => {
  const prev = O({ visited: ['A'], frontier: ['B'], names: { visited: 'seen' } });
  const now = O({ visited: ['A', 'B'], frontier: ['C', 'D'], names: { visited: 'seen' } });
  const c = graphChanges(prev, now);
  assert.deepEqual([...c.visited], ['B']);
  assert.deepEqual([...c.frontier].sort(), ['C', 'D']);
  assert.deepEqual([...c.any].sort(), ['B', 'C', 'D']);
});

test('a new or different parent and a new colour are changes', () => {
  const prev = O({ parent: { B: 'A' }, colors: { A: 0 }, names: { parent: 'parent', colors: 'color' } });
  const now = O({ parent: { B: 'C', D: 'B' }, colors: { A: 0, B: 1 }, names: { parent: 'parent', colors: 'color' } });
  const c = graphChanges(prev, now);
  assert.deepEqual([...c.parent].sort(), ['B', 'D']);
  assert.deepEqual([...c.colors], ['B']);
});

test('nothing before this step, or nothing different, is no change', () => {
  assert.equal(graphChanges(null, O({ visited: ['A'] })).any.size, 0);
  const same = O({ visited: ['A'], dist: { A: 0 }, names: { dist: 'd', visited: 'v' } });
  assert.equal(graphChanges(same, same).any.size, 0);
});

test('the path to a node follows parent pointers, root first, and survives a cycle', () => {
  assert.deepEqual(pathToRoot({ B: 'A', C: 'B' }, 'C'), ['A', 'B', 'C']);
  assert.deepEqual(pathToRoot({ B: 'A' }, 'A'), ['A']);
  assert.deepEqual(pathToRoot({ A: 'B', B: 'A' }, 'A').sort(), ['A', 'B']);
  assert.deepEqual(pathToRoot({}, 'Z'), ['Z']);
});

test('path edges use the same keys as the recogniser: a>b when directed, a canonical a-b when not', () => {
  assert.deepEqual([...pathEdgeKeys(['A', 'B', 'C'], true)], ['A>B', 'B>C']);
  assert.deepEqual([...pathEdgeKeys(['B', 'A'], false)], ['A-B']);
  assert.equal(keyOf('B', 'A', false), keyOf('A', 'B', false));
  assert.notEqual(keyOf('B', 'A', true), keyOf('A', 'B', true));
});

test('path cost adds the weights, either way round when undirected, and is null when any weight is missing', () => {
  const edges = [{ from: 'A', to: 'B', w: 2 }, { from: 'C', to: 'B', w: 3 }, { from: 'C', to: 'D' }, { from: 'D', to: 'E', w: 0.1 }, { from: 'E', to: 'F', w: 0.2 }];
  assert.equal(pathCost(edges, ['A', 'B', 'C'], false), 5);
  assert.equal(pathCost(edges, ['A', 'B', 'C'], true), null, 'directed: there is no B>C edge');
  assert.equal(pathCost(edges, ['C', 'D'], false), null, 'no weight on that edge');
  assert.equal(pathCost(edges, ['D', 'E', 'F'], true), 0.3, 'no floating point crumbs');
  assert.equal(pathCost(edges, ['A'], false), null);
});

test('chosen edges: how many and their total weight; an undirected edge is counted once', () => {
  const edges = [{ from: 'A', to: 'B', w: 4 }, { from: 'B', to: 'A', w: 4 }, { from: 'B', to: 'C', w: 1 }, { from: 'C', to: 'D' }];
  assert.deepEqual(chosenSummary(edges, [keyOf('A', 'B', false), keyOf('B', 'C', false)], false), { count: 2, weight: 5 });
  assert.deepEqual(chosenSummary(edges, [keyOf('C', 'D', false)], false), { count: 1, weight: null });
  assert.deepEqual(chosenSummary(edges, [], false), { count: 0, weight: null });
});

test('order lists nodes by their number, numerically (10 comes after 9)', () => {
  assert.deepEqual(orderList({ x: 10, y: 2, z: 9 }), ['y', 'z', 'x']);
  assert.deepEqual(orderList(undefined), []);
});

test('nodes shrink as the graph grows, and long chains are cut', () => {
  assert.ok(radiusFor(6) > radiusFor(20) && radiusFor(20) > radiusFor(60));
  assert.equal(chain(['a', 'b', 'c'], 8), 'a → b → c');
  assert.equal(chain(['a', 'b', 'c', 'd'], 2), 'a → b → …');
});

// ── real runs ────────────────────────────────────────────────────────────────────────────────────
function graphOverlays(model, idx) {
  return recognize(model, idx).panels.find((p) => p.lens === 'graph')?.data.overlays || null;
}

test('Dijkstra: relaxing an edge shows up as a changed distance, and the initial table does not', async () => {
  const { built, job } = await traceExample(example('dijkstra'), 'python');
  const model = buildModel(built.frames, { code: job.code, language: 'python' });
  let firstSeen = -1;
  let relaxed = 0;
  for (let i = 0; i < model.frames.length; i += 1) {
    const now = graphOverlays(model, i);
    if (!now || !now.names.dist) continue;
    const changes = graphChanges(i > 0 ? graphOverlays(model, i - 1) : null, now);
    if (firstSeen < 0) {
      firstSeen = i;
      assert.equal(changes.dist.size, 0, 'the distance table appearing is initialisation, not a relaxation');
    } else if (changes.dist.size > 0) relaxed += 1;
  }
  assert.ok(firstSeen >= 0, 'distances were recognised');
  assert.ok(relaxed >= 1, 'at least one distance dropped during the run');
});

test('BFS: the path from the source to the current node appears once parents are set', async () => {
  const { built, job } = await traceExample(example('bfs-shortest-path'), 'python');
  const model = buildModel(built.frames, { code: job.code, language: 'python' });
  let longest = 0;
  for (let i = 0; i < model.frames.length; i += 1) {
    const o = graphOverlays(model, i);
    if (o?.current && Object.keys(o.parent).length) longest = Math.max(longest, pathToRoot(o.parent, o.current.id).length);
  }
  assert.ok(longest >= 2, `the longest path seen had ${longest} node(s)`);
});
