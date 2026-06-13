import React, { useMemo, useCallback } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  detectStructures,
  buildCallTree,
  layoutTree,
} from './detectStructures';
import {
  ArrayVisualizer,
  HashMapVisualizer,
  GenericBoard,
  RecursionTreeViz,
  LinkedListVisualizer,
  TreeVisualizer,
  StackVisualizer,
  QueueVisualizer,
  GraphVisualizer
} from './Visualizers';

// ============================================================
// BUG BANNER
// ============================================================
function BugBanner({ bugs, currentFrame, onJumpToBug }) {
  const activeBug = useMemo(
    () => bugs.find((b) => b.frameId === currentFrame) ?? bugs[0] ?? null,
    [bugs, currentFrame],
  );
  if (!activeBug) return null;

  const sev = activeBug.severity === 'warning';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 16px',
      background: sev ? 'rgba(231,195,106,0.12)' : 'rgba(224,82,82,0.10)',
      borderBottom: `1px solid ${sev ? 'rgba(231,195,106,0.3)' : 'rgba(224,82,82,0.25)'}`,
      flexShrink: 0, zIndex: 10,
    }}>
      <AlertTriangle
        size={14}
        style={{ color: sev ? '#B08A30' : '#C05540', flexShrink: 0 }}
      />
      <span style={{
        flex: 1, fontSize: 12,
        color: sev ? '#8C6A14' : '#C05540',
        fontFamily: 'var(--font-mono)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {activeBug.description}
      </span>
      {activeBug.frameId !== currentFrame && (
        <button
          onClick={() => onJumpToBug(activeBug.frameId)}
          style={{
            padding: '3px 10px',
            background: sev ? 'rgba(231,195,106,0.2)' : 'rgba(224,82,82,0.15)',
            border: `1px solid ${sev ? 'rgba(231,195,106,0.4)' : 'rgba(224,82,82,0.3)'}`,
            borderRadius: 6,
            color: sev ? '#8C6A14' : '#C05540',
            fontSize: 11, fontFamily: 'var(--font-sans)',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          Jump to frame {activeBug.frameId}
        </button>
      )}
    </div>
  );
}

// ============================================================
// CANVAS CONTROLS OVERLAY
// ============================================================
function CanvasControls({ currentFrame, totalFrames, description, onStep }) {
  const pct = totalFrames > 1 ? (currentFrame / (totalFrames - 1)) * 100 : 0;

  return (
    <div style={{
      position: 'absolute', bottom: 16, left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 16px',
      background: 'var(--glass-bg)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      border: '1px solid var(--border)',
      borderRadius: 24,
      boxShadow: 'var(--shadow-panel)',
      zIndex: 20,
      maxWidth: 'calc(100% - 80px)',
    }}>
      {/* Step back */}
      <button
        id="canvas-step-back"
        onClick={() => onStep(-1)}
        disabled={currentFrame <= 0}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: currentFrame <= 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
          cursor: currentFrame <= 0 ? 'not-allowed' : 'pointer',
          transition: 'all var(--motion-standard)',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { if (currentFrame > 0) e.currentTarget.style.background = 'var(--border)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <ChevronLeft size={14} />
      </button>

      {/* Frame description */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        minWidth: 0, maxWidth: 360,
      }}>
        <span style={{
          fontSize: 10, fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)', flexShrink: 0,
        }}>
          {currentFrame + 1}/{totalFrames}
        </span>
        <span style={{
          width: 1, height: 12, background: 'var(--border)',
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: 11, fontFamily: 'var(--font-mono)',
          color: 'var(--text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {description || '–'}
        </span>
      </div>

      {/* Step forward */}
      <button
        id="canvas-step-fwd"
        onClick={() => onStep(1)}
        disabled={currentFrame >= totalFrames - 1}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: currentFrame >= totalFrames - 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
          cursor: currentFrame >= totalFrames - 1 ? 'not-allowed' : 'pointer',
          transition: 'all var(--motion-standard)',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { if (currentFrame < totalFrames - 1) e.currentTarget.style.background = 'var(--border)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

// ============================================================
// EMPTY CANVAS
// ============================================================
function EmptyCanvas() {
  const { update } = useApp();
  return (
    <div className="animate-fade-in" style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 40,
    }}>
      <div style={{
        background: 'var(--glass-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid var(--border)', borderRadius: 24, padding: '40px 60px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        boxShadow: '0 24px 60px rgba(0,0,0,0.1)'
      }}>
        
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '-0.02em' }}>Ready to Visualize</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 280, marginBottom: 32, lineHeight: 1.5 }}>
          Your execution timeline is empty. Return to the editor to write code and debug visually.
        </p>

        <button 
          onClick={() => update({ view: 'editor' })}
          style={{
            padding: '10px 24px', background: 'var(--text-primary)', color: 'var(--bg-card)',
            border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            transition: 'transform 150ms ease, opacity 150ms ease',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.opacity = 0.9; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = 1; }}
        >
          Return to Editor
        </button>
      </div>
    </div>
  );
}

