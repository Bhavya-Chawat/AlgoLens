import {
  isObj, isInt, isNum, stripTrunc, same,
} from './values.js';
import { nameRole, baseName } from './roles.js';
import { subscripts, accessesOnLine } from './access.js';
import { isStepper } from './model.js';

/**
 * What a recogniser sees for one frame: the variables in scope (callers' and globals' included, objects'
 * fields expanded as `self.parent`), which of them are already shown by another panel, how variables are
 * used as indexes in the source, and which cells the line about to run touches.
 */

const IDENT = /^[A-Za-z_$][\w$]*$/;
const SIMPLE_INDEX = /^\s*([A-Za-z_$][\w$]*)\s*(?:[+-]\s*(?:\d+|[A-Za-z_$][\w$]*))?\s*$/;
const strip = (name) => String(name).replace(/^(?:self|this)\./, '');

function nodeish(value) {
  return isObj(value) && ('left' in value || 'right' in value || 'next' in value || 'children' in value || 'neighbors' in value || 'neighbours' in value);
}

/** Methods the source calls on each name: `stack.pop()` -> stack: {pop}; `q.pop(0)` also adds `pop0`. */
export function methodsOn(code) {
  const out = new Map();
  const text = String(code || '');
  const re = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.([A-Za-z_$][\w$]*)\s*\(\s*(0)?\s*\)?/g;
  let m;
  while ((m = re.exec(text))) {
    const key = strip(m[1]);
    let set = out.get(key);
    if (!set) out.set(key, (set = new Set()));
    set.add(m[2]);
    if (m[2] === 'pop' && m[3] === '0') set.add('pop0');
  }
  return out;
}

