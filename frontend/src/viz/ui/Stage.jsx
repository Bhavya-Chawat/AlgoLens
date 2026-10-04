import { Component, useMemo } from 'react';
import './viz.css';
import { VizContext } from './kit.js';
import { LENS_LABELS } from '../recognize.js';
import { PanelContext } from './panelContext.js';
import { usePanelPrefs } from './usePanelPrefs.js';
import { isFolded, isOpen, sizeOf } from './panelPrefs.js';
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
 * Lays the recognised panels out: the variables strip on top, a tray with one chip per panel, then the open panels
 * as a responsive grid (one column when narrow, two or three when the stage is wide; big structures span the row).
 *
 * The first few panels start open and the rest start in the tray, so a busy program is not a wall of pictures.
 * Every panel can be folded, closed (its chip stays in the tray) and resized, and the choice is remembered.
 */
export default function Stage({ result, model, language, frameIdx }) {
  const { prefs, setOpen, setFolded, setSize, reset } = usePanelPrefs(model.code);
  const ctx = useMemo(() => ({ model, language, frameIdx }), [model, language, frameIdx]);
  const vars = result.panels.find((p) => p.lens === 'scalars');
  const structures = result.panels.filter((p) => p.lens !== 'scalars' && LENSES[p.lens]);
  const open = structures.map((p, rank) => isOpen(prefs, p.id, rank));
  const shown = structures.filter((_, i) => open[i]);
  const arranged = Object.keys(prefs).length > 0;

  return (
    <VizContext.Provider value={ctx}>
      <div className="vz-stage vz">
        {vars && <VarsStrip panel={vars} />}
        {structures.length === 0 && (
          <div className="vz-card" style={{ padding: 22, textAlign: 'center', color: 'var(--vz-ink-3)', fontSize: 13 }}>
            Nothing to draw yet - the variables above are all there is at this step.
          </div>
        )}
        {structures.length > 0 && (structures.length > 1 || arranged) && (
          <div className="vz-tray" role="group" aria-label="Panels">
            {structures.map((p, i) => (
              <button
                key={p.id}
                className="vz-chip"
                data-open={open[i] ? '1' : '0'}
                aria-pressed={open[i]}
                title={`${open[i] ? 'Close' : 'Open'} the ${LENS_LABELS[p.lens] || p.lens} panel`}
                onClick={() => setOpen(p.id, !open[i])}
              >
                <i />
                {p.title}
              </button>
            ))}
            {arranged && <button className="vz-tray-link" onClick={reset} title="Forget what you opened, closed and resized">Reset layout</button>}
          </div>
        )}
        {structures.length > 0 && shown.length === 0 && (
          <div className="vz-card" style={{ padding: 18, textAlign: 'center', color: 'var(--vz-ink-3)', fontSize: 12.5 }}>
            Every panel is closed. Open one from the tray above.
          </div>
        )}
        <div className="vz-grid">
          {shown.map((panel, i) => {
            const Lens = LENSES[panel.lens];
            const control = {
              folded: isFolded(prefs, panel.id),
              setFolded: (folded) => setFolded(panel.id, folded),
              size: sizeOf(prefs, panel.id),
              setSize: (size) => setSize(panel.id, size),
              close: () => setOpen(panel.id, false),
            };
            return (
              <PanelContext.Provider key={panel.id} value={control}>
                <LensBoundary title={panel.title} panelKey={`${panel.id}:${frameIdx}`}>
                  <Lens panel={panel} first={i === 0} />
                </LensBoundary>
              </PanelContext.Provider>
            );
          })}
        </div>
      </div>
    </VizContext.Provider>
  );
}
