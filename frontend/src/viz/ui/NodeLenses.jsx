import { Card, Legend } from './Card.jsx';
import { LEGEND, fmt, useViz } from './kit.js';
import { layoutTree } from './layout.js';

/** Pointer structures: trees, linked lists, tries. Nodes are keyed by object identity, so a node keeps its place. */

const GX = 54;
const GY = 66;
const PAD = 38;
const NR = 18;

function LabelPills({ labels, id, x, y }) {
  const mine = labels.filter((l) => l.id === id).map((l) => l.name.replace(/^(self|this)\./, ''));
  if (!mine.length) return null;
  const text = mine.slice(0, 3).join(' · ');
  const w = Math.max(28, text.length * 6.4 + 12);
  return (
    <g transform={`translate(${x}, ${y})`}>
      <path d={`M ${-4} ${-4} L ${4} ${-4} L 0 ${2} z`} fill="var(--vz-point)" transform="translate(0,-6)" />
      <rect x={-w / 2} y={-22} width={w} height={16} rx={8} fill="var(--vz-point-bg)" stroke="var(--vz-point)" />
      <text textAnchor="middle" y={-10.5} fontSize="10" fontWeight="700" fill="var(--vz-point)">{text}</text>
    </g>
  );
}

function NullPointers({ labels }) {
  const nulls = labels.filter((l) => l.id === null).map((l) => l.name.replace(/^(self|this)\./, ''));
  if (!nulls.length) return null;
  return <div className="vz-note">{nulls.join(', ')} → null</div>;
}

// ── trees ──────────────────────────────────────────────────────────────────────────────────────
export function TreeLens({ panel, first }) {
  const { language } = useViz();
  const { data } = panel;
  const { nodes, roots, labels, changed, pending, kind } = data;
  const kids = (id) => {
    const r = nodes[id];
    if (!r) return [];
    if (kind === 'binary') return [{ id: r.left, side: 'l' }, { id: r.right, side: 'r' }].filter((c) => c.id !== null && c.id !== undefined && nodes[c.id]);
    return r.children.filter((c) => nodes[c.id]).map((c) => ({ id: c.id }));
  };
  const { pos, width, height } = layoutTree(roots.filter((r) => nodes[r]), kids);
  const W = Math.max(260, width * GX + PAD * 2 - GX * 0.3);
  const H = height * GY + PAD + 30;
  const ch = new Set(changed);
  const pend = new Set(pending);
  const labelled = new Set(labels.filter((l) => l.id !== null).map((l) => l.id));
  const px = (id) => PAD + (pos.get(id)?.x ?? 0) * GX;
  const py = (id) => PAD + 12 + (pos.get(id)?.y ?? 0) * GY;
  const legend = [LEGEND.point];
  if (changed.length) legend.push(LEGEND.write);
  if (pending.length) legend.push({ label: 'waiting in stack / queue', color: 'var(--vz-front-bg)', border: 'solid' });
  return (
    <Card title={panel.title} kind={kind === 'binary' ? 'binary tree' : 'tree'} badges={[{ text: `${Object.keys(nodes).length} nodes` }]} vars={panel.vars} wide first={first}>
      <svg className="vz-svg" viewBox={`0 0 ${W} ${H}`} style={{ maxHeight: 460 }} role="img" aria-label={`Tree ${panel.title}`}>
        {[...pos.keys()].flatMap((id) => kids(id).map((c) => (
          <line key={`${id}-${c.id}`} className="vz-edge" x1={px(id)} y1={py(id)} x2={px(c.id)} y2={py(c.id)} stroke="var(--vz-line-2)" strokeWidth="1.8" />
        )))}
        {[...pos.keys()].map((id) => {
          const r = nodes[id];
          const isCh = ch.has(id);
          const isPoint = labelled.has(id);
          const isPend = pend.has(id);
          return (
            <g key={id} className="vz-node" style={{ transform: `translate(${px(id)}px, ${py(id)}px)` }}>
              <circle r={NR} fill={isCh ? 'var(--vz-write-bg)' : isPoint ? 'var(--vz-point-bg)' : 'var(--vz-surface)'} stroke={isCh ? 'var(--vz-write)' : isPoint ? 'var(--vz-point)' : isPend ? 'var(--vz-front)' : 'var(--vz-line-2)'} strokeWidth={isPoint || isCh ? 2.8 : 1.8} strokeDasharray={isPend && !isPoint ? '4 3' : undefined} />
              <text textAnchor="middle" dy="4.5" fontSize="13" fontWeight="700" fill="var(--vz-ink)">{fmt(r.val, language, 4)}</text>
              <LabelPills labels={labels} id={id} x={0} y={-NR - 4} />
            </g>
          );
        })}
      </svg>
      <NullPointers labels={labels} />
      <Legend items={legend} />
    </Card>
  );
}

