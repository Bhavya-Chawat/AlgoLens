import {
  isObj, isInt, isScalar, stripTrunc, elemKind, asGrid, gridKind, toNumber, isNumLike,
} from '../values.js';
import { nameRole } from '../roles.js';

/**
 * Graphs from four shapes - adjacency dict, adjacency list, edge list, adjacency matrix - and, around them,
 * the *roles* of the other variables: visited, distance, parent, colour, in-degree, frontier, current node.
 * That is what lets BFS, DFS, Dijkstra, Prim, Kruskal, topological sort or 2-colouring all light up the same
 * way without special-casing any of them.
 */

const DIRECTED_HINT = /in_?degree|topolog|prerequisit|directed|digraph|dependenc/i;

const edgeKey = (a, b, directed) => (directed || a === b ? `${a}>${b}` : a < b ? `${a}-${b}` : `${b}-${a}`);
const same2 = (a, b) => String(a) === String(b);

// ── readers: shape -> { nodes, edges, weighted, source } ───────────────────────────────────────
function fromAdjDict(value) {
  const keys = Object.keys(value).filter((k) => k !== '…');
  if (keys.length < 1) return null;
  const rows = [];
  for (const k of keys) {
    const row = value[k];
    if (!Array.isArray(row)) return null;
    rows.push(stripTrunc(row).items);
  }
  const all = rows.flat();
  const kind = elemKind(all);
  if (!['int', 'str', 'char', 'pair', 'empty'].includes(kind)) return null;
  const keySet = new Set(keys);
  const weighted = kind === 'pair';
  const edges = [];
  let known = 0;
  let total = 0;
  const nodes = new Set(keys);
  keys.forEach((k, i) => {
    for (const item of rows[i]) {
      let to;
      let w;
      if (weighted) {
        // (node, weight) normally; (weight, node) when only the second is a known key
        if (!Array.isArray(item)) return;
        const [a, b] = item;
        if (!keySet.has(String(a)) && keySet.has(String(b))) { to = String(b); w = a; } else { to = String(a); w = b; }
      } else to = String(item);
      total += 1;
      if (keySet.has(to)) known += 1;
      nodes.add(to);
      edges.push({ from: k, to, w });
    }
  });
  if (total && known / total < 0.6) return null;
  if (nodes.size < 2) return null;
  return { nodes: [...nodes], edges, weighted, source: 'dict' };
}

function fromAdjList(rows) {
  const n = rows.length;
  const items = rows.flatMap((r) => stripTrunc(r).items);
  const kind = elemKind(items);
  if (!['int', 'pair', 'empty'].includes(kind) || n < 2) return null;
  const weighted = kind === 'pair';
  const edges = [];
  let inRange = 0;
  let total = 0;
  rows.forEach((row, from) => {
    for (const item of stripTrunc(row).items) {
      const to = weighted ? (Array.isArray(item) ? item[0] : null) : item;
      const w = weighted && Array.isArray(item) ? item[1] : undefined;
      total += 1;
      if (isInt(to) && to >= 0 && to < n) inRange += 1;
      edges.push({ from: String(from), to: String(to), w });
    }
  });
  if (total && inRange / total < 0.9) return null;
  return { nodes: rows.map((_, i) => String(i)), edges, weighted, source: 'list' };
}

function fromEdgeList(items) {
  const kind = elemKind(items);
  if (kind !== 'pair' && kind !== 'tuple') return null;
  const edges = [];
  const nodes = new Set();
  let weighted = false;
  for (const e of items) {
    if (!Array.isArray(e) || e.length < 2) return null;
    const [a, b, w] = e;
    if (!isScalar(a) || !isScalar(b) || a === null || b === null) return null;
    if (isNumLike(w) && e.length === 3) weighted = true;
    nodes.add(String(a));
    nodes.add(String(b));
    edges.push({ from: String(a), to: String(b), w: e.length >= 3 ? w : undefined });
  }
  if (!edges.length || nodes.size < 2) return null;
  const sorted = [...nodes].sort((x, y) => (Number.isNaN(Number(x)) || Number.isNaN(Number(y)) ? x.localeCompare(y) : Number(x) - Number(y)));
  return { nodes: sorted, edges, weighted, source: 'edges' };
}

function fromMatrix(grid) {
  const n = grid.rows;
  const edges = [];
  const INF = (c) => c === null || c === 'Infinity' || (typeof c === 'number' && c >= 99);
  let weighted = false;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const c = grid.cells[i][j];
      if (i === j || c === 0 || c === false || c === null || c === '0' || INF(c)) continue;
      if (c !== 1 && c !== true && c !== '1') weighted = true;
      edges.push({ from: String(i), to: String(j), w: c === 1 || c === true || c === '1' ? undefined : c });
    }
  }
  return { nodes: Array.from({ length: n }, (_, i) => String(i)), edges, weighted, source: 'matrix' };
}

