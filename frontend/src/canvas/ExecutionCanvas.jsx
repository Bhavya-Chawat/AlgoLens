import React, { useMemo, useCallback } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Activity } from 'lucide-react';
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
function CanvasControls({ currentFrame, totalFrames, description, frame, vars, onStep }) {
  const pct = totalFrames > 1 ? (currentFrame / (totalFrames - 1)) * 100 : 0;

  return (
    <div style={{
      position: 'absolute', bottom: 44, left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 20px',
      background: 'var(--glass-bg)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      border: '1px solid var(--border)',
      borderRadius: 28,
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
          width: 32, height: 32, borderRadius: 10,
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
        <ChevronLeft size={16} />
      </button>

      {/* Frame description */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        minWidth: 0, maxWidth: 520,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%',
        }}>
          <span style={{
            fontSize: 11, fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)', flexShrink: 0,
          }}>
            {currentFrame + 1}/{totalFrames}
          </span>
          <span style={{
            width: 1, height: 14, background: 'var(--border)',
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: 14, fontFamily: 'var(--font-mono)',
            color: 'var(--text-primary)', fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {frame?.codeWithValues || description || '–'}
          </span>
        </div>
        
        {/* Secondary plain English explanation */}
        {frame?.explanation && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, fontFamily: 'var(--font-sans)' }}>
            {frame.explanation}
          </div>
        )}
        
        {/* Variable values inline — only show changed vars */}
        {description && Object.keys(vars || {}).length > 0 && !description.startsWith('Line ') && (() => {
          // Collect scalar vars that actually appear in the description
          const tokens = [];
          Object.entries(vars).forEach(([name, info]) => {
            const val = info && info.value !== undefined ? info.value : info;
            const type = info?.type || '';
            const isScalar = ['int', 'float', 'bool', 'str', 'char', 'string'].includes(type) || typeof val === 'number' || typeof val === 'boolean';
            if (isScalar && name && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
              // Only show if the var name appears in the description
              const regex = new RegExp(`\\b${name}\\b`);
              if (regex.test(description)) {
                tokens.push({ name, val: String(val).slice(0, 12), changed: info?.changedThisFrame });
              }
            }
          });
          if (!tokens.length) return null;
          return (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>where</span>
              {tokens.map(({ name, val, changed }) => (
                <span key={name} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  padding: '1px 8px', borderRadius: 12,
                  background: changed ? 'rgba(231,195,106,0.15)' : 'rgba(126,184,212,0.12)',
                  border: `1px solid ${changed ? 'rgba(231,195,106,0.4)' : 'rgba(126,184,212,0.3)'}`,
                  fontSize: 11, fontFamily: 'var(--font-mono)',
                }}>
                  <span style={{ color: 'var(--text-muted)' }}>{name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>=</span>
                  <span style={{ color: changed ? '#B08A30' : '#5BA4C8', fontWeight: 700 }}>{val}</span>
                </span>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Step forward */}
      <button
        id="canvas-step-fwd"
        onClick={() => onStep(1)}
        disabled={currentFrame >= totalFrames - 1}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 10,
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
        <ChevronRight size={16} />
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

  // ── Accumulate missing structures (in case trace drops them) ─
  const cumulativeVars = useMemo(() => {
    if (!executionTrace || !executionTrace.length) return {};
    const structs = {};
    for (let i = 0; i <= currentFrame; i++) {
      const f = executionTrace[i];
      if (f && f.variables) {
        Object.entries(f.variables).forEach(([k, info]) => {
          const val = info && info.value !== undefined ? info.value : info;
          // Only accumulate Arrays and Objects (HashMaps, Trees, etc.)
          if (Array.isArray(val) || (val !== null && typeof val === 'object')) {
            structs[k] = info;
          }
        });
      }
    }
    return structs;
  }, [executionTrace, currentFrame]);

  // ── Detect structures ──────────────────────────────────────
  const detected = useMemo(() => {
    // 1. Base layer: intelligently auto-detect from all variable shapes
    const mergedFrame = {
      ...frame,
      variables: {
        ...cumulativeVars,
        ...(frame?.variables || {})
      }
    };
    const autoDetected = detectStructures(mergedFrame);

    // 2. Overlay layer: apply rich AI formatting (highlights, windows, bitwise, pointers)
    if (frame && frame.dataStructureState) {
      const ds = frame.dataStructureState;
      
      // Merge pointers and bits
      autoDetected.pointers = ds.pointers || autoDetected.pointers || {};
      autoDetected.bits = ds.bits || autoDetected.bits || null;
      
      if (ds.type === 'bitwise') {
        autoDetected.type = 'bitwise';
      }
      
      if (ds.name) {
        if (ds.type === 'array' || ds.type === 'sliding_window') {
          const arr = autoDetected.arrays?.find(a => a.name === ds.name);
          if (arr) { arr.window = ds.window; arr.highlights = ds.highlights; }
          if (autoDetected.mainArray && autoDetected.mainArray.name === ds.name) {
            autoDetected.mainArray.window = ds.window;
            autoDetected.mainArray.highlights = ds.highlights;
          }
        } else if (ds.type === 'binary_tree') {
          const tree = autoDetected.trees?.find(t => t.name === ds.name);
          if (tree) tree.nodes = ds.nodes;
          // If autoDetected didn't find the tree (e.g., missing left/right initially), force it
          if (!tree && ds.nodes) {
             if (!autoDetected.trees) autoDetected.trees = [];
             autoDetected.trees.push({ name: ds.name, info: frame.variables?.[ds.name] || {value: null}, nodes: ds.nodes });
          }
        } else if (ds.type === 'linked_list') {
          const ll = autoDetected.linkedLists?.find(l => l.name === ds.name);
          if (ll) ll.nodes = ds.nodes;
        }
        
        // Upgrade type if autoDetected missed the primary structure
        if (autoDetected.type === 'generic' && ds.type && ds.type !== 'generic') {
          autoDetected.type = ds.type;
        }
      }
    }

    return autoDetected;
  }, [frame, cumulativeVars]);

  // Helper to guess main var if AI doesn't provide it
  function findMainVar(vars, expectedType) {
    if (!vars) return null;
    const keys = Object.keys(vars);
    if (keys.length === 0) return null;
    return keys.find(k => vars[k].type?.includes('list') || vars[k].type?.includes('dict')) || keys[0];
  }

  // ── Build recursion tree (memo on frame index) ─────────────
  const callTree = useMemo(() => {
    // 1. Try AI-provided recursion tree first
    if (frame && frame.recursionTree && frame.recursionTree.nodes && frame.recursionTree.nodes.length > 0) {
      const rawNodes = frame.recursionTree.nodes;
      const getDepth = (id) => {
        let depth = 0;
        let curr = rawNodes.find(n => n.id === id);
        let visited = new Set();
        while (curr && curr.parentId !== null && curr.parentId !== undefined && !visited.has(curr.id)) {
          visited.add(curr.id);
          depth++;
          curr = rawNodes.find(n => n.id === curr.parentId);
        }
        return depth;
      };

      const nodes = rawNodes.map(n => {
        const match = (n.label || '').match(/^([^(]+)\((.*)\)$/);
        return {
          ...n,
          name: match ? match[1] : (n.label || 'func'),
          description: match ? match[2] : '',
          depth: getDepth(n.id),
          isActive: n.status === 'active',
          done: n.status === 'done',
          children: rawNodes.filter(child => child.parentId === n.id).map(c => c.id)
        };
      });
      const roots = nodes.filter(n => n.parentId === null);
      if (nodes.length > 0) {
        const dims = layoutTree(nodes, roots);
        return { nodes, roots, dims };
      }
    }
    
    // 2. Fallback to heuristic buildCallTree from execution trace
    if (detected.type === 'recursion' || (detected.trees && detected.trees.length > 0)) {
       const { nodes, roots } = buildCallTree(executionTrace, currentFrame);
       if (nodes && nodes.length > 0) {
         const dims = layoutTree(nodes, roots);
         return { nodes, roots, dims };
       }
    }
    
    return null;
  }, [frame, detected.type, executionTrace, currentFrame]);

  const prevVars = prevF?.variables ?? {};

  // ── Bug frame indicator ────────────────────────────────────
  const isBugFrame = frame?.isBugFrame ?? false;

  const [zoom, setZoom] = React.useState(1);
  const zoomRef = React.useRef(1);
  const panRef = React.useRef({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = React.useState(false);
  const dragRef = React.useRef({ startX: 0, startY: 0, startPanX: 0, startPanY: 0 });
  const contentRef = React.useRef(null);

  // Sync zoom state to ref for handlers
  React.useEffect(() => {
    zoomRef.current = zoom;
    if (contentRef.current) {
      contentRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoom})`;
    }
  }, [zoom]);

  const handleMouseDown = React.useCallback((e) => {
    if (e.button !== 0) return; // left click only
    setIsPanning(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPanX: panRef.current.x,
      startPanY: panRef.current.y,
    };
  }, []);

  const handleMouseMove = React.useCallback((e) => {
    if (!isPanning || !contentRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    panRef.current = {
      x: dragRef.current.startPanX + dx,
      y: dragRef.current.startPanY + dy,
    };
    contentRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoomRef.current})`;
  }, [isPanning]);

  const handleMouseUp = React.useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleWheel = React.useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(z => Math.max(0.2, Math.min(3, z + delta)));
    }
  }, []);

  if (!total || !frame) {
    return <EmptyCanvas />;
  }

  return (
    <div style={{
      flex: 1, width: '100%',
      display: 'flex', flexDirection: 'column',
      height: '100%', position: 'relative',
      outline: isBugFrame ? '2px solid rgba(224,82,82,0.5)' : (isDiffMode && currentFrame >= diffFrameIndex) ? '2px solid rgba(224,82,82,0.3)' : 'none',
      outlineOffset: -2,
      animation: isBugFrame ? 'bug-pulse 2s ease-in-out infinite' : 'none',
      background: (isDiffMode && currentFrame >= diffFrameIndex) ? 'rgba(224,82,82,0.03)' : 'transparent',
      overflow: 'hidden', // Prevent scrollbars
    }}>
      {/* Zoom Controls Overlay — top center, inside canvas */}
      <div style={{
        position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 40,
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
        <button onClick={() => { setZoom(1); panRef.current = { x: 0, y: 0 }; if (contentRef.current) contentRef.current.style.transform = `translate(0px, 0px) scale(1)`; }} style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', borderRadius: 4 }} onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} title="Reset View">
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

      {/* Main content — pannable container */}
      <div
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{
          flex: 1,
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: isPanning ? 'grabbing' : 'grab',
        }}
      >
        <div
          ref={contentRef}
          style={{
            display: 'flex', flexDirection: 'column', gap: 32,
            alignItems: 'flex-start',
            transform: `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoom})`,
            transition: isPanning ? 'none' : 'transform 100ms ease',
            minWidth: 'max-content',
            willChange: 'transform',
          }}
        >{/* ── BADGES: Event / Algo / DS ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
          <EventBadge type={frame.event || frame.eventType} />
          <span style={{
            fontSize: 11, fontFamily: 'var(--font-mono)',
            color: 'var(--canvas-text-muted)', padding: '2px 6px',
          }}>
            line {frame.line}
          </span>

          {/* Execution Result inline badge — shows only when a return value is present */}
          {state.executionResult !== undefined && state.executionResult !== null && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)',
              padding: '2px 10px', borderRadius: 20, marginLeft: 4,
            }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#10B981', fontWeight: 700, letterSpacing: '0.08em' }}>
                RETURN
              </span>
              <div style={{ width: 1, height: 12, background: 'rgba(16,185,129,0.4)' }} />
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: '#10B981', fontWeight: 700 }}>
                {String(state.executionResult)}
              </span>
            </div>
          )}

          {/* Data Structure badge — shown immediately from detected type */}
          {detected.type && detected.type !== 'generic' && detected.type !== 'empty' && (() => {
            const DS_LABELS = {
              stack_queue: 'Stack / Queue',
              array: 'Array',
              array_hashmap: 'Array + HashMap',
              hashmap: 'HashMap',
              linked_list: 'Linked List',
              tree: 'Binary Tree',
              graph: 'Graph',
              recursion: 'Recursion',
            };
            const label = DS_LABELS[detected.type] || detected.type.replace(/_/g, ' ');
            return (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(126,184,212,0.12)', border: '1px solid rgba(126,184,212,0.4)',
                padding: '3px 10px', borderRadius: 20,
              }}>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#5BA4C8', fontWeight: 700, letterSpacing: '0.04em' }}>
                  DS: {label.toUpperCase()}
                </span>
              </div>
            );
          })()}

          {/* Algorithm badge — shown only after AI hint fills it in */}
          {state.detectedAlgorithm && (() => {
            // Ensure we don't show a DS as an algo name (AI hint may confuse them)
            const dsNames = new Set(['stack', 'queue', 'array', 'hashmap', 'linked list', 'tree', 'graph']);
            const algoLabel = state.detectedAlgorithm.trim();
            if (dsNames.has(algoLabel.toLowerCase())) return null;
            return (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'rgba(143,175,157,0.12)', border: '1px solid rgba(143,175,157,0.4)',
                padding: '3px 10px', borderRadius: 20,
              }}>
                <Activity size={11} style={{ color: 'var(--accent-sage)' }} />
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--accent-sage)', fontWeight: 700, letterSpacing: '0.04em' }}>
                  ALGO: {algoLabel.toUpperCase()}
                </span>
              </div>
            );
          })()}
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

        {/* ── ARRAY / STRING / SET + POINTERS ── */}
        {(['array', 'sliding_window', 'array_hashmap', 'recursion', 'set'].includes(detected.type)) &&
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
                vars={detected.vars}
              />
            ))}
          </Section>
        )}

        {/* ── HASHMAP / SET ── */}
        {(['hashmap', 'array_hashmap', 'set'].includes(detected.type)) &&
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
            <GenericBoard 
              vars={detected.vars} 
              isBitwise={
                state.detectedAlgorithm === 'Bit Manipulation' || 
                (state.leetcodeProblem?.topicTags || []).some(t => t.name.toLowerCase().includes('bit'))
              }
            />
          </Section>
        )}

        {/* ── BITWISE VISUALIZER ── */}
        {detected.type === 'bitwise' && detected.bits && (
          <Section label="Bitwise Operation">
             <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
               {Object.entries(detected.bits).map(([name, binaryStr]) => (
                 <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                   <span style={{ width: 60, fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', textAlign: 'right' }}>{name}</span>
                   <div style={{ display: 'flex', gap: 4 }}>
                     {binaryStr.split('').map((bit, i) => (
                       <span key={i} style={{ 
                         width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                         background: bit === '1' ? 'rgba(16,185,129,0.15)' : 'var(--bg-canvas)',
                         color: bit === '1' ? '#10B981' : 'var(--text-muted)',
                         border: `1px solid ${bit === '1' ? 'rgba(16,185,129,0.4)' : 'var(--border)'}`,
                         borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600
                       }}>
                         {bit}
                       </span>
                     ))}
                   </div>
                 </div>
               ))}
             </div>
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
          frame={frame}
          vars={detected.vars}
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
  loop_iteration:{ label: 'loop',       bg: 'rgba(231,195,106,0.15)', text: '#8C6A14', border: 'rgba(231,195,106,0.35)' },
  comparison:    { label: 'compare',    bg: 'rgba(126,184,212,0.15)', text: '#1E6480', border: 'rgba(126,184,212,0.35)' },
  assignment:    { label: 'assign',     bg: 'rgba(143,175,157,0.15)', text: '#2E6B50', border: 'rgba(143,175,157,0.35)' },
  return:        { label: 'return',     bg: 'rgba(16,185,129,0.12)',  text: '#065F46', border: 'rgba(16,185,129,0.35)' },
  branch_true:   { label: 'branch_T',   bg: 'rgba(212,155,132,0.15)', text: '#8B4A2C', border: 'rgba(212,155,132,0.35)' },
  branch_false:  { label: 'branch_F',   bg: 'rgba(212,155,132,0.15)', text: '#8B4A2C', border: 'rgba(212,155,132,0.35)' },
  swap:          { label: 'swap',       bg: 'rgba(231,195,106,0.15)', text: '#8C6A14', border: 'rgba(231,195,106,0.35)' },
  recurse:       { label: 'recurse',    bg: 'rgba(167,139,250,0.15)', text: '#7C3AED', border: 'rgba(167,139,250,0.35)' },
  base_case:     { label: 'base_case',  bg: 'rgba(16,185,129,0.12)',  text: '#065F46', border: 'rgba(16,185,129,0.35)' },
  loop_start:    { label: 'loop',       bg: 'rgba(231,195,106,0.15)', text: '#8C6A14', border: 'rgba(231,195,106,0.35)' },
  branch:        { label: 'branch',     bg: 'rgba(212,155,132,0.15)', text: '#8B4A2C', border: 'rgba(212,155,132,0.35)' },
  exception:     { label: 'exception',  bg: 'rgba(224,82,82,0.12)',   text: '#9B1C1C', border: 'rgba(224,82,82,0.3)'  },
  bitwise:       { label: 'bitwise',    bg: 'rgba(126,184,212,0.15)', text: '#1E6480', border: 'rgba(126,184,212,0.35)' },
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