// ============================================================
// EXECUTION CANVAS — Main orchestrator
// ============================================================
const ExecutionCanvas = React.memo(function ExecutionCanvas({
  trace, frameIndex, bugs, onStepReq, onJumpReq, hideControls, isDiffMode, diffFrameIndex
}) {
  const { state, update } = useApp();
  
  const executionTrace = trace || state.executionTrace;
  const currentFrame = frameIndex !== undefined ? frameIndex : state.currentFrame;
  const detectedBugs = bugs || state.detectedBugs;

  const total  = executionTrace.length;
  const frame  = executionTrace[currentFrame] ?? null;
  const prevF  = currentFrame > 0 ? executionTrace[currentFrame - 1] : null;

  // ── Step handler ───────────────────────────────────────────
  const handleStep = useCallback((delta) => {
    if (onStepReq) {
      onStepReq(delta);
    } else {
      update({
        currentFrame: Math.max(0, Math.min(total - 1, currentFrame + delta)),
        isPlaying: false,
      });
    }
  }, [currentFrame, total, update, onStepReq]);

  // ── Jump to bug ────────────────────────────────────────────
  const handleJumpToBug = useCallback((frameId) => {
    if (onJumpReq) {
      onJumpReq(frameId);
    } else {
      update({ currentFrame: frameId, isPlaying: false });
    }
  }, [update, onJumpReq]);

  // ── Keyboard step ──────────────────────────────────────────
  React.useEffect(() => {
    if (state.view !== 'visualizer') return;
    if (onStepReq) return; // parent handles hotkeys if props are provided

    const handler = (e) => {
      if (e.key === 'ArrowRight') handleStep(1);
      if (e.key === 'ArrowLeft')  handleStep(-1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleStep, state.view]);

  // ── Detect structures ──────────────────────────────────────
  const detected = useMemo(() => detectStructures(frame), [frame]);

  // ── Build recursion tree (memo on frame index) ─────────────
  const callTree = useMemo(() => {
    if (detected.type !== 'recursion') return null;
    const { nodes, roots } = buildCallTree(executionTrace, currentFrame);
    if (!nodes.length) return null;
    const dims = layoutTree(nodes, roots);
    return { nodes, roots, dims };
  }, [detected.type, executionTrace, currentFrame]);

  const prevVars = prevF?.variables ?? {};

  // ── Bug frame indicator ────────────────────────────────────
  const isBugFrame = frame?.isBugFrame ?? false;

  const [zoom, setZoom] = React.useState(1);

  if (!total || !frame) {
    return <EmptyCanvas />;
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', position: 'relative',
      outline: isBugFrame ? '2px solid rgba(224,82,82,0.5)' : (isDiffMode && currentFrame >= diffFrameIndex) ? '2px solid rgba(224,82,82,0.3)' : 'none',
      outlineOffset: -2,
      animation: isBugFrame ? 'bug-pulse 2s ease-in-out infinite' : 'none',
      background: (isDiffMode && currentFrame >= diffFrameIndex) ? 'rgba(224,82,82,0.03)' : 'transparent',
    }}>
      {/* Zoom Controls Overlay */}
      <div style={{
        position: 'absolute', top: 24, right: 24, zIndex: 40,
        display: 'flex', alignItems: 'center', gap: 4,
        background: 'var(--glass-bg)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        padding: 4, borderRadius: 8,
        border: '1px solid var(--border)', boxShadow: 'var(--shadow-panel)',
      }}>
        <button onClick={() => setZoom(Math.max(0.2, zoom - 0.2))} style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', borderRadius: 4 }} onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <ZoomOut size={14} />
        </button>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', width: 36, textAlign: 'center', color: 'var(--text-muted)' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={() => setZoom(Math.min(3, zoom + 0.2))} style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', borderRadius: 4 }} onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <ZoomIn size={14} />
        </button>
        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
        <button onClick={() => setZoom(1)} style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', borderRadius: 4 }} onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} title="Reset Zoom">
          <Maximize size={14} />
        </button>
      </div>

      {/* Bug banner */}
      {(detectedBugs.length > 0 || isBugFrame) && (
        <BugBanner
          bugs={detectedBugs.length > 0 ? detectedBugs : [{ frameId: currentFrame, description: frame.description, severity: 'error' }]}
          currentFrame={currentFrame}
          onJumpToBug={handleJumpToBug}
        />
      )}

      {/* Main content — scrollable */}
      <div style={{
        flex: 1, minHeight: 0,
        overflowY: 'auto', overflowX: 'auto',
      }}>
        <div style={{
          padding: '32px 40px 80px',
          display: 'flex', flexDirection: 'column', gap: 32,
          alignItems: 'flex-start',
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          transition: 'transform 150ms ease',
          minWidth: 'max-content',
        }}>        {/* ── EVENT TYPE BADGE ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <EventBadge type={frame.eventType} />
          <span style={{
            fontSize: 12, fontFamily: 'var(--font-mono)',
            color: 'var(--canvas-text-muted)',
          }}>
            line {frame.line}
          </span>
          {state.detectedAlgorithm && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--bg-canvas)', border: '1px solid var(--accent-sage)',
              padding: '2px 8px', borderRadius: 12, marginLeft: 16
            }}>
              <Zap size={12} style={{ color: 'var(--accent-sage)' }} />
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent-sage)', fontWeight: 600 }}>
                {state.detectedAlgorithm}
              </span>
            </div>
          )}
        </div>

        {/* ── RECURSION TREE ── */}
        {callTree && (
          <Section label="Call Stack Tree">
            <RecursionTreeViz
              nodes={callTree.nodes}
              roots={callTree.roots}
              layoutDims={callTree.dims}
            />
          </Section>
        )}

        {/* ── ARRAY + POINTERS ── */}
        {(detected.type === 'array' || detected.type === 'array_hashmap' || detected.type === 'recursion') &&
          detected.mainArray && (
            <Section label={`Array — ${detected.mainArray.name}`}>
              <ArrayVisualizer
                mainArray={detected.mainArray}
                pointers={detected.pointers}
                isBugFrame={isBugFrame}
                prevVars={prevVars}
              />
            </Section>
        )}

        {/* ── STACKS ── */}
        {detected.stacks && detected.stacks.length > 0 && (
          <Section label="Stack">
            {detected.stacks.map((stack, idx) => (
              <StackVisualizer
                key={idx}
                stackData={stack}
                prevVars={prevVars}
              />
            ))}
          </Section>
        )}

        {/* ── QUEUES ── */}
        {detected.queues && detected.queues.length > 0 && (
          <Section label="Queue">
            {detected.queues.map((queue, idx) => (
              <QueueVisualizer
                key={idx}
                queueData={queue}
                prevVars={prevVars}
              />
            ))}
          </Section>
        )}

        {/* ── GRAPHS ── */}
        {detected.graphs && detected.graphs.length > 0 && (
          <Section label="Graph">
            {detected.graphs.map((graph, idx) => (
              <GraphVisualizer
                key={idx}
                graphData={graph}
                prevVars={prevVars}
              />
            ))}
          </Section>
        )}

        {/* ── LINKED LISTS ── */}
        {detected.linkedLists && detected.linkedLists.length > 0 && (
          <Section label="Linked List">
            {detected.linkedLists.map((ll, idx) => (
              <LinkedListVisualizer
                key={idx}
                listData={ll}
                pointers={detected.pointers}
                prevVars={prevVars}
              />
            ))}
          </Section>
        )}

        {/* ── TREES ── */}
        {detected.trees && detected.trees.length > 0 && (
          <Section label="Tree">
            {detected.trees.map((tree, idx) => (
              <TreeVisualizer
                key={idx}
                treeData={tree}
                pointers={detected.pointers}
                prevVars={prevVars}
              />
            ))}
          </Section>
        )}

        {/* ── HASHMAP ── */}
        {(detected.type === 'hashmap' || detected.type === 'array_hashmap') &&
          detected.hashmaps.length > 0 && (
            <Section label="Hash Map">
              <HashMapVisualizer
                hashmaps={detected.hashmaps}
                prevVars={prevVars}
              />
            </Section>
        )}

        {/* ── GENERIC BOARD ── */}
        {detected.type === 'generic' && (
          <Section label="Variables">
            <GenericBoard vars={detected.vars} />
          </Section>
        )}

        {/* ── ALWAYS SHOW REMAINING SCALAR VARS ── */}
        {detected.type !== 'generic' && Object.keys(detected.vars).length > 0 && (
          <ScalarRow vars={detected.vars} />
        )}
        </div>
      </div>

      {/* Canvas controls overlay */}
      {total > 0 && !hideControls && (
        <CanvasControls
          currentFrame={currentFrame}
          totalFrames={total}
          description={frame.description}
          onStep={handleStep}
        />
      )}
    </div>
  );
});