function isSymmetric(edges) {
  const set = new Set(edges.map((e) => `${e.from}>${e.to}`));
  return edges.length > 0 && edges.every((e) => set.has(`${e.to}>${e.from}`));
}

/** Does the source walk `name[x]` as a list of neighbours (`for y in graph[x]`, `for (int y : adj[x])`)? */
function walkedAsNeighbours(code, name) {
  const n = String(name).replace(/^(?:self|this)\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // python `for y in g[x]`; java/c++ `for (int y : g[x])` (colon inside the parentheses, same line); js `g[x].forEach`
  const pattern = `\\bin[ \\t]+(?:self\\.|this\\.)?${n}\\s*\\[|\\([^()\\n]*:[ \\t]*(?:this\\.)?${n}\\s*\\[|\\b${n}\\s*\\[[^\\]]+\\]\\s*\\.(?:forEach|map|length|size)`;
  return new RegExp(pattern).test(code);
}

/** Decide which graph (if any) a variable holds. */
function readGraph(ctx, v) {
  const val = v.value;
  if (v.type === 'set') return null;
  const graphName = nameRole(v.name, 'graph');
  const edgesName = nameRole(v.name, 'edges');
  if (isObj(val) && !val.__class__ && !('__id__' in val)) {
    const g = fromAdjDict(val);
    if (g) return g;
    return null;
  }
  if (!Array.isArray(val)) return null;
  const { items } = stripTrunc(val);
  if (items.length < 2) return null;
  if (items.every(Array.isArray)) {
    const grid = asGrid(val);
    const ragged = !grid;
    const evidence = graphName >= 1 || edgesName >= 1 || walkedAsNeighbours(ctx.model.code, v.name);
    if (ragged) return evidence ? fromAdjList(items) : null;
    // rectangular: a graph only when the name says so, and the shape fits
    const edgesLike = (edgesName >= 1 || /edge/i.test(v.name)) && (grid.cols === 2 || grid.cols === 3);
    if (edgesLike) return fromEdgeList(items);
    if (graphName >= 1 || walkedAsNeighbours(ctx.model.code, v.name)) {
      // a square matrix named like a network is an adjacency / capacity matrix (even while the algorithm updates it)
      const strong = graphName >= 2;
      if (grid.rows === grid.cols && gridKind(grid.cells) !== 'char' && (strong || ctx.profile(v.name).arr.ops.set === 0) && !walkedAsNeighbours(ctx.model.code, v.name)) return fromMatrix(grid);
      return fromAdjList(items);
    }
    if (nameRole(v.name, 'grid') >= 2 || nameRole(v.name, 'dp') >= 2) return null;
    return null;
  }
  return null;
}

// ── overlays ───────────────────────────────────────────────────────────────────────────────────
function mapFromVar(v, nodeSet, nodeList) {
  const val = v.value;
  if (isObj(val) && !val.__class__ && !('__id__' in val)) {
    const out = {};
    for (const [k, x] of Object.entries(val)) if (k !== '…') out[k] = x;
    return Object.keys(out).length ? out : null;
  }
  if (Array.isArray(val)) {
    const { items } = stripTrunc(val);
    if (items.length === nodeList.length && items.every(isScalar)) {
      const out = {};
      items.forEach((x, i) => { out[nodeList[i]] = x; });
      return out;
    }
  }
  return null;
}

function nodeOf(x, nodeSet) {
  if (Array.isArray(x)) {
    for (let i = x.length - 1; i >= 0; i--) if (isScalar(x[i]) && x[i] !== null && nodeSet.has(String(x[i]))) return String(x[i]);
    return null;
  }
  return isScalar(x) && x !== null && nodeSet.has(String(x)) ? String(x) : null;
}

function computeOverlays(ctx, graphVar, g) {
  const nodeSet = new Set(g.nodes);
  const O = { visited: [], dist: {}, parent: {}, colors: {}, indegree: {}, order: {}, extra: {}, frontier: [], current: null, next: null, chosen: [], names: {} };
  const claimed = [];
  const graphBase = graphVar.name;
  // per-node numbers (disc / low / depth ...) are recognised by being indexed with the same variable as the graph
  const graphIndex = new Set(ctx.indexVars(graphBase));
  const sharesIndex = (name) => ctx.indexVars(name).some((x) => graphIndex.has(x));
  for (const v of ctx.vars.values()) {
    if (v.name === graphBase || v.name.startsWith(`${graphBase}.`) || ctx.isClaimed(v.name)) continue;
    const val = v.value;
    const p = ctx.profile(v.name);
    const type = v.type || '';

    if (Array.isArray(val) || (isObj(val) && !val.__class__ && !('__id__' in val))) {
      const isSet = type === 'set';
      const listItems = Array.isArray(val) ? stripTrunc(val).items : null;
      const visitedName = nameRole(v.name, 'visited');
      const distName = nameRole(v.name, 'dist');
      const parentName = nameRole(v.name, 'parent');
      const colorName = nameRole(v.name, 'colors');
      const inName = nameRole(v.name, 'indegree');
      const orderName = nameRole(v.name, 'order');
      const roleOf = (r) => nameRole(v.name, r);

      // an empty set in a graph algorithm is the visited set that has not started to fill
      if (isSet && listItems && listItems.length === 0 && visitedName >= 1) { O.names.visited = v.name; claimed.push(v.name); continue; }
      // lists / sets of node ids (or tuples that contain one)
      if (listItems && listItems.length && listItems.every((x) => nodeOf(x, nodeSet) !== null) && !(listItems.length === g.nodes.length && listItems.every((x) => typeof x === 'boolean'))) {
        const ids = listItems.map((x) => nodeOf(x, nodeSet));
        const stackish = p.arr.ops.popFront + p.arr.ops.popEnd > 0 || roleOf('queue') >= 1 || roleOf('stack') >= 1 || roleOf('heap') >= 1 || ctx.hints.heap && nameRole(v.name, 'heap') >= 1;
        if (isSet || visitedName >= 1) { for (const id of ids) O.visited.push(id); O.names.visited = v.name; claimed.push(v.name); continue; }
        if (stackish && roleOf('order') < 2) { for (const id of ids) O.frontier.push(id); continue; }
        if (orderName >= 1 && ids.length === new Set(ids).size) { ids.forEach((id, i) => { O.order[id] = i + 1; }); continue; }
        if (p.arr.ops.push > 0 && p.arr.ops.popEnd === 0 && ids.length === new Set(ids).size && (p.arr.ops.set + p.arr.ops.multi) === 0 && nameRole(v.name, 'order') >= 0) {
          ids.forEach((id, i) => { O.order[id] = i + 1; });
          continue;
        }
      }
      // edges chosen by the algorithm (MST edges, path edges)
      if (listItems && listItems.length && listItems.every((x) => Array.isArray(x) && x.length >= 2 && nodeOf(x[0], nodeSet) && nodeOf(x[1], nodeSet)) && (orderName >= 1 || /mst|tree|chosen|picked|selected|result|path|edge/i.test(v.name)) && !(nameRole(v.name, 'edges') >= 2 && v.name === graphBase)) {
        for (const x of listItems) O.chosen.push(edgeKey(String(x[0]), String(x[1]), !g.undirected));
        continue;
      }

      const map = mapFromVar(v, nodeSet, g.nodes);
      if (!map) continue;
      const keys = Object.keys(map);
      if (!keys.every((k) => nodeSet.has(k))) continue;
      const values = Object.values(map);
      const allBool = values.every((x) => typeof x === 'boolean' || x === 0 || x === 1 || x === null);
      const allNum = values.every((x) => x === null || isNumLike(x));
      const allNode = values.every((x) => x === null || x === -1 || (isScalar(x) && nodeSet.has(String(x))));
      const smallInts = values.every((x) => x === null || (isInt(x) && x >= -1 && x <= 8));

      if (visitedName >= 1 && allBool) { for (const k of keys) if (map[k]) O.visited.push(k); O.names.visited = v.name; claimed.push(v.name); }
      else if (colorName >= 1 && smallInts && (colorName >= 2 || !allBool || ctx.hints)) { for (const k of keys) if (map[k] !== null && map[k] !== -1) O.colors[k] = map[k]; O.names.colors = v.name; claimed.push(v.name); }
      else if (inName >= 1 && allNum) { for (const k of keys) O.indegree[k] = map[k]; O.names.indegree = v.name; claimed.push(v.name); }
      else if (parentName >= 1 && allNode && !p.arr.identity && !p.dict.identity) { for (const k of keys) if (map[k] !== null && map[k] !== -1 && String(map[k]) !== k) O.parent[k] = String(map[k]); O.names.parent = v.name; claimed.push(v.name); }
      else if (distName >= 1 && allNum) { for (const k of keys) if (map[k] !== null) O.dist[k] = map[k]; O.names.dist = v.name; claimed.push(v.name); }
      else if (visitedName >= 1 && allNum) { for (const k of keys) if (map[k] !== null && map[k] !== 0) O.visited.push(k); O.names.visited = v.name; claimed.push(v.name); }
      else if (allNum && !isSet && Object.keys(O.extra).length < 2 && values.length >= 2 && sharesIndex(v.name)) { O.extra[v.name] = map; claimed.push(v.name); }
    }
  }

  // current / next node: scalar variables holding a node, named like one or used to index the graph
  const used = new Set(ctx.indexVars(graphBase));
  const consider = [];
  for (const v of ctx.vars.values()) {
    if (v.name === graphBase || !isScalar(v.value) || v.value === null || typeof v.value === 'boolean') continue;
    const id = String(v.value);
    if (!nodeSet.has(id)) continue;
    if (typeof v.value === 'string' && v.value.length > 12) continue;
    const cur = nameRole(v.name, 'currentNode');
    const nxt = nameRole(v.name, 'nextNode');
    if (cur >= 1 || nxt >= 1 || used.has(v.base)) consider.push({ v, id, cur, nxt, used: used.has(v.base) });
  }
  consider.sort((a, b) => (b.cur - a.cur) || (b.used - a.used));
  const cur = consider.find((c) => c.cur >= 2) || consider.find((c) => c.used && c.nxt < 2) || consider.find((c) => c.cur >= 1);
  if (cur) O.current = { id: cur.id, name: cur.v.name };
  const nxt = consider.find((c) => c !== cur && c.nxt >= 1 && !(O.current && c.id === O.current.id && consider.length > 1 && c.nxt < 2))
    || consider.find((c) => c !== cur);
  if (nxt) O.next = { id: nxt.id, name: nxt.v.name };

  return { overlays: O, claimed };
}

// ── universe: every node and edge the variable ever held, so the layout never jumps ─────────────
export function graphUniverse(model, varName, read) {
  const key = `graph-universe:${varName}`;
  if (model.cache.has(key)) return model.cache.get(key);
  const nodes = new Set();
  const edges = new Map();
  for (const s of model.samples(varName)) {
    const g = read(s.v);
    if (!g) continue;
    g.nodes.forEach((n) => nodes.add(n));
    g.edges.forEach((e) => edges.set(`${e.from}>${e.to}`, e));
  }
  const out = { nodes: [...nodes], edges: [...edges.values()] };
  model.cache.set(key, out);
  return out;
}

export function recognizeGraphs(ctx) {
  const out = [];
  const found = [];
  for (const v of ctx.vars.values()) {
    if (ctx.isClaimed(v.name)) continue;
    const g = readGraph(ctx, v);
    if (g && g.edges.length + g.nodes.length >= 3) found.push({ v, g });
  }
  const canon = (e) => `${e.from < e.to ? e.from : e.to}-${e.from < e.to ? e.to : e.from}`;
  const covered = (edgeG, other) => {
    const have = new Set(other.edges.map(canon));
    return edgeG.edges.length > 0 && edgeG.edges.every((e) => have.has(canon(e)));
  };
  for (const { v, g } of found) {
    if (g.source === 'edges' && found.some((o) => o.g !== g && o.g.source !== 'edges' && covered(g, o.g))) continue;
    const directed = g.source === 'edges' ? DIRECTED_HINT.test(ctx.model.code) : !isSymmetric(g.edges);
    g.undirected = !directed;

    const { overlays, claimed } = computeOverlays(ctx, v, g);
    // an edge between the current node and the next one
    const cur = overlays.current?.id;
    const nxt = overlays.next?.id;
    const edgeNow = cur && nxt && g.edges.find((e) => (same2(e.from, cur) && same2(e.to, nxt)) || (!directed && same2(e.from, nxt) && same2(e.to, cur)));

    const universe = graphUniverse(ctx.model, v.name, (value) => readGraph(ctx, { ...v, value }));
    ctx.claim(`graph:${v.name}`, v.name, ...claimed);
    out.push(ctx.emit({
      id: `graph:${v.name}`, lens: 'graph', title: v.name.replace(/^(self|this)\./, ''), vars: [v.name, ...claimed], priority: 92,
      data: {
        name: v.name, nodes: g.nodes, edges: g.edges, directed, weighted: g.weighted, source: g.source,
        universe, overlays, edgeNow: edgeNow ? edgeKey(edgeNow.from, edgeNow.to, directed) : null,
        changed: v.changed,
      },
    }));
  }
  return out;
}

export { toNumber };
