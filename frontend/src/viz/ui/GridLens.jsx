import { Fragment } from 'react';
import { Card, Legend } from './Card.jsx';
import { LEGEND, fmt, fmtCell, infinityIn, isInfinity, useViz } from './kit.js';

/**
 * Two-dimensional data: mazes, boards (N-Queens, Sudoku), matrices and DP tables. For a DP table the cells the
 * current line reads (blue) and is about to write (amber) are marked, headers come from the strings / arrays the
 * table is indexed with, and the loop position is outlined.
 */

const WALLS = new Set(['#', 'X', '%', 'W', '█']);
const EMPTY = new Set(['.', ' ', '_', '-', 0, '0', false, null]);

function sizeFor(rows, cols) {
  const m = Math.max(rows, cols);
  if (m <= 6) return 46;
  if (m <= 10) return 38;
  if (m <= 16) return 30;
  return 24;
}

function cellTone(x, kind, cellKind) {
  if (kind === 'board') return x === 'Q' ? 'queen' : 'empty';
  if (WALLS.has(x)) return 'wall';
  if (cellKind === 'binary' || cellKind === 'binary-char' || cellKind === 'bool') return x === 1 || x === '1' || x === true ? 'on' : 'empty';
  return EMPTY.has(x) && cellKind !== 'int' && cellKind !== 'num' ? 'empty' : 'plain';
}

