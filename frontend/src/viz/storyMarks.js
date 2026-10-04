import { evaluate } from './expr.js';
import { isObj, stripTrunc } from './values.js';

/**
 * Marks from "Explain this run": the AI says *what to point at* ("the window is i-k+1 .. i", "the cell it reads is
 * [i-1][j-1]", "the current node is `node`") and this module works out *where that is* from the REAL values of the
 * step on screen. The AI never supplies a number that gets drawn. An expression that cannot be evaluated at a step,
 * or points outside the structure, simply draws nothing at that step.
 *
 * A resolved mark is attached to the panel it belongs to as `panel.story`, which the lenses read:
 *   { cells:[{i,label,tone}], range:{lo,hi,label,tone}|null, grid:[{r,c,label,tone}], rows:[{r,label,tone}], nodes:[{id,label,tone}] }
 */

const strip = (name) => String(name).replace(/^(?:self|this)\./, '');
const IDENT = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?$/;

/** Name -> value lookups for one step: the step's own variables, its callers', and the fields of `self` / `this`. */
export function scopeLookup(model, idx) {
  const scope = model.scope(idx);
  const find = (name) => {
    const hit = scope.get(name) || scope.get(strip(name));
    if (hit) return hit.entry.value;
    const self = scope.get('self') || scope.get('this');
    const fields = self?.entry?.value;
    if (isObj(fields) && strip(name) in fields) return fields[strip(name)];
    return undefined;
  };
  const num = (name) => {
    const v = find(name);
    return typeof v === 'number' ? v : undefined;
  };
  return { find, num, len: (name) => lengthOfValue(find(name)) };
}

export function lengthOfValue(v) {
  if (Array.isArray(v)) return stripTrunc(v).items.length;
  if (typeof v === 'string') return v.length;
  if (isObj(v)) return Object.keys(v).filter((k) => k !== '…').length;
  return undefined;
}

const styleOf = (mark) => ({ label: mark.label || '', tone: mark.tone || 'accent' });

/** One mark at one step -> where it points, or null when it cannot be resolved right now. */
export function resolveMark(mark, look) {
  const target = look.find(mark.on);
  if (target === undefined || target === null) return null;
  const length = lengthOfValue(target);

  if (mark.kind === 'range') {
    const lo = evaluate(mark.from, look.num, look.len);
    const hi = evaluate(mark.to, look.num, look.len);
    if (lo === null || hi === null || length === undefined || hi < lo) return null;
    const a = Math.max(0, lo);
    const b = Math.min(length - 1, hi);
    return a <= b ? { kind: 'range', lo: a, hi: b, ...styleOf(mark) } : null;
  }

  if (mark.kind === 'cell') {
    const at = mark.at.map((e) => evaluate(e, look.num, look.len));
    if (at.some((v) => v === null)) return null;
    const rows = Array.isArray(target) ? stripTrunc(target).items : null;
    if (at.length === 2) {
      if (!rows || at[0] < 0 || at[0] >= rows.length) return null;
      const row = rows[at[0]];
      const cols = Array.isArray(row) ? stripTrunc(row).items.length : typeof row === 'string' ? row.length : undefined;
      return cols !== undefined && at[1] >= 0 && at[1] < cols ? { kind: 'grid', r: at[0], c: at[1], ...styleOf(mark) } : null;
    }
    if (length === undefined || at[0] < 0 || at[0] >= length) return null;
    // one index into a list of lists is a whole row; into anything else it is a cell
    return rows && rows.length && rows.every(Array.isArray)
      ? { kind: 'row', r: at[0], ...styleOf(mark) }
      : { kind: 'cell', i: at[0], ...styleOf(mark) };
  }

  if (mark.kind === 'node') {
    let id = null;
    if (IDENT.test(mark.at)) {
      const v = look.find(mark.at);
      if (v !== undefined && v !== null && typeof v !== 'object' && typeof v !== 'boolean') id = String(v);
    } else {
      const n = evaluate(mark.at, look.num, look.len);
      if (n !== null) id = String(n);
    }
    return id === null ? null : { kind: 'node', id, ...styleOf(mark) };
  }
  return null;
}

/** Does a panel show this variable? (`self.parent` and `parent` count as the same one.) */
export function panelShows(panel, name) {
  const want = strip(name);
  return (panel.vars || []).some((v) => strip(v) === want) || strip(panel.title || '') === want;
}

/** The result with `story` attached to every panel a resolved mark points at. */
export function applyStory(result, story, model, idx) {
  if (!story || !story.marks?.length) return result;
  const look = scopeLookup(model, idx);
  const found = new Map(); // panel id -> story object
  for (const mark of story.marks) {
    const hit = resolveMark(mark, look);
    if (!hit) continue;
    const panel = result.panels.find((p) => p.lens !== 'scalars' && panelShows(p, mark.on));
    if (!panel) continue;
    let s = found.get(panel.id);
    if (!s) found.set(panel.id, (s = { cells: [], range: null, grid: [], rows: [], nodes: [] }));
    const { kind, ...rest } = hit;
    if (kind === 'range') s.range = rest;
    else if (kind === 'cell') s.cells.push(rest);
    else if (kind === 'grid') s.grid.push(rest);
    else if (kind === 'row') s.rows.push(rest);
    else if (kind === 'node') s.nodes.push(rest);
  }
  if (!found.size) return result;
  return { ...result, panels: result.panels.map((p) => (found.has(p.id) ? { ...p, story: found.get(p.id) } : p)) };
}

/** Evenly spaced step numbers, always including the first and the last. */
export function sampleSteps(total, count) {
  if (total <= 0) return [];
  if (total <= count) return Array.from({ length: total }, (_, i) => i);
  const out = new Set([0, total - 1]);
  for (let k = 1; k < count - 1; k += 1) out.add(Math.round((k * (total - 1)) / (count - 1)));
  return [...out].sort((a, b) => a - b);
}

/** Marks that resolve to something at one or more of the sampled steps: the rest do not hold up against this run. */
export function marksThatHold(marks, model, samples) {
  const looks = samples.map((idx) => scopeLookup(model, idx));
  return marks.filter((m) => looks.some((look) => resolveMark(m, look) !== null));
}

/** A numeric variable's values over the run, at the steps where it changed (thinned to `maxPoints`). */
export function seriesFor(name, model, maxPoints = 80) {
  const pts = [];
  for (let i = 0; i < model.frames.length; i += 1) {
    const entry = model.frames[i].variables?.[name];
    if (entry && entry.changedThisFrame && typeof entry.value === 'number' && Number.isFinite(entry.value)) pts.push({ idx: i, v: entry.value });
  }
  if (pts.length <= maxPoints) return pts;
  const keep = [];
  for (let k = 0; k < maxPoints - 1; k += 1) keep.push(pts[Math.round((k * (pts.length - 1)) / (maxPoints - 1))]);
  keep.push(pts[pts.length - 1]);
  return keep;
}
