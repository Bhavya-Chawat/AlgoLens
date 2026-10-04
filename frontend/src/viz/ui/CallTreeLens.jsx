import { useEffect, useRef } from 'react';
import { Card, Legend } from './Card.jsx';
import { fmt, useViz } from './kit.js';
import { layoutTree } from './layout.js';

/**
 * The call tree of a recursive run, growing as the program runs. Repeated (function, arguments) pairs are
 * drawn dashed with a counter: that is exactly the work memoisation would save.
 */

const NW = 118;
const NH = 40;
const GX = 132;
const GY = 74;

function visibleSet(calls, upto, active) {
  if (upto <= 260) return null; // everything
  const keep = new Set();
  let c = active;
  while (c !== null && c !== undefined) {
    keep.add(c);
    calls[c].children.forEach((k) => { if (k < upto) keep.add(k); });
    c = calls[c].parent;
  }
  for (let i = Math.max(0, upto - 40); i < upto; i++) keep.add(i);
  keep.add(0);
  return keep;
}

export default function CallTreeLens({ panel, first }) {
  const { language } = useViz();
  const { calls, upto, idx, active, recursive, repeated, total } = panel.data;
  const keep = visibleSet(calls, upto, active);
  const show = (id) => id < upto && (!keep || keep.has(id));
  const roots = calls.filter((c) => c.parent === null && show(c.id)).map((c) => c.id);
  const { pos, width, height } = layoutTree(roots, (id) => calls[id].children.filter(show).map((k) => ({ id: k })));
  const W = Math.max(300, (width - 1) * GX + NW + 40);
  const H = (height - 1) * GY + NH + 40;
  const px = (id) => 20 + (pos.get(id)?.x ?? 0) * GX + NW / 2;
  const py = (id) => 18 + (pos.get(id)?.y ?? 0) * GY + NH / 2;
  const holder = useRef(null);
  useEffect(() => {
    const el = holder.current?.querySelector('[data-active="1"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [active, upto]);
  const dupCount = new Map();
  calls.forEach((c, i) => { if (i < upto && c.dup) dupCount.set(c.dupOf, (dupCount.get(c.dupOf) || 0) + 1); });
  const hidden = keep ? upto - keep.size : 0;
  const badges = [{ text: `${upto}/${total} calls` }];
  if (repeated) badges.push({ text: `${repeated} repeated`, tone: 'write' });
  return (
    <Card title={panel.title} kind={recursive ? 'call tree' : 'calls'} badges={badges} vars={[]} wide first={first}>
      <div ref={holder} style={{ overflow: 'auto', maxHeight: 460 }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Call tree" style={{ display: 'block' }}>
          {[...pos.keys()].flatMap((id) => calls[id].children.filter((k) => pos.has(k)).map((k) => (
            <line key={`${id}-${k}`} className="vz-edge" x1={px(id)} y1={py(id) + NH / 2} x2={px(k)} y2={py(k) - NH / 2} stroke={calls[k].dup ? 'var(--vz-write)' : 'var(--vz-line-2)'} strokeWidth="1.6" strokeDasharray={calls[k].dup ? '4 3' : undefined} />
          )))}
          {[...pos.keys()].map((id) => {
            const c = calls[id];
            const isActive = id === active;
            const open = c.end === null || c.end > idx;
            const done = !open;
            const stroke = isActive ? 'var(--vz-point)' : c.unwound && done ? 'var(--vz-error)' : c.dup ? 'var(--vz-write)' : done ? 'var(--vz-done)' : 'var(--vz-read)';
            const fill = isActive ? 'var(--vz-point-bg)' : c.dup ? 'var(--vz-write-bg)' : done ? 'var(--vz-surface)' : 'var(--vz-read-bg)';
            const text = `${c.fn}(${c.args})`;
            const clipped = text.length > 17 ? `${text.slice(0, 16)}…` : text;
            return (
              <g key={id} className="vz-node" data-active={isActive ? '1' : undefined} style={{ transform: `translate(${px(id) - NW / 2}px, ${py(id) - NH / 2}px)` }}>
                <title>{`${text}${done && c.hasRet ? ` → ${JSON.stringify(c.ret)}` : ''}${c.dup ? ' (repeated work)' : ''}`}</title>
                <rect width={NW} height={NH} rx={10} fill={fill} stroke={stroke} strokeWidth={isActive ? 2.8 : 1.8} strokeDasharray={c.dup ? '5 3' : undefined} />
                <text x={NW / 2} y={done && c.hasRet ? 16 : 24} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--vz-ink)">{clipped}</text>
                {done && c.hasRet && <text x={NW / 2} y={31} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--vz-done)">→ {fmt(c.ret, language, 14)}</text>}
                {done && c.unwound && <text x={NW / 2} y={31} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--vz-error)">exception</text>}
                {c.dup && <text x={NW - 6} y={-3} textAnchor="end" fontSize="9" fontWeight="800" fill="var(--vz-write)">again</text>}
              </g>
            );
          })}
        </svg>
      </div>
      {hidden > 0 && <div className="vz-note">{hidden} earlier calls hidden — showing the path to the active call</div>}
      <Legend items={[{ label: 'running now', color: 'var(--vz-point-bg)', border: 'solid' }, { label: 'on the stack', color: 'var(--vz-read-bg)', border: 'solid' }, { label: 'finished (→ value)', color: 'var(--vz-surface)', border: 'solid' }, { label: 'repeated call', color: 'var(--vz-write-bg)', border: 'dashed' }]} />
    </Card>
  );
}
