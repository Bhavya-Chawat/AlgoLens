import React, { useEffect, useRef, useState } from 'react';
import { Zap, AlertTriangle, Bot } from 'lucide-react';
import { useApp } from '../context/AppContext';
import TopBar from '../components/TopBar';
import Timeline from '../components/Timeline';
import ExecutionCanvas from '../canvas/ExecutionCanvas';
import CodeEditor from '../components/CodeEditor';
import InspectorPanel from '../components/inspector/InspectorPanel';
import AIDebugAssistant from '../components/AIDebugAssistant';
import TestcaseLab from '../components/TestcaseLab';
import DiffDebugger from '../components/DiffDebugger';
import { itemIndexFor } from '../core/beats';

// ============================================================
// TRACE BANNERS — explain what the canvas is showing
// ============================================================
function TraceBanners() {
  const { state, beats } = useApp();
  const item = beats.items[itemIndexFor(beats.items, state.currentFrame)];
  const fold = item?.type === 'fold' ? item : null;
  if (!fold) return null;

  const pill = (bg, border, color) => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', borderRadius: 10,
    background: bg, border: `1px solid ${border}`, color, fontSize: 12, boxShadow: 'var(--shadow-panel)',
    maxWidth: 'min(100%, 720px)',
  });

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', padding: '8px 12px 0', flexShrink: 0,
    }}>
      <div style={pill('rgba(183,168,232,0.2)', 'rgba(183,168,232,0.6)', '#4B3C93')}>
        <span>
          {fold.kind === 'call' ? 'Nested call folded' : `${fold.count} similar iterations folded`}
          {' · '}showing the state after {fold.kind === 'call' ? 'it' : 'them'}. Nothing was skipped.
        </span>
        <button
          onClick={() => beats.goToFrame(fold.start)}
          style={{
            padding: '3px 10px', borderRadius: 6, border: '1px solid #6D5BB5', background: 'transparent',
            color: '#4B3C93', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          Expand
        </button>
      </div>
    </div>
  );
}