// ── linked lists ───────────────────────────────────────────────────────────────────────────────
const BW = 58;
const BH = 38;
const GAP = 34;
const PER_ROW = 7;

function chainsOf(nodes, roots) {
  const used = new Set();
  const chains = [];
  for (const root of roots) {
    if (used.has(root) || !nodes[root]) continue;
    const ids = [];
    let cur = root;
    let cycleTo = null;
    let tail = null;
    while (cur !== null && cur !== undefined) {
      if (ids.includes(cur) || used.has(cur)) { cycleTo = cur; break; }
      if (!nodes[cur]) { tail = 'ref'; break; }
      ids.push(cur);
      cur = nodes[cur].next;
    }
    ids.forEach((i) => used.add(i));
    chains.push({ ids, cycleTo, tail });
  }
  return chains;
}

export function LinkedLens({ panel, first }) {
  const { language } = useViz();
  const { data } = panel;
  const { nodes, roots, labels, changed, doubly } = data;
  const chains = chainsOf(nodes, roots);
  const ch = new Set(changed);
  const labelled = new Set(labels.filter((l) => l.id !== null).map((l) => l.id));
  // lay the chains out in rows
  const slots = new Map();
  let row = 0;
  const rowOf = [];
  chains.forEach((c) => {
    c.ids.forEach((id, i) => {
      slots.set(id, { row: row + Math.floor(i / PER_ROW), col: i % PER_ROW });
    });
    const rowsUsed = Math.max(1, Math.ceil(c.ids.length / PER_ROW));
    rowOf.push({ start: row, rows: rowsUsed });
    row += rowsUsed;
  });
  const W = PAD + PER_ROW * (BW + GAP) + 24;
  const rowH = 86;
  const H = Math.max(1, row) * rowH + 30;
  const at = (id) => ({ x: PAD + slots.get(id).col * (BW + GAP), y: 44 + slots.get(id).row * rowH });
  const legend = [LEGEND.point];
  if (changed.length) legend.push(LEGEND.write);
  return (
    <Card title={panel.title} kind={doubly ? 'doubly linked list' : 'linked list'} badges={[{ text: `${Object.keys(nodes).length} nodes` }, ...(chains.some((c) => c.cycleTo !== null) ? [{ text: 'cycle', tone: 'write' }] : []), ...(chains.length > 1 ? [{ text: `${chains.length} chains`, tone: 'point' }] : [])]} vars={panel.vars} wide first={first}>
      <svg className="vz-svg" viewBox={`0 0 ${W} ${H}`} style={{ maxHeight: 520 }} role="img" aria-label={`Linked list ${panel.title}`}>
        <defs>
          <marker id="vz-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--vz-ink-3)" /></marker>
          <marker id="vz-arr-w" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--vz-write)" /></marker>
        </defs>
        {chains.map((c, ci) => (
          <g key={ci}>
            {c.ids.map((id, i) => {
              const p = at(id);
              const nextId = nodes[id].next;
              const hasNext = nextId !== null && nextId !== undefined;
              const target = hasNext && slots.has(nextId) ? at(nextId) : null;
              const sameRow = target && slots.get(nextId).row === slots.get(id).row && slots.get(nextId).col === slots.get(id).col + 1;
              const isCh = ch.has(id);
              const isPoint = labelled.has(id);
              return (
                <g key={id}>
                  <g className="vz-node" style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
                    <rect width={BW} height={BH} rx={9} fill={isCh ? 'var(--vz-write-bg)' : isPoint ? 'var(--vz-point-bg)' : 'var(--vz-surface)'} stroke={isCh ? 'var(--vz-write)' : isPoint ? 'var(--vz-point)' : 'var(--vz-line-2)'} strokeWidth={isPoint || isCh ? 2.6 : 1.8} />
                    <line x1={BW - 18} y1={0} x2={BW - 18} y2={BH} stroke="var(--vz-line)" />
                    <text x={(BW - 18) / 2} y={BH / 2 + 4.5} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--vz-ink)">{fmt(nodes[id].val, language, 4)}</text>
                    <circle cx={BW - 9} cy={BH / 2} r={3.2} fill={hasNext ? 'var(--vz-ink-3)' : 'var(--vz-line-2)'} />
                    <LabelPills labels={labels} id={id} x={(BW - 18) / 2} y={-2} />
                  </g>
                  {sameRow && <line x1={p.x + BW - 9} y1={p.y + BH / 2} x2={p.x + BW + GAP - 2} y2={p.y + BH / 2} stroke={isCh ? 'var(--vz-write)' : 'var(--vz-ink-3)'} strokeWidth="1.8" markerEnd={isCh ? 'url(#vz-arr-w)' : 'url(#vz-arr)'} />}
                  {target && !sameRow && !(c.cycleTo !== null && i === c.ids.length - 1) && (
                    <path d={`M ${p.x + BW - 9} ${p.y + BH / 2} C ${p.x + BW - 9} ${p.y + BH + 28}, ${target.x + BW / 2} ${target.y - 22}, ${target.x + BW / 2} ${target.y - 2}`} fill="none" stroke="var(--vz-ink-3)" strokeWidth="1.6" markerEnd="url(#vz-arr)" />
                  )}
                  {doubly && nodes[id].prev !== null && slots.has(nodes[id].prev) && (
                    <circle cx={p.x + 9} cy={p.y + BH + 8} r={2.5} fill="var(--vz-ink-3)" opacity="0.6" />
                  )}
                </g>
              );
            })}
            {(() => {
              const last = c.ids[c.ids.length - 1];
              if (last === undefined) return null;
              const p = at(last);
              if (c.cycleTo !== null && slots.has(c.cycleTo)) {
                const t = at(c.cycleTo);
                const y = p.y + BH + 26;
                return (
                  <path d={`M ${p.x + BW - 9} ${p.y + BH / 2} C ${p.x + BW + 26} ${y + 20}, ${t.x + BW / 2 + 10} ${y + 24}, ${t.x + BW / 2} ${t.y + BH + 2}`} fill="none" stroke="var(--vz-write)" strokeWidth="2" strokeDasharray="5 3" markerEnd="url(#vz-arr-w)" />
                );
              }
              if (nodes[last].next === null || nodes[last].next === undefined) {
                const lastSlot = slots.get(last);
                const x = p.x + BW + GAP * 0.35;
                return (
                  <g>
                    <line x1={p.x + BW - 9} y1={p.y + BH / 2} x2={x + 4} y2={p.y + BH / 2} stroke="var(--vz-line-2)" strokeWidth="1.6" markerEnd="url(#vz-arr)" />
                    <text x={x + 8} y={p.y + BH / 2 + 4} fontSize="11" fill="var(--vz-ink-3)" fontWeight="600">{language === 'python' ? 'None' : 'null'}</text>
                    {lastSlot ? null : null}
                  </g>
                );
              }
              return null;
            })()}
          </g>
        ))}
      </svg>
      <NullPointers labels={labels} />
      <Legend items={legend} />
    </Card>
  );
}

