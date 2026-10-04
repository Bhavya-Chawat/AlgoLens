import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, Repeat, Box } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { itemIndexFor } from '../../core/beats';

const BIG_OUTLINE = 250; // beyond this many nodes, only the path to the current frame starts open
const WINDOW = 5; // iterations shown around the current one in a long loop

const shown = (children) => children.filter((c) => c.kind !== 'frame');

function countNodes(nodes) {
  let n = 0;
  for (const node of nodes) {
    if (node.kind === 'frame') continue;
    n += 1 + countNodes(node.children);
  }
  return n;
}

/** ids of every node whose range contains `frame` */
function pathTo(nodes, frame, out = new Set()) {
  for (const node of nodes) {
    if (node.kind === 'frame') continue;
    if (frame >= node.start && frame <= node.end) {
      out.add(node.id);
      pathTo(node.children, frame, out);
    }
  }
  return out;
}

function iterationLabel(frames, it) {
  const header = frames[it.start];
  const vars = header ? Object.entries(header.variables || {}).filter(([, v]) => v.changedThisFrame) : [];
  const text = vars.slice(0, 3).map(([k, v]) => `${k}=${typeof v.value === 'object' ? '…' : String(v.value).slice(0, 10)}`).join(', ');
  return it.exit ? 'loop ends' : `#${it.n}${text ? `  ${text}` : ''}`;
}

export default function OutlineTab() {
  const { state, beats } = useApp();
  const frames = state.executionTrace;
  const cf = state.currentFrame;
  const [toggled, setToggled] = useState({});

  const nodes = beats.outline.nodes;
  const big = useMemo(() => countNodes(nodes) > BIG_OUTLINE, [nodes]);
  const onPath = useMemo(() => pathTo(nodes, cf), [nodes, cf]);

  if (!frames.length) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>The outline of calls and loops appears here after you visualise code.</div>;
  }
  if (nodes.every((n) => n.kind === 'frame')) {
    return <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>This run has no calls or loops to outline.</div>;
  }

  const isOpen = (node) => toggled[node.id] ?? (!big || onPath.has(node.id));
  const toggle = (node) => setToggled((t) => ({ ...t, [node.id]: !isOpen(node) }));
  const isFolded = (start) => beats.items[itemIndexFor(beats.items, start)]?.type === 'fold';

  const renderNodes = (list, level) => {
    let rows = shown(list);
    // a very long loop: keep the start, the end and a window around where you are
    if (rows.length > 60 && rows[0].kind === 'iteration') {
      const here = rows.findIndex((r) => cf >= r.start && cf <= r.end);
      const keep = new Set([0, 1, 2, rows.length - 3, rows.length - 2, rows.length - 1]);
      for (let k = Math.max(0, here - WINDOW); k <= Math.min(rows.length - 1, here + WINDOW); k += 1) keep.add(k);
      const out = [];
      let hidden = 0;
      rows.forEach((r, k) => {
        if (keep.has(k)) {
          if (hidden) out.push({ kind: 'gap', id: `gap-${k}`, count: hidden });
          hidden = 0;
          out.push(r);
        } else hidden += 1;
      });
      rows = out;
    }

    return rows.map((node) => {
      if (node.kind === 'gap') {
        return <div key={node.id} style={{ paddingLeft: 14 + level * 14, fontSize: 10, color: 'var(--text-muted)', padding: '2px 0 2px ' + (14 + level * 14) + 'px' }}>⋯ {node.count} more iterations (use the timeline to reach them)</div>;
      }
      const current = cf >= node.start && cf <= node.end;
      const kids = shown(node.children);
      const open = isOpen(node);
      const folded = node.kind === 'iteration' && isFolded(node.start);
      const label = node.kind === 'iteration' ? iterationLabel(frames, node) : node.kind === 'loop' ? `${node.label}  ×${node.count}` : node.label;

      return (
        <div key={node.id}>
          <div
            onClick={() => beats.goToFrame(node.start)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', paddingLeft: 8 + level * 14, cursor: 'pointer',
              background: current ? 'rgba(143,175,157,0.14)' : 'transparent',
              borderLeft: `2px solid ${current ? 'var(--accent-sage)' : 'transparent'}`,
              opacity: folded ? 0.55 : 1,
            }}
          >
            <span
              onClick={(e) => { e.stopPropagation(); if (kids.length) toggle(node); }}
              style={{ width: 14, display: 'inline-flex', justifyContent: 'center', color: 'var(--text-muted)' }}
            >
              {kids.length ? (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}
            </span>
            {node.kind === 'loop' && <Repeat size={11} style={{ color: '#B08A30', flexShrink: 0 }} />}
            {node.kind === 'call' && <Box size={11} style={{ color: '#7C3AED', flexShrink: 0 }} />}
            <span style={{
              fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: current ? 600 : 400,
            }}
            >
              {label}
            </span>
            {folded && <span style={{ fontSize: 9, color: '#6D5BB5', marginLeft: 'auto', flexShrink: 0 }}>folded</span>}
          </div>
          {open && kids.length > 0 && renderNodes(node.children, level + 1)}
        </div>
      );
    });
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', paddingBottom: 12 }}>
      <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, borderBottom: '1px solid var(--border)' }}>
        Calls, loops and iterations. Click any row to jump there; folded iterations open automatically.
      </div>
      {renderNodes(nodes, 0)}
    </div>
  );
}
