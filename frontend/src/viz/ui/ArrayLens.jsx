import { Card, Legend } from './Card.jsx';
import { LEGEND, fmtCell, fmtFull, infinityIn, isInfinity, useViz } from './kit.js';

/**
 * Arrays, strings, sorting bars and 1-D DP tables, with the overlays the recogniser worked out:
 * pointers, a window / search range, the cells the current line reads and writes, swaps.
 */

function groupPointers(pointers = []) {
  const by = new Map();
  for (const p of pointers) {
    if (!by.has(p.value)) by.set(p.value, []);
    by.get(p.value).push(p.base);
  }
  return by;
}

function cellClass({ i, changed, reads, writes, inWindow, dim, done, filler, pointerAt, small }) {
  const c = ['vz-cell'];
  if (small) c.push('small');
  if (writes.has(i)) c.push('write');
  else if (changed.has(i)) c.push('changed');
  else if (reads.has(i)) c.push('read');
  else if (pointerAt) c.push('point');
  else if (inWindow) c.push('in-window');
  else if (done) c.push('done');
  if (dim) c.push('dim');
  if (filler) c.push('filler');
  return c.join(' ');
}

function Cells({ data, language, story }) {
  const { items, pointers, bounds, changed, reads, writes, style, filler } = data;
  const byPtr = groupPointers(pointers);
  const changedSet = new Set(changed);
  const readSet = new Set(reads);
  const writeSet = new Set(writes);
  const small = items.length > 18;
  const isDp = style === 'dp';
  const mixed = infinityIn(items);
  // marks from "Explain this run": single cells by index, and one range (a window)
  const marks = new Map((story?.cells || []).map((m) => [m.i, m]));
  const win = story?.range || null;
  return (
    <div className="vz-cells" role="list" aria-label={`${data.name} cells`}>
      {items.map((x, i) => {
        const inRange = bounds ? i >= Math.min(bounds.lo, bounds.hi) && i <= Math.max(bounds.lo, bounds.hi) : false;
        const outside = bounds?.kind === 'range' && !inRange;
        const isFiller = isDp && filler !== null && filler !== undefined && JSON.stringify(x) === JSON.stringify(filler);
        const text = style === 'string' ? String(x) : fmtCell(x, language, small ? 4 : 7, mixed);
        const mark = marks.get(i);
        const inWin = win && i >= win.lo && i <= win.hi;
        const tone = mark ? mark.tone : inWin ? win.tone : null;
        const edge = !inWin ? null : win.lo === win.hi ? 'only' : i === win.lo ? 'start' : i === win.hi ? 'end' : 'mid';
        const tag = mark?.label || (inWin && i === win.lo ? win.label : '');
        const base = cellClass({
          i, changed: changedSet, reads: readSet, writes: writeSet, small,
          inWindow: bounds?.kind === 'window' && inRange, dim: outside && !tone, filler: isFiller,
          pointerAt: byPtr.has(i) && (byPtr.get(i).length > 0) && false,
        });
        return (
          <div key={i} className="vz-cellwrap" role="listitem">
            <div className={tone ? `${base} st-${tone}` : base} title={`${data.name}[${i}] = ${fmtFull(x, language)}${mark?.label ? ` (${mark.label})` : ''}`}>
              {text}
            </div>
            <span className="vz-idx">{i}</span>
            <div className="vz-ptrs">
              {(byPtr.get(i) || []).map((n) => <span key={n} className="vz-ptr">{n}</span>)}
            </div>
            {edge && <div className="vz-win" data-tone={win.tone} data-edge={edge} />}
            {tag && <span className="vz-tag" data-tone={mark ? mark.tone : win.tone}>{tag}</span>}
          </div>
        );
      })}
      {data.more > 0 && <div className="vz-cellwrap"><div className="vz-cell small dim">+{data.more}</div></div>}
    </div>
  );
}

