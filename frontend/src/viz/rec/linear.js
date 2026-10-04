import {
  isObj, stripTrunc, elemKind, isUniform, heapOrder, toNumber, sameMultiset,
} from '../values.js';
import { nameRole } from '../roles.js';
import { isNodeRecord } from './nodes.js';

/**
 * 1-D linear data: arrays, strings, stacks, queues, heaps, segment trees, Fenwick trees.
 * What a list *is* depends on what is done to it (over the whole run, and in the source), not only on its name.
 */

const QUEUE_TYPES = /^(deque|queue|ArrayDeque|Deque|Queue)$/i;
const STACK_TYPES = /^(stack|Stack)$/;
const HEAP_TYPES = /^(priority_queue|PriorityQueue)$/i;
const HEAPABLE = new Set(['int', 'num', 'pair', 'tuple', 'empty']);
const POP_END = ['pop', 'pop_back', 'removeLast', 'pollLast', 'removeLastOccurrence'];
const POP_FRONT = ['popleft', 'shift', 'poll', 'pop0', 'pop_front', 'removeFirst', 'pollFirst', 'dequeue'];

/** [{name, value}] pointers -> window / range semantics from how the two bounds move. */
export function boundsOf(ctx, pointers) {
  const by = new Map(pointers.map((p) => [p.base, p]));
  const pairs = [['left', 'right'], ['l', 'r'], ['lo', 'hi'], ['low', 'high'], ['start', 'end'], ['begin', 'end'], ['lower', 'upper'], ['lft', 'rgt'], ['i', 'j'], ['slow', 'fast'], ['front', 'back'], ['top', 'bottom']];
  for (const [a, b] of pairs) {
    const pa = by.get(a);
    const pb = by.get(b);
    if (!pa || !pb) continue;
    const A = ctx.profile(pa.name);
    const B = ctx.profile(pb.name);
    if (Math.abs(pb.value - pa.value) > 100000) continue;
    const converge = A.num.up > 0 && A.num.down === 0 && B.num.down > 0 && B.num.up === 0;
    const slide = A.num.down === 0 && B.num.down === 0 && (A.num.up > 0 || B.num.up > 0);
    const kind = converge || a === 'lo' || a === 'low' ? 'range' : slide ? 'window' : null;
    if (kind) return { kind, lo: pa.value, hi: pb.value, names: [pa.name, pb.name] };
  }
  return null;
}

function isSorting(ctx, v, items, kind) {
  const p = ctx.profile(v.name);
  if (kind !== 'int' && kind !== 'num') return false;
  if (items.length < 4 || nameRole(v.name, 'dp') >= 2) return false;
  if (p.arr.ops.push + p.arr.ops.popEnd + p.arr.ops.popFront + p.arr.ops.pushFront > 0) return false;
  if (p.arr.sameLen < 3) return false;
  if (p.arr.perm / p.arr.sameLen >= 0.6) return true;
  // insertion-style shifting never swaps, but the array ends as a rearrangement of what it started as
  const first = Array.isArray(p.first) ? stripTrunc(p.first).items : null;
  const last = Array.isArray(p.last) ? stripTrunc(p.last).items : null;
  return Boolean(first && last && first.length === last.length && sameMultiset(first, last) && JSON.stringify(first) !== JSON.stringify(last));
}

function chooseStyle(ctx, v, items, kind) {
  if (isSorting(ctx, v, items, kind)) return 'bars';
  const p = ctx.profile(v.name);
  const numeric = kind === 'int' || kind === 'num';
  const first = Array.isArray(p.first) ? stripTrunc(p.first).items : [];
  const startedUniform = first.length >= 2 && isUniform(first);
  const setOps = p.arr.ops.set + p.arr.ops.multi;
  if (numeric || kind === 'empty') {
    if (nameRole(v.name, 'dp') >= 1) return 'dp';
    if (startedUniform && setOps >= 2 && p.arr.ops.push + p.arr.ops.popEnd === 0 && numeric) return 'dp';
  }
  return 'cells';
}

function accessMarks(ctx, v) {
  const reads = [];
  const writes = [];
  for (const a of ctx.accessesFor(v.name)) {
    if (a.index.length !== 1) continue;
    (a.kind === 'write' ? writes : reads).push(a.index[0]);
  }
  return { reads, writes };
}

