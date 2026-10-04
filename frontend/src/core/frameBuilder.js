import { classifyLine } from './classify.js';
import { detectBugs } from './detectors.js';

/**
 * AlgoTrace v1 (what every tracer produces)  ->  UI frames (what the canvas consumes).
 *
 *   wire = {
 *     v: 1, language, truncated, limit, mode, entry,
 *     steps: [ {k:'call'|'line'|'ret'|'exc', l:line, f:frameId, n?, v?:{name:[type,value]}, d?:[names],
 *               r?:[type,value], x?:text, e?:excId, m?:1 (module frame), o?:stdoutLength } ],
 *     output: { stdout, result:[type,value]|null, resultPlain, error:{type,message,line,e}|null }
 *   }
 *
 * Memory: every frame owns a small `variables` object, but the per-variable entry objects are
 * shared with earlier frames unless the variable changed - so 20k steps stay cheap.
 */

const LITERALS = {
  python: { null: 'None', true: 'True', false: 'False' },
  default: { null: 'null', true: 'true', false: 'false' },
};

/** Compact, language-flavoured text for a value (used in descriptions and the result badge). */
export function renderValue(value, language = 'python', max = 40) {
  const lit = LITERALS[language] || LITERALS.default;
  const walk = (v, depth) => {
    if (v === null || v === undefined) return lit.null;
    if (typeof v === 'boolean') return v ? lit.true : lit.false;
    if (typeof v === 'string') return depth === 0 ? JSON.stringify(v) : JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.slice(0, 8).map((x) => walk(x, depth + 1)).join(', ')}${v.length > 8 ? ', …' : ''}]`;
    if (typeof v === 'object') {
      if (v.__class__) return `${v.__class__}(${walk(v.val ?? null, depth + 1)})`;
      return `{${Object.entries(v).slice(0, 4).map(([k, x]) => `${k}: ${walk(x, depth + 1)}`).join(', ')}}`;
    }
    return String(v);
  };
  const text = walk(value, 0);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function applyChanges(state, changed, deleted) {
  if (deleted) for (const name of deleted) state.locals.delete(name);
  const fresh = {};
  if (changed) {
    for (const [name, [type, value]] of Object.entries(changed)) {
      const before = state.locals.get(name);
      fresh[name] = { value, type, changedThisFrame: true, prevValue: before ? before.value : undefined };
    }
  }
  return fresh;
}

/** Current frame variables = settled entries (shared) overlaid with this step's fresh ones. */
function snapshotVariables(state, fresh) {
  const out = {};
  for (const [name, entry] of state.locals) out[name] = entry;
  for (const name in fresh) out[name] = fresh[name];
  for (const name in fresh) {
    state.locals.set(name, { value: fresh[name].value, type: fresh[name].type, changedThisFrame: false });
  }
  return out;
}

export function buildTrace(wire, source = '') {
  const language = wire.language || 'python';
  const lines = String(source).split('\n');
  const uncaught = wire.output?.error ?? null;

  const frames = [];
  const live = new Map(); // frame id -> { fid, name, callLine, isModule, callerFid, locals: Map }
  const stack = []; // function frames only: this is the UI's call stack
  let moduleFid = null; // the script's own frame: the outermost scope (globals)
  let outLen = 0;

  const callStack = () => stack.map((s, depth) => ({ name: s.name, line: s.callLine, depth }));
  const sourceText = (line) => (lines[line - 1] || '').trim();

  const add = (frame, state) => {
    frame.id = frames.length;
    if (state) {
      frame.fid = state.fid; // which activation of which function this step belongs to
      frame.callerFid = state.callerFid ?? null; // ...and who called it (null for the outermost)
    }
    frame.isBugFrame = frame.isBugFrame || false;
    frame.outLen = outLen;
    frames.push(frame);
    return frame;
  };

  for (const step of wire.steps || []) {
    if (step.o !== undefined) outLen = step.o;

    if (step.k === 'call') {
      const callerFid = stack.length ? stack[stack.length - 1].fid : moduleFid;
      const state = { fid: step.f, name: step.n, callLine: step.l, isModule: Boolean(step.m), callerFid, locals: new Map() };
      if (state.isModule) moduleFid = state.fid;
      live.set(step.f, state);
      const fresh = applyChanges(state, step.v);
      const variables = snapshotVariables(state, fresh);
      if (state.isModule) continue; // entering the script itself is not an event worth a frame
      stack.push(state);
      const args = Object.entries(fresh)
        .slice(0, 4)
        .map(([name, e]) => `${name}=${renderValue(e.value, language, 24)}`)
        .join(', ');
      add({
        line: step.l,
        eventType: 'function_call',
        fn: state.name,
        variables,
        callStack: callStack(),
        description: `${state.name}(${args})`,
      }, state);
      continue;
    }

    const state = live.get(step.f);
    if (!state) continue;

    if (step.k === 'line') {
      const fresh = applyChanges(state, step.v, step.d);
      add({
        line: step.l,
        eventType: classifyLine(lines[step.l - 1]),
        fn: state.name,
        variables: snapshotVariables(state, fresh),
        callStack: callStack(),
        description: sourceText(step.l) || `line ${step.l}`,
      }, state);
    } else if (step.k === 'ret') {
      const fresh = applyChanges(state, step.v, step.d);
      const variables = snapshotVariables(state, fresh);
      if (!state.isModule) {
        const [type, value] = step.r || ['NoneType', null];
        // u = the frame is being unwound by an exception: it never produced a return value
        add({
          line: step.l,
          eventType: 'return',
          fn: state.name,
          variables,
          callStack: callStack(),
          ...(step.u ? { unwinding: true } : { returnValue: value, returnType: type }),
          description: step.u ? '↩ exits (exception)' : `↩ return ${renderValue(value, language, 60)}`,
        }, state);
        const at = stack.lastIndexOf(state);
        if (at !== -1) stack.splice(at, 1);
      }
      live.delete(step.f);
    } else if (step.k === 'exc') {
      add({
        line: step.l,
        eventType: 'exception',
        fn: state.name,
        variables: snapshotVariables(state, {}),
        callStack: callStack(),
        // Only the exception that finally escapes the program is a bug; caught ones are just events.
        isBugFrame: Boolean(uncaught && uncaught.e === step.e),
        description: `⚠ ${step.x}`,
      }, state);
    }
  }

  // An error that escaped without its own exception step (e.g. raised while unwinding after the
  // step limit) still needs a frame so the failure is visible on the canvas. With no frames at
  // all (syntax error, bad arguments) there is nothing to visualise: the UI shows the error.
  if (uncaught && frames.length > 0 && !frames.some((f) => f.isBugFrame)) {
    const last = frames[frames.length - 1];
    add({
      line: uncaught.line || last?.line || 1,
      eventType: 'exception',
      fn: last?.fn,
      variables: last?.variables || {},
      callStack: last?.callStack || [],
      isBugFrame: true,
      description: `⚠ ${uncaught.type}: ${uncaught.message}`,
    });
  }

  const resultTuple = wire.output?.result;
  return {
    frames,
    bugs: detectBugs(frames, { error: uncaught, truncated: wire.truncated, limit: wire.limit }),
    stdout: wire.output?.stdout || '',
    stdoutClipped: Boolean(wire.output?.stdoutClipped),
    result: resultTuple ? renderValue(resultTuple[1], language, 200) : null,
    resultRaw: resultTuple ? resultTuple[1] : null,
    resultPlain: wire.output?.resultPlain ?? null,
    error: uncaught,
    truncated: Boolean(wire.truncated),
    meta: { language, mode: wire.mode, entry: wire.entry, steps: (wire.steps || []).length, limit: wire.limit },
  };
}