export default function GridLens({ panel, first }) {
  const { language } = useViz();
  const { data } = panel;
  const { rows, cols, cells, kind, cursor, rowLabels, colLabels, overlay, marks, changed, cellKind, filler } = data;
  const size = sizeFor(rows, cols);
  const key = (r, c) => `${r},${c}`;
  const writes = new Set(marks.writes.map(([r, c]) => key(r, c)));
  const reads = new Set(marks.reads.map(([r, c]) => key(r, c)));
  const chg = new Set(changed.map(([r, c]) => key(r, c)));
  const seen = new Set(overlay.visited.map(([r, c]) => key(r, c)));
  const front = new Set(overlay.frontier.map(([r, c]) => key(r, c)));
  const flat = cells.flat();
  const mixed = infinityIn(flat);
  // an "infinity" (1e9, INT_MAX ...) is neither drawn as a number nor allowed to flatten the heat of every real value
  const numbers = flat.filter((x) => typeof x === 'number' && Number.isFinite(x) && !isInfinity(x, mixed));
  const max = Math.max(1, ...numbers.map(Math.abs));
  const heat = kind === 'dp' && numbers.length > 0;
  const hasColLabels = colLabels.length > 0;
  const rowLabelCols = rowLabels.length;
  const tmpl = `${rowLabelCols ? `repeat(${rowLabelCols}, ${Math.max(28, size - 6)}px) ` : ''}repeat(${cols}, ${size}px)`;
  const labelAt = (L, idx) => (idx - L.offset >= 0 && idx - L.offset < L.items.length ? L.items[idx - L.offset] : null);

  const legend = [];
  if (marks.writes.length || changed.length) legend.push(LEGEND.write);
  if (marks.reads.length) legend.push(LEGEND.read);
  if (cursor) legend.push({ ...LEGEND.point, label: `at (${cursor.names.join(', ')})` });
  if (seen.size) legend.push(LEGEND.done);
  if (front.size) legend.push(LEGEND.front);

  const badges = [{ text: `${rows} × ${cols}` }];
  if (kind === 'dp') badges.unshift({ text: 'DP table', tone: 'point' });
  if (cursor) badges.push({ text: `[${cursor.r}][${cursor.c}]`, tone: 'point' });
  const kindLabel = kind === 'board' ? 'board' : kind === 'dp' ? 'table' : cellKind === 'int' || cellKind === 'num' ? 'matrix' : 'grid';

  return (
    <Card title={panel.title} kind={kindLabel} badges={badges} vars={panel.vars} wide={cols > 7 || rows > 7 || kind === 'dp'} first={first}>
      <div style={{ overflow: 'auto', maxHeight: 520 }}>
        {rowLabels.length > 0 && (
          <div className="vz-note" style={{ marginTop: 0, marginBottom: 4 }}>rows ← {rowLabels.map((l) => l.name).join(', ')}{hasColLabels ? ` · columns ← ${colLabels.map((l) => l.name).join(', ')}` : ''}</div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: tmpl, gap: 3, width: 'max-content' }} role="grid" aria-label={`${panel.title} grid`}>
          {hasColLabels && colLabels.map((L, li) => (
            <Fragment key={`h${li}`}>
              {rowLabelCols > 0 && Array.from({ length: rowLabelCols }, (_, k) => <div key={`pad${li}-${k}`} />)}
              {Array.from({ length: cols }, (_, c) => (
                <div key={c} className="vz-idx" style={{ textAlign: 'center', fontWeight: cursor?.c === c ? 800 : 600, color: cursor?.c === c ? 'var(--vz-point)' : 'var(--vz-ink-2)', fontSize: 12, fontFamily: 'var(--vz-mono)' }} title={L.name}>
                  {labelAt(L, c) === null ? '' : fmt(labelAt(L, c), language, 4)}
                </div>
              ))}
            </Fragment>
          ))}
          {cells.map((row, r) => (
            <Fragment key={r}>
              {rowLabels.map((L, li) => (
                <div key={`l${li}`} className="vz-idx" style={{ display: 'grid', placeItems: 'center', fontWeight: cursor?.r === r ? 800 : 600, color: cursor?.r === r ? 'var(--vz-point)' : 'var(--vz-ink-2)', fontSize: 12, fontFamily: 'var(--vz-mono)' }} title={L.name}>
                  {labelAt(L, r) === null ? '' : fmt(labelAt(L, r), language, 4)}
                </div>
              ))}
              {row.map((x, c) => {
                const k = key(r, c);
                const tone = cellTone(x, kind, cellKind);
                const cls = ['vz-cell'];
                let bg;
                let color;
                if (writes.has(k)) cls.push('write');
                else if (chg.has(k)) cls.push('changed');
                else if (reads.has(k)) cls.push('read');
                else if (cursor && cursor.r === r && cursor.c === c) cls.push('point');
                else if (seen.has(k)) cls.push('done');
                else if (front.has(k)) cls.push('front');
                if (tone === 'wall' || tone === 'on') { if (!cls.some((c0) => ['write', 'changed', 'read', 'point', 'done', 'front'].includes(c0))) { bg = 'var(--vz-ink-2)'; color = 'var(--vz-surface)'; } }
                if (kind === 'board' && !cls.some((c0) => ['write', 'changed', 'read', 'point'].includes(c0))) bg = (r + c) % 2 ? 'var(--vz-surface-3)' : 'var(--vz-surface)';
                if (heat && typeof x === 'number' && Number.isFinite(x) && !isInfinity(x, mixed) && !cls.some((c0) => ['write', 'changed', 'read', 'point'].includes(c0))) {
                  const t = Math.round((Math.abs(x) / max) * 38);
                  bg = `color-mix(in srgb, var(--vz-done) ${t}%, var(--vz-surface))`;
                }
                if (kind === 'dp' && filler !== null && filler !== undefined && x === filler && !cls.includes('write')) cls.push('filler');
                const text = kind === 'board' ? (x === 'Q' ? '♛' : '') : tone === 'on' || tone === 'wall' ? (cellKind === 'int' || cellKind === 'char' ? '' : '') : fmtCell(x, language, 4, mixed);
                const shown = (tone === 'on' && (cellKind === 'int' || cellKind === 'binary')) ? String(x) : text;
                return (
                  <div
                    key={c}
                    role="gridcell"
                    className={cls.join(' ')}
                    style={{ width: size, height: size, minWidth: 0, padding: 0, fontSize: kind === 'board' ? size * 0.62 : size > 30 ? 13 : 11, background: bg, color: color || (kind === 'board' ? 'var(--vz-ink)' : undefined) }}
                    title={`${panel.title}[${r}][${c}] = ${fmt(x, language, 30)}`}
                  >
                    {shown}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
      {legend.length > 0 && <Legend items={legend} />}
    </Card>
  );
}