// ── tries ──────────────────────────────────────────────────────────────────────────────────────
const END_FIELDS = ['end', 'isEnd', 'is_end', 'isWord', 'is_word', 'word', 'terminal', 'leaf', 'isLeaf', 'is_leaf', 'endOfWord', 'end_of_word'];

function trieNodes(data) {
  if (data.fromDict) return { list: data.trie, current: data.current?.id ?? null, added: new Set(data.added) };
  const { nodes, roots, labels, changed } = data;
  const list = [];
  const walk = (id, parent, ch) => {
    const r = nodes[id];
    if (!r) return;
    const end = END_FIELDS.some((f) => r.extra[f] === true || r.extra[f] === 1);
    list.push({ id: String(id), parent, ch, end });
    for (const c of r.children) walk(c.id, String(id), c.key);
  };
  roots.forEach((r) => walk(r, null, ''));
  const cur = labels.find((l) => l.id !== null && list.some((n) => n.id === String(l.id)));
  return { list, current: cur ? String(cur.id) : null, added: new Set(changed.map(String)) };
}

export function TrieLens({ panel, first }) {
  const { list, current, added } = trieNodes(panel.data);
  if (!list.length) return null;
  const kids = new Map();
  list.forEach((n) => { if (n.parent !== null) { if (!kids.has(n.parent)) kids.set(n.parent, []); kids.get(n.parent).push(n); } });
  const root = list.find((n) => n.parent === null);
  const { pos, width, height } = layoutTree([root.id], (id) => (kids.get(id) || []).map((n) => ({ id: n.id })));
  const W = Math.max(260, width * GX + PAD * 2);
  const H = height * GY + PAD + 24;
  const px = (id) => PAD + (pos.get(id)?.x ?? 0) * GX;
  const py = (id) => PAD + (pos.get(id)?.y ?? 0) * GY;
  const words = list.filter((n) => n.end).length;
  return (
    <Card title={panel.title} kind="trie" badges={[{ text: `${list.length - 1} letters` }, { text: `${words} words`, tone: 'done' }]} vars={panel.vars} wide first={first}>
      <svg className="vz-svg" viewBox={`0 0 ${W} ${H}`} style={{ maxHeight: 460 }} role="img" aria-label={`Trie ${panel.title}`}>
        {list.filter((n) => n.parent !== null && pos.has(n.id)).map((n) => (
          <g key={`e${n.id}`} className="vz-edge">
            <line x1={px(n.parent)} y1={py(n.parent)} x2={px(n.id)} y2={py(n.id)} stroke="var(--vz-line-2)" strokeWidth="1.8" />
            <text x={(px(n.parent) + px(n.id)) / 2 + (px(n.id) >= px(n.parent) ? 9 : -9)} y={(py(n.parent) + py(n.id)) / 2 + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--vz-ink-2)">{n.ch}</text>
          </g>
        ))}
        {list.filter((n) => pos.has(n.id)).map((n) => {
          const isCur = current === n.id;
          const isNew = added.has(n.id);
          return (
            <g key={n.id} className="vz-node" style={{ transform: `translate(${px(n.id)}px, ${py(n.id)}px)` }}>
              {n.end && <circle r={NR + 4} fill="none" stroke="var(--vz-done)" strokeWidth="2" />}
              <circle r={NR - 5} fill={isCur ? 'var(--vz-point-bg)' : isNew ? 'var(--vz-write-bg)' : n.end ? 'var(--vz-done-bg)' : 'var(--vz-surface)'} stroke={isCur ? 'var(--vz-point)' : isNew ? 'var(--vz-write)' : 'var(--vz-line-2)'} strokeWidth={isCur ? 3 : 1.8} />
              {n.parent === null && <text textAnchor="middle" dy="3.5" fontSize="9" fontWeight="700" fill="var(--vz-ink-3)">root</text>}
            </g>
          );
        })}
      </svg>
      <Legend items={[{ label: 'end of a word', color: 'var(--vz-done-bg)', border: 'solid' }, LEGEND.point, LEGEND.write]} />
    </Card>
  );
}
