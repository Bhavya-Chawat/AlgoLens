import { useMemo, useState } from 'react';
import { Card, Legend } from './Card.jsx';
import { LEGEND, TONE_COLOR, fmt, fmtCell, infinityIn, isInfinity, storyLegend, useViz } from './kit.js';
import { layoutGraph } from './layout.js';
import { recognize } from '../recognize.js';
import {
  DENSE_EDGES, chain, chosenSummary, graphChanges, keyOf, orderList, pathCost, pathEdgeKeys, pathToRoot, radiusFor,
} from './graphView.js';

const PALETTE = ['#cbd5e1', '#fca5a5', '#93c5fd', '#86efac', '#fcd34d', '#c4b5fd', '#f9a8d4', '#fdba74'];

// a tint of the surface, not a solid pastel: the label stays readable in dark mode too
const tint = (color) => `color-mix(in srgb, ${PALETTE[Math.abs(Number(color)) % PALETTE.length] || PALETTE[0]} 45%, var(--vz-surface))`;
const base = (color) => PALETTE[Math.abs(Number(color)) % PALETTE.length] || PALETTE[0];

function shorten(a, b, by) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: a.x + (dx / d) * by, y: a.y + (dy / d) * by, ux: dx / d, uy: dy / d };
}

const WIDTH = { now: 3.4, path: 3, tree: 2.6 };
const COLOR = { now: 'var(--vz-point)', path: 'var(--vz-point)', tree: 'var(--vz-done)' };
const MARKER = { now: 'p', path: 'p', tree: 'd' };

/** state: 'now' (the edge being looked at) | 'path' (on the path to the current node) | 'tree' (chosen / parent edge) | 'plain' */
function Edge({ e, p1, p2, directed, curved, state, markerId, r, dim, showLabel }) {
  const opacity = dim ? 0.16 : state === 'path' ? 0.75 : 1;
  if (e.from === e.to) {
    const { x, y } = p1;
    return (
      <g className="vz-edge" opacity={opacity}>
        <path d={`M ${x - 8} ${y - r + 2} C ${x - 30} ${y - 54}, ${x + 30} ${y - 54}, ${x + 8} ${y - r + 2}`} fill="none" stroke="var(--vz-line-2)" strokeWidth="1.6" markerEnd={directed ? `url(#${markerId}-n)` : undefined} />
      </g>
    );
  }
  const a = shorten(p1, p2, r);
  const b = shorten(p2, p1, r + (directed ? 5 : 0));
  const nx = -a.uy;
  const ny = a.ux;
  const bend = curved ? 20 : 0;
  const mx = (a.x + b.x) / 2 + nx * bend;
  const my = (a.y + b.y) / 2 + ny * bend;
  const d = curved ? `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}` : `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  const lx = (curved ? mx * 0.5 + (a.x + b.x) * 0.25 : (a.x + b.x) / 2) + nx * 10;
  const ly = (curved ? my * 0.5 + (a.y + b.y) * 0.25 : (a.y + b.y) / 2) + ny * 10;
  return (
    <g className="vz-edge" opacity={opacity}>
      <path
        d={d} fill="none" stroke={COLOR[state] || 'var(--vz-line-2)'} strokeWidth={WIDTH[state] || 1.6} strokeLinecap="round"
        markerEnd={directed ? `url(#${markerId}-${MARKER[state] || 'n'})` : undefined}
      />
      {showLabel && e.w !== undefined && e.w !== null && (
        <g>
          <rect x={lx - 10} y={ly - 8} width={20} height={15} rx={5} fill="var(--vz-surface)" stroke="var(--vz-line)" />
          <text x={lx} y={ly + 3.5} textAnchor="middle" fontSize="10" fontWeight="600" fill={state === 'now' || state === 'path' ? 'var(--vz-point)' : 'var(--vz-ink-2)'}>{fmt(e.w)}</text>
        </g>
      )}
    </g>
  );
}

/**
 * A graph at one step of an algorithm. Besides the state (current node, visited, waiting in a queue, distances,
 * parents, colours) it shows what that step *changed* (amber), the path from the source to the current node along
 * the parent pointers, and, on hover or focus, one node's edges and neighbours. Nothing here knows which algorithm
 * it is: BFS, Dijkstra, a topological sort or an MST differ only in which overlays the recogniser found.
 */
