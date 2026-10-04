import { makeContext } from './context.js';
import { recognizeDsu } from './rec/dsu.js';
import { recognizeNodes, recognizeDictTries } from './rec/nodes.js';
import { recognizeGraphs } from './rec/graph.js';
import { recognizeGrids } from './rec/grid.js';
import { recognizeLinear, recognizeStrings } from './rec/linear.js';
import {
  recognizeHash, recognizeIntervals, recognizeBits, recognizeScalars,
} from './rec/collections.js';
import { recognizeCallTree } from './rec/calltree.js';

/**
 * Frame -> panels. Recognisers run from the most specific structure to the most generic; each *claims* the
 * variables it draws so nothing is shown twice, and the leftovers end up in the plain Variables panel.
 *
 *   DSU  ->  node structures  ->  graphs (+ roles of the other variables)  ->  intervals  ->  grids / DP
 *   ->  dict tries  ->  arrays / stacks / queues / heaps / trees-in-arrays  ->  strings  ->  hash maps / sets
 *   ->  bit masks  ->  call tree  ->  scalars
 */
const PIPELINE = [
  recognizeDsu, recognizeNodes, recognizeGraphs, recognizeIntervals, recognizeGrids, recognizeDictTries,
  recognizeLinear, recognizeStrings, recognizeHash, recognizeBits,
  recognizeCallTree, recognizeScalars,
];

export const LENS_LABELS = {
  array: 'Array', bars: 'Sorting', dp1: 'DP table', grid: 'Grid', graph: 'Graph', dsu: 'Union-Find', tree: 'Tree', linked: 'Linked list',
  heap: 'Heap', stack: 'Stack', queue: 'Queue', hash: 'Hash map', set: 'Set', trie: 'Trie', segtree: 'Segment tree', fenwick: 'Fenwick tree',
  intervals: 'Intervals', bits: 'Bits', calltree: 'Call tree', scalars: 'Variables',
};

const KEEP = 160; // recognised steps remembered per trace

/**
 * Recognising a step is pure (the model never changes), so the answer is remembered: stepping back, scrubbing the
 * timeline and replaying all land on steps that were already worked out. The newest 160 are kept.
 */
export function recognize(model, idx) {
  const memo = model.recognized || (model.recognized = new Map());
  const hit = memo.get(idx);
  if (hit) {
    memo.delete(idx);
    memo.set(idx, hit); // most recently used goes last
    return hit;
  }
  const ctx = makeContext(model, idx);
  for (const step of PIPELINE) step(ctx);
  const panels = [...ctx.panels].sort((a, b) => b.priority - a.priority);
  const out = {
    panels,
    lenses: [...new Set(panels.map((p) => p.lens))],
    accesses: ctx.accesses,
  };
  memo.set(idx, out);
  if (memo.size > KEEP) memo.delete(memo.keys().next().value);
  return out;
}
