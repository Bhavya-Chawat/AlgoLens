/**
 * Runtime that the *instrumented* JavaScript talks to (`__al.s(...)`, `__al.e(...)` ...).
 * It records an "AlgoTrace v1" step list with exactly the same shape the Python tracer
 * produces, so core/frameBuilder.js treats both identically.
 *
 * Pure JS with no DOM access: it runs inside a Web Worker in the app and directly in Node
 * in the test-suite.
 */
const MAX_ITEMS = 60;
const MAX_KEYS = 40;
const MAX_DEPTH = 4;
const MAX_NODES = 80;
const MAX_STR = 200;

/** Thrown from inside the user's program to stop it (step limit). */
export const STOP = Object.freeze({ name: 'StopSignal', message: 'step limit reached' });

export function typeName(v) {
  if (v === null) return 'NoneType';
  if (v === undefined) return 'undefined';
  switch (typeof v) {
    case 'number': return Number.isInteger(v) ? 'int' : 'float';
    case 'bigint': return 'int';
    case 'string': return 'str';
    case 'boolean': return 'bool';
    case 'function': return 'function';
    case 'symbol': return 'symbol';
    default: break;
  }
  if (Array.isArray(v) || ArrayBuffer.isView(v)) return 'list';
  if (v instanceof Map) return 'dict';
  if (v instanceof Set) return 'set';
  const ctor = v.constructor && v.constructor.name;
  return !ctor || ctor === 'Object' ? 'dict' : ctor;
}

// Once one instance proves a class is a node (it has children / neighbours), all of its instances are.
const NODE_CLASSES = new Set();
const LINK_FIELDS = ['children', 'neighbors', 'neighbours', 'kids'];
const holdsLinks = (x) => Array.isArray(x) || x instanceof Map || x instanceof Set;

/** An object that points at objects of its own class (a trie node's children, a graph node's neighbours). */
function pointsAtOwnClass(v, ctor) {
  const same = (x) => x !== null && typeof x === 'object' && x.constructor === ctor;
  for (const key of Object.keys(v)) {
    const x = v[key];
    if (same(x)) return true;
    if (Array.isArray(x) && x.slice(0, 8).some(same)) return true;
    if (x instanceof Map && [...x.values()].slice(0, 8).some(same)) return true;
    if (x instanceof Set && [...x].slice(0, 8).some(same)) return true;
  }
  return false;
}

const isNode = (v) => {
  if (v === null || typeof v !== 'object' || Array.isArray(v) || v instanceof Map || v instanceof Set || ArrayBuffer.isView(v)) return false;
  if ('val' in v && ('next' in v || 'left' in v || 'right' in v)) return true;
  const ctor = v.constructor;
  if (!ctor || ctor === Object) return false;
  if (NODE_CLASSES.has(ctor)) return true;
  if (LINK_FIELDS.some((f) => holdsLinks(v[f])) || pointsAtOwnClass(v, ctor)) {
    NODE_CLASSES.add(ctor);
    return true;
  }
  return false;
};

class Serializer {
  constructor() {
    this.ids = new Map();
    this.path = new Set();
    NODE_CLASSES.clear();
  }

  oid(obj) {
    if (!this.ids.has(obj)) this.ids.set(obj, this.ids.size + 1);
    return this.ids.get(obj);
  }

  short(v) {
    let text;
    try {
      text = String(v);
    } catch {
      text = '<unprintable>';
    }
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  }

  ser(v, depth = 0) {
    if (v === null || v === undefined) return null;
    switch (typeof v) {
      case 'boolean': return v;
      case 'number':
        if (Number.isNaN(v)) return 'NaN';
        if (v === Infinity) return 'Infinity';
        if (v === -Infinity) return '-Infinity';
        return v;
      case 'bigint': return v.toString();
      case 'string': return v.length > MAX_STR ? `${v.slice(0, MAX_STR)}…` : v;
      case 'function': return `ƒ ${v.name || 'anonymous'}`;
      case 'symbol': return v.toString();
      default: break;
    }
    if (isNode(v)) return this.node(v, [MAX_NODES]);
    if (depth >= MAX_DEPTH) return this.short(v);
    if (this.path.has(v)) return '[circular]';

    this.path.add(v);
    try {
      if (Array.isArray(v) || ArrayBuffer.isView(v)) {
        const items = Array.from(v).slice(0, MAX_ITEMS).map((x) => this.ser(x, depth + 1));
        if (v.length > MAX_ITEMS) items.push(`+${v.length - MAX_ITEMS} more`);
        return items;
      }
      if (v instanceof Set) {
        const items = [...v].slice(0, MAX_ITEMS).map((x) => this.ser(x, depth + 1));
        if (v.size > MAX_ITEMS) items.push(`+${v.size - MAX_ITEMS} more`);
        return items;
      }
      if (v instanceof Map) {
        const out = {};
        let i = 0;
        for (const [k, x] of v) {
          if (i++ >= MAX_KEYS) { out['…'] = `+${v.size - MAX_KEYS} more`; break; }
          out[typeof k === 'string' ? k : JSON.stringify(this.ser(k, depth + 1))] = this.ser(x, depth + 1);
        }
        return out;
      }
      if (v instanceof Date) return v.toISOString();
      if (v instanceof RegExp || v instanceof Error) return this.short(v);

      const out = {};
      const ctor = v.constructor && v.constructor.name;
      if (ctor && ctor !== 'Object') {
        out.__class__ = ctor;
        out.__id__ = this.oid(v);
      }
      const keys = Object.keys(v);
      keys.slice(0, MAX_KEYS).forEach((k) => { out[k] = this.ser(v[k], depth + 1); });
      if (keys.length > MAX_KEYS) out['…'] = `+${keys.length - MAX_KEYS} more`;
      return out;
    } finally {
      this.path.delete(v);
    }
  }

