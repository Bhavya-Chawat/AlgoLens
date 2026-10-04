import { evaluate } from './expr.js';

/**
 * Which array cells does the line about to run touch?
 *
 *   dp[i][j] = dp[i - 1][j - 1] + 1      ->  write dp[i,j]   read dp[i-1,j-1]
 *   arr[j], arr[j+1] = arr[j+1], arr[j]   ->  write arr[j], arr[j+1]   read arr[j+1], arr[j]
 *   while stack and nums[stack[-1]] < v   ->  read stack[-1] and nums[<its value>]
 *
 * The source line is parsed for `name[expr]...` (the same syntax in Python, JavaScript, Java and C++), every
 * index expression is evaluated with the variable values *right now*, and the result is a list of accesses.
 * Anything that cannot be evaluated safely is simply left out: no highlight beats a wrong one.
 */

const NAME = /[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/y;

const blankStrings = (line) => String(line || '').replace(/(['"])(?:\\.|(?!\1).)*\1/g, (s) => ' '.repeat(s.length));

/** Find `[ ... ]` starting at `from` (which points at '['); returns [content, indexAfter] or null. */
function bracket(text, from) {
  if (text[from] !== '[') return null;
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return [text.slice(from + 1, i), i + 1];
    }
  }
  return null;
}

/** All subscript chains in a line: [{name, exprs:[...], start, end, depth}] (nested ones included). */
export function subscripts(rawLine) {
  const text = blankStrings(rawLine);
  const found = [];
  const scan = (src, offset, depth) => {
    for (let i = 0; i < src.length; i++) {
      if (!/[A-Za-z_$]/.test(src[i]) || (i > 0 && /[\w$.]/.test(src[i - 1]))) continue;
      NAME.lastIndex = i;
      const m = NAME.exec(src);
      if (!m) continue;
      let at = i + m[0].length;
      const exprs = [];
      const spans = [];
      for (;;) {
        const b = bracket(src, at);
        if (!b) break;
        exprs.push(b[0]);
        spans.push([at + 1, at + 1 + b[0].length]);
        at = b[1];
      }
      if (exprs.length) {
        found.push({ name: m[0], exprs, start: offset + i, end: offset + at, depth });
        spans.forEach(([a, b]) => scan(src.slice(a, b), offset + a, depth + 1));
        i = at - 1; // the index expressions were scanned by the recursion above
      } else {
        i += m[0].length - 1;
      }
    }
  };
  scan(text, 0, 0);
  return found;
}

/** How many '(' / '[' / '{' are still open before `pos`? (strings must be blanked already) */
function nesting(text, pos) {
  let depth = 0;
  for (let i = 0; i < pos; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
  }
  return depth;
}

/** Position of the statement's assignment `=` (top level, not ==, <=, >=, !=, =>) or -1. */
function assignmentAt(text) {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '=') continue;
    const prev = text[i - 1];
    const next = text[i + 1];
    if (next === '=' || next === '>') { i += 1; continue; }
    if (prev && '=!<>'.includes(prev)) continue;
    if (nesting(text, i) !== 0) continue;
    return i;
  }
  return -1;
}

/** Is the subscript at [start,end) a target of the assignment on this line? */
function isWrite(text, sub) {
  if (sub.depth > 0 || nesting(text, sub.start) !== 0) return false;
  const after = text.slice(sub.end);
  if (/^\s*(?:\+|-|\*|\/\/?|%|&|\||\^|<<|>>)=(?!=)/.test(after)) return true; // x[i] += ...
  if (/^\s*(?:\+\+|--)/.test(after) || /(?:\+\+|--)\s*$/.test(text.slice(0, sub.start))) return true;
  const eq = assignmentAt(text);
  return eq !== -1 && sub.start < eq;
}

/** Replace inner subscripts (`stack[-1]` inside `nums[stack[-1]]`) by the value they currently hold. */
function resolveNested(expr, env) {
  let text = expr;
  for (let guard = 0; guard < 8 && text.includes('['); guard++) {
    const m = /([A-Za-z_$][\w$.]*)\s*\[([^[\]]*)\]/.exec(text);
    if (!m) return null;
    const inner = evaluate(m[2], env.lookup, env.lengthOf);
    if (inner === null) return null;
    const len = env.lengthOf(m[1]);
    const idx = inner < 0 && len !== undefined ? len + inner : inner;
    const value = env.valueAt ? env.valueAt(m[1], idx) : undefined;
    if (typeof value !== 'number') return null;
    text = text.slice(0, m.index) + `(${value})` + text.slice(m.index + m[0].length);
  }
  return text.includes('[') ? null : text;
}

/**
 * @param line  source text of the line about to run
 * @param env   { lookup(name)->number|undefined, lengthOf(name)->number|undefined, valueAt(name, i)->number|undefined }
 * @returns [{name, index:[...ints], kind:'read'|'write'}]
 */
export function accessesOnLine(line, env) {
  const text = blankStrings(line);
  const out = [];
  const seen = new Set();
  for (const sub of subscripts(line)) {
    const index = [];
    let ok = true;
    for (const expr of sub.exprs) {
      const cleaned = expr.trim();
      if (!cleaned || /^[^[]*:[^[]*$/.test(cleaned)) { ok = false; break; } // empty or a slice
      const resolved = resolveNested(cleaned, env);
      const value = resolved === null ? null : evaluate(resolved, env.lookup, env.lengthOf);
      if (value === null) { ok = false; break; }
      const len = index.length === 0 ? env.lengthOf(sub.name) : undefined;
      index.push(value < 0 && len !== undefined ? len + value : value);
    }
    if (!ok) continue;
    const kind = isWrite(text, sub) ? 'write' : 'read';
    const key = `${sub.name}|${index.join(',')}|${kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: sub.name, index, kind });
  }
  return out;
}
