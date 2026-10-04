import { classifyLine } from './classify.js';

/**
 * "Beats": a readable, hierarchical view over a long trace - without throwing anything away.
 *
 *   outline   call -> loop -> iteration -> frame   (built from the trace + the source's block structure)
 *   plan      which outline pieces are shown one by one, and which are folded into a "xN" chip
 *
 * Folding rules (all local, no AI):
 *   - A run of loop iterations that took the *same path* shows its first iteration; the rest fold.
 *   - The last iteration of a loop is always shown (that is where loops end or exit early).
 *   - An iteration whose path differs from the previous one is "interesting" and stays open.
 *   - Anything containing a bug frame is never folded.
 *   - Short traces are not folded at all. Folds can always be expanded, so no step is ever lost.
 */

const indentOf = (line) => {
  const m = /^[\t ]*/.exec(line)[0];
  return m.replace(/\t/g, '    ').length;
};
const isBlank = (line) => line.trim() === '';

/** header line number (1-based) -> last line of that loop's body, from indentation / braces. */
export function computeLoopExtents(source) {
  const lines = String(source).split('\n');
  const extents = new Map();
  for (let i = 0; i < lines.length; i += 1) {
    const text = lines[i];
    if (/^\s*\}\s*while\b/.test(text)) continue; // the tail of a do/while, not a header
    if (classifyLine(text) !== 'loop_start') continue;
    const base = indentOf(text);
    let end = i;
    let j = i + 1;
    // Allman style: the opening brace sits alone on the next line
    if (j < lines.length && lines[j].trim() === '{') { end = j; j += 1; }
    for (; j < lines.length; j += 1) {
      if (isBlank(lines[j])) continue;
      if (indentOf(lines[j]) > base) { end = j; continue; }
      if (indentOf(lines[j]) === base && /^\s*\}/.test(lines[j])) end = j; // the closing brace belongs to the loop
      break;
    }
    extents.set(i + 1, end + 1);
  }
  return extents;
}

const depthOf = (frame) => frame.callStack?.length || 0;

/**
 * A loop's "shape": its header, how many iterations it ran, and the run-length-encoded paths
 * of those iterations. Two outer iterations only count as the same when their inner loops ran
 * the same way - so bubble sort's shrinking inner loop keeps every pass visible, while
 * `for i: for j: s += 1` (identical work every time) still folds.
 */
function loopShape(loop) {
  const sigs = loop.children.filter((it) => !it.exit).map((it) => it.sig);
  const runs = [];
  for (const sig of sigs) {
    const last = runs[runs.length - 1];
    if (last && last[0] === sig) last[1] += 1;
    else runs.push([sig, 1]);
  }
  return `L${loop.header}:${sigs.length}:${runs.map(([s, n]) => `${s}*${n}`).join('|')}`;
}

const hasLoop = (nodes) => nodes.some((n) => n.kind === 'loop' || (n.children && hasLoop(n.children)));

let nextId = 1;

/**
 * @returns {{ nodes: Array, loops: number }}  nodes: {kind:'frame'|'call'|'loop'|'iteration', ...}
 */
export function buildOutline(frames, source) {
  nextId = 1;
  const extents = computeLoopExtents(source);
  const lines = String(source).split('\n');
  let loops = 0;

  // `skip`: the iteration's own header frame, which must not start another loop
  const group = (lo, hi, depth, skip = -1) => {
    const out = [];
    let i = lo;
    while (i <= hi) {
      const frame = frames[i];
      const d = depthOf(frame);

      if (d > depth && frame.eventType === 'function_call') {
        // callee range: from the call frame to the first return at the callee's own depth
        let j = i;
        while (j < hi && !(frames[j].eventType === 'return' && depthOf(frames[j]) === d)) j += 1;
        out.push({
          kind: 'call', id: nextId++, start: i, end: j, depth: d,
          label: frame.description, children: group(i, j, d),
        });
        i = j + 1;
        continue;
      }

      if (i !== skip && frame.eventType === 'loop_start' && d === depth && extents.has(frame.line)) {
        const header = frame.line;
        const last = extents.get(header);
        let k = i;
        while (k + 1 <= hi && (depthOf(frames[k + 1]) > depth || (frames[k + 1].line >= header && frames[k + 1].line <= last))) k += 1;

        // split the loop instance at every execution of the header line
        const starts = [];
        for (let p = i; p <= k; p += 1) {
          if (depthOf(frames[p]) === depth && frames[p].line === header && frames[p].eventType === 'loop_start') starts.push(p);
        }
        const iterations = starts.map((a, n) => {
          const b = (starts[n + 1] ?? k + 1) - 1;
          const children = group(a, b, depth, a);
          return {
            kind: 'iteration', id: nextId++, start: a, end: b, children,
            sig: children.map((c) => (c.kind === 'frame' ? frames[c.index].line : c.kind === 'loop' ? loopShape(c) : `c${frames[c.start].line}`)).join(','),
          };
        });
        // Python raises the header event once more when the iterator is exhausted: not an iteration
        const tail = iterations[iterations.length - 1];
        const exitOnly = iterations.length > 1 && tail.start === tail.end;
        iterations.forEach((it, n) => { it.n = n + 1; it.exit = exitOnly && it === tail; });

        loops += 1;
        out.push({
          kind: 'loop', id: nextId++, header, start: i, end: k, children: iterations,
          innermost: !iterations.some((it) => hasLoop(it.children)),
          label: (lines[header - 1] || '').trim(),
          count: iterations.filter((it) => !it.exit).length,
        });
        i = k + 1;
        continue;
      }

      out.push({ kind: 'frame', index: i });
      i += 1;
    }
    return out;
  };

  return { nodes: frames.length ? group(0, frames.length - 1, depthOf(frames[0]) > 0 ? depthOf(frames[0]) - 1 : 0) : [], loops };
}