/** Names handed to the heap functions: `heapq.heappush(high, x)`, `std::push_heap(v.begin(), v.end())` -> {high, v}. */
export function heapUsed(code) {
  const out = new Set();
  const re = /\b(?:heappush|heappop|heapify|heappushpop|heapreplace|make_heap|push_heap|pop_heap|sort_heap)\s*\(\s*([A-Za-z_$][\w$.]*)/g;
  let m;
  while ((m = re.exec(String(code || '')))) out.add(strip(m[1].replace(/\.(?:begin|end)$/, '')));
  return out;
}

/** Source analysis done once per trace: which variables index which arrays. */
export function indexUses(code) {
  const uses = new Map(); // array base name -> [Set(var names) for dimension 0, 1, ...]
  const lines = String(code || '').split('\n');
  for (const line of lines) {
    for (const sub of subscripts(line)) {
      const key = strip(sub.name);
      let dims = uses.get(key);
      if (!dims) uses.set(key, (dims = []));
      sub.exprs.forEach((expr, d) => {
        const m = SIMPLE_INDEX.exec(expr);
        if (!m || !IDENT.test(m[1])) return;
        (dims[d] || (dims[d] = new Set())).add(m[1]);
      });
    }
  }
  return uses;
}

export function makeContext(model, idx) {
  const frame = model.frames[idx];
  const prevFrame = model.frames[idx - 1];
  const lines = model.lines || (model.lines = String(model.code || '').split('\n'));
  if (!model.uses) model.uses = indexUses(model.code);
  if (!model.methods) model.methods = methodsOn(model.code);
  if (!model.heapVars) model.heapVars = heapUsed(model.code);

  const vars = new Map();
  const claimed = new Map(); // name -> panel id that shows it
  const panels = [];

  const addVar = (name, v) => { if (!vars.has(name)) vars.set(name, { name, base: baseName(name), ...v }); };
  const expanded = new Set(); // object ids whose fields are already listed (`self` and `dsu` are the same object)

  for (const [name, { entry, outer }] of model.scope(idx)) {
    const changed = !outer && entry.changedThisFrame === true;
    const prev = outer ? undefined : entry.prevValue;
    addVar(name, { value: entry.value, type: entry.type, changed, prev, outer, owner: null });
    // expand plain objects (a DSU instance, `self`, a Trie wrapper): their fields behave like variables
    if (isObj(entry.value) && entry.value.__class__ && !nodeish(entry.value) && !expanded.has(entry.value.__id__ ?? entry.value)) {
      expanded.add(entry.value.__id__ ?? entry.value);
      for (const [field, fv] of Object.entries(entry.value)) {
        if (field.startsWith('__')) continue;
        // methods see `self.parent` as a plain local `parent`: do not list the same data again as `dsu.parent`
        // (the caller's copy is only as fresh as its last own step, so the method's own variable wins)
        const twin = vars.get(field);
        if (outer && twin && !twin.outer) continue;
        const pv = isObj(prev) ? prev[field] : undefined;
        addVar(`${name}.${field}`, {
          value: fv,
          type: Array.isArray(fv) ? 'list' : isObj(fv) ? 'dict' : typeof fv,
          changed: changed && !same(pv, fv),
          prev: pv,
          outer,
          owner: name,
        });
      }
    }
  }

  const lineText = frame ? lines[frame.line - 1] || '' : '';

  const ctx = {
    model, idx, frame, prevFrame, vars, claimed, panels, lineText,
    language: model.language,
    hints: model.hints,

    get: (name) => vars.get(name),
    profile: (name) => model.profile(name),
    claim(panelId, ...names) { for (const n of names) if (n) claimed.set(n, panelId); },
    isClaimed: (name) => claimed.has(name),
    emit(panel) { panels.push(panel); return panel; },

    /** Variables not yet claimed, optionally filtered. */
    free(filter = () => true) {
      const out = [];
      for (const v of vars.values()) if (!claimed.has(v.name) && filter(v)) out.push(v);
      return out;
    },

    /** Scalar integer variables in scope. */
    ints() {
      const out = [];
      for (const v of vars.values()) if (isInt(v.value) && !v.outer) out.push(v);
      for (const v of vars.values()) if (isInt(v.value) && v.outer) out.push(v);
      return out;
    },

    /** Methods the source calls on a variable (`pop`, `popleft`, `append` ...). */
    methodsOf: (name) => model.methods.get(strip(name)) || new Set(),

    /** Is this list passed to heappush / heappop / push_heap ... somewhere in the source? */
    usedAsHeap: (name) => model.heapVars.has(strip(name)),

    /** Variables the source uses as the n-th index of `arrayName`. */
    indexVars(arrayName, dim = 0) {
      const set = model.uses.get(strip(arrayName))?.[dim];
      return set ? [...set] : [];
    },

    lengthOf(name) {
      const v = vars.get(name) || vars.get(`self.${name}`) || vars.get(`this.${name}`) || vars.get(strip(name));
      if (!v) return undefined;
      if (Array.isArray(v.value)) return stripTrunc(v.value).items.length;
      if (typeof v.value === 'string') return v.value.length;
      if (isObj(v.value)) return Object.keys(v.value).length;
      return undefined;
    },
  };

  // ── accesses of the line about to run ───────────────────────────────────────────────────────
  const lookup = (name) => {
    const v = vars.get(name) || vars.get(strip(name)) || vars.get(`self.${name}`) || vars.get(`this.${name}`);
    return v && isNum(v.value) ? v.value : undefined;
  };
  const valueAt = (name, i) => {
    const v = vars.get(name) || vars.get(strip(name)) || vars.get(`self.${name}`) || vars.get(`this.${name}`);
    if (!v || !Array.isArray(v.value)) return undefined;
    const cell = stripTrunc(v.value).items[i];
    return typeof cell === 'number' ? cell : undefined;
  };
  ctx.accesses = frame && frame.eventType !== 'function_call' ? accessesOnLine(lineText, { lookup, lengthOf: ctx.lengthOf, valueAt }) : [];

  /** Accesses of the line that target the variable called `name` (matches `self.x` / `this.x` / `x`). */
  ctx.accessesFor = (name) => {
    const want = strip(name);
    return ctx.accesses.filter((a) => strip(a.name) === want);
  };

  /**
   * Integer variables acting as positions inside an array of `length` elements: used as an index in the source,
   * or named like a pointer and inside the array's range, or stepping by one.
   */
  ctx.pointersFor = (arrayName, length, { dim = 0, exclude = new Set() } = {}) => {
    const used = new Set(ctx.indexVars(arrayName, dim));
    const out = [];
    for (const v of ctx.ints()) {
      if (exclude.has(v.name) || ctx.isClaimed(v.name) && ctx.claimed.get(v.name) !== 'pointers') continue;
      if (v.value < -1 || v.value > length) continue;
      const named = nameRole(v.name, 'pointer');
      const p = model.profile(v.name);
      const byUse = used.has(v.base);
      // an index that never moves (`n` in `dp[n]`) is a size, not a position
      const moves = p.num.changes >= 1;
      if ((byUse && (moves || named === 2)) || named === 2 || (named === 1 && isStepper(p))) out.push({ name: v.name, base: v.base, value: v.value, byUse, changed: v.changed });
    }
    return out;
  };

  return ctx;
}