export default function GraphLens({ panel, first }) {
  const { model, language, frameIdx } = useViz();
  const { data } = panel;
  const { nodes, edges, directed, overlays: O, edgeNow, universe, labels: nodeText } = data;
  const [hover, setHover] = useState(null);
  const R = radiusFor(universe.nodes.length || nodes.length);
  const extraNames = Object.keys(O.extra || {});
  const distMixed = infinityIn(Object.values(O.dist));
  const storyNodes = new Map((panel.story?.nodes || []).map((m) => [String(m.id), m])); // marks from "Explain this run"
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
  const dense = edges.length > DENSE_EDGES;

  // what this step changed: this step's overlays against the step before (that one is already worked out and remembered)
  const prevOverlays = frameIdx > 0 && model ? recognize(model, frameIdx - 1).panels.find((p) => p.id === panel.id)?.data?.overlays : null;
  const changes = graphChanges(prevOverlays || null, O);
  const prevDist = prevOverlays?.dist || {};

  // the path from the source to the current node, following parent pointers
  const pathNodes = O.current && Object.keys(O.parent).length ? pathToRoot(O.parent, O.current.id) : [];
  const pathEdges = pathNodes.length >= 2 ? pathEdgeKeys(pathNodes, directed) : new Set();
  const cost = pathNodes.length >= 2 ? pathCost(edges, pathNodes, directed) : null;

  // hovering (or tabbing to) a node brings its edges and neighbours forward and dims the rest
  const near = new Set();
  if (hover !== null) {
    near.add(hover);
    for (const e of edges) {
      if (e.from === hover) near.add(e.to);
      if (e.to === hover) near.add(e.from);
    }
  }
  const incident = (e) => hover !== null && (e.from === hover || e.to === hover);

  // one line each: what is being looked at, the path so far, the order so far, what has been chosen
  const arrow = directed ? '→' : '–';
  const eNow = edgeNow ? edges.find((e) => keyOf(e.from, e.to, directed) === edgeNow) : null;
  const order = orderList(O.order);
  const picked = chosenSummary(edges, chosen, directed);
  const chips = [];
  if (eNow) chips.push({ tone: 'read', text: `looking at ${eNow.from} ${arrow} ${eNow.to}${eNow.w !== undefined && eNow.w !== null ? ` (${fmt(eNow.w)})` : ''}` });
  if (pathNodes.length >= 2) chips.push({ tone: 'point', text: `path ${chain(pathNodes)}${cost !== null ? ` · cost ${cost}` : ''}` });
  if (order.length >= 2) chips.push({ tone: 'done', text: `order ${chain(order, 14)}` });
  if (picked.count) chips.push({ tone: 'done', text: `${picked.count} edge${picked.count === 1 ? '' : 's'} chosen${picked.weight !== null ? ` · total weight ${picked.weight}` : ''}` });

  const colorsUsed = [...new Set(Object.values(O.colors))].slice(0, 6);
  const legend = [];
  if (O.current) legend.push({ ...LEGEND.point, label: `current (${O.current.name})` });
  if (O.next) legend.push({ label: `looking at (${O.next.name})`, color: 'var(--vz-read-bg)', border: 'solid' });
  if (visited.size) legend.push({ ...LEGEND.done, label: `visited (${O.names.visited || ''})` });
  if (frontier.size) legend.push({ ...LEGEND.front, label: 'in queue / heap' });
  if (Object.keys(O.parent).length || chosen.size) legend.push({ label: 'tree / chosen edges', color: 'var(--vz-done)', border: 'solid' });
  if (pathEdges.size) legend.push({ label: 'path to current', color: 'var(--vz-point)', border: 'solid' });
  if (changes.any.size) legend.push({ label: 'changed this step', color: 'var(--vz-write-bg)', border: 'solid' });
  colorsUsed.forEach((c) => legend.push({ label: `${O.names.colors || 'colour'} ${c}`, color: tint(c), border: 'solid' }));
  legend.push(...storyLegend(panel.story?.nodes || []));

  const tipOf = (id) => {
    const bits = [`node ${nodeText?.[id] ?? id}`];
    const d = O.dist[id];
    if (d !== undefined) {
      const was = changes.dist.has(id) && prevDist[id] !== undefined ? ` (was ${fmtCell(prevDist[id], language, 14, distMixed)})` : '';
      bits.push(`${O.names.dist || 'distance'} ${fmtCell(d, language, 14, distMixed)}${was}`);
    }
    if (O.parent[id] !== undefined) bits.push(`reached from ${O.parent[id]}`);
    if (O.colors[id] !== undefined) bits.push(`${O.names.colors || 'colour'} ${O.colors[id]}`);
    if (O.order[id] !== undefined) bits.push(`number ${O.order[id]} in the order`);
    if (O.indegree[id] !== undefined) bits.push(`in-degree ${O.indegree[id]}`);
    const status = [O.current?.id === id && 'current', O.next?.id === id && 'being looked at', visited.has(id) && 'visited', frontier.has(id) && 'waiting'].filter(Boolean);
    if (status.length) bits.push(status.join(', '));
    if (changes.any.has(id)) bits.push('changed this step');
    return bits.join(' · ');
  };

  const fontSize = R >= 19 ? 13 : R >= 16 ? 12 : 11;
  const maxChars = R >= 19 ? 3 : 2;

  const badges = [{ text: `${nodes.length} nodes · ${edges.length} edges` }];
  if (data.weighted) badges.push({ text: 'weighted' });
  badges.push({ text: directed ? 'directed' : 'undirected' });

  return (
    <Card title={panel.title} kind="graph" badges={badges} vars={panel.vars} wide first={first}>
      {chips.length > 0 && (
        <div className="vz-gchips" aria-live="polite">
          {chips.map((c) => <span key={c.text} className={`vz-badge ${c.tone}`}>{c.text}</span>)}
        </div>
      )}
      <svg className="vz-svg" style={{ minWidth: 420 }} viewBox={`0 0 ${layout.width} ${layout.height}`} role="group" aria-label={`Graph ${panel.title}`}>
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
          const state = k === edgeNow ? 'now' : pathEdges.has(k) ? 'path' : treeEdges.has(k) || chosen.has(k) ? 'tree' : 'plain';
          const curved = directed && pairs.has(`${e.to}>${e.from}`) && e.from !== e.to;
          return (
            <Edge
              key={`${e.from}>${e.to}`} e={e} p1={p1} p2={p2} directed={directed} curved={curved} state={state} markerId={markerId} r={R}
              dim={hover !== null && !incident(e)} showLabel={!dense || state !== 'plain' || incident(e)}
            />
          );
        })}
        {[...layout.pos.entries()].filter(([id]) => present.has(id)).map(([id, p]) => {
          const isCur = O.current?.id === id;
          const isNext = O.next?.id === id;
          const isVisited = visited.has(id);
          const isFront = frontier.has(id);
          const touched = changes.any.has(id);
          const color = O.colors[id];
          let fill = 'var(--vz-surface)';
          let stroke = 'var(--vz-line-2)';
          let sw = 1.8;
          if (color !== undefined) { fill = tint(color); stroke = base(color); }
          if (isVisited) { fill = 'var(--vz-done-bg)'; stroke = 'var(--vz-done)'; sw = 2; }
          if (isFront) { stroke = 'var(--vz-front)'; sw = 2.4; }
          if (isNext) { stroke = 'var(--vz-read)'; sw = 3; }
          if (isCur) { fill = 'var(--vz-point-bg)'; stroke = 'var(--vz-point)'; sw = 3.2; }
          const dist = O.dist[id];
          const indeg = O.indegree[id];
          const nodeOrder = O.order[id];
          const tip = tipOf(id);
          const label = String(nodeText?.[id] ?? id);
          return (
            <g
              key={id} className="vz-node" tabIndex={0} role="img" aria-label={tip}
              style={{ transform: `translate(${p.x}px, ${p.y}px)`, opacity: hover !== null && !near.has(id) ? 0.4 : 1, outline: 'none' }}
              onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(id)} onBlur={() => setHover(null)}
            >
              <title>{tip}</title>
              {touched && <circle key={`pulse-${frameIdx}`} className="vz-pulse" r={R + 2} fill="none" stroke="var(--vz-write)" strokeWidth="2.6" />}
              {touched && <circle r={R + 3.5} fill="none" stroke="var(--vz-write)" strokeWidth="1.5" opacity="0.8" />}
              {isCur && <circle r={R + 6} fill="none" stroke="var(--vz-point)" strokeOpacity="0.35" strokeWidth="3" />}
              <circle r={R} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray={isFront && !isVisited && !isCur && !isNext ? '4 3' : undefined} />
              <text textAnchor="middle" dy="4.5" fontSize={fontSize} fontWeight="700" fill="var(--vz-ink)">{label.length > maxChars ? `${label.slice(0, maxChars)}…` : label}</text>
              {storyNodes.has(String(id)) && (() => {
                const sn = storyNodes.get(String(id));
                const toneColor = TONE_COLOR[sn.tone] || TONE_COLOR.accent;
                return (
                  <g>
                    <circle r={R + 5} fill="none" stroke={toneColor} strokeWidth="2.4" strokeDasharray="3 3" />
                    {sn.label && <text textAnchor="middle" y={-R - 9} fontSize="10" fontWeight="700" fill={toneColor}>{sn.label}</text>}
                  </g>
                );
              })()}
              {dist === undefined && extraNames.length > 0 && (
                <g transform={`translate(0, ${R + 12})`}>
                  <rect x={-17} y={-9} width={34} height={16} rx={6} fill="var(--vz-surface)" stroke="var(--vz-line)" />
                  <text textAnchor="middle" dy="3" fontSize="10" fontWeight="700" fill="var(--vz-ink-2)">{extraNames.map((n) => fmt(O.extra[n][id], language)).join('/')}</text>
                </g>
              )}
              {dist !== undefined && (
                <g transform={`translate(0, ${R + 12})`}>
                  <rect x={-14} y={-9} width={28} height={16} rx={6} fill={changes.dist.has(id) ? 'var(--vz-write-bg)' : 'var(--vz-surface)'} stroke={changes.dist.has(id) ? 'var(--vz-write)' : 'var(--vz-line)'} />
                  <text textAnchor="middle" dy="3" fontSize="10.5" fontWeight="700" fill={changes.dist.has(id) ? 'var(--vz-write)' : isInfinity(dist, distMixed) ? 'var(--vz-ink-3)' : 'var(--vz-ink)'}>{fmtCell(dist, language, 14, distMixed)}</text>
                </g>
              )}
              {indeg !== undefined && (
                <g transform={`translate(${R - 2}, ${-R + 2})`}>
                  <circle r={8} fill="var(--vz-surface-3)" stroke="var(--vz-line-2)" />
                  <text textAnchor="middle" dy="3" fontSize="9.5" fontWeight="700" fill="var(--vz-ink-2)">{indeg}</text>
                </g>
              )}
              {nodeOrder !== undefined && (
                <g transform={`translate(${-R + 2}, ${-R + 2})`}>
                  <circle r={8} fill="var(--vz-done)" />
                  <text textAnchor="middle" dy="3" fontSize="9.5" fontWeight="700" fill="var(--vz-surface)">{nodeOrder}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      {legend.length > 0 && <Legend items={legend} />}
      {(Object.keys(O.dist).length > 0 || Object.keys(O.indegree).length > 0 || extraNames.length > 0 || dense) && (
        <div className="vz-note">
          {Object.keys(O.dist).length > 0 && <>badge under a node = {O.names.dist || 'distance'}</>}
          {Object.keys(O.dist).length === 0 && extraNames.length > 0 && <>badge under a node = {extraNames.join(' / ')}</>}
          {Object.keys(O.indegree).length > 0 && <> · grey dot = in-degree ({O.names.indegree})</>}
          {dense && <> · hover a node to see its edges and weights</>}
        </div>
      )}
    </Card>
  );
}
