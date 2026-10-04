import { Component, useMemo, useState } from 'react';
import './viz.css';
import { VizContext } from './kit.js';
import ArrayLens from './ArrayLens.jsx';
import GridLens from './GridLens.jsx';
import GraphLens from './GraphLens.jsx';
import { TreeLens, LinkedLens, TrieLens } from './NodeLenses.jsx';
import { DsuLens, HeapLens, SegTreeLens, FenwickLens } from './StructLenses.jsx';
import {
  StackLens, QueueLens, HashLens, SetLens, IntervalsLens, BitsLens, VarsStrip,
} from './CollectionLenses.jsx';
import CallTreeLens from './CallTreeLens.jsx';

const LENSES = {
  array: ArrayLens, bars: ArrayLens, dp1: ArrayLens, string: ArrayLens,
  grid: GridLens, graph: GraphLens, dsu: DsuLens, tree: TreeLens, linked: LinkedLens, trie: TrieLens,
  heap: HeapLens, stack: StackLens, queue: QueueLens, hash: HashLens, set: SetLens,
  segtree: SegTreeLens, fenwick: FenwickLens, intervals: IntervalsLens, bits: BitsLens, calltree: CallTreeLens,
};

const MAX_VISIBLE = 8;

/** One broken lens must never take the whole canvas down. */
class LensBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(prev) { if (prev.panelKey !== this.props.panelKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="vz-card">
        <header className="vz-card-head"><span className="vz-card-title">{this.props.title}</span><span className="vz-badge">could not draw this one</span></header>
        <div className="vz-card-body vz-note" style={{ margin: 0 }}>{String(this.state.error.message || this.state.error).slice(0, 160)}</div>
      </section>
    );
  }
}

/**
 * Lays the recognised panels out: the variables strip on top, then the structures as a responsive grid
 * (one column when narrow, two or three when the stage is wide; big structures span the full row).
 */
export default function Stage({ result, model, language, frameIdx }) {
  const [showAll, setShowAll] = useState(false);
  const ctx = useMemo(() => ({ model, language, frameIdx }), [model, language, frameIdx]);
  const vars = result.panels.find((p) => p.lens === 'scalars');
  const structures = result.panels.filter((p) => p.lens !== 'scalars' && LENSES[p.lens]);
  const visible = showAll ? structures : structures.slice(0, MAX_VISIBLE);
  const hidden = structures.length - visible.length;
  return (
    <VizContext.Provider value={ctx}>
      <div className="vz-stage vz">
        {vars && <VarsStrip panel={vars} />}
        {structures.length === 0 && (
          <div className="vz-card" style={{ padding: 22, textAlign: 'center', color: 'var(--vz-ink-3)', fontSize: 13 }}>
            Nothing to draw yet - the variables above are all there is at this step.
          </div>
        )}
        <div className="vz-grid">
          {visible.map((panel, i) => {
            const Lens = LENSES[panel.lens];
            return (
              <LensBoundary key={panel.id} title={panel.title} panelKey={`${panel.id}:${frameIdx}`}>
                <Lens panel={panel} first={i === 0} />
              </LensBoundary>
            );
          })}
        </div>
        {hidden > 0 && (
          <button className="vz-badge" style={{ alignSelf: 'center', cursor: 'pointer', border: 'none', padding: '6px 14px', fontSize: 11 }} onClick={() => setShowAll(true)}>
            Show {hidden} more
          </button>
        )}
      </div>
    </VizContext.Provider>
  );
}
