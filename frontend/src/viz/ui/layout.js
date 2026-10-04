// Pure layout helpers for the visual layer (no React): tidy trees and graph drawings.

/** Deterministic PRNG so the same graph always lays out the same way. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const natural = (a, b) => {
  const na = Number(a);
  const nb = Number(b);
  return Number.isNaN(na) || Number.isNaN(nb) ? String(a).localeCompare(String(b)) : na - nb;
};

/**
 * Tidy tree: leaves get consecutive x slots, parents sit above the middle of their children. For binary trees
 * a lone child hangs to the side it belongs to (left child left of its parent), so a BST keeps its shape.
 *
 * @param roots      ids of the roots (laid out side by side)
 * @param kids       (id) => [{ id, side?: 'l' | 'r' }]
 * @returns { pos: Map(id -> {x, y}) in slot/level units, width, height }
 */
export function layoutTree(roots, kids) {
  const pos = new Map();
  let next = 0;
  let maxDepth = 0;
  const seen = new Set();
  const place = (id, depth) => {
    if (seen.has(id)) return pos.get(id)?.x ?? 0;
    seen.add(id);
    maxDepth = Math.max(maxDepth, depth);
    const children = (kids(id) || []).filter((c) => c.id !== null && c.id !== undefined && !seen.has(c.id));
    if (!children.length) {
      pos.set(id, { x: next, y: depth });
      next += 1;
      return next - 1;
    }
    const sides = children.map((c) => c.side);
    const xs = [];
    if (children.length === 1 && sides[0] === 'r') next += 0.5;
    for (const c of children) xs.push(place(c.id, depth + 1));
    let x;
    if (children.length === 1 && sides[0] === 'l') x = xs[0] + 0.5;
    else if (children.length === 1 && sides[0] === 'r') x = xs[0] - 0.5;
    else x = (xs[0] + xs[xs.length - 1]) / 2;
    pos.set(id, { x, y: depth });
    if (children.length === 1 && sides[0] === 'l') next += 0.5;
    return x;
  };
  roots.forEach((r, i) => {
    if (i > 0) next += 0.6;
    place(r, 0);
  });
  return { pos, width: Math.max(1, next), height: maxDepth + 1 };
}

// ── graphs ─────────────────────────────────────────────────────────────────────────────────────
function topoLayers(nodes, edges) {
  const indeg = new Map(nodes.map((n) => [n, 0]));
  const out = new Map(nodes.map((n) => [n, []]));
  for (const e of edges) {
    if (e.from === e.to || !indeg.has(e.from) || !indeg.has(e.to)) continue;
    out.get(e.from).push(e.to);
    indeg.set(e.to, indeg.get(e.to) + 1);
  }
  const layer = new Map();
  const queue = nodes.filter((n) => indeg.get(n) === 0);
  queue.forEach((n) => layer.set(n, 0));
  let seen = 0;
  const deg = new Map(indeg);
  while (queue.length) {
    const n = queue.shift();
    seen += 1;
    for (const m of out.get(n)) {
      layer.set(m, Math.max(layer.get(m) ?? 0, layer.get(n) + 1));
      deg.set(m, deg.get(m) - 1);
      if (deg.get(m) === 0) queue.push(m);
    }
  }
  return seen === nodes.length ? layer : null; // null: there is a cycle
}

function layered(nodes, edges, W, H) {
  const layers = topoLayers(nodes, edges);
  if (!layers) return null;
  const depth = Math.max(...layers.values()) + 1;
  if (depth < 2) return null;
  const columns = Array.from({ length: depth }, () => []);
  nodes.forEach((n) => columns[layers.get(n)].push(n));
  // order inside a column by the average position of the parents: fewer crossings
  const index = new Map();
  columns[0].sort(natural).forEach((n, i) => index.set(n, i));
  const parents = new Map(nodes.map((n) => [n, []]));
  edges.forEach((e) => { if (parents.has(e.to) && e.from !== e.to) parents.get(e.to).push(e.from); });
  for (let c = 1; c < depth; c++) {
    const score = (n) => {
      const ps = parents.get(n).filter((p) => index.has(p));
      return ps.length ? ps.reduce((s, p) => s + index.get(p), 0) / ps.length : 0;
    };
    columns[c].sort((a, b) => score(a) - score(b) || natural(a, b));
    columns[c].forEach((n, i) => index.set(n, i));
  }
  const widest = Math.max(...columns.map((c) => c.length));
  const pos = new Map();
  const padX = 40;
  const padY = 34;
  const gx = depth > 1 ? (W - 2 * padX) / (depth - 1) : 0;
  columns.forEach((col, c) => {
    const gy = widest > 1 ? (H - 2 * padY) / (widest - 1) : 0;
    const offset = ((widest - col.length) * gy) / 2;
    col.forEach((n, i) => pos.set(n, { x: padX + c * gx, y: padY + offset + i * gy + (widest === 1 ? (H - 2 * padY) / 2 : 0) }));
  });
  return pos;
}

