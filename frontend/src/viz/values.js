// Pure helpers over wire values (what the tracers put in `variables[name].value`):
// numbers, booleans, strings, null, arrays, plain objects (dicts), and node-like objects
// ({__class__, __id__, val, next, left, right, ...}). Nothing here knows about React or frames.

export const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const isInt = (v) => typeof v === 'number' && Number.isInteger(v);
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const isScalar = (v) => v === null || typeof v !== 'object';

const TRUNC = /^\+\d+ more$/;

/** Tracers cap long arrays and append a "+N more" marker: split it off. */
export function stripTrunc(arr) {
  if (Array.isArray(arr) && arr.length && typeof arr[arr.length - 1] === 'string' && TRUNC.test(arr[arr.length - 1])) {
    return { items: arr.slice(0, -1), more: Number(arr[arr.length - 1].slice(1).split(' ')[0]) };
  }
  return { items: arr, more: 0 };
}

/** Numbers as the tracers encode them: infinities / NaN travel as strings. */
export function toNumber(v) {
  if (typeof v === 'number') return v;
  if (v === 'Infinity') return Infinity;
  if (v === '-Infinity') return -Infinity;
  if (v === 'NaN') return NaN;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
}
export const isNumLike = (v) => isNum(v) || v === 'Infinity' || v === '-Infinity' || v === 'NaN';

export const isNodeObj = (v) => isObj(v) && ('__class__' in v || '__id__' in v);
export const isListNode = (v) => isObj(v) && 'next' in v && ('val' in v || 'data' in v || 'value' in v || 'key' in v);
export const isTreeNode = (v) => isObj(v) && ('left' in v || 'right' in v) && ('val' in v || 'data' in v || 'value' in v || 'key' in v);
export const isRef = (v) => isObj(v) && ('__ref__' in v || '__cycle__' in v);

/** Cheap structural equality for wire values. */
export function same(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (!(k in b) || !same(a[k], b[k])) return false;
  return true;
}

/**
 * What the elements of an array are. 'int' | 'num' | 'bool' | 'char' | 'str' | 'pair' | 'tuple' |
 * 'array' | 'object' | 'mixed' | 'empty'. Nulls (unfilled DP cells, missing children) are ignored.
 */
export function elemKind(items) {
  const kinds = new Set();
  let seen = 0;
  for (const v of items) {
    if (v === null || v === undefined) continue;
    seen += 1;
    if (typeof v === 'boolean') kinds.add('bool');
    else if (isInt(v)) kinds.add('int');
    else if (isNumLike(v)) kinds.add('num');
    else if (typeof v === 'string') kinds.add(v.length === 1 ? 'char' : 'str');
    else if (Array.isArray(v)) {
      const { items: inner } = stripTrunc(v);
      if (inner.length === 2 && inner.every(isScalar)) kinds.add('pair');
      else if (inner.every(isScalar) && inner.length >= 3 && inner.length <= 6) kinds.add('tuple');
      else kinds.add('array');
    } else if (isObj(v)) kinds.add('object');
    if (kinds.size > 2) return 'mixed';
  }
  if (!seen) return 'empty';
  if (kinds.size === 1) return [...kinds][0];
  if (kinds.has('int') && kinds.has('num') && kinds.size === 2) return 'num';
  if (kinds.has('char') && kinds.has('str') && kinds.size === 2) return 'str';
  return 'mixed';
}

/** Is this (list of lists of scalars) a rectangular grid? -> {rows, cols, cells} | null */
export function asGrid(v, { minRows = 1, minCols = 1 } = {}) {
  if (!Array.isArray(v)) return null;
  const { items: rows } = stripTrunc(v);
  if (rows.length < minRows) return null;
  let cols = -1;
  const cells = [];
  for (const r of rows) {
    if (!Array.isArray(r)) return null;
    const { items } = stripTrunc(r);
    if (!items.every(isScalar)) return null;
    if (cols === -1) cols = items.length;
    else if (items.length !== cols) return null;
    cells.push(items);
  }
  if (cols < minCols) return null;
  return { rows: cells.length, cols, cells };
}