  node(v, budget) {
    if (this.path.has(v)) return { __cycle__: this.oid(v) };
    if (budget[0] <= 0) return '…';
    budget[0] -= 1;
    this.path.add(v);
    try {
      const out = { __class__: (v.constructor && v.constructor.name) || 'Node', __id__: this.oid(v) };
      for (const name of ['val', 'left', 'right', 'next']) {
        if (name in v) {
          const child = v[name];
          out[name] = child === null || child === undefined ? null : isNode(child) ? this.node(child, budget) : this.ser(child, 1);
        }
      }
      // a node with no left/right/next is held together by its children (trie, n-ary tree): those are structure and
      // are embedded; elsewhere other node attributes (random pointer, neighbours) are shown by reference
      const structural = !('left' in v || 'right' in v || 'next' in v);
      const embed = (x) => (isNode(x) ? this.node(x, budget) : this.ser(x, 1));
      for (const name of Object.keys(v)) {
        if (name in out) continue;
        const x = v[name];
        if (isNode(x)) out[name] = { __ref__: this.oid(x) };
        else if (structural && Array.isArray(x) && x.some(isNode)) out[name] = x.slice(0, MAX_ITEMS).map(embed);
        else if (structural && x instanceof Set && [...x].some(isNode)) out[name] = [...x].slice(0, MAX_ITEMS).map(embed);
        else if (structural && x instanceof Map && [...x.values()].some(isNode)) {
          const m = {};
          for (const [k, c] of [...x].slice(0, MAX_KEYS)) m[typeof k === 'string' ? k : JSON.stringify(this.ser(k, 1))] = embed(c);
          out[name] = m;
        } else out[name] = this.ser(x, MAX_DEPTH - 1);
      }
      return out;
    } finally {
      this.path.delete(v);
    }
  }
}

