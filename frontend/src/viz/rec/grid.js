import {
  isInt, isScalar, stripTrunc, asGrid, gridKind, isUniform, same,
} from '../values.js';
import { nameRole } from '../roles.js';

/**
 * Two-dimensional data: mazes, boards, matrices and DP tables. A DP table is recognised by how it is filled
 * (started uniform, cells written one by one) as much as by its name; its row/column headers come from the
 * strings/arrays the source indexes with the same loop variables (`text1[i - 1]`, `weights[i - 1]`).
 */

function charGrid(value) {
  if (!Array.isArray(value)) return null;
  const { items } = stripTrunc(value);
  if (items.length < 2 || !items.every((r) => typeof r === 'string' && r.length >= 2)) return null;
  if (!items.every((r) => r.length === items[0].length)) return null;
  const cells = items.map((r) => r.split(''));
  return { rows: cells.length, cols: cells[0].length, cells, fromStrings: true };
}

function readGrid(v) {
  return asGrid(v.value, { minRows: 2, minCols: 2 }) || charGrid(v.value);
}

const bare = (name) => String(name).replace(/^(?:self|this)\./, '');

/**
 * A list of lists is a *grid* only with evidence: the source indexes it twice (`g[r][c]`), it is named like a
 * board, or it is written to. Otherwise it is just a list of tuples (query pairs, results, heap entries).
 */
function hasGridEvidence(ctx, v) {
  const dims = ctx.model.uses.get(bare(v.name));
  const indexedTwice = Boolean(dims && dims[1] && dims[1].size > 0);
  const named = nameRole(v.name, 'grid') >= 1 || nameRole(v.name, 'dp') >= 1 || nameRole(v.name, 'visited') >= 1;
  const p = ctx.profile(v.name);
  return indexedTwice || named || p.arr.ops.set + p.arr.ops.multi >= 1;
}

function pairCells(items, rows, cols) {
  const out = [];
  for (const x of items) {
    if (!Array.isArray(x) || x.length < 2 || !isInt(x[0]) || !isInt(x[1])) return null;
    if (x[0] < -1 || x[1] < -1 || x[0] > rows || x[1] > cols) return null;
    out.push([x[0], x[1]]);
  }
  return out;
}

function changedGridCells(v, grid) {
  if (!v.changed || v.prev === undefined) return [];
  const before = v.prev;
  const prevGrid = Array.isArray(before) && before.every((r) => typeof r === 'string')
    ? before.map((r) => r.split(''))
    : Array.isArray(before) ? before.map((r) => (Array.isArray(r) ? stripTrunc(r).items : r)) : null;
  if (!prevGrid) return [];
  const out = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const was = prevGrid[r]?.[c];
      if (!same(was, grid.cells[r][c])) out.push([r, c]);
    }
  }
  return out;
}

