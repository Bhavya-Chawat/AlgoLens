/**
 * Edge cases for the Test Cases tab, generated from the function's own parameters - no AI, no network, and no
 * parameter names are assumed. What a parameter *is* comes from its declared type (`vector<vector<int>>`,
 * `int[][]`, `List[int]`, `integer[]`, `TreeNode*` ...) and, when there is none (plain Python), from the shape of
 * the value currently typed in for it. Every theme then fills each parameter with the value that probes that
 * theme: empty, a single item, duplicates, sorted, reversed, negatives, extremes, or seeded random.
 */

export const EDGE_THEMES = [
  { id: 'empty', label: 'Empty / zero', hint: 'no items, 0, empty text' },
  { id: 'single', label: 'Single item', hint: 'exactly one element' },
  { id: 'equal', label: 'All equal', hint: 'duplicates everywhere' },
  { id: 'sorted', label: 'Sorted', hint: 'ascending order' },
  { id: 'reversed', label: 'Reversed', hint: 'descending: the worst case for many sorts and scans' },
  { id: 'negative', label: 'Negatives', hint: 'negative numbers and zero, mixed-case text' },
  { id: 'extreme', label: 'Extremes', hint: 'INT_MAX / INT_MIN: overflow and boundary bugs' },
  { id: 'random', label: 'Random', hint: 'seeded random values' },
];

const INT_MAX = 2147483647;
const INT_MIN = -2147483648;

// ── what is this parameter? ────────────────────────────────────────────────────────────────────
const CONTAINER = /(vector|list|arraylist|linkedlist|deque|array|set|unordered_set|multiset|queue|stack|iterable|collection|sequence)[<[]/g;
const INT_WORDS = new Set(['int', 'integer', 'long', 'short', 'size_t', 'number', 'int32', 'int64', 'byte', 'uint', 'unsigned']);
const FLOAT_WORDS = new Set(['float', 'double', 'decimal']);
const TEXT_WORDS = new Set(['string', 'str', 'char', 'character']);
const BOOL_WORDS = new Set(['bool', 'boolean']);

/** "vector<vector<int>>" | "int[][]" | "List[str]" | "TreeNode*" -> { depth, base } or null when it is not recognised. */
export function parseType(type) {
  const t = String(type ?? '').toLowerCase().replace(/\bconst\b|std::|[&*]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (t.includes('treenode')) return { depth: 0, base: 'tree', unsigned: false };
  if (t.includes('listnode')) return { depth: 0, base: 'linked', unsigned: false };
  const depth = (t.match(/\[\]/g) || []).length + (t.match(CONTAINER) || []).length;
  const words = t.replace(/[<>[\],]/g, ' ').split(/[^a-z0-9_]+/).filter(Boolean);
  const unsigned = words.includes('unsigned') || words.includes('uint');
  let base = null;
  for (const w of words) {
    if (FLOAT_WORDS.has(w)) base = 'float';
    else if (TEXT_WORDS.has(w)) base = 'text';
    else if (BOOL_WORDS.has(w)) base = 'bool';
    else if (INT_WORDS.has(w) && base === null) base = 'int';
  }
  if (base === null && depth === 0) return null;
  return { depth, base: base || 'int', unsigned };
}

/** The same description, read from a value instead of a type. */
export function kindFromValue(value) {
  let depth = 0;
  let leaf = value;
  while (Array.isArray(leaf)) {
    depth += 1;
    leaf = leaf.find((x) => x !== null && x !== undefined) ?? leaf[0];
  }
  if (typeof leaf === 'boolean') return { depth, base: 'bool', unsigned: false };
  if (typeof leaf === 'string') return { depth, base: 'text', unsigned: false };
  if (typeof leaf === 'number') return { depth, base: Number.isInteger(leaf) ? 'int' : 'float', unsigned: false };
  return depth > 0 ? { depth, base: 'int', unsigned: false } : null;
}

/** A parameter's kind: its declared type wins, the value currently typed in is the fallback. */
export function kindOf(param, sample) {
  return parseType(param?.type) || kindFromValue(sample) || null;
}

// ── values ──────────────────────────────────────────────────────────────────────────────────────
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const NEGATIVES = [-3, 0, -1, 4, -2, 2, -5, 1];
const EXTREMES = [INT_MAX, INT_MIN, 0, 1, -1];

/** How many items a one-dimensional list gets in each theme. */
const LENGTH = { empty: 0, single: 1, equal: 5, sorted: 8, reversed: 8, negative: 6, extreme: 5, random: 8 };

function numberAt(theme, i, n, rand, float) {
  let v;
  switch (theme) {
    case 'sorted': v = i + 1; break;
    case 'reversed': v = n - i; break;
    case 'equal': v = 3; break;
    case 'negative': v = NEGATIVES[i % NEGATIVES.length]; break;
    case 'extreme': v = EXTREMES[i % EXTREMES.length]; break;
    case 'random': v = Math.floor(rand() * 50); break;
    default: v = 1; // single
  }
  return float && theme !== 'extreme' ? v + 0.5 : v;
}

function textAt(theme, i, n, rand) {
  switch (theme) {
    case 'sorted': return LETTERS[i % 26];
    case 'reversed': return LETTERS[(n - 1 - i) % 26];
    case 'equal': return 'a';
    case 'negative': return i % 2 ? LETTERS[i % 26].toUpperCase() : LETTERS[i % 26];
    case 'extreme': return ['z', 'A', '0', ' ', 'a'][i % 5];
    case 'random': return LETTERS[Math.floor(rand() * 26)];
    default: return 'a'; // single
  }
}

function leaf(base, theme, i, n, rand, unsigned) {
  if (base === 'text') return textAt(theme, i, n, rand);
  if (base === 'bool') return theme === 'empty' ? false : theme === 'random' ? rand() < 0.5 : theme === 'sorted' ? i % 2 === 0 : theme !== 'reversed' || i % 2 === 1;
  const v = numberAt(theme, i, n, rand, base === 'float');
  return unsigned ? Math.max(0, Math.abs(v) === Math.abs(INT_MIN) ? 0 : Math.abs(v)) : v;
}

function list(base, theme, rand, unsigned) {
  const n = LENGTH[theme];
  return Array.from({ length: n }, (_, i) => leaf(base, theme, i, n, rand, unsigned));
}

function grid(base, theme, rand, unsigned) {
  if (theme === 'empty') return [];
  const rows = theme === 'single' ? 1 : theme === 'extreme' ? 2 : 3;
  const cols = theme === 'single' ? 1 : theme === 'extreme' ? 2 : theme === 'random' ? 4 : 3;
  const n = rows * cols;
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => leaf(base, theme, r * cols + c, n, rand, unsigned)));
}