/** The kind of values a grid holds: 'binary' (0/1), 'bool', 'int', 'num', 'char', 'str', 'mixed'. */
export function gridKind(cells) {
  const flat = [];
  for (const row of cells) for (const c of row) flat.push(c);
  const k = elemKind(flat);
  if (k === 'int' && flat.every((c) => c === null || c === 0 || c === 1)) return 'binary';
  if (k === 'char' && flat.every((c) => c === null || c === '0' || c === '1')) return 'binary-char';
  return k;
}

/** A value that is all one filler: [0,0,0], [inf, inf], [None, None], ['.', '.']. */
export function isUniform(items) {
  if (!items.length) return false;
  return items.every((x) => x === items[0] || (typeof x === 'string' && x === items[0]));
}

/** Distinct, non-null scalar values (capped) for set-like checks. */
export function distinct(items, cap = 64) {
  const out = new Set();
  for (const v of items) {
    if (v === null || v === undefined || typeof v === 'object') continue;
    out.add(v);
    if (out.size >= cap) break;
  }
  return out;
}

/** Same multiset (order ignored)? primitives only; used to spot "this change only moved things". */
export function sameMultiset(a, b) {
  if (a.length !== b.length) return false;
  const count = new Map();
  for (const v of a) {
    const key = typeof v === 'object' ? JSON.stringify(v) : v;
    count.set(key, (count.get(key) || 0) + 1);
  }
  for (const v of b) {
    const key = typeof v === 'object' ? JSON.stringify(v) : v;
    const n = count.get(key);
    if (!n) return false;
    count.set(key, n - 1);
  }
  return true;
}

/**
 * How did array `a` become array `b`?
 *   { op: 'push' | 'popEnd' | 'popFront' | 'pushFront' | 'set' | 'swap' | 'multi' | 'rewrite' | 'same', idx: [...] }
 * `idx` are the positions that differ (in `b`).
 */
export function diffArrays(a, b) {
  const la = a.length;
  const lb = b.length;
  if (la === lb) {
    const idx = [];
    for (let i = 0; i < lb; i++) if (!same(a[i], b[i])) idx.push(i);
    if (!idx.length) return { op: 'same', idx };
    if (idx.length === 1) return { op: 'set', idx };
    if (idx.length === 2 && same(a[idx[0]], b[idx[1]]) && same(a[idx[1]], b[idx[0]])) return { op: 'swap', idx };
    return { op: 'multi', idx };
  }
  if (lb === la + 1) {
    let prefix = true;
    for (let i = 0; i < la; i++) if (!same(a[i], b[i])) { prefix = false; break; }
    if (prefix) return { op: 'push', idx: [lb - 1] };
    let suffix = true;
    for (let i = 0; i < la; i++) if (!same(a[i], b[i + 1])) { suffix = false; break; }
    if (suffix) return { op: 'pushFront', idx: [0] };
  }
  if (lb === la - 1) {
    let prefix = true;
    for (let i = 0; i < lb; i++) if (!same(a[i], b[i])) { prefix = false; break; }
    if (prefix) return { op: 'popEnd', idx: [] };
    let suffix = true;
    for (let i = 0; i < lb; i++) if (!same(a[i + 1], b[i])) { suffix = false; break; }
    if (suffix) return { op: 'popFront', idx: [] };
  }
  return { op: 'rewrite', idx: [] };
}

/** Sort key of a heap entry: a number, or the first number of a tuple/pair. */
export function heapKey(v) {
  if (isNumLike(v)) return toNumber(v);
  if (Array.isArray(v) && v.length) return toNumber(v[0]);
  return null;
}

/** Does `items` satisfy the (min- or max-) heap property in array layout? */
export function heapOrder(items) {
  const keys = items.map(heapKey);
  if (keys.some((k) => k === null || Number.isNaN(k))) return null;
  let min = true;
  let max = true;
  for (let i = 1; i < keys.length; i++) {
    const p = keys[(i - 1) >> 1];
    if (p > keys[i]) min = false;
    if (p < keys[i]) max = false;
    if (!min && !max) return null;
  }
  return min ? 'min' : 'max';
}
