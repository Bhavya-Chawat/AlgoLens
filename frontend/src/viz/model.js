import {
  isObj, isNum, isScalar, stripTrunc, diffArrays, sameMultiset, heapOrder, same,
} from './values.js';

/**
 * The trace model: everything the recognisers need to know about a whole run, computed once.
 *
 *   - scope(idx)      variables visible at a frame: its own plus those of its callers (closures, globals)
 *   - profile(name)   what a variable *did* over time: pushed/popped at the end? swapped? kept heap order?
 *   - samples(name)   a thinned list of its values over the run (to lay a graph out once, for example)
 *   - hints           facts about the source code (uses heapq? bit operations? `i & -i`?)
 *
 * Names beat nothing on their own: a variable called `stack` that is never popped is not a stack, and a list
 * called `a` that is only pushed to and popped from the end is. Profiles are how the two are told apart.
 */

const MAX_SAMPLES = 64;
const MAX_ANCESTORS = 40;

export function sourceHints(code, language) {
  const text = String(code || '');
  return {
    language,
    heap: /heapq|heappush|heappop|heapify|PriorityQueue|priority_queue|make_heap|push_heap/.test(text),
    bitops: /<<|>>|(^|[^&])&([^&]|$)|(^|[^|])\|([^|]|$)|\^|~|bin\(|popcount|bit_count|bitCount/.test(text),
    lowbit: /&\s*-\s*\w|&\s*\(\s*-|lowbit|lowBit/.test(text),
    deque: /deque|ArrayDeque|std::queue|std::deque|\.shift\(\)|popleft|poll\(\)/.test(text),
    ordered: /OrderedDict|LinkedHashMap|move_to_end/.test(text),
  };
}

function newProfile(name) {
  return {
    name,
    count: 0,
    firstFrame: -1,
    lastFrame: -1,
    types: {},
    first: undefined,
    last: undefined,
    samples: [],
    stride: 1,
    seen: 0,
    num: { min: Infinity, max: -Infinity, changes: 0, stepOne: 0, up: 0, down: 0 },
    arr: {
      ops: { push: 0, popEnd: 0, popFront: 0, pushFront: 0, set: 0, swap: 0, multi: 0, rewrite: 0 },
      maxLen: 0, sameLen: 0, perm: 0, heapMin: 0, heapMax: 0, heapChecks: 0,
      identity: false, // at some point a[i] === i for every i (a fresh union-find parent array)
    },
    dict: { added: 0, removed: 0, updated: 0, maxKeys: 0, identity: false },
    nodeRef: false, // at some point held a node object (linked list / tree pointer)
    kinds: new Set(),
  };
}

function sample(p, frame, value) {
  p.seen += 1;
  if (p.seen % p.stride !== 0 && p.samples.length > 8) return;
  p.samples.push({ f: frame, v: value });
  if (p.samples.length > MAX_SAMPLES) {
    p.samples = p.samples.filter((_, i) => i % 2 === 0 || i > MAX_SAMPLES - 8);
    p.stride *= 2;
  }
}

function observe(p, frameIdx, entry) {
  const value = entry.value;
  const prev = entry.prevValue;
  p.count += 1;
  if (p.firstFrame < 0) p.firstFrame = frameIdx;
  p.lastFrame = frameIdx;
  p.types[entry.type] = (p.types[entry.type] || 0) + 1;
  if (p.first === undefined) p.first = value;
  p.last = value;
  sample(p, frameIdx, value);

  if (typeof value === 'number' && Number.isFinite(value)) {
    p.kinds.add('number');
    p.num.min = Math.min(p.num.min, value);
    p.num.max = Math.max(p.num.max, value);
    if (typeof prev === 'number') {
      p.num.changes += 1;
      if (Math.abs(value - prev) === 1) p.num.stepOne += 1;
      if (value > prev) p.num.up += 1;
      else if (value < prev) p.num.down += 1;
    }
  } else if (Array.isArray(value)) {
    p.kinds.add('array');
    const { items } = stripTrunc(value);
    p.arr.maxLen = Math.max(p.arr.maxLen, items.length);
    if (Array.isArray(prev)) {
      const before = stripTrunc(prev).items;
      const d = diffArrays(before, items);
      if (d.op !== 'same') p.arr.ops[d.op] += 1;
      if (before.length === items.length && d.op !== 'same') {
        p.arr.sameLen += 1;
        if (items.length <= 200 && sameMultiset(before, items)) p.arr.perm += 1;
      }
    }
    if (items.length >= 2 && !p.arr.identity && items.length <= 400 && items.every((x, i) => x === i)) p.arr.identity = true;
    if (items.length >= 3 && items.length <= 400) {
      const order = heapOrder(items);
      p.arr.heapChecks += 1;
      if (order === 'min') p.arr.heapMin += 1;
      else if (order === 'max') p.arr.heapMax += 1;
    }
  } else if (isObj(value)) {
    p.kinds.add('object');
    const keys = Object.keys(value);
    p.dict.maxKeys = Math.max(p.dict.maxKeys, keys.length);
    if ('__id__' in value || '__cycle__' in value || '__ref__' in value) p.nodeRef = true;
    if (!p.dict.identity && keys.length >= 2 && keys.every((k) => String(value[k]) === k)) p.dict.identity = true;
    if (isObj(prev)) {
      for (const k of keys) {
        if (!(k in prev)) p.dict.added += 1;
        else if (!same(prev[k], value[k])) p.dict.updated += 1;
      }
      for (const k of Object.keys(prev)) if (!(k in value)) p.dict.removed += 1;
    }
  } else if (isScalar(value)) {
    p.kinds.add(value === null ? 'null' : typeof value);
  }
}

export function buildModel(frames, { code = '', language = 'python' } = {}) {
  const fidFrames = new Map(); // fid -> frame indices of that activation, ascending
  const profiles = new Map();
  const lastEntry = new Map(); // fid -> Map(name -> entry) so shared entries are not counted twice

  for (let idx = 0; idx < frames.length; idx++) {
    const frame = frames[idx];
    if (frame.fid !== undefined) {
      let list = fidFrames.get(frame.fid);
      if (!list) fidFrames.set(frame.fid, (list = []));
      list.push(idx);
    }
    let seenHere = lastEntry.get(frame.fid);
    if (!seenHere) lastEntry.set(frame.fid, (seenHere = new Map()));
    for (const name in frame.variables) {
      const entry = frame.variables[name];
      if (!entry.changedThisFrame || seenHere.get(name) === entry) continue;
      seenHere.set(name, entry);
      let p = profiles.get(name);
      if (!p) profiles.set(name, (p = newProfile(name)));
      observe(p, idx, entry);
    }
  }

  const lastIndexAtOrBefore = (list, idx) => {
    let lo = 0;
    let hi = list.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid] <= idx) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  };

  const model = {
    frames,
    language,
    code: String(code || ''),
    hints: sourceHints(code, language),
    profiles,
    fidFrames,
    cache: new Map(), // per-trace memo for expensive derived data (layouts, universes)

    profile: (name) => profiles.get(name) || newProfile(name),
    samples: (name) => profiles.get(name)?.samples || [],

    /** Variables visible at frame `idx`: own first, then the callers' (nearest first, then the outermost). */
    scope(idx) {
      const frame = frames[idx];
      const out = new Map();
      if (!frame) return out;
      for (const name in frame.variables) out.set(name, { name, entry: frame.variables[name], outer: false });
      let fid = frame.callerFid;
      let hops = 0;
      while (fid !== null && fid !== undefined) {
        const list = fidFrames.get(fid);
        if (!list) break;
        const at = lastIndexAtOrBefore(list, idx);
        if (at < 0) break;
        const ancestor = frames[list[at]];
        const copy = hops < MAX_ANCESTORS || ancestor.callerFid === null || ancestor.callerFid === undefined;
        if (copy) {
          for (const name in ancestor.variables) {
            if (!out.has(name)) out.set(name, { name, entry: ancestor.variables[name], outer: true });
          }
        }
        fid = ancestor.callerFid;
        hops += 1;
        if (hops > 100000) break;
      }
      return out;
    },
  };
  return model;
}

/** Numeric facts a recogniser may want. */
export const isStepper = (p) => p.num.changes >= 2 && p.num.stepOne / p.num.changes >= 0.6;
export const isCounter = (p) => p.kinds.has('number') && isNum(p.num.min) && p.num.up + p.num.down > 0;
