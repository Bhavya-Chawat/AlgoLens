import { createContext, useContext } from 'react';

/** What a card needs to be closable, foldable and resizable. Null outside the Stage (a lens rendered on its own). */
export const PanelContext = createContext(null);
export const usePanel = () => useContext(PanelContext);

/** One plain sentence per kind of panel, shown from the (i) button: what you are looking at and how to read it. */
const HELP = [
  ['graph', 'Circles are nodes and lines are edges. Colours and small badges show what your code is tracking: the current node, visited nodes, distances.'],
  ['union-find', 'Each tree is one group. An arrow points from a node to its parent, and the node on top is the group\'s root. The row below is the parent array itself.'],
  ['stack', 'Last in, first out. The item on top is the next one to come out.'],
  ['deque', 'Items can go in and out at both ends.'],
  ['queue', 'First in, first out. Items leave from the front.'],
  ['table', 'A table your code fills in. Blue cells are read by the line about to run; amber cells are written.'],
  ['1-d table', 'A row your code fills in. Blue cells are read by the line about to run; amber cells are written.'],
  ['matrix', 'Rows and columns of numbers. Highlights are the cells the current line touches.'],
  ['grid', 'Rows and columns. Highlights are the cells the current line touches.'],
  ['board', 'A board. Highlights are the squares the current line touches.'],
  ['sorting', 'The height of each bar is the value, so you can watch items move into order.'],
  ['array', 'Each box is one item with its index below it. Arrows are variables that hold an index.'],
  ['string', 'Each box is one character with its index below it.'],
  ['min-heap', 'A heap drawn as a tree: the smallest item is at the top and every parent is smaller than its children.'],
  ['max-heap', 'A heap drawn as a tree: the largest item is at the top and every parent is larger than its children.'],
  ['hash', 'Keys and the values they map to. New or changed rows are highlighted.'],
  ['set', 'Distinct values. Newly added ones are highlighted.'],
  ['call tree', 'Every call your function made. Dashed boxes are repeated work that memoisation could save.'],
  ['calls', 'Every call your function made, nested under the call that made it.'],
  ['binary tree', 'A tree of nodes. The current node is highlighted.'],
  ['linked list', 'Nodes joined by their next pointers.'],
  ['trie', 'Each path from the top spells a prefix.'],
];

export function helpFor(kind) {
  const k = String(kind || '').toLowerCase();
  const hit = HELP.find(([prefix]) => k === prefix || k.startsWith(`${prefix} `) || k.startsWith(`${prefix} ·`));
  return hit ? hit[1] : null;
}
