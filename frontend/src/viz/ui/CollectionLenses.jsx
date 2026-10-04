import { Fragment } from 'react';
import { Card, Legend } from './Card.jsx';
import { LEGEND, fmt, fmtFull, useViz } from './kit.js';

/** Stacks, queues / deques, hash maps, sets, intervals, bit masks, plain variables. */

const label = (x, language, max = 8) => (x && typeof x === 'object' && !Array.isArray(x) && 'label' in x ? fmt(x.label, language, max) : fmt(x, language, max));

// ── stack & queue ──────────────────────────────────────────────────────────────────────────────
function StackColumn({ title, items, changed, language, op }) {
  const rev = [...items].reverse();
  const top = items.length - 1;
  const ch = new Set(changed);
  return (
    <div style={{ minWidth: 110, width: 'fit-content', maxWidth: 240, flex: '0 0 auto' }}>
      {title && <div className="vz-idx" style={{ textAlign: 'center', marginBottom: 6, fontWeight: 700, color: 'var(--vz-ink-2)', fontSize: 11 }}>{title}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 44, justifyContent: 'flex-start' }}>
        {rev.map((x, k) => {
          const i = top - k;
          const isTop = i === top;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className={`vz-cell${ch.has(i) ? ` changed${op === 'push' ? ' pop' : ''}` : isTop ? ' point' : ''}`} style={{ flex: 1, minWidth: 64 }} title={fmtFull(x, language)}>{label(x, language, 10)}</div>
              <span className="vz-idx" style={{ width: 38, whiteSpace: 'nowrap', textAlign: 'left', color: isTop ? 'var(--vz-point)' : undefined, fontWeight: isTop ? 800 : undefined }}>{isTop ? '← top' : ''}</span>
            </div>
          );
        })}
        {items.length === 0 && <div className="vz-cell dim filler" style={{ minWidth: 64, height: 32 }}>empty</div>}
        <div style={{ height: 4, borderRadius: 3, background: 'var(--vz-line-2)' }} />
      </div>
    </div>
  );
}

export function StackLens({ panel, first }) {
  const { language } = useViz();
  const { data } = panel;
  const multi = data.multi;
  return (
    <Card title={panel.title} kind={multi ? 'stacks' : 'stack'} badges={multi ? [] : [{ text: `${data.items.length} item${data.items.length === 1 ? '' : 's'}` }, ...(data.op === 'push' ? [{ text: 'push', tone: 'write' }] : data.op === 'pop' ? [{ text: 'pop', tone: 'point' }] : [])]} vars={panel.vars} first={first}>
      {multi ? (
        <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {multi.map((s, k) => <StackColumn key={s.label} title={s.label} items={s.items} changed={data.changed.includes(k) ? s.items.map((_, i) => i).slice(-1) : []} language={language} op="push" />)}
        </div>
      ) : (
        <StackColumn items={data.items} changed={data.changed} language={language} op={data.op} />
      )}
    </Card>
  );
}

export function QueueLens({ panel, first }) {
  const { language } = useViz();
  const { data } = panel;
  const { items, changed, op, deque } = data;
  const ch = new Set(changed);
  return (
    <Card title={panel.title} kind={deque ? 'deque' : 'queue'} badges={[{ text: `${items.length} waiting` }, ...(op === 'push' ? [{ text: 'enqueue', tone: 'write' }] : op === 'pop' ? [{ text: 'dequeue', tone: 'point' }] : [])]} vars={panel.vars} first={first}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>
        <span className="vz-idx" style={{ fontWeight: 700, color: 'var(--vz-point)' }}>front →</span>
        {items.length === 0 && <div className="vz-cell dim filler" style={{ minWidth: 64 }}>empty</div>}
        {items.map((x, i) => (
          <div key={i} className="vz-cellwrap">
            <div className={`vz-cell${ch.has(i) ? ` changed${op === 'push' ? ' pop' : ''}` : i === 0 ? ' point' : ' front'}`} title={fmtFull(x, language)}>{label(x, language, 9)}</div>
            <span className="vz-idx">{i === 0 ? 'front' : i === items.length - 1 ? 'back' : ''}</span>
          </div>
        ))}
        <span className="vz-idx" style={{ fontWeight: 700, color: 'var(--vz-ink-3)' }}>→ back</span>
      </div>
    </Card>
  );
}