// ============================================================
// BUGS PANEL (Moved to left panel below Code Editor)
// ============================================================
function BugsPanel() {
  const { state, beats } = useApp();
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
            onClick={() => beats.goToFrame(b.frameId)}
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
// DOCK PANEL — a real column beside the stage (not an overlay): resizable, collapses to a slim rail
// ============================================================
function DockPanel({ side, isOpen, onToggle, label, defaultWidth, min, max, children }) {
  const widthKey = `algolens-dock-${side}`;
  // the width you dragged it to is remembered for next time
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(widthKey));
      return saved >= min && saved <= max ? saved : defaultWidth;
    } catch {
      return defaultWidth;
    }
  });
  const left = side === 'left';

  const startDrag = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    let latest = startW;
    const onMove = (ev) => {
      const delta = left ? ev.clientX - startX : startX - ev.clientX;
      latest = Math.max(min, Math.min(max, startW + delta));
      setWidth(latest);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { localStorage.setItem(widthKey, String(latest)); } catch { /* private mode: it just will not be remembered */ }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        aria-label={`Open ${label}`}
        style={{
          width: 30, flexShrink: 0, border: 'none', cursor: 'pointer', background: 'var(--bg-card)',
          borderRight: left ? '1px solid var(--border)' : 'none', borderLeft: left ? 'none' : '1px solid var(--border)',
          color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-canvas)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        <span style={{ writingMode: 'vertical-rl', transform: left ? 'none' : 'rotate(180deg)', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em' }}>
          {label}
        </span>
      </button>
    );
  }

  return (
    <aside
      aria-label={label}
      style={{
        width, flexShrink: 0, position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0,
        background: 'var(--bg-card)', borderRight: left ? '1px solid var(--border)' : 'none', borderLeft: left ? 'none' : '1px solid var(--border)',
      }}
    >
      {children}
      <button
        onClick={onToggle}
        aria-label={`Collapse ${label}`}
        title={`Collapse ${label}`}
        style={{
          position: 'absolute', top: 8, [left ? 'right' : 'left']: 6, width: 22, height: 22, borderRadius: 6, border: 'none',
          background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', zIndex: 3, fontSize: 14, lineHeight: 1,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-canvas)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        {left ? '‹' : '›'}
      </button>
      <div
        onMouseDown={startDrag}
        role="separator"
        aria-orientation="vertical"
        style={{ position: 'absolute', top: 0, bottom: 0, [left ? 'right' : 'left']: -3, width: 6, cursor: 'col-resize', zIndex: 10 }}
      />
    </aside>
  );
}

// ============================================================
// LEFT PANEL (Code with the running line, Testcases, Diff Debug)
// ============================================================
function LeftPanel({ activeLine }) {
  const [activeTab, setActiveTab] = React.useState('code');
  const { state, update } = useApp();
  const codeChanged = state.code !== state.lastExecutedCode && state.lastExecutedCode !== '';
  const executed = state.lastExecutedCode || state.code;
  const bugLines = React.useMemo(() => state.detectedBugs.map((b) => state.executionTrace[b.frameId]?.line).filter(Boolean), [state.detectedBugs, state.executionTrace]);

  return (
    <>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', paddingRight: 28, flexShrink: 0 }}>
        {['code', 'testcases', 'diff'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, padding: '11px 0', border: 'none', background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              textTransform: 'capitalize', color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: activeTab === tab ? '2px solid var(--accent-sage)' : '2px solid transparent',
            }}
          >
            {tab === 'diff' ? 'Diff Debug' : tab === 'code' ? 'Code' : tab}
          </button>
        ))}
      </div>

      {activeTab === 'code' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {codeChanged && (
            <div style={{ margin: '10px 12px 0', padding: '8px 12px', background: 'rgba(231,195,106,0.12)', border: '1px solid rgba(231,195,106,0.35)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, fontSize: 11, color: 'var(--text-secondary)' }}>
                <b style={{ color: '#8C6A14' }}>The editor changed</b> since this run. You are looking at the code that ran.
              </div>
              <button onClick={() => update({ view: 'editor' })} style={{ padding: '5px 10px', background: '#B08A30', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Re-run
              </button>
            </div>
          )}
          <div style={{ padding: '10px 12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            {activeLine >= 0 && (
              <span style={{ padding: '3px 10px', background: 'rgba(231,195,106,0.16)', border: '1px solid rgba(231,195,106,0.4)', borderRadius: 20, fontSize: 11.5, fontFamily: 'var(--font-mono)', color: '#8C6A14', fontWeight: 700 }}>
                line {activeLine + 1}
              </span>
            )}
            <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>{activeLine >= 0 ? 'about to run' : 'not started'}</span>
            <button
              onClick={() => update({ view: 'editor' })}
              style={{ padding: '4px 10px', background: 'var(--bg-canvas)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              ← Editor
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 160, padding: 12 }}>
            <CodeEditor mode="readonly" code={executed} activeLineIndex={activeLine} bugLines={bugLines} />
          </div>
          <div style={{ maxHeight: '38%', overflowY: 'auto', flexShrink: 0, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <BugsPanel />
            <ProblemCard />
          </div>
          {!state.isAiAssistantOpen && (
            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button
                onClick={() => update({ isAiAssistantOpen: true })}
                style={{ width: '100%', padding: '9px', background: 'var(--accent-sage)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <Bot size={15} /> Ask for a hint
              </button>
            </div>
          )}
        </div>
      )}
      {activeTab === 'testcases' && <div style={{ flex: 1, overflowY: 'auto' }}><TestcaseLab /></div>}
      {activeTab === 'diff' && <div style={{ flex: 1, overflowY: 'auto' }}><DiffDebugger /></div>}
    </>
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
  const { state, beats } = useApp();
  const { isPlaying, playbackSpeed, executionTrace } = state;
  const total = executionTrace.length;
  const { advance } = beats;
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
        advance(); // next beat (a folded run counts as one); stops by itself at the end
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTickRef.current = null;
    };
  }, [isPlaying, playbackSpeed, total, advance]);
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================
function useKeyboardShortcuts() {
  const { state, update, beats } = useApp();
  const { isPlaying, executionTrace } = state;
  const total = executionTrace.length;
  const { stepBy } = beats;

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
          stepBy(-1);
          break;
        case 'ArrowRight':
          stepBy(1);
          break;
        case 'Home':
          stepBy(-Infinity);
          break;
        case 'End':
          stepBy(Infinity);
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
  }, [state.view, isPlaying, total, update, stepBy]);
}

// ============================================================
// RESPONSIVE LAYOUT HOOK
// ============================================================
// Folds a dock only when the window *becomes* narrow (crosses the breakpoint), never because the dock's own state
// changed: the old version re-closed a dock the moment you opened it on a narrow window.
function useResponsiveLayout() {
  const { update } = useApp();

  useEffect(() => {
    let last = window.innerWidth;
    const handleResize = () => {
      const width = window.innerWidth;
      const crossed = (limit) => last >= limit && width < limit;
      if (crossed(1024)) update({ rightPanelOpen: false });
      if (crossed(768)) update({ leftPanelOpen: false });
      last = width;
    };
    // on arrival: a narrow window starts with the right dock folded
    if (window.innerWidth < 1024) update({ rightPanelOpen: false });
    if (window.innerWidth < 768) update({ leftPanelOpen: false });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [update]);
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-page)' }}>
      <TopBar />

      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', overflow: 'hidden' }}>
        {/* Left dock: the code that ran, with the running line */}
        <DockPanel side="left" label="CODE" isOpen={state.leftPanelOpen} onToggle={() => update({ leftPanelOpen: !state.leftPanelOpen })} defaultWidth={390} min={280} max={760}>
          <LeftPanel activeLine={activeLine} />
        </DockPanel>

        {/* The stage */}
        <div style={{
          flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden', background: 'var(--canvas-bg)',
          backgroundImage: 'radial-gradient(circle, var(--canvas-dot) 1px, transparent 1px)', backgroundSize: '24px 24px',
          display: 'flex', flexDirection: 'column',
        }}>
          <TraceBanners />
          <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
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
        </div>

        {/* Right dock: variables, call stack, memory, outline */}
        <DockPanel side="right" label="INSPECT" isOpen={state.rightPanelOpen} onToggle={() => update({ rightPanelOpen: !state.rightPanelOpen })} defaultWidth={320} min={240} max={620}>
          <InspectorPanel />
        </DockPanel>

        {/* Floating hint assistant */}
        <AIDebugAssistant isOpen={state.isAiAssistantOpen} onClose={() => update({ isAiAssistantOpen: false })} />
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
