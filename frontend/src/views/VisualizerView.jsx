import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Zap, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import TopBar from '../components/TopBar';
import Timeline from '../components/Timeline';
import ExecutionCanvas from '../canvas/ExecutionCanvas';
import InspectorPanel from '../components/inspector/InspectorPanel';
import AIDebugAssistant from '../components/AIDebugAssistant';
import TestcaseLab from '../components/TestcaseLab';
import DiffDebugger from '../components/DiffDebugger';

// ============================================================
// BUGS PANEL (Moved to left panel below Code Editor)
// ============================================================
function BugsPanel() {
  const { state, update } = useApp();
  const bugs = state.detectedBugs;

  if (!bugs.length) return null;

  const sevColor = (s) => s === 'error' ? '#C05540' : '#B08A30';

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#C05540', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <AlertTriangle size={14} style={{ color: '#C05540' }} /> Bugs ({bugs.length})
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {bugs.map((b, i) => (
          <button
            key={i}
            onClick={() => update({ currentFrame: b.frameId })}
            style={{
              textAlign: 'left', width: '100%',
              padding: '7px 10px',
              background: `${sevColor(b.severity)}0F`,
              border: `1px solid ${sevColor(b.severity)}30`,
              borderLeft: `3px solid ${sevColor(b.severity)}`,
              borderRadius: 6, cursor: 'pointer',
            }}
          >
            <div style={{
              fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono)',
              color: sevColor(b.severity), textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: 3,
            }}>
              {b.type.replace(/_/g, ' ')}
            </div>
            <div style={{
              fontSize: 11, color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)', lineHeight: 1.45,
              overflow: 'hidden',
              display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}>
              {b.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// COMPLEXITY MINI CARD
// ============================================================
function ProblemCard() {
  const { state, update } = useApp();
  const isLeetCode = !!state.leetcodeProblem;
  const problemName = isLeetCode ? state.leetcodeProblem.title : 'Custom Script';
  const difficulty = isLeetCode ? state.leetcodeProblem.difficulty : 'N/A';

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <Zap size={12} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {problemName}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[{ l: 'Difficulty', v: difficulty }, { l: 'Language', v: state.language }].map((c) => (
          <div key={c.l} style={{
            flex: '1 1 40%', padding: '8px',
            border: '1px solid var(--border)',
            borderRadius: 8, textAlign: 'center',
            background: 'var(--bg-canvas)',
          }}>
            <div style={{
              fontSize: 10, color: 'var(--text-muted)',
              marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              {c.l}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500,
              color: c.v === 'Easy' ? '#2cbb5d' : c.v === 'Medium' ? '#ffc01e' : c.v === 'Hard' ? '#ff375f' : 'var(--text-secondary)'
            }}>
              {c.v}
            </div>
          </div>
        ))}
        {isLeetCode && [{ l: 'Time', v: state.leetcodeProblem?.timeComplexity || 'O(?)' }, { l: 'Space', v: state.leetcodeProblem?.spaceComplexity || 'O(?)' }].map((c) => (
          <div key={c.l} style={{
            flex: '1 1 40%', padding: '8px',
            border: '1px solid var(--border)',
            borderRadius: 8, textAlign: 'center',
            background: 'var(--bg-canvas)',
          }}>
            <div style={{
              fontSize: 10, color: 'var(--text-muted)',
              marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              {c.l}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500,
              color: 'var(--text-secondary)'
            }}>
              {c.v}
            </div>
          </div>
        ))}
      </div>
      
      {isLeetCode && (
        <button
          onClick={() => update({ isLeetcodeModalOpen: true })}
          style={{
            marginTop: 8, width: '100%', padding: '6px',
            background: 'rgba(143,175,157,0.1)', color: 'var(--accent-sage)',
            border: '1px solid rgba(143,175,157,0.3)', borderRadius: 6,
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
            transition: 'background var(--motion-standard)'
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(143,175,157,0.2)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(143,175,157,0.1)'}
        >
          View Problem Description
        </button>
      )}
    </div>
  );
}

// ============================================================
// LEFT PANEL (Editor, Testcases, Diff Debug)
// ============================================================
function LeftPanel({ isOpen, onToggle, activeLine }) {
  const [activeTab, setActiveTab] = React.useState('code');
  const { state, update } = useApp();
  const codeChanged = state.code !== state.lastExecutedCode && state.lastExecutedCode !== '';

  return (
    <div style={{
      position: 'absolute', top: 0, bottom: 0, left: 0,
      width: 400, zIndex: 30, display: 'flex', flexDirection: 'column',
      transform: isOpen ? 'translateX(0)' : 'translateX(-400px)',
      transition: 'transform 400ms cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        background: 'var(--glass-bg)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        borderRight: '1px solid var(--border)',
        boxShadow: '4px 0 24px rgba(0,0,0,0.08)',
        overflow: 'hidden'
      }}>
        {/* TABS HEADER */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {['code', 'testcases', 'diff'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: '12px 0', border: 'none', background: 'transparent',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                textTransform: 'capitalize',
                color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
                borderBottom: activeTab === tab ? '2px solid var(--accent-sage)' : '2px solid transparent'
              }}
            >
              {tab === 'diff' ? 'Diff Debug' : tab === 'code' ? 'Code' : tab}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {activeTab === 'code' && (
            <>
              {/* Code changed banner */}
              {codeChanged && (
                <div style={{
                  margin: 16, padding: '12px 16px',
                  background: 'rgba(231,195,106,0.12)',
                  border: '1px solid rgba(231,195,106,0.35)',
                  borderRadius: 10,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#8C6A14', marginBottom: 4 }}>Code has changed</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>The editor code differs from the last execution.</div>
                  </div>
                  <button
                    onClick={() => update({ view: 'editor' })}
                    style={{
                      padding: '6px 12px', background: '#B08A30', color: '#fff',
                      border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Re-run
                  </button>
                </div>
              )}

              {/* Current line indicator */}
              {activeLine >= 0 && (
                <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    padding: '4px 10px', background: 'rgba(143,175,157,0.12)',
                    border: '1px solid rgba(143,175,157,0.3)', borderRadius: 20,
                    fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--accent-sage)', fontWeight: 600,
                  }}>
                    Line {activeLine + 1}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>currently executing</span>
                </div>
              )}

              {/* Back to Editor button */}
              <div style={{ padding: '0 16px 16px' }}>
                <button
                  onClick={() => update({ view: 'editor' })}
                  style={{
                    width: '100%', padding: '10px',
                    background: 'var(--bg-canvas)', color: 'var(--text-primary)',
                    border: '1px solid var(--border)', borderRadius: 8,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    transition: 'background var(--motion-standard)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-canvas)'}
                >
                  ← Open Editor
                </button>
              </div>

              <div style={{ height: 1, background: 'var(--border)', margin: '0 16px 16px' }} />
              <BugsPanel />
              <ProblemCard />
              <AIDebugAssistant />
            </>
          )}
          {activeTab === 'testcases' && <TestcaseLab />}
          {activeTab === 'diff' && <DiffDebugger />}
        </div>
      </div>

      {/* Toggle button */}
      <button
        onClick={onToggle}
        style={{
          position: 'absolute', top: '50%', left: '100%',
          transform: 'translateY(-50%)',
          width: 26, height: 90,
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: 'none',
          borderRadius: '0 var(--radius-md) var(--radius-md) 0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)', cursor: 'pointer', zIndex: 2,
          transition: 'color 150ms ease, background 150ms ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-canvas)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'var(--bg-card)'; }}
      >
        <span style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em' }}>
          CODE
        </span>
      </button>
    </div>
  );
}

// ============================================================
// RESIZABLE RIGHT PANEL (Inspector)
// ============================================================
function ResizableRightPanel({ isOpen, onToggle }) {
  const [width, setWidth] = useState(320);

  const startDrag = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;

    const onMove = (ev) => {
      const delta = startX - ev.clientX;
      const newW = Math.max(220, Math.min(600, startW + delta)); // Max 600px
      setWidth(newW);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div style={{
      position: 'absolute', top: 0, bottom: 0, right: 0,
      width, zIndex: 30, display: 'flex', flexDirection: 'column',
      transform: isOpen ? 'translateX(0)' : `translateX(${width}px)`,
      transition: 'transform 400ms cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      <div style={{
        flex: 1, background: 'var(--glass-bg)',
        backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
        display: 'flex', flexDirection: 'column'
      }}>
        <InspectorPanel />
      </div>

      {/* Resize Handle */}
      {isOpen && (
        <div
          onMouseDown={startDrag}
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 6,
            cursor: 'col-resize', zIndex: 10,
          }}
        />
      )}

      <button
        onClick={onToggle}
        style={{
          position: 'absolute', top: '50%', right: '100%',
          transform: 'translateY(-50%)',
          width: 26, height: 90,
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRight: 'none',
          borderRadius: 'var(--radius-md) 0 0 var(--radius-md)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)', cursor: 'pointer', zIndex: 2,
          transition: 'color 150ms ease, background 150ms ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-canvas)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'var(--bg-card)'; }}
      >
        <span style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', transform: 'rotate(180deg)' }}>
          INSPECT
        </span>
      </button>
    </div>
  );
}

// ============================================================
// RESIZABLE BOTTOM PANEL (Timeline)
// ============================================================
function ResizableBottomPanel({ isOpen, onToggle, children }) {
  const [height, setHeight] = useState(140);

  const startDrag = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;

    const onMove = (ev) => {
      const delta = startY - ev.clientY; // moving mouse UP increases height
      const newH = Math.max(100, Math.min(400, startH + delta));
      setHeight(newH);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div style={{
      position: 'relative',
      height: isOpen ? height : 0,
      transition: 'height 400ms cubic-bezier(0.16, 1, 0.3, 1)',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0,
      zIndex: 20,
    }}>
      {/* Toggle button */}
      <button
        onClick={onToggle}
        style={{
          position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)',
          width: 80, height: 20,
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderBottom: 'none',
          borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)', cursor: 'pointer', zIndex: 2,
          transition: 'color 150ms ease, background 150ms ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-canvas)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'var(--bg-card)'; }}
      >
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em' }}>
          TIMELINE
        </span>
      </button>

      {/* Resize Handle */}
      {isOpen && (
        <div
          onMouseDown={startDrag}
          style={{
            position: 'absolute', left: 0, right: 0, top: 0, height: 6,
            cursor: 'row-resize', zIndex: 10,
          }}
        />
      )}

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// PLAY ENGINE
// ============================================================
function usePlayEngine() {
  const { state, update } = useApp();
  const { isPlaying, playbackSpeed, currentFrame, executionTrace } = state;
  const total = executionTrace.length;
  const rafRef = useRef(null);
  const lastTickRef = useRef(null);

  useEffect(() => {
    if (!isPlaying || total === 0) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    const msPerFrame = 200 / playbackSpeed;

    const tick = (now) => {
      if (!lastTickRef.current) lastTickRef.current = now;
      const elapsed = now - lastTickRef.current;

      if (elapsed >= msPerFrame) {
        lastTickRef.current = now;
        update((prev) => {
          const next = prev.currentFrame + 1;
          if (next >= prev.executionTrace.length) {
            return { isPlaying: false }; // stop at end
          }
          return { currentFrame: next };
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTickRef.current = null;
    };
  }, [isPlaying, playbackSpeed, total, update]);
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
function useKeyboardShortcuts() {
  const { state, update } = useApp();
  const { isPlaying, currentFrame, executionTrace } = state;
  const total = executionTrace.length;

  useEffect(() => {
    if (state.view !== 'visualizer') return;

    const handleKeyDown = (e) => {
      // Don't trigger if user is typing in an input or textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        // Allow escape to blur
        if (e.key === 'Escape') {
          e.target.blur();
        }
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          update({ isPlaying: !isPlaying });
          break;
        case 'ArrowLeft':
          update({ currentFrame: Math.max(0, currentFrame - 1), isPlaying: false });
          break;
        case 'ArrowRight':
          update({ currentFrame: Math.min(total - 1, currentFrame + 1), isPlaying: false });
          break;
        case 'Home':
          update({ currentFrame: 0, isPlaying: false });
          break;
        case 'End':
          update({ currentFrame: total - 1, isPlaying: false });
          break;
        case '1': update({ playbackSpeed: 0.25 }); break;
        case '2': update({ playbackSpeed: 0.5 }); break;
        case '3': update({ playbackSpeed: 1 }); break;
        case '4': update({ playbackSpeed: 2 }); break;
        case '5': update({ playbackSpeed: 4 }); break;
        case 'k':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            update({ view: 'editor' }); // Quick switch back to editor
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.view, currentFrame, isPlaying, total, update]);
}

// ============================================================
// RESPONSIVE LAYOUT HOOK
// ============================================================
function useResponsiveLayout() {
  const { state, update } = useApp();

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024 && state.rightPanelOpen) {
        update({ rightPanelOpen: false });
      }
      if (window.innerWidth < 768 && state.leftPanelOpen) {
        update({ leftPanelOpen: false });
      }
    };

    // Initial check
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [state.rightPanelOpen, state.leftPanelOpen, update]);
}

// ============================================================
// VISUALIZER VIEW
// ============================================================
export default function VisualizerView() {
  const { state, update } = useApp();
  const [timelineOpen, setTimelineOpen] = useState(true);

  usePlayEngine();
  useKeyboardShortcuts();
  useResponsiveLayout();

  const frame       = state.executionTrace[state.currentFrame];
  const activeLine  = frame ? frame.line - 1 : -1;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', background: 'var(--bg-page)',
    }}>
      <TopBar />

      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>

        {/* Canvas background + ExecutionCanvas */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'var(--canvas-bg)',
          backgroundImage: 'radial-gradient(circle, var(--canvas-dot) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          display: 'flex'
        }}>
          {state.diffMode && state.traceA && state.traceB ? (
            <div style={{ display: 'flex', width: '100%', height: '100%' }}>
              <div style={{ flex: 1, borderRight: '2px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
                <ExecutionCanvas trace={state.traceA} isDiffMode={true} diffFrameIndex={state.diffFrameIndex} />
                <div style={{ position: 'absolute', top: 16, right: 16, padding: '4px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', zIndex: 50, boxShadow: 'var(--shadow-panel)' }}>Trace A</div>
              </div>
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                <ExecutionCanvas trace={state.traceB} isDiffMode={true} diffFrameIndex={state.diffFrameIndex} />
                <div style={{ position: 'absolute', top: 16, right: 16, padding: '4px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', zIndex: 50, boxShadow: 'var(--shadow-panel)' }}>Trace B</div>
              </div>
            </div>
          ) : (
            <ExecutionCanvas />
          )}
        </div>

        {/* Left Panel: Code Editor + Bugs */}
        <LeftPanel
          isOpen={state.leftPanelOpen}
          onToggle={() => update({ leftPanelOpen: !state.leftPanelOpen })}
          activeLine={activeLine}
        />

        {/* Right Panel: Tabbed Inspector */}
        <ResizableRightPanel
          isOpen={state.rightPanelOpen}
          onToggle={() => update({ rightPanelOpen: !state.rightPanelOpen })}
        />

      </div>

      <ResizableBottomPanel isOpen={timelineOpen} onToggle={() => setTimelineOpen(!timelineOpen)}>
        {state.diffMode && state.traceA && state.traceB ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ borderBottom: '1px solid var(--border)', flex: 1 }}>
              <Timeline trace={state.traceA} hideControls />
            </div>
            <div style={{ flex: 1 }}>
              <Timeline trace={state.traceB} hideControls />
            </div>
          </div>
        ) : (
          <Timeline />
        )}
      </ResizableBottomPanel>
    </div>
  );
}
