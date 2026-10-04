import React, { useMemo, useCallback, useState } from 'react';
import { AlertTriangle, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { buildModel } from '../viz/model.js';
import { recognize, LENS_LABELS } from '../viz/recognize.js';
import Stage from '../viz/ui/Stage.jsx';
import { fmt } from '../viz/ui/kit.js';

// ============================================================
// BUG BANNER
// ============================================================
function BugBanner({ bugs, currentFrame, onJumpToBug }) {
  const activeBug = useMemo(
    () => bugs.find((b) => b.frameId === currentFrame) ?? bugs[0] ?? null,
    [bugs, currentFrame],
  );
  if (!activeBug) return null;
  const warn = activeBug.severity === 'warning';
  return (
    <div className="vz-banner" data-tone={warn ? 'warn' : 'error'} role="alert">
      <AlertTriangle size={14} style={{ flexShrink: 0 }} />
      <span className="vz-banner-text">{activeBug.description}</span>
      {activeBug.frameId !== currentFrame && (
        <button onClick={() => onJumpToBug(activeBug.frameId)} className="vz-banner-btn">
          Jump to step {activeBug.frameId + 1}
        </button>
      )}
    </div>
  );
}

// ============================================================
// EMPTY CANVAS
// ============================================================
function EmptyCanvas() {
  const { update } = useApp();
  return (
    <div className="animate-fade-in" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{
        background: 'var(--glass-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid var(--border)', borderRadius: 24, padding: '40px 60px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.1)',
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '-0.02em' }}>Ready to visualise</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 300, marginBottom: 28, lineHeight: 1.5 }}>
          Run some code from the editor, or open one of the examples: graphs, DP tables, union-find, heaps, tries and more.
        </p>
        <button
          onClick={() => update({ view: 'editor' })}
          style={{ padding: '10px 24px', background: 'var(--text-primary)', color: 'var(--bg-card)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Back to the editor
        </button>
      </div>
    </div>
  );
}

// ============================================================
// EVENT BADGE
// ============================================================
const EVENT_LABEL = {
  function_call: 'call', loop_start: 'loop', comparison: 'compare', assignment: 'assign', return: 'return', branch: 'branch', exception: 'error', line: 'line',
};
const EVENT_TONE = { function_call: 'call', return: 'return', exception: 'error', loop_start: 'loop', comparison: 'cmp' };

function EventBadge({ type }) {
  return <span className="vz-event" data-tone={EVENT_TONE[type] || 'plain'}>{EVENT_LABEL[type] || 'step'}</span>;
}

// ============================================================
// "NOW EXECUTING" STRIP
// ============================================================
function NowStrip({ frame, source, result, language, zoom, setZoom, onResetView }) {
  const line = frame.line;
  const text = frame.eventType === 'function_call' ? frame.description : (source[line - 1] || frame.description || '').trim();
  const reads = result.accesses.filter((a) => a.kind === 'read').slice(0, 3);
  const writes = result.accesses.filter((a) => a.kind === 'write').slice(0, 3);
  const cell = (a) => `${a.name}${a.index.map((i) => `[${i}]`).join('')}`;
  const lenses = result.lenses.filter((l) => l !== 'scalars' && l !== 'calltree').slice(0, 3);
  return (
    <div className="vz-now">
      <EventBadge type={frame.eventType} />
      <span className="vz-now-line">line {line}</span>
      <code className="vz-now-code" title={text}>{text || '–'}</code>
      {reads.map((a) => <span key={`r${cell(a)}`} className="vz-badge read" title="this line reads">reads {cell(a)}</span>)}
      {writes.map((a) => <span key={`w${cell(a)}`} className="vz-badge write" title="this line writes">writes {cell(a)}</span>)}
      {frame.eventType === 'return' && !frame.unwinding && (
        <span className="vz-badge done" title="return value">returns {fmt(frame.returnValue, language, 28)}</span>
      )}
      <span style={{ flex: 1 }} />
      {lenses.map((l) => <span key={l} className="vz-badge">{LENS_LABELS[l] || l}</span>)}
      <div className="vz-zoom" role="group" aria-label="Zoom">
        <button onClick={() => setZoom(Math.max(0.5, +(zoom - 0.1).toFixed(2)))} aria-label="Zoom out"><ZoomOut size={14} /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(Math.min(1.6, +(zoom + 0.1).toFixed(2)))} aria-label="Zoom in"><ZoomIn size={14} /></button>
        <button onClick={onResetView} aria-label="Reset zoom"><Maximize size={14} /></button>
      </div>
    </div>
  );
}

// ============================================================
// EXECUTION CANVAS
// ============================================================
const ExecutionCanvas = React.memo(function ExecutionCanvas({
  trace, frameIndex, bugs, onJumpReq, isDiffMode, diffFrameIndex, code,
}) {
  const { state, update } = useApp();
  const [zoom, setZoom] = useState(1);

  const executionTrace = trace || state.executionTrace;
  const currentFrame = frameIndex !== undefined ? frameIndex : state.currentFrame;
  const detectedBugs = bugs || state.detectedBugs;
  const total = executionTrace.length;
  const frame = executionTrace[currentFrame] ?? null;

  // What was actually executed (not what is in the editor now) and in which language
  const source = code ?? (isDiffMode ? '' : state.lastExecutedCode || state.code || '');
  const language = state.traceMeta?.language || state.language;
  const lines = useMemo(() => String(source).split('\n'), [source]);
  const model = useMemo(() => buildModel(executionTrace, { code: source, language }), [executionTrace, source, language]);
  const result = useMemo(() => (frame ? recognize(model, currentFrame) : { panels: [], lenses: [], accesses: [] }), [model, currentFrame, frame]);

  const handleJumpToBug = useCallback((frameId) => {
    if (onJumpReq) onJumpReq(frameId);
    else update({ currentFrame: frameId, isPlaying: false });
  }, [update, onJumpReq]);

  if (!total || !frame) return <EmptyCanvas />;

  const isBugFrame = frame.isBugFrame ?? false;
  const diffHot = isDiffMode && currentFrame >= diffFrameIndex;
  return (
    <div
      className="vz-canvas vz"
      data-bug={isBugFrame ? '1' : undefined}
      style={{ outline: isBugFrame ? '2px solid rgba(224,82,82,0.5)' : diffHot ? '2px solid rgba(224,82,82,0.3)' : 'none', outlineOffset: -2, background: diffHot ? 'rgba(224,82,82,0.03)' : 'transparent' }}
    >
      {(detectedBugs.length > 0 || isBugFrame) && (
        <BugBanner
          bugs={detectedBugs.length > 0 ? detectedBugs : [{ frameId: currentFrame, description: frame.description, severity: 'error' }]}
          currentFrame={currentFrame}
          onJumpToBug={handleJumpToBug}
        />
      )}
      <NowStrip frame={frame} source={lines} result={result} language={language} zoom={zoom} setZoom={setZoom} onResetView={() => setZoom(1)} />
      <div
        className="vz-scroll"
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setZoom((z) => Math.max(0.5, Math.min(1.6, +(z + (e.deltaY > 0 ? -0.1 : 0.1)).toFixed(2))));
          }
        }}
      >
        <div style={{ zoom }}>
          <Stage result={result} model={model} language={language} frameIdx={currentFrame} />
        </div>
      </div>
    </div>
  );
});

export default ExecutionCanvas;
