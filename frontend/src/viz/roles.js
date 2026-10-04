// Name vocabulary for the recognisers. A name is a *hint with a weight*, never the decision: the shape of the
// value and what the variable did over time (see model.js) always have the last word.
//
//   strong -> 2   `visited`, `dist`, `heap` ...
//   weak   -> 1   `v`, `d`, `p` ... only meaningful together with a matching shape
//   none   -> 0

const ROLES = {
  visited: {
    strong: ['visited', 'seen', 'vis', 'explored', 'settled', 'closed', 'finalized', 'discovered', 'marked', 'processed', 'done', 'intree', 'instack', 'onstack', 'reached'],
    weak: ['used', 'taken', 'selected', 'chosen', 'check', 'flag'],
  },
  dist: {
    strong: ['dist', 'distance', 'distances', 'dists', 'mindist', 'shortest', 'cost', 'costs', 'dis'],
    weak: ['d', 'best', 'level', 'levels', 'depth', 'time', 'steps', 'len', 'lens', 'weight'],
  },
  parent: {
    strong: ['parent', 'parents', 'par', 'prev', 'previous', 'pred', 'predecessor', 'camefrom', 'came', 'pi'],
    weak: ['p', 'up', 'from'],
  },
  dsu: {
    strong: ['parent', 'parents', 'par', 'uf', 'dsu', 'leader', 'leaders', 'unionfind', 'disjoint', 'rep', 'reps', 'roots', 'ancestor'],
    weak: ['root', 'comp', 'group', 'id', 'ids', 'link', 'up', 'p'],
  },
  rank: {
    strong: ['rank', 'ranks', 'size', 'sizes', 'sz', 'height', 'heights', 'compsize'],
    weak: ['weight', 'count', 'cnt', 'num'],
  },
  queue: {
    strong: ['queue', 'q', 'dq', 'deque', 'frontier', 'fifo', 'todo', 'worklist', 'pending', 'que', 'bfsqueue', 'nextlevel', 'buffer'],
    weak: ['level', 'current', 'line', 'window'],
  },
  stack: {
    strong: ['stack', 'stk', 'st', 'callstack', 'dfsstack', 'opstack', 'monostack'],
    weak: ['s', 'path', 'dfs', 'trail', 'history'],
  },
  heap: {
    strong: ['heap', 'pq', 'minheap', 'maxheap', 'priority', 'hp', 'priorityqueue', 'heaplist'],
    weak: ['h', 'frontier', 'open', 'candidates'],
  },
  graph: {
    strong: ['graph', 'adj', 'adjacency', 'adjlist', 'adjmatrix', 'neighbors', 'neighbours', 'network', 'nodes', 'vertices', 'capacity', 'capacities', 'cap', 'residual', 'flownetwork'],
    weak: ['g', 'tree', 'edges', 'connections', 'map', 'rooms'],
  },
  edges: {
    strong: ['edges', 'edge', 'connections', 'roads', 'flights', 'prerequisites', 'links', 'dependencies', 'relations', 'routes', 'tickets', 'trust'],
    weak: ['pairs', 'e', 'times', 'conn'],
  },
  colors: {
    strong: ['color', 'colour', 'colors', 'colours', 'side', 'sides', 'partition'],
    weak: ['state', 'status', 'mark', 'group', 'marks', 'flag'],
  },
  indegree: {
    strong: ['indegree', 'indeg', 'indegrees', 'incoming', 'degree', 'degrees', 'deg'],
    weak: ['in', 'ind'],
  },
  order: {
    strong: ['order', 'topo', 'traversal', 'visitorder', 'sequence', 'seq', 'sortedorder', 'result', 'res', 'ans', 'answer', 'output', 'out'],
    weak: ['path', 'list', 'ret', 'r'],
  },
  currentNode: {
    strong: ['node', 'cur', 'curr', 'current', 'vertex', 'u', 'src', 'source', 'start', 'city', 'position', 'pos'],
    weak: ['x', 'top', 'at', 'here', 'k'],
  },
  nextNode: {
    strong: ['nxt', 'next', 'neighbor', 'neighbour', 'nei', 'nb', 'child', 'adjacent', 'target', 'dest', 'to', 'w'],
    weak: ['v', 'y'],
  },
  grid: {
    strong: ['grid', 'board', 'matrix', 'maze', 'mat', 'field', 'image', 'room', 'rooms', 'cells', 'land', 'terrain', 'mtx', 'arena', 'map'],
    weak: ['m', 'a', 'g', 'b', 'data', 'world'],
  },
  dp: {
    strong: ['dp', 'memo', 'cache', 'table', 'tab', 'dpt', 'ways', 'lcs', 'lis', 'knap', 'opt', 'dparr', 'memoize', 'memoization', 'tbl', 'subproblems'],
    weak: ['f', 'g', 'best', 'prefix', 'pre', 'cum', 'suffix', 'ps', 'cnt', 'count', 'counts', 'tails', 'lps', 'next'],
  },
  intervals: {
    strong: ['intervals', 'interval', 'meetings', 'events', 'ranges', 'segments', 'slots', 'spans', 'bookings', 'schedule', 'merged'],
    weak: ['tasks', 'jobs', 'result', 'res', 'points'],
  },
  string: {
    strong: ['text', 'pattern', 'word', 'string', 'str', 'haystack', 'needle', 'word1', 'word2', 'text1', 'text2', 's1', 's2', 'sentence', 'chars', 'txt', 'pat', 'source', 's', 't'],
    weak: ['p', 'a', 'b', 'w', 'line'],
  },
  mask: {
    strong: ['mask', 'bits', 'bitmask', 'subset', 'bit', 'flags', 'state', 'visitedmask', 'usedmask'],
    weak: ['n', 'x', 'num', 'number', 'val', 'value', 'b', 'm', 'flag', 'cur'],
  },
  trie: {
    strong: ['trie', 'prefixtree', 'dictionary', 'children'],
    weak: ['root', 'node', 'words'],
  },
  segtree: {
    strong: ['segtree', 'seg', 'sgt', 'segmenttree', 'sumtree', 'minseg', 'maxseg', 'tree', 'st'],
    weak: ['t', 'tr', 'data'],
  },
  fenwick: {
    strong: ['bit', 'fenwick', 'ft', 'fen', 'bitree', 'fw', 'binaryindexedtree'],
    weak: ['tree', 'sums', 'prefix'],
  },
  pointer: {
    strong: ['i', 'j', 'k', 'l', 'r', 'lo', 'hi', 'mid', 'left', 'right', 'start', 'end', 'slow', 'fast', 'low', 'high', 'ptr', 'idx', 'index', 'pos', 'lft', 'rgt', 'top', 'bot', 'bottom', 'begin', 'p1', 'p2', 'pivot', 'cur', 'curr', 'lower', 'upper', 'front', 'back'],
    weak: ['p', 'q', 'a', 'b', 'x', 'y', 'm', 'n', 't', 'c', 'row', 'col', 'rr', 'cc'],
  },
};