/** A tree in LeetCode's level-order form. */
function tree(theme, rand) {
  switch (theme) {
    case 'empty': return [];
    case 'single': return [1];
    case 'equal': return [1, 1, 1];
    case 'sorted': return [4, 2, 6, 1, 3, 5, 7];
    case 'reversed': return [1, null, 2, null, 3, null, 4]; // a chain: the unbalanced worst case
    case 'negative': return [0, -1, 1];
    case 'extreme': return [INT_MAX];
    default: return [Math.floor(rand() * 20) + 1, Math.floor(rand() * 20), Math.floor(rand() * 20), null, Math.floor(rand() * 20)];
  }
}

function scalar(base, theme, rand, unsigned) {
  if (base === 'text') {
    const n = { empty: 0, single: 1, equal: 4, sorted: 8, reversed: 8, negative: 6, extreme: 5, random: 8 }[theme];
    if (theme === 'extreme') return ' aA0 ';
    return Array.from({ length: n }, (_, i) => textAt(theme, i, n, rand)).join('');
  }
  if (base === 'bool') return theme === 'empty' ? false : theme === 'random' ? rand() < 0.5 : true;
  const ints = { empty: 0, single: 1, equal: 3, sorted: 3, reversed: 3, negative: -1, extreme: INT_MAX, random: 1 + Math.floor(rand() * 9) };
  let v = ints[theme];
  if (base === 'float' && theme !== 'extreme') v += 0.5;
  return unsigned ? Math.abs(v) : v;
}

/** The value of one parameter (of a known kind) for one theme. */
export function valueFor(kind, theme, rand) {
  if (kind.base === 'tree') return tree(theme, rand);
  if (kind.base === 'linked') return list('int', theme, rand, false);
  if (kind.depth === 0) return scalar(kind.base, theme, rand, kind.unsigned);
  if (kind.depth === 1) return list(kind.base, theme, rand, kind.unsigned);
  if (kind.depth === 2) return grid(kind.base, theme, rand, kind.unsigned);
  const inner = grid(kind.base, theme, rand, kind.unsigned);
  let out = inner;
  for (let d = 2; d < kind.depth; d += 1) out = [out];
  return out;
}

/**
 * One edge case: { id, theme, label, data, unknown } with data = { paramName: value }.
 * `params` = [{ name, type }]; `sample` = { paramName: current value } (used when a type is missing).
 * A parameter whose kind cannot be told (no type, nothing typed) is left out of `data` and listed in `unknown`:
 * guessing from its name would be hardcoding, and a made-up value would break the run in a confusing way.
 */
export function edgeCase(themeId, params, { sample = {}, seed = 1 } = {}) {
  const theme = EDGE_THEMES.find((t) => t.id === themeId);
  if (!theme) throw new Error(`Unknown edge-case theme: ${themeId}`);
  const rand = rng(seed + EDGE_THEMES.indexOf(theme) * 101);
  const data = {};
  const unknown = [];
  for (const p of params) {
    const kind = kindOf(p, sample[p.name]);
    if (kind) data[p.name] = valueFor(kind, theme.id, rand);
    else unknown.push(p.name);
  }
  return { id: `edge-${theme.id}-${seed}`, theme: theme.id, label: theme.label, data, unknown };
}

export function edgeCases(params, options = {}) {
  return EDGE_THEMES.map((t) => edgeCase(t.id, params, options));
}
