// A tiny, safe expression evaluator for index expressions found in source lines: `i - 1`, `(lo + hi) // 2`,
// `n - 1 - i`, `i & -i`, `len(nums) - 1`, `arr.length - 1`, `Math.floor((l + r) / 2)`.
// It never runs user code: numbers, identifiers looked up in a given scope, and a few operators/functions.
// Anything it does not understand makes the whole expression `null` (no highlight rather than a wrong one).

const FUNCS = {
  int: (x) => Math.trunc(x), floor: (x) => Math.floor(x), trunc: (x) => Math.trunc(x), ceil: (x) => Math.ceil(x),
  abs: (x) => Math.abs(x), min: Math.min, max: Math.max, round: Math.round,
};

function tokenize(src) {
  const out = [];
  const re = /\s*(\d+\.?\d*|[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*|\/\/|<<|>>|[-+*/%&|^~(),])/y;
  let i = 0;
  while (i < src.length) {
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) {
      if (/^\s*$/.test(src.slice(i))) break;
      return null;
    }
    out.push(m[1]);
    i = re.lastIndex;
  }
  return out;
}

/**
 * Evaluate `src` with `lookup(name) -> number | undefined` and `lengthOf(name) -> number | undefined`.
 * Returns a finite integer or null.
 */
export function evaluate(src, lookup, lengthOf = () => undefined) {
  const toks = tokenize(src);
  if (!toks || !toks.length) return null;
  let pos = 0;
  const peek = () => toks[pos];
  const next = () => toks[pos++];
  let failed = false;
  const fail = () => { failed = true; return 0; };

  function primary() {
    const t = next();
    if (t === undefined) return fail();
    if (t === '(') {
      const v = parseExpr(0);
      if (next() !== ')') return fail();
      return v;
    }
    if (t === '-') return -unary();
    if (t === '+') return unary();
    if (t === '~') return ~unary();
    if (/^\d/.test(t)) return Number(t);
    // len(x), x.length, x.size(), x.size, x.length()
    const lenCall = /^(?:len|size)$/.test(t) && peek() === '(';
    if (lenCall) {
      next();
      const arg = next();
      if (next() !== ')') return fail();
      const n = lengthOf(arg);
      return n === undefined ? fail() : n;
    }
    const prop = /^(.+)\.(length|size)$/.exec(t);
    if (prop) {
      if (peek() === '(') { next(); if (next() !== ')') return fail(); }
      const n = lengthOf(prop[1]);
      return n === undefined ? fail() : n;
    }
    const fn = /^(?:Math\.)?([a-z]+)$/.exec(t);
    if (fn && FUNCS[fn[1]] && peek() === '(') {
      next();
      const args = [];
      if (peek() !== ')') {
        args.push(parseExpr(0));
        while (peek() === ',') { next(); args.push(parseExpr(0)); }
      }
      if (next() !== ')') return fail();
      return FUNCS[fn[1]](...args);
    }
    const v = lookup(t);
    return typeof v === 'number' ? v : fail();
  }
  function unary() { return primary(); }

  const PREC = { '|': 1, '^': 2, '&': 3, '<<': 4, '>>': 4, '+': 5, '-': 5, '*': 6, '/': 6, '//': 6, '%': 6 };
  function parseExpr(min) {
    let left = primary();
    for (;;) {
      const op = peek();
      const prec = PREC[op];
      if (prec === undefined || prec < min) break;
      next();
      const right = parseExpr(prec + 1);
      switch (op) {
        case '+': left += right; break;
        case '-': left -= right; break;
        case '*': left *= right; break;
        case '/': left = Number.isInteger(left) && Number.isInteger(right) ? Math.trunc(left / right) : left / right; break;
        case '//': left = Math.floor(left / right); break;
        case '%': left = ((left % right) + right) % right; break;
        case '&': left &= right; break;
        case '|': left |= right; break;
        case '^': left ^= right; break;
        case '<<': left <<= right; break;
        case '>>': left >>= right; break;
        default: return fail();
      }
    }
    return left;
  }

  const value = parseExpr(0);
  if (failed || pos !== toks.length || !Number.isFinite(value) || !Number.isInteger(value)) return null;
  return value;
}
