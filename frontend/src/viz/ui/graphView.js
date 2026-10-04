// Pure helpers for the graph panel (no React): what changed since the step before, the path through the parent
// pointers, the summaries shown above the picture. The recogniser works out the *state* of a graph at a step; this
// is what turns two states into something a person can read ("this distance just dropped from 7 to 4").

/** The same key the recogniser uses for an edge: `a>b` when directed, a canonical `a-b` when not. */
export const keyOf = (a, b, directed) => (directed || a === b ? `${a}>${b}` : a < b ? `${a}-${b}` : `${b}-${a}`);

const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const entries = (o) => Object.entries(o || {});

/**
 * What this step changed: the overlays of the step against those of the step before.
 * `prev` is null when there is no step before (nothing is reported then). A variable that only *appears* at this
 * step (its first snapshot) is an initialisation, not a change, so a fresh `dist = {A: 0, B: inf}` does not light
 * up every node.
 */
export function graphChanges(prev, now) {
  const out = { dist: new Set(), visited: new Set(), frontier: new Set(), parent: new Set(), colors: new Set(), any: new Set() };
  if (!prev || !now) return out;
  const appeared = (kind) => Boolean(now.names?.[kind]) && !prev.names?.[kind];

  const was = { visited: new Set(prev.visited || []), frontier: new Set(prev.frontier || []) };
  for (const id of now.visited || []) if (!was.visited.has(id) && !appeared('visited')) out.visited.add(id);
  for (const id of now.frontier || []) if (!was.frontier.has(id)) out.frontier.add(id);
  for (const kind of ['dist', 'parent', 'colors']) {
    if (appeared(kind)) continue;
    const before = prev[kind] || {};
    for (const [id, value] of entries(now[kind])) if (!(id in before) || !same(before[id], value)) out[kind].add(id);
  }
  for (const kind of ['dist', 'visited', 'frontier', 'parent', 'colors']) out[kind].forEach((id) => out.any.add(id));
  return out;
}

/** The nodes from the root down to `id`, following parent pointers (stops at a root or a cycle). */
export function pathToRoot(parent, id, limit = 200) {
  const path = [id];
  const seen = new Set([id]);
  let cur = id;
  while (path.length < limit) {
    const up = parent?.[cur];
    if (up === undefined || up === null || seen.has(up)) break;
    cur = up;
    seen.add(cur);
    path.push(cur);
  }
  return path.reverse();
}

/** Keys of the edges along a path (root first). */
export function pathEdgeKeys(path, directed) {
  const keys = new Set();
  for (let i = 0; i + 1 < path.length; i += 1) keys.add(keyOf(path[i], path[i + 1], directed));
  return keys;
}

const numeric = (w) => (typeof w === 'number' && Number.isFinite(w) ? w : null);

/** The weight of the edge between two nodes (either direction when undirected), or null. */
function weightBetween(edges, a, b, directed) {
  const hit = edges.find((e) => (e.from === a && e.to === b) || (!directed && e.from === b && e.to === a));
  return hit ? numeric(hit.w) : null;
}

/** The total weight along a path, or null when any edge has no numeric weight. */
export function pathCost(edges, path, directed) {
  if (path.length < 2) return null;
  let total = 0;
  for (let i = 0; i + 1 < path.length; i += 1) {
    const w = weightBetween(edges, path[i], path[i + 1], directed);
    if (w === null) return null;
    total += w;
  }
  return Math.round(total * 1e6) / 1e6;
}

/** How many edges the algorithm has chosen so far and their total weight (null when they carry none). */
export function chosenSummary(edges, chosenKeys, directed) {
  const keys = chosenKeys instanceof Set ? chosenKeys : new Set(chosenKeys);
  if (!keys.size) return { count: 0, weight: null };
  const seen = new Set();
  let weight = 0;
  let weighed = 0;
  for (const e of edges) {
    const k = keyOf(e.from, e.to, directed);
    if (!keys.has(k) || seen.has(k)) continue;
    seen.add(k);
    const w = numeric(e.w);
    if (w !== null) { weight += w; weighed += 1; }
  }
  return { count: keys.size, weight: weighed ? Math.round(weight * 1e6) / 1e6 : null };
}

/** Node ids in the order the algorithm gave them (visit order, topological order, finish order ...). */
export function orderList(order) {
  return entries(order).sort((a, b) => Number(a[1]) - Number(b[1])).map(([id]) => id);
}

/** Node radius: big enough to read in a small graph, smaller in a big one so nodes do not overlap. */
export const radiusFor = (count) => (count <= 14 ? 19 : count <= 28 ? 16 : 13);

/** Edge weights on a dense graph would bury it: show them only for edges that matter right now. */
export const DENSE_EDGES = 40;

/** `a → b → c …`, cut after `max` items. */
export function chain(ids, max = 8) {
  const shown = ids.slice(0, max).join(' → ');
  return ids.length > max ? `${shown} → …` : shown;
}
