import { createContext, useContext } from 'react';

/** What every lens may need besides its own data: the trace model, the language, the current frame. */
export const VizContext = createContext({ model: null, language: 'python', frameIdx: 0 });
export const useViz = () => useContext(VizContext);

const LITERALS = {
  python: { null: 'None', true: 'True', false: 'False' },
  default: { null: 'null', true: 'true', false: 'false' },
};

/** A value as a short piece of text: ∞ for infinities, language-flavoured literals, compact containers. */
export function fmt(value, language = 'python', max = 14) {
  const lit = LITERALS[language] || LITERALS.default;
  if (value === null || value === undefined) return lit.null;
  if (typeof value === 'boolean') return value ? lit.true : lit.false;
  if (value === 'Infinity') return '∞';
  if (value === '-Infinity') return '-∞';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  if (typeof value === 'string') return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  if (Array.isArray(value)) {
    const inner = value.slice(0, 5).map((x) => fmt(x, language, 6)).join(', ');
    const text = `(${inner}${value.length > 5 ? ', …' : ''})`;
    return text.length > max + 8 ? `${text.slice(0, max + 7)}…` : text;
  }
  if (typeof value === 'object') {
    if (value.__class__) return `${value.__class__}`;
    const keys = Object.keys(value);
    return `{${keys.length}}`;
  }
  return String(value);
}

// ── "infinity" sentinels ──────────────────────────────────────────────────────────────────────
// C++ and Java spell infinity as INT_MAX, 1e9, 0x3f3f3f3f, 1e18, LLONG_MAX ... (the tracers send integers
// beyond 2^53 as strings). A distance badge or table cell showing 1000000000 hides the point of the algorithm.
const SENTINELS = new Set(['1000000000', '2147483647', '1073741823', '1061109567', '1000000000000000000', '4611686018427387903', '9223372036854775807', '4557430888798830399']);
const BIG_INT = /^-?\d{16,}$/;
const unsigned = (x) => String(x).replace(/^-/, '');

/** A number this large (>= 1e9, or an exact integer beyond 2^53 sent as a string). */
export function isHuge(x) {
  if (typeof x === 'number') return Number.isFinite(x) && Math.abs(x) >= 1e9;
  return typeof x === 'string' && BIG_INT.test(x);
}

/** One of the well-known "infinity" constants, which is never real data. */
export function isSentinel(x) {
  if (typeof x === 'number') return Number.isFinite(x) && SENTINELS.has(String(Math.abs(x)));
  return typeof x === 'string' && BIG_INT.test(x) && SENTINELS.has(unsigned(x));
}

/** Everyday numbers next to huge ones: the huge ones are a sentinel. A collection that is huge everywhere is real data. */
export function infinityIn(values) {
  let huge = false;
  let ordinary = false;
  for (const x of values) {
    if (isHuge(x)) huge = true;
    else if (typeof x === 'number') ordinary = true;
    if (huge && ordinary) return true;
  }
  return false;
}

/** Does this value mean infinity? `mixed` = infinityIn(its collection): then any huge value counts, not only the known constants. */
export function isInfinity(value, mixed = false) {
  if (value === 'Infinity' || value === '-Infinity') return true;
  return isHuge(value) && (mixed || isSentinel(value));
}

/** fmt() for a cell of a numeric collection: infinities read ∞ / -∞ (the exact value stays in the tooltip). */
export function fmtCell(value, language, max, mixed) {
  if (isInfinity(value, mixed)) return String(value).startsWith('-') ? '-∞' : '∞';
  return fmt(value, language, max);
}

/** Long form for tooltips. */
export function fmtFull(value, language = 'python') {
  try {
    return JSON.stringify(value)
      ?.replace(/null/g, (LITERALS[language] || LITERALS.default).null)
      .slice(0, 400);
  } catch {
    return String(value);
  }
}

export const LEGEND = {
  write: { label: 'written', color: 'var(--vz-write-bg)', border: 'solid' },
  read: { label: 'read next', color: 'var(--vz-read-bg)', border: 'solid' },
  point: { label: 'pointer / current', color: 'var(--vz-point-bg)', border: 'solid' },
  done: { label: 'visited / done', color: 'var(--vz-done-bg)', border: 'solid' },
  front: { label: 'waiting', color: 'var(--vz-front-bg)', border: 'solid' },
};

export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