/** `self.parent` -> `parent`; `visitedNodes` -> `visited nodes`; `dist_2` -> `dist`. */
export function baseName(name) {
  const last = String(name).split('.').pop();
  return last;
}

export function tokens(name) {
  return baseName(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-\s]+/g, ' ')
    .toLowerCase()
    .split(' ')
    .map((t) => t.replace(/^\d+|\d+$/g, '') || t)
    .filter(Boolean);
}

const norm = (name) => baseName(name).replace(/[_\-\s]/g, '').toLowerCase();
const normNoDigits = (name) => norm(name).replace(/\d+$/g, '');

const roleCache = new Map();

/** 2 = strong name for the role, 1 = weak, 0 = no hint. (Asked for every variable, several times, at every step: memoised.) */
export function nameRole(name, role) {
  const key = `${role}|${name}`;
  const hit = roleCache.get(key);
  if (hit !== undefined) return hit;
  const value = computeRole(name, role);
  if (roleCache.size > 4000) roleCache.clear();
  roleCache.set(key, value);
  return value;
}

function computeRole(name, role) {
  const table = ROLES[role];
  if (!table) return 0;
  const whole = norm(name);
  const noDigits = normNoDigits(name);
  if (table.strong.includes(whole) || table.strong.includes(noDigits)) return 2;
  if (table.weak.includes(whole) || table.weak.includes(noDigits)) return 1;
  // compound names: any token is a strong word of the role (visited_nodes, node_dist, min_heap ...)
  const parts = tokens(name);
  if (parts.length > 1) {
    if (parts.some((t) => table.strong.includes(t) && t.length > 1)) return 2;
    if (table.strong.includes(whole)) return 2;
  }
  return 0;
}

export const hasRole = (name, role, min = 1) => nameRole(name, role) >= min;
export const ROLE_NAMES = Object.keys(ROLES);
