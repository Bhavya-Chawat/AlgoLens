/**
 * The call tree of the whole run, built once from the frames: every call with its arguments, its parent, when
 * it started and ended and what it returned. Repeated (function, arguments) pairs are flagged as repeated
 * work, which is exactly what memoisation removes.
 */

function argsText(frame) {
  const d = frame.description || '';
  const open = d.indexOf('(');
  return open >= 0 && d.endsWith(')') ? d.slice(open + 1, -1) : '';
}

export function callsOf(model) {
  if (model.cache.has('calls')) return model.cache.get('calls');
  const calls = [];
  const open = [];
  const firstSeen = new Map();
  for (let idx = 0; idx < model.frames.length; idx++) {
    const f = model.frames[idx];
    if (f.eventType === 'function_call') {
      const id = calls.length;
      const args = argsText(f);
      const key = `${f.fn}(${args})`;
      // a repeated call is only 'repeated work' when it has arguments (a no-argument __init__() is just a constructor)
      const comparable = args !== '';
      const call = {
        id, fid: f.fid, fn: f.fn, args, parent: open.length ? open[open.length - 1] : null, depth: open.length,
        start: idx, end: null, ret: undefined, hasRet: false, unwound: false, dup: comparable && firstSeen.has(key), dupOf: firstSeen.get(key) ?? null, children: [],
      };
      if (comparable && !firstSeen.has(key)) firstSeen.set(key, id);
      if (call.parent !== null) calls[call.parent].children.push(id);
      calls.push(call);
      open.push(id);
    } else if (f.eventType === 'return') {
      // close this activation (and any left open above it by an exception)
      while (open.length) {
        const id = open.pop();
        const call = calls[id];
        call.end = idx;
        if (call.fid === f.fid) {
          if (f.unwinding) call.unwound = true;
          else { call.ret = f.returnValue; call.hasRet = true; }
          break;
        }
        call.unwound = true;
      }
    }
  }
  const byFn = new Map();
  let recursive = false;
  let maxDepth = 0;
  for (const c of calls) {
    maxDepth = Math.max(maxDepth, c.depth);
    const chain = byFn.get(c.parent) || new Set();
    if (chain.has(c.fn)) recursive = true;
    const own = new Set(chain);
    own.add(c.fn);
    byFn.set(c.id, own);
  }
  const info = { calls, recursive, maxDepth, roots: calls.filter((c) => c.parent === null).map((c) => c.id) };
  model.cache.set('calls', info);
  return info;
}

/** Number of calls started at or before frame `idx` (calls are in start order). */
function startedBy(calls, idx) {
  let lo = 0;
  let hi = calls.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (calls[mid].start <= idx) lo = mid + 1; else hi = mid;
  }
  return lo;
}

export function recognizeCallTree(ctx) {
  const info = callsOf(ctx.model);
  if (info.calls.length < 3 || !(info.recursive || info.maxDepth >= 3)) return [];
  const upto = startedBy(info.calls, ctx.idx);
  if (upto === 0) return [];
  let active = null;
  const fid = ctx.frame?.fid;
  for (let i = upto - 1; i >= 0; i--) {
    const c = info.calls[i];
    if (c.fid === fid && (c.end === null || c.end >= ctx.idx)) { active = c.id; break; }
  }
  const repeated = info.calls.filter((c, i) => i < upto && c.dup).length;
  return [ctx.emit({
    id: 'calltree', lens: 'calltree', title: info.recursive ? 'Recursion' : 'Calls', vars: [], priority: info.recursive ? 60 : 30,
    data: { calls: info.calls, upto, idx: ctx.idx, active, recursive: info.recursive, repeated, total: info.calls.length },
  })];
}
