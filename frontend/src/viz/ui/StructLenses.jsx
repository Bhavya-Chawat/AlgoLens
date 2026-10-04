import { Card, Legend } from './Card.jsx';
import { LEGEND, fmt, useViz } from './kit.js';
import { layoutTree } from './layout.js';

/** Union-Find forest, heap (array + tree), segment tree, Fenwick tree. */

const GX = 52;
const GY = 62;
const PAD = 34;
const NR = 17;
const PALETTE = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c', '#2dd4bf', '#f87171'];

// ── union-find ─────────────────────────────────────────────────────────────────────────────────
export function DsuLens({ panel, first }) {
  const { language } = useViz();
  const { data } = panel;
  const { labels, parent, companion, roots, children, changed, rewired, focus, marks } = data;
  const { pos, width, height } = layoutTree(roots, (id) => children[id].map((c) => ({ id: c })));
  const W = Math.max(300, width * GX + PAD * 2);
  const H = (Math.max(1, height) - 1) * GY + PAD + NR + 36; // the lowest row, its tag below it, a little air
  const px = (i) => PAD + (pos.get(i)?.x ?? 0) * GX;
  const py = (i) => PAD + 6 + (pos.get(i)?.y ?? 0) * GY;
  const rootOf = (i) => { let x = i; let n = 0; while (parent[x] !== x && n++ < parent.length) x = parent[x]; return x; };
  const color = (i) => PALETTE[roots.indexOf(rootOf(i)) % PALETTE.length] || PALETTE[0];
  const changedSet = new Set(changed);
  const rewiredBy = new Map(rewired.map((r) => [r.node, r]));
  const focusBy = new Map();
  focus.forEach((f) => { if (!focusBy.has(f.node)) focusBy.set(f.node, []); focusBy.get(f.node).push(f.name); });
  const touched = new Map(marks.map((m) => [m.node, m.kind]));
  const comp = companion;
  return (
    <Card title={panel.title} kind="union-find" badges={[{ text: `${data.components} component${data.components === 1 ? '' : 's'}`, tone: 'done' }, ...(rewired.length ? [{ text: `rewired ${rewired.length}`, tone: 'write' }] : [])]} vars={panel.vars} wide first={first}>
      {/* a small forest is drawn at (at most) 1.3x its natural size and centred, not stretched across the whole card */}
      <svg className="vz-svg" viewBox={`0 0 ${W} ${H}`} style={{ maxHeight: 420, maxWidth: Math.round(W * 1.3), margin: '0 auto' }} role="img" aria-label="Union-find forest">
        <defs>
          <marker id="vz-dsu-a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--vz-ink-3)" /></marker>
          <marker id="vz-dsu-w" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--vz-write)" /></marker>
        </defs>
        {parent.map((p, i) => {
          if (p === i || !pos.has(i) || !pos.has(p)) return null;
          const hot = changedSet.has(i);
          const dx = px(p) - px(i);
          const dy = py(p) - py(i);
          const d = Math.hypot(dx, dy) || 1;
          return (
            <g key={`e${i}`} className="vz-edge">
              {hot && rewiredBy.get(i) && pos.has(rewiredBy.get(i).from) && rewiredBy.get(i).from !== i && (
                <line x1={px(i)} y1={py(i)} x2={px(rewiredBy.get(i).from)} y2={py(rewiredBy.get(i).from)} stroke="var(--vz-ink-3)" strokeWidth="1.4" strokeDasharray="4 4" opacity="0.7" />
              )}
              <line x1={px(i) + (dx / d) * NR} y1={py(i) + (dy / d) * NR} x2={px(p) - (dx / d) * (NR + 4)} y2={py(p) - (dy / d) * (NR + 4)} stroke={hot ? 'var(--vz-write)' : 'var(--vz-ink-3)'} strokeWidth={hot ? 2.8 : 1.8} markerEnd={`url(#${hot ? 'vz-dsu-w' : 'vz-dsu-a'})`} />
            </g>
          );
        })}
        {parent.map((_, i) => {
          if (!pos.has(i)) return null;
          const isRoot = parent[i] === i;
          const c = color(i);
          const f = focusBy.get(i);
          const t = touched.get(i);
          return (
            <g key={i} className="vz-node" style={{ transform: `translate(${px(i)}px, ${py(i)}px)` }}>
              <circle r={NR} fill={`color-mix(in srgb, ${c} 22%, var(--vz-surface))`} stroke={t === 'write' ? 'var(--vz-write)' : f ? 'var(--vz-point)' : c} strokeWidth={f || t ? 3 : isRoot ? 2.6 : 1.8} />
              <text textAnchor="middle" dy="4.5" fontSize="13" fontWeight="700" fill="var(--vz-ink)">{labels[i]}</text>
              {isRoot && comp && (
                <g transform={`translate(${NR - 1}, ${-NR + 3})`}>
                  <rect x={-2} y={-8} width={Math.max(18, String(comp.items[i]).length * 7 + 10)} height={15} rx={7} fill="var(--vz-surface)" stroke="var(--vz-line-2)" />
                  <text x={Math.max(18, String(comp.items[i]).length * 7 + 10) / 2 - 2} y={3} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="var(--vz-ink-2)">{comp.kind[0]}{comp.items[i]}</text>
                </g>
              )}
              {/* above the node: the children's arrows arrive from below */}
              {isRoot && <text x={-3} y={-NR - 6} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--vz-done)">root</text>}
              {f && (
                <g transform={`translate(0, ${NR + 12})`}>
                  <rect x={-(f.join('·').length * 3.3 + 7)} y={-9} width={f.join('·').length * 6.6 + 14} height={15} rx={7} fill="var(--vz-point-bg)" stroke="var(--vz-point)" />
                  <text textAnchor="middle" y={2.5} fontSize="10" fontWeight="700" fill="var(--vz-point)">{f.join('·')}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <div className="vz-cells" style={{ marginTop: 10 }} aria-label="parent array">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginRight: 6, paddingTop: 0 }}>
          <span className="vz-idx" style={{ height: 30, display: 'grid', alignItems: 'center' }}>index</span>
          <span className="vz-idx" style={{ height: 30, display: 'grid', alignItems: 'center', color: 'var(--vz-ink-2)', fontWeight: 700 }}>{panel.title}</span>
          {comp && <span className="vz-idx" style={{ height: 24, display: 'grid', alignItems: 'center' }}>{comp.name.replace(/^(self|this)\./, '')}</span>}
        </div>
        {parent.map((p, i) => (
          <div key={i} className="vz-cellwrap" style={{ gap: 4 }}>
            <span className="vz-idx" style={{ height: 30, display: 'grid', alignItems: 'center' }}>{labels[i]}</span>
            <div className={`vz-cell small${changedSet.has(i) ? ' changed' : touched.get(i) === 'read' ? ' read' : p === i ? ' done' : ''}`}>{labels[p] ?? p}</div>
            {comp && <div className={`vz-cell small${comp.changed?.includes(i) ? ' changed' : ''}`} style={{ height: 24, fontWeight: 500, color: 'var(--vz-ink-2)' }}>{fmt(comp.items[i], language, 4)}</div>}
          </div>
        ))}
      </div>
      <Legend items={[{ label: 'root', color: 'var(--vz-done-bg)', border: 'solid' }, LEGEND.write, { label: 'node in use (x, ra, rb)', color: 'var(--vz-point-bg)', border: 'solid' }, { label: 'dashed = old parent', color: 'var(--vz-line-2)' }]} />
    </Card>
  );
}

// ── heap ───────────────────────────────────────────────────────────────────────────────────────
export function HeapLens({ panel, first }) {
  const { language } = useViz();
  const { data } = panel;
  const { items, order, changed, tuples, swapped } = data;
  const n = items.length;
  const levels = n ? Math.floor(Math.log2(n)) + 1 : 1;
  const W = 640;
  const H = levels * 62 + 28;
  const at = (i) => {
    const level = Math.floor(Math.log2(i + 1));
    const within = i + 1 - 2 ** level;
    return { x: ((within + 0.5) / 2 ** level) * W, y: 28 + level * 62 };
  };
  const ch = new Set(changed);
  const label = (x) => (Array.isArray(x) ? x.map((y) => fmt(y, language, 3)).join(',') : fmt(x, language, 5));
  return (
    <Card title={panel.title} kind={`${order}-heap`} badges={[{ text: `${n} item${n === 1 ? '' : 's'}` }, ...(n ? [{ text: `${order === 'min' ? 'smallest' : 'largest'}: ${label(items[0])}`, tone: 'done' }] : []), ...(swapped ? [{ text: `swap ${swapped[0]} ↔ ${swapped[1]}`, tone: 'write' }] : [])]} vars={panel.vars} first={first}>
      {n === 0 ? <div className="vz-note" style={{ margin: 0 }}>empty heap</div> : (
        <>
          <svg className="vz-svg" viewBox={`0 0 ${W} ${H}`} style={{ maxHeight: 300 }} role="img" aria-label="Heap as a tree">
            {items.map((_, i) => (i === 0 ? null : (
              <line key={`e${i}`} className="vz-edge" x1={at((i - 1) >> 1).x} y1={at((i - 1) >> 1).y} x2={at(i).x} y2={at(i).y} stroke={ch.has(i) && ch.has((i - 1) >> 1) ? 'var(--vz-write)' : 'var(--vz-line-2)'} strokeWidth="1.8" />
            )))}
            {items.map((x, i) => {
              const p = at(i);
              const wide = tuples ? Math.max(NR + 8, label(x).length * 3.6 + 10) : NR + 2;
              return (
                <g key={i} className="vz-node" style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
                  <rect x={-wide} y={-NR} width={wide * 2} height={NR * 2} rx={NR} fill={ch.has(i) ? 'var(--vz-write-bg)' : i === 0 ? 'var(--vz-done-bg)' : 'var(--vz-surface)'} stroke={ch.has(i) ? 'var(--vz-write)' : i === 0 ? 'var(--vz-done)' : 'var(--vz-line-2)'} strokeWidth={ch.has(i) || i === 0 ? 2.4 : 1.8} />
                  <text textAnchor="middle" dy="4.5" fontSize="12.5" fontWeight="700" fill="var(--vz-ink)">{label(x)}</text>
                </g>
              );
            })}
          </svg>
          <div className="vz-cells" style={{ marginTop: 8 }}>
            {items.map((x, i) => (
              <div key={i} className="vz-cellwrap">
                <div className={`vz-cell small${ch.has(i) ? ' changed' : i === 0 ? ' done' : ''}`}>{label(x)}</div>
                <span className="vz-idx">{i}</span>
              </div>
            ))}
          </div>
          <div className="vz-note">parent of i is (i−1)//2 · children 2i+1, 2i+2</div>
        </>
      )}
    </Card>
  );
}

// ── segment tree ───────────────────────────────────────────────────────────────────────────────
export function SegTreeLens({ panel, first }) {
  const { language } = useViz();
  const { data } = panel;
  const { items, oneBased, changed, reads, writes } = data;
  const N = items.length;
  // iterative layout: leaves at n..2n-1, node i has children 2i and 2i+1 (index 0 unused)
  const base = oneBased ? 1 : 0;
  const kid = (i) => (oneBased ? [2 * i, 2 * i + 1] : [2 * i + 1, 2 * i + 2]).filter((c) => c < N);
  const rootIdx = base;
  const { pos, width, height } = layoutTree([rootIdx], (i) => kid(i).map((c) => ({ id: c })));
  // ranges (only meaningful for the iterative layout where the leaves are the last n entries)
  const leafStart = oneBased ? N / 2 : null;
  const range = new Map();
  if (oneBased && Number.isInteger(leafStart)) {
    const f = (i) => {
      if (i >= N) return null;
      if (i >= leafStart) { range.set(i, [i - leafStart, i - leafStart]); return range.get(i); }
      const a = f(2 * i);
      const b = f(2 * i + 1);
      if (a && b) range.set(i, [a[0], b[1]]);
      return range.get(i) || null;
    };
    f(1);
  }
  const W = Math.max(300, width * 56 + 60);
  const H = height * 68 + 40;
  const px = (i) => 34 + (pos.get(i)?.x ?? 0) * 56;
  const py = (i) => 28 + (pos.get(i)?.y ?? 0) * 68;
  const ch = new Set(changed);
  const rd = new Set(reads);
  const wr = new Set(writes);
  return (
    <Card title={panel.title} kind="segment tree" badges={[{ text: `${N} nodes` }]} vars={panel.vars} wide first={first}>
      <svg className="vz-svg" viewBox={`0 0 ${W} ${H}`} style={{ maxHeight: 440 }} role="img" aria-label="Segment tree">
        {[...pos.keys()].flatMap((i) => kid(i).filter((c) => pos.has(c)).map((c) => (
          <line key={`${i}-${c}`} className="vz-edge" x1={px(i)} y1={py(i)} x2={px(c)} y2={py(c)} stroke="var(--vz-line-2)" strokeWidth="1.6" />
        )))}
        {[...pos.keys()].map((i) => {
          const hot = wr.has(i) || ch.has(i);
          const r = range.get(i);
          return (
            <g key={i} className="vz-node" style={{ transform: `translate(${px(i)}px, ${py(i)}px)` }}>
              <rect x={-24} y={-17} width={48} height={34} rx={9} fill={hot ? 'var(--vz-write-bg)' : rd.has(i) ? 'var(--vz-read-bg)' : 'var(--vz-surface)'} stroke={hot ? 'var(--vz-write)' : rd.has(i) ? 'var(--vz-read)' : 'var(--vz-line-2)'} strokeWidth={hot || rd.has(i) ? 2.4 : 1.6} />
              <text textAnchor="middle" y={-1} fontSize="13" fontWeight="700" fill="var(--vz-ink)">{fmt(items[i], language, 4)}</text>
              <text textAnchor="middle" y={11} fontSize="8.5" fill="var(--vz-ink-3)">{r ? (r[0] === r[1] ? `[${r[0]}]` : `[${r[0]}..${r[1]}]`) : `#${i}`}</text>
            </g>
          );
        })}
      </svg>
      <Legend items={[LEGEND.write, LEGEND.read]} />
    </Card>
  );
}

// ── Fenwick tree ───────────────────────────────────────────────────────────────────────────────
export function FenwickLens({ panel, first }) {
  const { language } = useViz();
  const { data } = panel;
  const { items, changed, reads, writes, cursor } = data;
  const N = items.length - 1;
  const CW = 46;
  const rows = [];
  for (let i = 1; i <= N; i++) {
    const low = i & -i;
    const level = Math.log2(low);
    (rows[level] || (rows[level] = [])).push({ i, from: i - low + 1 });
  }
  const H = rows.length * 24 + 8;
  const ch = new Set(changed);
  const wr = new Set(writes);
  const rd = new Set(reads);
  return (
    <Card title={panel.title} kind="Fenwick tree" badges={[{ text: `${N} slots` }, ...(cursor ? [{ text: `${cursor.name} = ${cursor.value} = ${cursor.value.toString(2)}₂`, tone: 'point' }] : [])]} vars={panel.vars} wide first={first}>
      <div style={{ overflowX: 'auto' }}>
        <div className="vz-cells" style={{ width: 'max-content', paddingLeft: 0 }}>
          {items.slice(1).map((x, k) => {
            const i = k + 1;
            return (
              <div key={i} className="vz-cellwrap" style={{ width: CW - 4 }}>
                <div className={`vz-cell small${wr.has(i) ? ' write' : ch.has(i) ? ' changed' : rd.has(i) ? ' read' : cursor?.value === i ? ' point' : ''}`} style={{ width: '100%', minWidth: 0 }}>{fmt(x, language, 4)}</div>
                <span className="vz-idx">{i}</span>
                <span className="vz-idx" style={{ opacity: 0.6 }}>{i.toString(2)}</span>
              </div>
            );
          })}
        </div>
        <svg width={N * CW} height={H} style={{ display: 'block', marginTop: 6 }} aria-label="Range each slot covers">
          {rows.map((row, level) => row.map(({ i, from }) => (
            <g key={i}>
              <rect x={(from - 1) * CW + 2} y={level * 24 + 2} width={(i - from + 1) * CW - 6} height={18} rx={6} fill={ch.has(i) || wr.has(i) ? 'var(--vz-write-bg)' : 'var(--vz-surface-3)'} stroke={ch.has(i) || wr.has(i) ? 'var(--vz-write)' : 'var(--vz-line-2)'} />
              <text x={(from - 1) * CW + 2 + ((i - from + 1) * CW - 6) / 2} y={level * 24 + 15} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--vz-ink-2)">{from === i ? `${i}` : `${from}..${i}`}</text>
            </g>
          )))}
        </svg>
      </div>
      <div className="vz-note">slot i stores the sum of the range ending at i whose length is the lowest set bit of i (i &amp; −i)</div>
    </Card>
  );
}