/** Which cells did this very step change? */
function changedCells(v, items) {
  if (!v.changed || !Array.isArray(v.prev)) return { changed: [], swapped: null, op: null };
  const before = stripTrunc(v.prev).items;
  const out = [];
  const n = Math.max(before.length, items.length);
  for (let i = 0; i < n; i++) if (JSON.stringify(before[i]) !== JSON.stringify(items[i])) out.push(i);
  const op = items.length > before.length ? 'push' : items.length < before.length ? 'pop' : 'set';
  let swapped = null;
  if (op === 'set' && out.length === 2 && JSON.stringify(before[out[0]]) === JSON.stringify(items[out[1]]) && JSON.stringify(before[out[1]]) === JSON.stringify(items[out[0]])) swapped = out;
  return { changed: op === 'pop' ? [] : out.filter((i) => i < items.length), swapped, op };
}

export function recognizeLinear(ctx) {
  const out = [];
  for (const v of ctx.vars.values()) {
    if (ctx.isClaimed(v.name) || !Array.isArray(v.value) || v.type === 'set') continue;
    let { items } = stripTrunc(v.value);
    const { more } = stripTrunc(v.value);
    let kind = elemKind(items);

    // rows that are not a grid (a list of results, of query pairs ...): drawn as a list of tuples
    if (kind === 'array') {
      if (items.length > 24) continue;
      kind = 'tuple';
    }
    // a stack / queue of nodes (iterative traversals): each node shown by its value
    if (kind === 'object' && items.length && items.every((x) => isNodeRecord(x) || (isObj(x) && ('__ref__' in x || '__cycle__' in x)))) {
      items = items.map((x) => ({ node: x.__id__ ?? x.__ref__ ?? x.__cycle__, label: x.val ?? x.value ?? x.data ?? x.key ?? '·' }));
      kind = 'node';
    }
    if (kind === 'object' || kind === 'mixed') continue;

    const p = ctx.profile(v.name);
    const type = v.type || '';
    const ops = p.arr.ops;
    const methods = ctx.methodsOf(v.name);
    const { changed, swapped, op } = changedCells(v, items);

    // ── heap ─────────────────────────────────────────────────────────────────────────────────
    // decided from the whole run (so the panel does not flip when the list is momentarily empty)
    const heapName = nameRole(v.name, 'heap');
    const heapTested = p.arr.heapChecks >= 3 && (p.arr.heapMin + p.arr.heapMax) / p.arr.heapChecks >= 0.95 && p.arr.maxLen >= 3;
    const heapish = HEAP_TYPES.test(type)
      || (ctx.usedAsHeap(v.name) && HEAPABLE.has(kind))
      || (heapName >= 2 && HEAPABLE.has(kind))
      || (heapName >= 1 && ctx.hints.heap && HEAPABLE.has(kind))
      || (ctx.hints.heap && heapTested && HEAPABLE.has(kind)
          && ops.push + ops.popEnd + ops.rewrite + ops.multi + ops.swap + ops.popFront >= 2);
    if (heapish) {
      const order = items.length < 3 ? null : heapOrder(items);
      ctx.claim(`heap:${v.name}`, v.name);
      out.push(ctx.emit({
        id: `heap:${v.name}`, lens: 'heap', title: v.name.replace(/^(self|this)\./, ''), vars: [v.name], priority: 62,
        data: { name: v.name, items, more, order: order || (p.arr.heapMax > p.arr.heapMin ? 'max' : 'min'), changed, tuples: kind === 'pair' || kind === 'tuple', op, swapped },
      }));
      continue;
    }

    // ── Fenwick / segment tree ───────────────────────────────────────────────────────────────
    if ((kind === 'int' || kind === 'num') && items.length >= 3) {
      const fenName = nameRole(v.name, 'fenwick');
      const segName = nameRole(v.name, 'segtree');
      const marks = accessMarks(ctx, v);
      if (ctx.hints.lowbit && fenName >= 1 && toNumber(items[0]) === 0) {
        ctx.claim(`fenwick:${v.name}`, v.name);
        out.push(ctx.emit({
          id: `fenwick:${v.name}`, lens: 'fenwick', title: v.name, vars: [v.name], priority: 66,
          data: { name: v.name, items, changed, reads: marks.reads, writes: marks.writes, cursor: ctx.pointersFor(v.name, items.length - 1).filter((q) => q.value >= 1)[0] || null },
        }));
        continue;
      }
      if (segName >= 1 && (segName >= 2 || ctx.hints.bitops || /2\s*\*\s*\w+|\w+\s*\*\s*2/.test(ctx.model.code)) && items.length >= 4 && !ops.popEnd) {
        ctx.claim(`segtree:${v.name}`, v.name);
        out.push(ctx.emit({
          id: `segtree:${v.name}`, lens: 'segtree', title: v.name, vars: [v.name], priority: 66,
          data: { name: v.name, items, oneBased: toNumber(items[0]) === 0 || items.length % 2 === 0, changed, reads: marks.reads, writes: marks.writes },
        }));
        continue;
      }
    }

    // ── stack / queue / deque ────────────────────────────────────────────────────────────────
    // By type when the language says so; otherwise a list is a stack/queue only when the *source* removes from
    // its end/front (`stack.pop()`, `queue.popleft()`) and the trace shows it. `level = []` is a reset, not a pop.
    const stackName = nameRole(v.name, 'stack');
    const queueName = nameRole(v.name, 'queue');
    const popsEndInCode = POP_END.some((m) => methods.has(m));
    const popsFrontInCode = POP_FRONT.some((m) => methods.has(m));
    let stackish = null;
    if (STACK_TYPES.test(type)) stackish = 'stack';
    else if (QUEUE_TYPES.test(type)) stackish = popsEndInCode && !popsFrontInCode && stackName >= 1 ? 'stack' : 'queue';
    else if (ops.popFront > 0 && popsFrontInCode) stackish = 'queue';
    else if (ops.popEnd > 0 && popsEndInCode && ops.push > 0 && !popsFrontInCode) stackish = 'stack';
    else if (queueName >= 2 && popsFrontInCode) stackish = 'queue';
    if (stackish) {
      ctx.claim(`${stackish}:${v.name}`, v.name);
      out.push(ctx.emit({
        id: `${stackish}:${v.name}`, lens: stackish, title: v.name.replace(/^(self|this)\./, ''), vars: [v.name], priority: 58,
        data: { name: v.name, items, more, kind: stackish, changed, op, deque: /deque/i.test(type) || (popsFrontInCode && popsEndInCode) },
      }));
      continue;
    }

    // ── plain array / bars / dp ──────────────────────────────────────────────────────────────
    const style = chooseStyle(ctx, v, items, kind);
    const pointers = ctx.pointersFor(v.name, items.length);
    const bounds = boundsOf(ctx, pointers);
    const { reads, writes } = accessMarks(ctx, v);
    ctx.claim(`array:${v.name}`, v.name);
    out.push(ctx.emit({
      id: `array:${v.name}`, lens: style === 'bars' ? 'bars' : style === 'dp' ? 'dp1' : 'array', title: v.name.replace(/^(self|this)\./, ''), vars: [v.name],
      priority: style === 'bars' ? 70 : 50,
      data: {
        name: v.name, items, more, style, kind, pointers, bounds, changed, swapped, op, reads, writes,
        filler: style === 'dp' && Array.isArray(p.first) ? stripTrunc(p.first).items[0] : null,
      },
    }));
  }
  return out;
}

/** Strings worth drawing as characters: indexed in the source, or named like text. */
export function recognizeStrings(ctx) {
  const out = [];
  for (const v of ctx.vars.values()) {
    if (ctx.isClaimed(v.name) || typeof v.value !== 'string' || v.value.length < 2 || v.value.length > 80) continue;
    const indexed = ctx.indexVars(v.name).length > 0 || ctx.model.uses.has(v.base);
    const named = nameRole(v.name, 'string') >= 2;
    if (!indexed && !named) continue;
    const items = v.value.split('');
    const pointers = ctx.pointersFor(v.name, items.length);
    const bounds = boundsOf(ctx, pointers);
    const { reads, writes } = accessMarks(ctx, v);
    ctx.claim(`string:${v.name}`, v.name);
    out.push(ctx.emit({
      id: `string:${v.name}`, lens: 'string', title: v.name.replace(/^(self|this)\./, ''), vars: [v.name], priority: 52,
      data: { name: v.name, items, more: 0, style: 'string', kind: 'char', pointers, bounds, changed: [], swapped: null, op: null, reads, writes, filler: null },
    }));
  }
  return out;
}
