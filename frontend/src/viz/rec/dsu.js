import { isInt, isObj, stripTrunc, same } from '../values.js';
import { nameRole } from '../roles.js';

/**
 * Union-Find (disjoint set union): a parent array / map whose entries point at other entries.
 * Recognised by shape + history, not only by name: `parent` that started as the identity (everyone their own
 * root), only ever rewired, never grown or shrunk.
 */

const FOCUS_NAMES = new Set(['x', 'y', 'a', 'b', 'u', 'v', 'ra', 'rb', 'rx', 'ry', 'pa', 'pb', 'px', 'py', 'root', 'node', 'i', 'j', 'p', 'q', 'find', 'r']);

function listCandidate(ctx, v) {
  if (!Array.isArray(v.value)) return null;
  const { items } = stripTrunc(v.value);
  if (items.length < 2 || !items.every((x) => isInt(x) && x >= 0 && x < items.length)) return null;
  const p = ctx.profile(v.name);
  const named = nameRole(v.name, 'dsu');
  // a parent array starts as "everyone is their own root" (or zeros that a loop then fills with i): its first
  // snapshot is made of valid indexes. `disc = [-1] * n` that later fills with 0..n-1 is not a union-find.
  const firstItems = Array.isArray(p.first) ? stripTrunc(p.first).items : [];
  const startsLikeParents = firstItems.length >= 2 && firstItems.every((x) => isInt(x) && x >= 0 && x < firstItems.length);
  const shaped = p.arr.identity && startsLikeParents && p.arr.ops.push === 0 && p.arr.ops.popEnd === 0;
  const roots = items.filter((x, i) => x === i).length;
  const usedAsParent = /\bfind\b|\bunion\b|\bunite\b|\bmerge\b/i.test(ctx.model.code);
  const ok = (shaped && (named >= 1 || usedAsParent || p.arr.sameLen + p.arr.ops.set >= 1)) || (named >= 2 && roots >= 1 && usedAsParent);
  return ok ? { items, labels: items.map((_, i) => String(i)), index: (x) => x } : null;
}

function dictCandidate(ctx, v) {
  if (!isObj(v.value) || v.value.__class__ || v.value.__id__ !== undefined) return null;
  const keys = Object.keys(v.value).filter((k) => k !== '…');
  if (keys.length < 2) return null;
  const keySet = new Set(keys);
  if (!keys.every((k) => v.value[k] === null || keySet.has(String(v.value[k])))) return null;
  const p = ctx.profile(v.name);
  const named = nameRole(v.name, 'dsu');
  if (!(p.dict.identity && (named >= 1 || /\bfind\b|\bunion\b/i.test(ctx.model.code)))) return null;
  const labels = keys;
  const pos = new Map(labels.map((k, i) => [k, i]));
  const items = keys.map((k) => (v.value[k] === null ? pos.get(k) : pos.get(String(v.value[k]))));
  return { items, labels, index: (x) => pos.get(String(x)) };
}

export function recognizeDsu(ctx) {
  const out = [];
  for (const v of ctx.vars.values()) {
    if (ctx.isClaimed(v.name)) continue;
    const found = listCandidate(ctx, v) || dictCandidate(ctx, v);
    if (!found) continue;
    const { items: parent, labels, index } = found;
    const n = parent.length;

    // companion arrays: rank / size / height, same owner, same length
    const prefix = v.name.includes('.') ? `${v.name.split('.').slice(0, -1).join('.')}.` : '';
    let companion = null;
    for (const c of ctx.vars.values()) {
      if (c.name === v.name || ctx.isClaimed(c.name) || !c.name.startsWith(prefix)) continue;
      if (prefix === '' && c.name.includes('.')) continue;
      const role = nameRole(c.name, 'rank');
      if (role < 1) continue;
      const items = Array.isArray(c.value) ? stripTrunc(c.value).items : isObj(c.value) ? labels.map((k) => c.value[k]) : null;
      if (items && items.length === n && items.every((x) => typeof x === 'number')) { companion = { name: c.name, items, kind: /size|sz/i.test(c.name) ? 'size' : 'rank' }; break; }
    }

    // what changed in this very step: rewired parents (union, path compression)
    const changed = [];
    const rewired = [];
    if (v.changed && v.prev !== undefined) {
      const before = Array.isArray(v.prev) ? stripTrunc(v.prev).items : isObj(v.prev) ? labels.map((k) => (v.prev[k] === null ? k : v.prev[k])) : [];
      for (let i = 0; i < n; i++) {
        const was = Array.isArray(v.prev) ? before[i] : index(before[i]);
        if (was !== undefined && was !== parent[i]) { changed.push(i); rewired.push({ node: i, from: was, to: parent[i] }); }
      }
    }
    if (companion) {
      const cv = ctx.get(companion.name);
      if (cv?.changed && Array.isArray(cv.prev)) {
        const before = stripTrunc(cv.prev).items;
        companion.changed = companion.items.map((x, i) => (same(before[i], x) ? -1 : i)).filter((i) => i >= 0);
      } else companion.changed = [];
    }

    // nodes the code is working with right now: `x`, `ra`, `rb`... used as an index into the parent array
    const used = new Set(ctx.indexVars(v.name));
    const focus = [];
    for (const c of ctx.ints()) {
      if (c.name === v.name || (!used.has(c.base) && !FOCUS_NAMES.has(c.base))) continue;
      if (c.value >= 0 && c.value < n) focus.push({ name: c.name, node: c.value });
    }
    // reads/writes on this line
    const marks = ctx.accessesFor(v.name).filter((a) => a.index.length === 1 && a.index[0] >= 0 && a.index[0] < n)
      .map((a) => ({ node: a.index[0], kind: a.kind }));

    // forest
    const children = Array.from({ length: n }, () => []);
    const roots = [];
    parent.forEach((p, i) => { if (p === i || p === undefined || p < 0 || p >= n) roots.push(i); else children[p].push(i); });

    ctx.claim(`dsu:${v.name}`, v.name, companion?.name);
    out.push(ctx.emit({
      id: `dsu:${v.name}`, lens: 'dsu', title: v.name.replace(/^(self|this)\./, ''), vars: [v.name, companion?.name].filter(Boolean), priority: 88,
      data: { name: v.name, labels, parent, companion, roots, children, changed, rewired, focus, marks, components: roots.length },
    }));
  }
  return out;
}