export function recognizeGrids(ctx) {
  const out = [];
  // first pass: which variables are grids at all (visited masks are folded into the main grid afterwards)
  const grids = [];
  for (const v of ctx.vars.values()) {
    if (ctx.isClaimed(v.name) || v.type === 'set') continue;
    const grid = readGrid(v);
    if (grid && hasGridEvidence(ctx, v)) grids.push({ v, grid });
  }
  const masks = new Set();
  for (const { v, grid } of grids) {
    if (nameRole(v.name, 'visited') >= 1 && (gridKind(grid.cells) === 'bool' || gridKind(grid.cells) === 'binary')) masks.add(v.name);
  }
  const mains = grids.filter(({ v }) => !masks.has(v.name) || grids.length === 1);

  for (const { v, grid } of mains) {
    const kindOfCells = gridKind(grid.cells);
    const numeric = kindOfCells === 'int' || kindOfCells === 'num' || kindOfCells === 'binary';
    const flat = grid.cells.flat();
    const p = ctx.profile(v.name);

    const first = Array.isArray(p.first) ? asGrid(p.first) : null;
    const startedUniform = first ? isUniform(first.cells.flat()) : false;
    const writes = p.arr.ops.set + p.arr.ops.multi;
    const dpName = nameRole(v.name, 'dp');
    const progressive = startedUniform && writes >= 3 && p.arr.ops.push === 0;
    const hasBoardGlyph = flat.some((c) => c === 'Q' || c === 'K' || c === 'X' || c === 'O');
    let kind = 'grid';
    if (numeric && (dpName >= 1 || progressive) && nameRole(v.name, 'grid') < 2) kind = 'dp';
    else if (hasBoardGlyph && kindOfCells !== 'int' && flat.some((c) => c === 'Q')) kind = 'board';

    // cursor: the loop variables the source uses as row / column index
    const rowVars = new Set(ctx.indexVars(v.name, 0));
    const colVars = new Set(ctx.indexVars(v.name, 1));
    let cursor = null;
    {
      // loop variables first: a variable that moves is a position, one that never changes (`m` in `dp[m][n]`) is a size
      const moving = (i) => -ctx.profile(i.name).num.changes;
      const ints = [...ctx.ints()].sort((a, b) => moving(a) - moving(b));
      const r = ints.find((i) => rowVars.has(i.base) && i.value >= 0 && i.value < grid.rows);
      const c = ints.find((i) => colVars.has(i.base) && i.value >= 0 && i.value < grid.cols && i !== r);
      if (r && c) cursor = { r: r.value, c: c.value, names: [r.name, c.name] };
      else if (r && grid.cols === 1) cursor = { r: r.value, c: 0, names: [r.name] };
    }

    // headers for DP-style tables
    const rowLabels = [];
    const colLabels = [];
    const labelNames = [];
    if (kind === 'dp') {
      for (const L of ctx.vars.values()) {
        if (L.name === v.name || ctx.isClaimed(L.name)) continue;
        const items = typeof L.value === 'string' ? L.value.split('') : Array.isArray(L.value) ? stripTrunc(L.value).items : null;
        if (!items || !items.length || !items.every(isScalar) || items.some((x) => Array.isArray(x))) continue;
        const use = ctx.indexVars(L.name, 0);
        const forRows = use.some((u) => rowVars.has(u));
        const forCols = use.some((u) => colVars.has(u));
        const off = (n, total) => (n === total - 1 ? 1 : n === total ? 0 : -1);
        if (forRows && off(items.length, grid.rows) >= 0) { rowLabels.push({ name: L.name, items, offset: off(items.length, grid.rows) }); labelNames.push(L.name); }
        else if (forCols && off(items.length, grid.cols) >= 0) { colLabels.push({ name: L.name, items, offset: off(items.length, grid.cols) }); labelNames.push(L.name); }
      }
    }

    // masks and frontier overlays
    const overlay = { visited: [], frontier: [] };
    const claimed = [];
    for (const m of grids) {
      if (m.v.name === v.name || !masks.has(m.v.name)) continue;
      if (m.grid.rows !== grid.rows || m.grid.cols !== grid.cols) continue;
      m.grid.cells.forEach((row, r) => row.forEach((c, cc) => { if (c === true || c === 1 || c === '1') overlay.visited.push([r, cc]); }));
      claimed.push(m.v.name);
    }
    for (const o of ctx.vars.values()) {
      if (o.name === v.name || ctx.isClaimed(o.name) || !Array.isArray(o.value)) continue;
      const items = stripTrunc(o.value).items;
      if (!items.length) continue;
      const cells = pairCells(items, grid.rows, grid.cols);
      if (!cells) continue;
      const pp = ctx.profile(o.name);
      if (o.type === 'set' || nameRole(o.name, 'visited') >= 1) { overlay.visited.push(...cells); claimed.push(o.name); }
      else if (pp.arr.ops.popFront + pp.arr.ops.popEnd > 0 || nameRole(o.name, 'queue') >= 1 || nameRole(o.name, 'stack') >= 1) overlay.frontier.push(...cells);
    }

    const marks = { reads: [], writes: [] };
    for (const a of ctx.accessesFor(v.name)) {
      if (a.index.length !== 2) continue;
      if (a.index[0] < 0 || a.index[0] >= grid.rows || a.index[1] < 0 || a.index[1] >= grid.cols) continue;
      (a.kind === 'write' ? marks.writes : marks.reads).push([a.index[0], a.index[1]]);
    }

    ctx.claim(`grid:${v.name}`, v.name, ...claimed, ...labelNames);
    out.push(ctx.emit({
      id: `grid:${v.name}`, lens: 'grid', title: v.name.replace(/^(self|this)\./, ''), vars: [v.name, ...claimed, ...labelNames],
      priority: kind === 'dp' ? 84 : 80,
      data: {
        name: v.name, kind, rows: grid.rows, cols: grid.cols, cells: grid.cells, cellKind: kindOfCells,
        cursor, rowLabels, colLabels, overlay, marks, changed: changedGridCells(v, grid),
        filler: first ? first.cells[0][0] : null,
      },
    }));
  }
  return out;
}