// ── hash maps & sets ───────────────────────────────────────────────────────────────────────────
export function HashLens({ panel, first }) {
  const { language } = useViz();
  const { data } = panel;
  const { entries, added, updated, removed, kind, size, more } = data;
  const add = new Set(added);
  const upd = new Set(updated);
  const kindLabel = { memo: 'memo / cache', counter: 'counter', ordered: 'ordered (LRU)', dict: 'hash map' }[kind];
  return (
    <Card title={panel.title} kind={kindLabel} badges={[{ text: `${size} key${size === 1 ? '' : 's'}` }, ...(added.length ? [{ text: `+ ${added.join(', ').slice(0, 20)}`, tone: 'done' }] : []), ...(updated.length ? [{ text: `~ ${updated.join(', ').slice(0, 20)}`, tone: 'write' }] : []), ...(removed.length ? [{ text: `− ${removed.join(', ').slice(0, 20)}` }] : [])]} vars={panel.vars} first={first}>
      {entries.length === 0 ? <div className="vz-note" style={{ margin: 0 }}>empty</div> : (
        <table className="vz-table" aria-label={`${panel.title} entries`}>
          <tbody>
            {kind === 'ordered' && <tr><td colSpan={2} style={{ background: 'none', padding: '0 4px', color: 'var(--vz-ink-3)', fontSize: 10 }}>oldest — evicted first ↓</td></tr>}
            {entries.map(([k, v]) => (
              <tr key={k} className={add.has(k) ? 'added' : upd.has(k) ? 'updated' : ''}>
                <td>{k}</td>
                <td title={fmtFull(v, language)}>{typeof v === 'object' && v !== null ? fmtFull(v, language).slice(0, 56) : fmt(v, language, 40)}</td>
              </tr>
            ))}
            {kind === 'ordered' && <tr><td colSpan={2} style={{ background: 'none', padding: '0 4px', color: 'var(--vz-ink-3)', fontSize: 10 }}>newest ↑</td></tr>}
          </tbody>
        </table>
      )}
      {more > 0 && <div className="vz-note">+ {more} more</div>}
    </Card>
  );
}

export function SetLens({ panel, first }) {
  const { language } = useViz();
  const { data } = panel;
  const add = new Set(data.added);
  return (
    <Card title={panel.title} kind="set" badges={[{ text: `${data.items.length} member${data.items.length === 1 ? '' : 's'}` }]} vars={panel.vars} first={first}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {data.items.length === 0 && <div className="vz-cell dim filler">empty</div>}
        {data.items.map((x, i) => (
          <div key={i} className={`vz-cell${add.has(JSON.stringify(x)) ? ' changed pop' : ''}`} title={fmtFull(x, language)}>{fmt(x, language, 8)}</div>
        ))}
        {data.more > 0 && <div className="vz-cell small dim">+{data.more}</div>}
      </div>
    </Card>
  );
}

