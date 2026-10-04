import {
  isObj, isInt, isScalar, stripTrunc, elemKind, same, toNumber,
} from '../values.js';
import { nameRole } from '../roles.js';

/**
 * Hash maps, sets, intervals, bit masks and the leftover scalars.
 */

const keysOf = (o) => Object.keys(o).filter((k) => k !== '…');
const plainDict = (v) => isObj(v) && !('__class__' in v) && !('__id__' in v);

function diffKeys(prev, cur) {
  const added = [];
  const updated = [];
  const removed = [];
  if (!plainDict(prev)) return { added, updated, removed };
  for (const k of keysOf(cur)) {
    if (!(k in prev)) added.push(k);
    else if (!same(prev[k], cur[k])) updated.push(k);
  }
  for (const k of keysOf(prev)) if (!(k in cur)) removed.push(k);
  return { added, updated, removed };
}

export function recognizeHash(ctx) {
  const out = [];
  for (const v of ctx.vars.values()) {
    if (ctx.isClaimed(v.name)) continue;
    const type = v.type || '';

    // sets
    if (type === 'set' && Array.isArray(v.value)) {
      const { items, more } = stripTrunc(v.value);
      const prev = Array.isArray(v.prev) ? stripTrunc(v.prev).items : [];
      const key = (x) => JSON.stringify(x);
      const before = new Set(prev.map(key));
      const now = new Set(items.map(key));
      ctx.claim(`set:${v.name}`, v.name);
      out.push(ctx.emit({
        id: `set:${v.name}`, lens: 'set', title: v.name.replace(/^(self|this)\./, ''), vars: [v.name], priority: 46,
        data: { name: v.name, items, more, added: v.changed ? items.filter((x) => !before.has(key(x))).map(key) : [], removed: v.changed ? prev.filter((x) => !now.has(key(x))).map(key) : [] },
      }));
      continue;
    }

    if (!plainDict(v.value)) continue;
    const keys = keysOf(v.value);
    if (!keys.length && !v.changed && ctx.profile(v.name).dict.maxKeys === 0) { /* an empty dict still deserves a panel once it fills */ }
    const values = keys.map((k) => v.value[k]);
    const delta = v.changed ? diffKeys(v.prev, v.value) : { added: [], updated: [], removed: [] };

    // a few named buckets of small lists (pegs, bins, adjacency left over): drawn as stacks side by side
    const listy = keys.length >= 1 && keys.length <= 8 && values.every((x) => Array.isArray(x) && stripTrunc(x).items.every(isScalar));
    if (listy && keys.length >= 2 && values.every((x) => stripTrunc(x).items.length <= 30)) {
      ctx.claim(`stack:${v.name}`, v.name);
      out.push(ctx.emit({
        id: `stack:${v.name}`, lens: 'stack', title: v.name.replace(/^(self|this)\./, ''), vars: [v.name], priority: 56,
        data: { name: v.name, kind: 'stack', multi: keys.map((k) => ({ label: k, items: stripTrunc(v.value[k]).items })), changed: [...delta.added, ...delta.updated].map((k) => keys.indexOf(k)) },
      }));
      continue;
    }

    const p = ctx.profile(v.name);
    const ordered = /^OrderedDict$|^LinkedHashMap$/.test(type) || ctx.hints.ordered && nameRole(v.name, 'dp') === 0 && /cache|lru/i.test(v.name);
    const counter = type === 'Counter' || (values.length && values.every((x) => isInt(x) && x >= 0) && /count|freq|seen|cnt|hist/i.test(v.name));
    const memo = nameRole(v.name, 'dp') >= 1 || /memo|cache/i.test(v.name);
    const entries = keys.slice(0, 80).map((k) => [k, v.value[k]]);
    ctx.claim(`hash:${v.name}`, v.name);
    out.push(ctx.emit({
      id: `hash:${v.name}`, lens: 'hash', title: v.name.replace(/^(self|this)\./, ''), vars: [v.name], priority: 54,
      data: { name: v.name, entries, more: Math.max(0, keys.length - entries.length), kind: ordered ? 'ordered' : memo ? 'memo' : counter ? 'counter' : 'dict', ...delta, size: keys.length, grew: p.dict.added > 0 },
    }));
  }
  return out;
}