function sameValue(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** console.log-style rendering of one argument. */
function inspectValue(v, depth = 0) {
  if (typeof v === 'string') return depth === 0 ? v : JSON.stringify(v);
  if (v === undefined) return 'undefined';
  if (typeof v === 'function') return `[Function: ${v.name || 'anonymous'}]`;
  if (typeof v !== 'object' || v === null) return String(v);
  if (depth > 3) return '[…]';
  if (Array.isArray(v)) return `[${v.slice(0, 100).map((x) => inspectValue(x, depth + 1)).join(', ')}]`;
  if (v instanceof Map) return `Map(${v.size}) {${[...v].map(([k, x]) => `${inspectValue(k, depth + 1)} => ${inspectValue(x, depth + 1)}`).join(', ')}}`;
  if (v instanceof Set) return `Set(${v.size}) {${[...v].map((x) => inspectValue(x, depth + 1)).join(', ')}}`;
  return `{ ${Object.keys(v).slice(0, 30).map((k) => `${k}: ${inspectValue(v[k], depth + 1)}`).join(', ')} }`;
}

export function createRuntime({ limit = 20000, stdoutCap = 65536 } = {}) {
  const steps = [];
  const ser = new Serializer();
  const stack = [];
  const excIds = new Map();
  const excLines = new Map();
  let nextFid = 1;
  let enabled = false;
  let stopped = false;
  let truncated = false;
  let lastOut = 0;
  const out = { parts: [], size: 0, clipped: false };

  const write = (text) => {
    const room = stdoutCap - out.size;
    if (room <= 0) { out.clipped = true; return; }
    const piece = text.length > room ? text.slice(0, room) : text;
    if (piece.length < text.length) out.clipped = true;
    out.parts.push(piece);
    out.size += piece.length;
  };

  function emit(step) {
    if (steps.length >= limit) {
      truncated = true;
      stopped = true;
      enabled = false;
      throw STOP;
    }
    if (out.size !== lastOut) {
      step.o = out.size;
      lastOut = out.size;
    }
    steps.push(step);
  }

  /** Diff of visible variables against the previous step of the same frame. */
  function snapshot(frame, vars, self) {
    const current = new Map();
    const changed = {};
    const take = (name, read) => {
      let value;
      try { value = read(); } catch { return; } // a variable still in its temporal dead zone
      if (typeof value === 'function') return;
      const type = typeName(value);
      const shown = ser.ser(value);
      current.set(name, { type, shown });
      const before = frame.last.get(name);
      if (!before || before.type !== type || !sameValue(before.shown, shown)) changed[name] = [type, shown];
    };
    if (vars) for (const name of Object.keys(vars)) take(name, () => vars[name]);
    if (self && typeof self === 'object') {
      for (const name of Object.keys(self)) take(name in current ? `this.${name}` : name, () => self[name]);
    }
    const deleted = [];
    for (const name of frame.last.keys()) if (!current.has(name)) deleted.push(name);
    frame.last = current;
    return { changed, deleted };
  }

  const withVars = (step, { changed, deleted }) => {
    if (Object.keys(changed).length) step.v = changed;
    if (deleted.length) step.d = deleted;
    return step;
  };

  const api = {
    /** function entry -> frame */
    e(name, line, vars, self) {
      if (stopped) throw STOP;
      if (!enabled) return null;
      const frame = { fid: nextFid++, last: new Map(), line, returned: false, unwinding: false };
      stack.push(frame);
      const { changed } = snapshot(frame, vars, self);
      const step = { k: 'call', l: line, f: frame.fid, n: name };
      if (Object.keys(changed).length) step.v = changed;
      emit(step);
      return frame;
    },
    /** module (script) frame */
    m() {
      if (stopped) throw STOP;
      if (!enabled) return null;
      const frame = { fid: nextFid++, last: new Map(), line: 1, returned: false, unwinding: false, isModule: true };
      stack.push(frame);
      emit({ k: 'call', l: 1, f: frame.fid, n: '<module>', m: 1 });
      return frame;
    },
    /** about to run `line` */
    s(line, vars, self) {
      if (stopped) throw STOP;
      if (!enabled) return;
      const frame = stack[stack.length - 1];
      if (!frame) return;
      frame.line = line;
      frame.unwinding = false;
      emit(withVars({ k: 'line', l: line, f: frame.fid }, snapshot(frame, vars, self)));
    },
    /** `return value` (value is evaluated before this is called) */
    ret(frame, line, value, vars) {
      if (frame && enabled) {
        frame.returned = true;
        frame.line = line;
        const snap = snapshot(frame, vars);
        emit(withVars({ k: 'ret', l: line, f: frame.fid, r: [typeName(value), ser.ser(value)] }, snap));
      }
      return value;
    },
    /** frame leaves (finally) */
    r(frame) {
      if (!frame) return;
      const at = stack.lastIndexOf(frame);
      if (at !== -1) stack.splice(at, 1);
      if (frame.returned || stopped || frame.isModule) return;
      const step = { k: 'ret', l: frame.line, f: frame.fid, r: [frame.unwinding ? 'NoneType' : 'undefined', null] };
      if (frame.unwinding) step.u = 1;
      emit(step);
    },
    /** exception passing through a frame; reported once per exception object */
    x(frame, error) {
      if (error === STOP) return error;
      if (frame) frame.unwinding = true;
      if (frame && enabled && error !== null && error !== undefined && !excIds.has(error)) {
        const id = excIds.size + 1;
        excIds.set(error, id);
        excLines.set(error, frame.line);
        const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        emit({ k: 'exc', l: frame.line, f: frame.fid, x: text.slice(0, 300), e: id });
      }
      return error;
    },
    stop(error) { return error === STOP; },
  };

  const consoleShim = {};
  for (const level of ['log', 'info', 'debug', 'warn', 'error']) {
    consoleShim[level] = (...args) => write(`${args.map((a) => inspectValue(a)).join(' ')}\n`);
  }

  return {
    api,
    console: consoleShim,
    ser,
    enable() { enabled = true; },
    disable() { enabled = false; },
    excIdOf: (error) => excIds.get(error) ?? null,
    excLineOf: (error) => excLines.get(error) ?? null,
    lastLine: () => (stack.length ? stack[stack.length - 1].line : null),
    result: () => ({
      steps,
      truncated,
      stdout: out.parts.join(''),
      stdoutClipped: out.clipped,
    }),
  };
}