function Bars({ data, language }) {
  const { items, pointers, changed, reads, writes, swapped, bounds } = data;
  const mixed = infinityIn(items);
  const inf = items.map((x) => isInfinity(x, mixed));
  // an "infinity" gets a full-height bar but must not squash every real value
  const nums = items.map((x, i) => (inf[i] ? 0 : typeof x === 'number' ? x : Number(x))).map((x) => (Number.isFinite(x) ? x : 0));
  const max = Math.max(1, ...nums.map(Math.abs));
  const byPtr = groupPointers(pointers);
  const H = 150;
  const barW = Math.max(14, Math.min(46, Math.floor(620 / Math.max(1, items.length))));
  return (
    <div className="vz-cells" style={{ gap: 6, alignItems: 'flex-end' }} role="list" aria-label={`${data.name} bars`}>
      {nums.map((n, i) => {
        const h = inf[i] ? H : Math.max(6, Math.round((Math.abs(n) / max) * H));
        const isSwap = swapped?.includes(i);
        let color = 'var(--vz-line-2)';
        let fill = 'var(--vz-surface-3)';
        if (writes.includes(i) || isSwap) { color = 'var(--vz-write)'; fill = 'var(--vz-write-bg)'; }
        else if (changed.includes(i)) { color = 'var(--vz-write)'; fill = 'var(--vz-write-bg)'; }
        else if (reads.includes(i)) { color = 'var(--vz-read)'; fill = 'var(--vz-read-bg)'; }
        else if (bounds && bounds.kind === 'range' && (i < Math.min(bounds.lo, bounds.hi) || i > Math.max(bounds.lo, bounds.hi))) { fill = 'var(--vz-surface-2)'; }
        return (
          <div key={i} className="vz-cellwrap" style={{ width: barW }} role="listitem">
            <span className="vz-idx" style={{ color: 'var(--vz-ink-2)', fontWeight: 600, fontSize: 11 }}>{fmtCell(items[i], language, 5, mixed)}</span>
            <div
              style={{
                width: '100%', height: h, borderRadius: '6px 6px 2px 2px', background: fill, border: `1.5px solid ${color}`,
                transition: 'height 320ms cubic-bezier(.22,1,.36,1), background 200ms, border-color 200ms',
              }}
              title={`${data.name}[${i}] = ${fmtFull(items[i], language)}`}
            />
            <span className="vz-idx">{i}</span>
            <div className="vz-ptrs">{(byPtr.get(i) || []).map((n) => <span key={n} className="vz-ptr">{n}</span>)}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function ArrayLens({ panel, first }) {
  const { language } = useViz();
  const { data } = panel;
  const bars = data.style === 'bars';
  const legend = [];
  if (data.writes.length || data.changed.length || data.swapped) legend.push(LEGEND.write);
  if (data.reads.length) legend.push(LEGEND.read);
  if (data.bounds?.kind === 'window') legend.push({ label: `window ${data.bounds.names.join('..')}`, color: 'var(--vz-point-bg)', border: 'solid' });
  const badges = [];
  if (data.bounds?.kind === 'range') badges.push({ text: `search ${data.bounds.names[0]}=${data.bounds.lo} … ${data.bounds.names[1]}=${data.bounds.hi}`, tone: 'point' });
  if (data.bounds?.kind === 'window') badges.push({ text: `window [${data.bounds.lo}, ${data.bounds.hi}] · ${Math.abs(data.bounds.hi - data.bounds.lo) + 1} wide`, tone: 'point' });
  if (data.swapped) badges.push({ text: `swap ${data.swapped[0]} ↔ ${data.swapped[1]}`, tone: 'write' });
  const range = panel.story?.range;
  if (range && !bars) badges.push({ text: `${range.label || 'range'} [${range.lo}, ${range.hi}]`, tone: 'point' });
  const kindLabel = { bars: 'sorting', dp: '1-D table', string: 'string', cells: 'array' }[data.style] || 'array';
  return (
    <Card title={panel.title} kind={`${kindLabel} · ${data.items.length}${data.more ? '+' : ''}`} badges={badges} vars={panel.vars} first={first}>
      {bars ? <Bars data={data} language={language} /> : <Cells data={data} language={language} story={panel.story} />}
      {legend.length > 0 && <Legend items={legend} />}
    </Card>
  );
}