export function recognizeIntervals(ctx) {
  const out = [];
  for (const v of ctx.vars.values()) {
    if (ctx.isClaimed(v.name) || !Array.isArray(v.value)) continue;
    const { items } = stripTrunc(v.value);
    if (items.length < 1 || elemKind(items) !== 'pair') continue;
    const named = nameRole(v.name, 'intervals');
    if (named < 1) continue;
    if (!items.every((x) => Array.isArray(x) && typeof x[0] === 'number' && typeof x[1] === 'number' && x[0] <= x[1])) continue;
    const prev = Array.isArray(v.prev) ? stripTrunc(v.prev).items : [];
    const changed = v.changed ? items.map((x, i) => (same(prev[i], x) ? -1 : i)).filter((i) => i >= 0) : [];
    ctx.claim(`intervals:${v.name}`, v.name);
    out.push(ctx.emit({
      id: `intervals:${v.name}`, lens: 'intervals', title: v.name, vars: [v.name], priority: 72,
      data: { name: v.name, items, changed },
    }));
  }
  return out;
}

export function recognizeBits(ctx) {
  if (!ctx.hints.bitops) return [];
  const found = [];
  for (const v of ctx.vars.values()) {
    if (ctx.isClaimed(v.name) || !isInt(v.value) || v.outer && false) continue;
    if (v.value < 0 || v.value > 2 ** 31) continue;
    const role = nameRole(v.name, 'mask');
    const p = ctx.profile(v.name);
    const looksBitwise = role >= 2 || (role === 1 && p.num.max >= 2 && new RegExp(`\\b${v.base}\\b\\s*(?:&|\\|\\||<<|>>|\\^)|(?:&|<<|>>|\\^)\\s*\\b${v.base}\\b|\\b${v.base}\\s*=\\s*${v.base}\\s*(?:&|\\||\\^|>>|<<)`).test(ctx.model.code));
    if (!looksBitwise) continue;
    found.push(v);
  }
  if (!found.length) return [];
  const widthFor = (max) => Math.min(32, Math.max(4, Math.ceil(Math.log2(Math.max(1, max) + 1) / 4) * 4));
  const rows = found.slice(0, 4).map((v) => {
    const p = ctx.profile(v.name);
    const width = widthFor(Math.max(p.num.max, v.value));
    const bitsOf = (n) => Array.from({ length: width }, (_, i) => ((n >> (width - 1 - i)) & 1));
    const bits = bitsOf(v.value);
    const prevBits = typeof v.prev === 'number' ? bitsOf(v.prev) : null;
    const changed = prevBits ? bits.map((b, i) => (b !== prevBits[i] ? i : -1)).filter((i) => i >= 0) : [];
    return { name: v.name, value: v.value, width, bits, changed };
  });
  ctx.claim('bits', ...found.map((v) => v.name));
  return [ctx.emit({ id: 'bits', lens: 'bits', title: 'Bits', vars: found.map((v) => v.name), priority: 64, data: { rows } })];
}

export function recognizeScalars(ctx) {
  const items = [];
  for (const v of ctx.vars.values()) {
    if (ctx.isClaimed(v.name)) continue;
    const val = v.value;
    const scalar = isScalar(val) && !(typeof val === 'string' && val.length > 60);
    const shortList = Array.isArray(val) && stripTrunc(val).items.length <= 12 && stripTrunc(val).items.every(isScalar);
    if (!scalar && !shortList) continue;
    items.push({ name: v.name.replace(/^(self|this)\./, ''), full: v.name, value: val, changed: v.changed, outer: v.outer, type: v.type });
  }
  if (!items.length) return [];
  const rank = (i) => (i.changed ? 0 : i.outer ? 2 : 1);
  items.sort((a, b) => rank(a) - rank(b));
  return [ctx.emit({ id: 'scalars', lens: 'scalars', title: 'Variables', vars: items.map((i) => i.full), priority: 10, data: { items } })];
}

export { toNumber };
