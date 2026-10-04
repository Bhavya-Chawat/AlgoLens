import { useMemo } from 'react';
import { Card, Legend } from './Card.jsx';
import { LEGEND, fmt, fmtCell, infinityIn, isInfinity, useViz } from './kit.js';
import { layoutGraph } from './layout.js';

const R = 19;
const PALETTE = ['#cbd5e1', '#fca5a5', '#93c5fd', '#86efac', '#fcd34d', '#c4b5fd', '#f9a8d4', '#fdba74'];

const keyOf = (a, b, directed) => (directed || a === b ? `${a}>${b}` : a < b ? `${a}-${b}` : `${b}-${a}`);

function shorten(a, b, by) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: a.x + (dx / d) * by, y: a.y + (dy / d) * by, ux: dx / d, uy: dy / d };
}

function Edge({ e, p1, p2, directed, curved, state, markerId }) {
  if (e.from === e.to) {
    const { x, y } = p1;
    return (
      <g className="vz-edge">
        <path d={`M ${x - 8} ${y - R + 2} C ${x - 30} ${y - 54}, ${x + 30} ${y - 54}, ${x + 8} ${y - R + 2}`} fill="none" stroke="var(--vz-line-2)" strokeWidth="1.6" markerEnd={directed ? `url(#${markerId}-n)` : undefined} />
      </g>
    );
  }
  const a = shorten(p1, p2, R);
  const b = shorten(p2, p1, R + (directed ? 5 : 0));
  const nx = -a.uy;
  const ny = a.ux;
  const bend = curved ? 20 : 0;
  const mx = (a.x + b.x) / 2 + nx * bend;
  const my = (a.y + b.y) / 2 + ny * bend;
  const d = curved ? `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}` : `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  const tone = state === 'now' ? 'var(--vz-point)' : state === 'tree' ? 'var(--vz-done)' : 'var(--vz-line-2)';
  const width = state === 'now' ? 3.2 : state === 'tree' ? 2.6 : 1.6;
  const marker = directed ? `url(#${markerId}-${state === 'now' ? 'p' : state === 'tree' ? 'd' : 'n'})` : undefined;
  const lx = (curved ? mx * 0.5 + (a.x + b.x) * 0.25 : (a.x + b.x) / 2) + nx * 10;
  const ly = (curved ? my * 0.5 + (a.y + b.y) * 0.25 : (a.y + b.y) / 2) + ny * 10;
  return (
    <g className="vz-edge">
      <path d={d} fill="none" stroke={tone} strokeWidth={width} markerEnd={marker} strokeLinecap="round" />
      {e.w !== undefined && e.w !== null && (
        <g>
          <rect x={lx - 10} y={ly - 8} width={20} height={15} rx={5} fill="var(--vz-surface)" stroke="var(--vz-line)" />
          <text x={lx} y={ly + 3.5} textAnchor="middle" fontSize="10" fontWeight="600" fill={state === 'now' ? 'var(--vz-point)' : 'var(--vz-ink-2)'}>{fmt(e.w)}</text>
        </g>
      )}
    </g>
  );
}

export default function GraphLens({ panel, first }) {
  const { model, language } = useViz();
  const { data } = panel;
  const { nodes, edges, directed, overlays: O, edgeNow, universe, labels: nodeText } = data;
  const extraNames = Object.keys(O.extra || {});
  const distMixed = infinityIn(Object.values(O.dist));
  const markerId = `m${panel.id.replace(/[^a-z0-9]/gi, '')}`;

  const W = 640;
  const H = Math.min(440, 280 + Math.max(0, (universe.nodes.length - 6)) * 16);
  const layout = useMemo(() => {
    const key = `glayout:${panel.id}:${universe.nodes.length}:${universe.edges.length}:${directed}`;
    if (model?.cache.has(key)) return model.cache.get(key);
    const l = layoutGraph(universe.nodes.length ? universe.nodes : nodes, universe.edges.length ? universe.edges : edges, directed, { width: W, height: H });
    model?.cache.set(key, l);
    return l;
  }, [model, panel.id, universe, nodes, edges, directed, H]);

  const present = new Set(nodes);
  const visited = new Set(O.visited);
  const frontier = new Set(O.frontier);
  const treeEdges = new Set(Object.entries(O.parent).map(([child, par]) => keyOf(par, child, directed)));
  const chosen = new Set(O.chosen);
  const pairs = new Set(edges.map((e) => `${e.from}>${e.to}`));
  const drawn = new Map();
  edges.forEach((e) => drawn.set(`${e.from}>${e.to}`, e));

  const legend = [];
  if (O.current) legend.push({ ...LEGEND.point, label: `current (${O.current.name})` });
  if (O.next) legend.push({ label: `looking at (${O.next.name})`, color: 'var(--vz-read-bg)', border: 'solid' });
  if (visited.size) legend.push({ ...LEGEND.done, label: `visited (${O.names.visited || ''})` });
  if (frontier.size) legend.push({ ...LEGEND.front, label: 'in queue / heap' });
  if (Object.keys(O.parent).length || chosen.size) legend.push({ label: 'tree / chosen edges', color: 'var(--vz-done)', border: 'solid' });

  const badges = [{ text: `${nodes.length} nodes · ${edges.length} edges` }];
  if (data.weighted) badges.push({ text: 'weighted' });
  badges.push({ text: directed ? 'directed' : 'undirected' });

  return (
    <Card title={panel.title} kind="graph" badges={badges} vars={panel.vars} wide first={first}>
      <svg className="vz-svg" viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={`Graph ${panel.title}`}>
        <defs>
          {[['n', 'var(--vz-line-2)'], ['p', 'var(--vz-point)'], ['d', 'var(--vz-done)']].map(([k, c]) => (
            <marker key={k} id={`${markerId}-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
            </marker>
          ))}
        </defs>
        {edges.map((e) => {
          const p1 = layout.pos.get(e.from);
          const p2 = layout.pos.get(e.to);
          if (!p1 || !p2) return null;
          const k = keyOf(e.from, e.to, directed);
          const state = k === edgeNow ? 'now' : treeEdges.has(k) || chosen.has(k) ? 'tree' : 'plain';
          const curved = directed && pairs.has(`${e.to}>${e.from}`) && e.from !== e.to;
          return <Edge key={`${e.from}>${e.to}`} e={e} p1={p1} p2={p2} directed={directed} curved={curved} state={state} markerId={markerId} />;
        })}
        {[...layout.pos.entries()].filter(([id]) => present.has(id)).map(([id, p]) => {
          const isCur = O.current?.id === id;
          const isNext = O.next?.id === id;
          const isVisited = visited.has(id);
          const isFront = frontier.has(id);
          const color = O.colors[id];
          let fill = 'var(--vz-surface)';
          let stroke = 'var(--vz-line-2)';
          let sw = 1.8;
          if (color !== undefined) {
            // a tint of the surface, not a solid pastel: the label stays readable in dark mode too
            const base = PALETTE[Math.abs(Number(color)) % PALETTE.length] || PALETTE[0];
            fill = `color-mix(in srgb, ${base} 45%, var(--vz-surface))`;
            stroke = base;
          }
          if (isVisited) { fill = 'var(--vz-done-bg)'; stroke = 'var(--vz-done)'; sw = 2; }
          if (isFront) { stroke = 'var(--vz-front)'; sw = 2.4; }
          if (isNext) { stroke = 'var(--vz-read)'; sw = 3; }
          if (isCur) { fill = 'var(--vz-point-bg)'; stroke = 'var(--vz-point)'; sw = 3.2; }
          const dist = O.dist[id];
          const indeg = O.indegree[id];
          const order = O.order[id];
          return (
            <g key={id} className="vz-node" style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
              {isCur && <circle r={R + 6} fill="none" stroke="var(--vz-point)" strokeOpacity="0.35" strokeWidth="3" />}
              <circle r={R} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray={isFront && !isVisited && !isCur && !isNext ? '4 3' : undefined} />
              <text textAnchor="middle" dy="4.5" fontSize="13" fontWeight="700" fill="var(--vz-ink)">{(() => { const t = String(nodeText?.[id] ?? id); return t.length > 3 ? `${t.slice(0, 3)}…` : t; })()}</text>
              {dist === undefined && extraNames.length > 0 && (
                <g transform={`translate(0, ${R + 12})`}>
                  <rect x={-17} y={-9} width={34} height={16} rx={6} fill="var(--vz-surface)" stroke="var(--vz-line)" />
                  <text textAnchor="middle" dy="3" fontSize="10" fontWeight="700" fill="var(--vz-ink-2)">{extraNames.map((n) => fmt(O.extra[n][id], language)).join('/')}</text>
                </g>
              )}
              {dist !== undefined && (
                <g transform={`translate(0, ${R + 12})`}>
                  <rect x={-14} y={-9} width={28} height={16} rx={6} fill="var(--vz-surface)" stroke="var(--vz-line)" />
                  <text textAnchor="middle" dy="3" fontSize="10.5" fontWeight="700" fill={isInfinity(dist, distMixed) ? 'var(--vz-ink-3)' : 'var(--vz-ink)'}>{fmtCell(dist, language, 14, distMixed)}</text>
                </g>
              )}
              {indeg !== undefined && (
                <g transform={`translate(${R - 2}, ${-R + 2})`}>
                  <circle r={8} fill="var(--vz-surface-3)" stroke="var(--vz-line-2)" />
                  <text textAnchor="middle" dy="3" fontSize="9.5" fontWeight="700" fill="var(--vz-ink-2)">{indeg}</text>
                </g>
              )}
              {order !== undefined && (
                <g transform={`translate(${-R + 2}, ${-R + 2})`}>
                  <circle r={8} fill="var(--vz-done)" />
                  <text textAnchor="middle" dy="3" fontSize="9.5" fontWeight="700" fill="var(--vz-surface)">{order}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      {legend.length > 0 && <Legend items={legend} />}
      {(Object.keys(O.dist).length > 0 || Object.keys(O.indegree).length > 0 || extraNames.length > 0) && (
        <div className="vz-note">
          {Object.keys(O.dist).length > 0 && <>badge under a node = {O.names.dist || 'distance'}</>}
          {Object.keys(O.dist).length === 0 && extraNames.length > 0 && <>badge under a node = {extraNames.join(' / ')}</>}
          {Object.keys(O.indegree).length > 0 && <> · grey dot = in-degree ({O.names.indegree})</>}
        </div>
      )}
    </Card>
  );
}