// ── intervals ──────────────────────────────────────────────────────────────────────────────────
export function IntervalsLens({ panel, first }) {
  const { language } = useViz();
  const { items, changed } = panel.data;
  const lo = Math.min(...items.map((x) => x[0]));
  const hi = Math.max(...items.map((x) => x[1]));
  const span = Math.max(1, hi - lo);
  const W = 640;
  const sx = (v) => 30 + ((v - lo) / span) * (W - 60);
  const ch = new Set(changed);
  const H = items.length * 28 + 38;
  const ticks = Array.from({ length: Math.min(12, span + 1) }, (_, k) => lo + Math.round((k * span) / Math.max(1, Math.min(11, span))));
  return (
    <Card title={panel.title} kind="intervals" badges={[{ text: `${items.length} interval${items.length === 1 ? '' : 's'}` }]} vars={panel.vars} wide first={first}>
      <svg className="vz-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Intervals on a number line">
        {items.map(([s, e], i) => (
          <g key={i} className="vz-node" style={{ transform: `translate(0px, ${i * 28 + 6}px)` }}>
            <rect x={sx(s)} y={0} width={Math.max(8, sx(e) - sx(s))} height={20} rx={8} fill={ch.has(i) ? 'var(--vz-write-bg)' : 'var(--vz-done-bg)'} stroke={ch.has(i) ? 'var(--vz-write)' : 'var(--vz-done)'} strokeWidth="1.8" />
            <text x={sx(s) + 8} y={14} fontSize="11" fontWeight="700" fill="var(--vz-ink)">[{fmt(s, language)}, {fmt(e, language)}]</text>
          </g>
        ))}
        <line x1={24} y1={H - 22} x2={W - 24} y2={H - 22} stroke="var(--vz-line-2)" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={sx(t)} y1={H - 26} x2={sx(t)} y2={H - 18} stroke="var(--vz-line-2)" />
            <text x={sx(t)} y={H - 6} textAnchor="middle" fontSize="9.5" fill="var(--vz-ink-3)">{t}</text>
          </g>
        ))}
      </svg>
    </Card>
  );
}

// ── bits ───────────────────────────────────────────────────────────────────────────────────────
export function BitsLens({ panel, first }) {
  const { data } = panel;
  return (
    <Card title="Bits" kind="binary view" vars={panel.vars} first={first}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.rows.map((r) => {
          const ch = new Set(r.changed);
          return (
            <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ width: 70, textAlign: 'right', fontFamily: 'var(--vz-mono)', fontSize: 12, fontWeight: 700, color: 'var(--vz-ink-2)' }}>{r.name.replace(/^(self|this)\./, '')}</span>
              <div style={{ display: 'flex', gap: 3 }}>
                {r.bits.map((b, i) => (
                  <Fragment key={i}>
                    {i > 0 && i % 4 === 0 && <span style={{ width: 5 }} />}
                    <div className={`vz-cell small${ch.has(i) ? ' changed' : b ? ' done' : ''}`} style={{ minWidth: 24, width: 24, padding: 0, fontWeight: b ? 800 : 500, color: b ? undefined : 'var(--vz-ink-3)' }} title={`bit ${r.width - 1 - i}`}>{b}</div>
                  </Fragment>
                ))}
              </div>
              <span style={{ fontFamily: 'var(--vz-mono)', fontSize: 12, color: 'var(--vz-ink-2)' }}>= <b style={{ color: 'var(--vz-ink)' }}>{r.value}</b> <span style={{ color: 'var(--vz-ink-3)' }}>(0x{r.value.toString(16)})</span></span>
            </div>
          );
        })}
      </div>
      <div className="vz-note">leftmost bit = highest · groups of 4</div>
    </Card>
  );
}

// ── variables strip ────────────────────────────────────────────────────────────────────────────
export function VarsStrip({ panel }) {
  const { language } = useViz();
  const { items } = panel.data;
  return (
    <div className="vz-vars" role="list" aria-label="Variables">
      {items.map((v) => (
        <span key={v.full} role="listitem" className={`vz-var${v.changed ? ' changed' : ''}${v.outer ? ' outer' : ''}`} title={`${v.full} = ${fmtFull(v.value, language)}`}>
          <span>{v.name}</span>
          <b>{Array.isArray(v.value) ? `[${v.value.map((x) => fmt(x, language, 5)).join(', ')}]` : fmt(v.value, language, 18)}</b>
        </span>
      ))}
    </div>
  );
}

export { Legend, LEGEND };
