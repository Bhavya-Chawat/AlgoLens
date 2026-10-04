import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutTree, layoutGraph } from './layout.js';

test('tree layout: parent above the middle of its children, left child left of right child', () => {
  const kids = { a: [{ id: 'b', side: 'l' }, { id: 'c', side: 'r' }], b: [], c: [] };
  const { pos } = layoutTree(['a'], (id) => kids[id]);
  assert.ok(pos.get('b').x < pos.get('a').x && pos.get('a').x < pos.get('c').x);
  assert.equal(pos.get('a').x, (pos.get('b').x + pos.get('c').x) / 2);
  assert.equal(pos.get('a').y, 0);
  assert.equal(pos.get('b').y, 1);
});

test('a lone child hangs on its own side (BST shape is kept)', () => {
  const kids = { r: [{ id: 'x', side: 'r' }], x: [] };
  const { pos } = layoutTree(['r'], (id) => kids[id]);
  assert.ok(pos.get('x').x > pos.get('r').x);
  const left = { r: [{ id: 'x', side: 'l' }], x: [] };
  const l = layoutTree(['r'], (id) => left[id]).pos;
  assert.ok(l.get('x').x < l.get('r').x);
});

test('several roots are laid out side by side without overlap', () => {
  const { pos } = layoutTree(['a', 'b'], () => []);
  assert.ok(pos.get('b').x - pos.get('a').x >= 1);
});

test('DAGs are layered: every edge points to a later column', () => {
  const edges = [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']].map(([from, to]) => ({ from, to }));
  const { pos } = layoutGraph(['a', 'b', 'c', 'd'], edges, true);
  for (const e of edges) assert.ok(pos.get(e.from).x < pos.get(e.to).x, `${e.from}->${e.to}`);
});

test('cyclic and undirected graphs: force layout inside the box, no overlapping nodes, deterministic', () => {
  const nodes = ['0', '1', '2', '3', '4'];
  const edges = [['0', '1'], ['1', '2'], ['2', '0'], ['2', '3'], ['3', '4']].map(([from, to]) => ({ from, to }));
  const a = layoutGraph(nodes, edges, false, { width: 600, height: 340 });
  const b = layoutGraph(nodes, edges, false, { width: 600, height: 340 });
  assert.deepEqual([...a.pos], [...b.pos]);
  const pts = [...a.pos.values()];
  for (const p of pts) assert.ok(p.x >= 0 && p.x <= 600 && p.y >= 0 && p.y <= 340);
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) > 30, `nodes ${i},${j} overlap`);
  }
});