// ============================================================
// SECTION WRAPPER
// ============================================================
function Section({ label, children }) {
  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      <div style={{
        fontSize: 10, fontWeight: 600,
        color: 'var(--canvas-text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.1em',
        marginBottom: 12,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

// ============================================================
// SCALAR ROW — integer / bool / string variables beside array
// ============================================================
function ScalarRow({ vars }) {
  const scalars = Object.entries(vars).filter(([, info]) => {
    return ['int', 'float', 'bool', 'str', 'NoneType'].includes(info.type);
  });
  if (!scalars.length) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {scalars.map(([name, info]) => (
        <div
          key={name}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '5px 12px',
            background: info.changedThisFrame ? 'rgba(231,195,106,0.12)' : 'var(--bg-card)',
            border: `1px solid ${info.changedThisFrame ? 'rgba(231,195,106,0.5)' : 'var(--border)'}`,
            borderRadius: 20,
            transition: 'all 220ms ease',
          }}
        >
          <span style={{
            fontSize: 11, fontFamily: 'var(--font-mono)',
            color: 'var(--canvas-text-muted)',
          }}>
            {name}
          </span>
          <span style={{ width: 1, height: 10, background: 'var(--border)' }} />
          <span style={{
            fontSize: 12, fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            color: info.changedThisFrame ? '#B08A30' : 'var(--canvas-text-primary)',
            transition: 'color 220ms ease',
          }}>
            {String(info.value ?? 'None').slice(0, 20)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// EVENT TYPE BADGE
// ============================================================
const EVENT_BADGE_CONFIG = {
  function_call: { label: 'call',       bg: 'rgba(167,139,250,0.15)', text: '#7C3AED', border: 'rgba(167,139,250,0.35)' },
  assignment:    { label: 'assign',     bg: 'rgba(143,175,157,0.15)', text: '#2E6B50', border: 'rgba(143,175,157,0.35)' },
  comparison:    { label: 'compare',    bg: 'rgba(126,184,212,0.15)', text: '#1E6480', border: 'rgba(126,184,212,0.35)' },
  loop_start:    { label: 'loop',       bg: 'rgba(231,195,106,0.15)', text: '#8C6A14', border: 'rgba(231,195,106,0.35)' },
  branch:        { label: 'branch',     bg: 'rgba(212,155,132,0.15)', text: '#8B4A2C', border: 'rgba(212,155,132,0.35)' },
  return:        { label: 'return',     bg: 'rgba(16,185,129,0.12)',  text: '#065F46', border: 'rgba(16,185,129,0.35)' },
  exception:     { label: 'exception',  bg: 'rgba(224,82,82,0.12)',   text: '#9B1C1C', border: 'rgba(224,82,82,0.3)'  },
  line:          { label: 'line',       bg: 'rgba(156,163,175,0.12)', text: '#374151', border: 'rgba(156,163,175,0.3)' },
};

function EventBadge({ type }) {
  const cfg = EVENT_BADGE_CONFIG[type] ?? EVENT_BADGE_CONFIG.line;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600,
      fontFamily: 'var(--font-mono)',
      padding: '2px 9px',
      background: cfg.bg,
      color: cfg.text,
      border: `1px solid ${cfg.border}`,
      borderRadius: 20,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
    }}>
      {cfg.label}
    </span>
  );
}

export default ExecutionCanvas;