// ── planning ───────────────────────────────────────────────────────────────────────────────
const FOLD_MIN_ITERATIONS = 5; // loops this short are always shown in full
const MIN_FOLD = 3; // never fold fewer iterations than this into one chip
const AUTO_FULL_BELOW = 80; // traces this short are not folded at all
const AGGRESSIVE_ABOVE = 400; // beyond this many visible items, fold harder
const MAX_CALL_DEPTH = 4; // recursion deeper than this (relative) folds in aggressive mode

const containsBug = (node, bugSet) => {
  if (bugSet.size === 0) return false;
  for (const b of bugSet) if (b >= node.start && b <= node.end) return true;
  return false;
};

/**
 * @param outline   result of buildOutline()
 * @param options   { detail: 'auto'|'overview'|'full', expanded: Set<string>, bugFrames: number[], total: number }
 * @returns items: [{type:'frame', index} | {type:'fold', id, start, end, count, label}]
 */
export function planVisible(outline, { detail = 'auto', expanded = new Set(), bugFrames = [], total = 0 } = {}) {
  const mode = detail === 'auto' ? (total <= AUTO_FULL_BELOW ? 'full' : 'overview') : detail;
  const bugSet = new Set(bugFrames);

  // level 0: fold identical runs only | 1: also shrink innermost loops | 2: all loops | 3: + deep calls
  const render = (level) => {
    const items = [];
    const walk = (nodes, callDepth) => {
      for (const node of nodes) {
        if (node.kind === 'frame') {
          items.push({ type: 'frame', index: node.index });
        } else if (node.kind === 'call') {
          const id = `c${node.id}`;
          const foldable = level >= 3 && callDepth >= MAX_CALL_DEPTH && !containsBug(node, bugSet) && !expanded.has(id);
          if (foldable) {
            items.push({ type: 'fold', id, start: node.start, end: node.end, count: 1, label: `call ${node.label}`, kind: 'call' });
          } else {
            walk(node.children, callDepth + 1);
          }
        } else if (node.kind === 'loop') {
          walkLoop(node, callDepth, level >= 2 || (level === 1 && node.innermost));
        }
      }
    };

    const walkLoop = (loop, callDepth, aggressive) => {
      const its = loop.children;
      const showAll = mode === 'full' || loop.count < FOLD_MIN_ITERATIONS;
      const lastReal = its.filter((it) => !it.exit).at(-1);
      let n = 0;
      while (n < its.length) {
        const it = its[n];
        const mustShow =
          showAll || it.exit || it === lastReal || containsBug(it, bugSet) ||
          (aggressive ? n < 2 : n === 0 || it.sig !== its[n - 1].sig);
        if (mustShow) { walk(it.children, callDepth); n += 1; continue; }

        // fold a maximal run of foldable iterations
        let m = n;
        while (
          m + 1 < its.length && !its[m + 1].exit && its[m + 1] !== lastReal && !containsBug(its[m + 1], bugSet) &&
          (aggressive ? m + 1 >= 2 : its[m + 1].sig === its[n].sig)
        ) m += 1;
        const first = its[n];
        const lastIt = its[m];
        const id = `l${first.id}-${lastIt.id}`;
        const count = m - n + 1;
        if (count < MIN_FOLD) {
          // a chip for one or two iterations would hide more than it helps: just show them
          for (let q = n; q <= m; q += 1) walk(its[q].children, callDepth);
          n = m + 1;
          continue;
        }
        if (expanded.has(id)) {
          for (let q = n; q <= m; q += 1) walk(its[q].children, callDepth);
        } else {
          items.push({
            type: 'fold', id, start: first.start, end: lastIt.end, count, kind: 'loop',
            label: `${loop.label}  ×${count} more iteration${count > 1 ? 's' : ''}`,
          });
        }
        n = m + 1;
      }
    };

    walk(outline.nodes, 0);
    return items;
  };

  // Escalate gradually: fold only as much as needed to keep the overview readable.
  let level = 0;
  let items = render(level);
  if (mode === 'overview') {
    while (items.length > AGGRESSIVE_ABOVE && level < 3) {
      level += 1;
      items = render(level);
    }
  }
  return items;
}

/** Index of the plan item that contains frame `index` (a fold contains all its frames). */
export function itemIndexFor(items, index) {
  let lo = 0;
  let hi = items.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const it = items[mid];
    const start = it.type === 'frame' ? it.index : it.start;
    const end = it.type === 'frame' ? it.index : it.end;
    if (index < start) hi = mid - 1;
    else if (index > end) lo = mid + 1;
    else return mid;
  }
  return Math.max(0, Math.min(items.length - 1, lo));
}

/** The frame the canvas shows for an item: itself, or - for a fold - the state after the fold. */
export const representativeFrame = (item) => (item.type === 'frame' ? item.index : item.end);

/** Next frame to land on when stepping `delta` items from `current`. */
export function stepFrame(items, current, delta) {
  if (items.length === 0) return 0;
  const at = itemIndexFor(items, current);
  const next = Math.max(0, Math.min(items.length - 1, at + delta));
  return representativeFrame(items[next]);
}

/** Fold ids that must be opened for frame `index` to become visible (empty when already visible). */
export function foldsToReveal(items, index) {
  const it = items[itemIndexFor(items, index)];
  return it && it.type === 'fold' && index >= it.start && index <= it.end ? [it.id] : [];
}