/**
 * Force-directed layout (Fruchterman-Reingold), deterministic. The inner loop is the cost: every pair of nodes,
 * every round. It works on typed arrays by index (no Map lookups, no per-round allocation) and a bigger graph
 * gets fewer rounds with a faster cooling, ending at the same temperature, so a 100-node graph is laid out in
 * a few milliseconds instead of freezing the page.
 */
function force(nodes, edges, W, H) {
  const n = nodes.length;
  const rnd = mulberry32(n * 7919 + edges.length * 104729);
  const sorted = [...nodes].sort(natural);
  const index = new Map(sorted.map((id, i) => [id, i]));
  const R = Math.min(W, H) / 2.6;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  sorted.forEach((_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    xs[i] = W / 2 + R * Math.cos(a) + (rnd() - 0.5) * 6;
    ys[i] = H / 2 + R * Math.sin(a) + (rnd() - 0.5) * 6;
  });
  const result = () => new Map(sorted.map((id, i) => [id, { x: xs[i], y: ys[i] }]));
  if (n <= 2) return result();

  const k = Math.sqrt((W * H) / n) * 0.85;
  const kk = k * k;
  const links = [];
  for (const e of edges) {
    if (e.from === e.to) continue;
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a !== undefined && b !== undefined) links.push(a, b);
  }
  const rounds = n > 80 ? 120 : n > 40 ? 200 : 300;
  const cooling = 0.985 ** (300 / rounds);
  const dispX = new Float64Array(n);
  const dispY = new Float64Array(n);
  let t = W / 8;
  for (let it = 0; it < rounds; it++) {
    dispX.fill(0);
    dispY.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = xs[i] - xs[j];
        let dy = ys[i] - ys[j];
        const d = Math.hypot(dx, dy) || 0.01;
        const f = kk / d;
        dx /= d; dy /= d;
        dispX[i] += dx * f; dispY[i] += dy * f;
        dispX[j] -= dx * f; dispY[j] -= dy * f;
      }
    }
    for (let l = 0; l < links.length; l += 2) {
      const a = links[l];
      const b = links[l + 1];
      let dx = xs[a] - xs[b];
      let dy = ys[a] - ys[b];
      const d = Math.hypot(dx, dy) || 0.01;
      const f = (d * d) / k;
      dx /= d; dy /= d;
      dispX[a] -= dx * f; dispY[a] -= dy * f;
      dispX[b] += dx * f; dispY[b] += dy * f;
    }
    for (let i = 0; i < n; i++) {
      const len = Math.hypot(dispX[i], dispY[i]) || 0.01;
      const step = Math.min(len, t);
      xs[i] = Math.max(30, Math.min(W - 30, xs[i] + (dispX[i] / len) * step));
      ys[i] = Math.max(30, Math.min(H - 30, ys[i] + (dispY[i] / len) * step));
    }
    t *= cooling;
  }
  return result();
}

/** Stretch positions to fill the drawing area with a margin. */
function fit(pos, W, H, pad = 36) {
  const xs = [...pos.values()].map((p) => p.x);
  const ys = [...pos.values()].map((p) => p.y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const sx = maxX > minX ? (W - 2 * pad) / (maxX - minX) : 0;
  const sy = maxY > minY ? (H - 2 * pad) / (maxY - minY) : 0;
  const s = Math.min(sx || sy, sy || sx) || 1;
  const out = new Map();
  const ox = (W - (maxX - minX) * s) / 2;
  const oy = (H - (maxY - minY) * s) / 2;
  for (const [id, p] of pos) out.set(id, { x: ox + (p.x - minX) * s, y: oy + (p.y - minY) * s });
  return out;
}

/**
 * Where to draw each node. Directed acyclic graphs are drawn in layers (sources on the left, so a topological
 * order reads left to right); everything else uses a deterministic force layout.
 */
export function layoutGraph(nodes, edges, directed, { width = 640, height = 360 } = {}) {
  const ids = [...new Set(nodes)];
  if (!ids.length) return { pos: new Map(), width, height };
  if (ids.length === 1) return { pos: new Map([[ids[0], { x: width / 2, y: height / 2 }]]), width, height };
  const unique = new Map();
  edges.forEach((e) => unique.set(`${e.from}>${e.to}`, e));
  const list = [...unique.values()];
  let pos = directed ? layered(ids, list, width, height) : null;
  if (!pos) pos = fit(force(ids, list, width, height), width, height);
  return { pos, width, height };
}
