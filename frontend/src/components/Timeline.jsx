import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import {
  SkipBack, ChevronLeft, Play, Pause, ChevronRight, SkipForward,
  ZoomIn, ZoomOut, Search, AlertTriangle, CornerDownLeft
} from 'lucide-react';
import { useApp } from '../context/AppContext';

// ============================================================
// CONSTANTS
// ============================================================
const EVENT_COLORS = {
  function_call: '#A78BFA',     // purple
  assignment:    '#8FAF9D',     // sage
  loop_start:    '#E7C36A',     // amber
  branch:        '#FCD34D',     // yellow
  return:        '#D49B84',     // terracotta
  exception:     '#E05252',     // red
  comparison:    '#7EB8D4',     // blue
  line:          '#9CA3AF',     // gray
};

const SPEEDS = [0.25, 0.5, 1, 2, 4];

// ============================================================
// TIMELINE COMPONENT
// ============================================================
const Timeline = React.memo(function Timeline({
  trace, frameIndex, playing, speed, bugs, onUpdateReq, hideControls
}) {
  const { state, update, traceEngine } = useApp();
  
  const executionTrace = trace || state.executionTrace;
  const currentFrame = frameIndex !== undefined ? frameIndex : state.currentFrame;
  const isPlaying = playing !== undefined ? playing : state.isPlaying;
  const playbackSpeed = speed !== undefined ? speed : state.playbackSpeed;
  const detectedBugs = bugs || state.detectedBugs;
  const total = executionTrace.length;

  const doUpdate = useCallback((patch) => {
    if (onUpdateReq) onUpdateReq(patch);
    else update(patch);
  }, [onUpdateReq, update]);

  const [zoom, setZoom] = useState(1);
  const [hoverFrame, setHoverFrame] = useState(null);
  const [jumpInput, setJumpInput] = useState('');
  const [scrollLeft, setScrollLeft] = useState(0);
  const [rightWidth, setRightWidth] = useState(200);
  const [centerVisible, setCenterVisible] = useState(true);
  
  const trackRef = useRef(null);
  const containerRef = useRef(null);

  // Resize right panel — drag its left border leftward to grow it
  const startRightResize = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = rightWidth;
    const onMove = (ev) => {
      const delta = startX - ev.clientX; // drag left = grow
      const newW = Math.max(140, Math.min(360, startW + delta));
      setRightWidth(newW);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };


  // Keyboard shortcuts moved to VisualizerView

  // ── AUTO-SCROLL TO PLAYHEAD WHEN ZOOMED ───────────────────
  useEffect(() => {
    if (zoom > 1 && containerRef.current && trackRef.current && total > 0) {
      const pct = currentFrame / (total - 1 || 1);
      const trackW = trackRef.current.offsetWidth;
      const contW = containerRef.current.offsetWidth;
      const targetScroll = (pct * trackW) - (contW / 2);
      
      // Only smooth scroll if we're playing, snap if we just zoomed or dragged
      containerRef.current.scrollTo({
        left: targetScroll,
        behavior: isPlaying ? 'smooth' : 'auto'
      });
    }
  }, [currentFrame, zoom, isPlaying, total]);

  // ── DRAG HANDLER ─────────────────────────────────────────
  const handleScrub = useCallback((e) => {
    if (!trackRef.current || total === 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = x / rect.width;
    const frame = Math.round(pct * (total - 1));
    doUpdate({ currentFrame: frame, isPlaying: false });
  }, [total, doUpdate]);

  const onTrackMouseDown = (e) => {
    handleScrub(e);
    const onMouseMove = (ev) => handleScrub(ev);
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const onTrackMouseMove = (e) => {
    if (!trackRef.current || total === 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const pct = x / rect.width;
    const frame = Math.round(pct * (total - 1));
    setHoverFrame({ frame, x });
  };

  // ── QUICK JUMPS ──────────────────────────────────────────
  const jumpToFirstBug = () => {
    if (!detectedBugs.length) return;
    doUpdate({ currentFrame: detectedBugs[0].frameId, isPlaying: false });
  };

  const jumpToLastReturn = () => {
    for (let i = total - 1; i >= 0; i--) {
      if (executionTrace[i].event === 'return') {
        doUpdate({ currentFrame: i, isPlaying: false });
        break;
      }
    }
  };

  const handleJumpSubmit = (e) => {
    e.preventDefault();
    const val = parseInt(jumpInput, 10);
    if (!isNaN(val) && val >= 0 && val < total) {
      doUpdate({ currentFrame: val, isPlaying: false });
      setJumpInput('');
    }
  };

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(playbackSpeed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    doUpdate({ playbackSpeed: next });
  };

  if (total === 0) {
    return (
      <div className="animate-slide-up" style={{
        height: '100%', background: 'var(--bg-card)', borderTop: '1px solid var(--border)',
        display: 'flex', flexShrink: 0, userSelect: 'none', position: 'relative',
        opacity: 0.6, pointerEvents: 'none'
      }}>
        <div style={{
          width: 220, padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          borderRight: '1px solid var(--border)', flexShrink: 0, gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ControlButton icon={<SkipBack size={18} />} title="First Frame" />
            <ControlButton icon={<ChevronLeft size={18} />} title="Step Back" />
            <button style={{
              width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-canvas)', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', margin: '0 4px',
            }}>
              <Play size={20} fill="currentColor" style={{ marginLeft: 2 }} />
            </button>
            <ControlButton icon={<ChevronRight size={18} />} title="Step Forward" />
            <ControlButton icon={<SkipForward size={18} />} title="Last Frame" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Speed</span>
            <button style={{
              padding: '2px 10px', borderRadius: 12, background: 'var(--bg-canvas)', border: '1px solid var(--border)',
              fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-muted)'
            }}>1x</button>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: '100%', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '100%', height: 6, background: 'var(--bg-canvas)', borderRadius: 3 }} />
            <span style={{ position: 'absolute', background: 'var(--bg-card)', padding: '0 12px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
              No execution trace
            </span>
          </div>
        </div>
      </div>
    );
  }

  const currentFrameObj = executionTrace[currentFrame];
  const pct = total > 1 ? (currentFrame / (total - 1)) * 100 : 0;
  const trackWidth = `${zoom * 100}%`;

  const handleGoDeeper = async () => {
    if (currentFrame >= total - 1) {
      alert("Cannot expand at the very end of the trace.");
      return;
    }
    try {
      doUpdate({ isPlaying: false });
      update({ globalLoading: true, globalLoadingText: 'Expanding trace depth...' });
      const startFrame = executionTrace[currentFrame];
      const endFrame = executionTrace[currentFrame + 1];

      const code = state.code || '';
      let testInput = state.testInput || '';
      const obj = {};
      let hasKeys = false;
      (state.customInputs || []).forEach(i => {
        if (!i.key) return;
        hasKeys = true;
        try { obj[i.key] = JSON.parse(i.val); }
        catch { obj[i.key] = i.val; } 
      });
      if (hasKeys) testInput = JSON.stringify([obj]);
      else if (state.editorMode === 'custom') testInput = '[]';

      const result = await traceEngine.expandTrace(
        state.editorMode, state.language, code, testInput, 
        state.customApiKey, state.judge0ApiKey, 
        startFrame, endFrame
      );
      
      const rawFrames = result.frames || [];
      const expandedFrames = rawFrames.filter(f => {
        const isSameAsStart = f.line === startFrame.line && f.codeWithValues === startFrame.codeWithValues;
        const isSameAsEnd = f.line === endFrame.line && f.codeWithValues === endFrame.codeWithValues;
        return !isSameAsStart && !isSameAsEnd;
      });

      if (expandedFrames.length > 0) {
        const cleanedCurrentFrame = { ...executionTrace[currentFrame] };
        delete cleanedCurrentFrame.skippedNext;
        if (cleanedCurrentFrame.variables?.skippedNext) {
          cleanedCurrentFrame.variables = { ...cleanedCurrentFrame.variables };
          delete cleanedCurrentFrame.variables.skippedNext;
        }

        const newTrace = [
          ...executionTrace.slice(0, currentFrame),
          cleanedCurrentFrame,
          ...expandedFrames,
          ...executionTrace.slice(currentFrame + 1)
        ];
        update({ executionTrace: newTrace, globalLoading: false });
      } else {
        const newTrace = [...executionTrace];
        newTrace[currentFrame] = { ...newTrace[currentFrame], _noExpandAvailable: true };
        update({ executionTrace: newTrace, globalLoading: false });
      }
    } catch (err) {
      update({ globalLoading: false });
      alert("Failed to expand trace: " + err.message);
    }
  };

  return (
    <div style={{
      height: '100%',
      background: 'var(--bg-card)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      flexShrink: 0,
      userSelect: 'none',
      position: 'relative',
    }}>

      {/* ── SECTION 1: PLAYBACK CONTROLS (~200px) ── */}
      <div style={{
        width: 220, padding: '24px 20px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        borderRight: '1px solid var(--border)', flexShrink: 0, gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ControlButton icon={<SkipBack size={18} />} onClick={() => update({ currentFrame: 0, isPlaying: false })} title="First Frame (Home)" />
          <ControlButton icon={<ChevronLeft size={18} />} onClick={() => update({ currentFrame: Math.max(0, currentFrame - 1), isPlaying: false })} title="Step Back (Left)" />
          
          <button
            onClick={() => update({ isPlaying: !isPlaying })}
            style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'var(--accent-sage)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(143,175,157,0.3)',
              transition: 'all 150ms ease',
              margin: '0 4px',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            title="Play / Pause (Space)"
          >
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>

          <ControlButton icon={<ChevronRight size={18} />} onClick={() => update({ currentFrame: Math.min(total - 1, currentFrame + 1), isPlaying: false })} title="Step Forward (Right)" />
          <ControlButton icon={<SkipForward size={18} />} onClick={() => update({ currentFrame: total - 1, isPlaying: false })} title="Last Frame (End)" />
        </div>

        {/* Speed Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Speed</span>
          <button
            onClick={cycleSpeed}
            style={{
              padding: '2px 10px', borderRadius: 12,
              background: 'var(--bg-canvas)', border: '1px solid var(--border)',
              fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600,
              color: 'var(--text-secondary)', cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-canvas)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            {playbackSpeed}x
          </button>
        </div>
      </div>

      {/* ── SECTION 2: TIMELINE TRACK (flex-1) ── */}
      <div style={{
        flex: 1, minWidth: 0, position: 'relative',
        display: 'flex', flexDirection: 'column',
        padding: '16px 24px',
      }}>
        {/* Zoom Controls Overlay */}
        <div style={{
          position: 'absolute', top: 16, right: 24, zIndex: 10,
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'var(--glass-bg)', padding: 4, borderRadius: 8,
          border: '1px solid var(--border)', boxShadow: 'var(--shadow-subtle)',
        }}>
          <ZoomBtn icon={<ZoomOut size={14} />} onClick={() => setZoom(Math.max(1, zoom - 1))} disabled={zoom <= 1} />
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', width: 24, textAlign: 'center', color: 'var(--text-muted)' }}>{zoom}x</span>
          <ZoomBtn icon={<ZoomIn size={14} />} onClick={() => setZoom(Math.min(10, zoom + 1))} disabled={zoom >= 10} />
        </div>

        {/* Scrollable Container for Track */}
        <div
          ref={containerRef}
          onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
          style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', position: 'relative' }}
        >
          <div
            ref={trackRef}
            onMouseMove={onTrackMouseMove}
            onMouseLeave={() => setHoverFrame(null)}
            style={{
              position: 'absolute', top: 0, left: 0, height: '100%',
              width: trackWidth,
            }}
          >
            {/* Native Slider Overlay for Smooth Scrubbing */}
            <input
              type="range"
              min="0"
              max={total > 0 ? total - 1 : 0}
              value={currentFrame}
              onChange={(e) => {
                doUpdate({ currentFrame: parseInt(e.target.value, 10), isPlaying: false });
              }}
              style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                opacity: 0, cursor: 'pointer', zIndex: 10, margin: 0
              }}
            />
            {/* Minimap Strip */}
            <div style={{
              height: 20, width: '100%',
              display: 'flex', alignItems: 'flex-end',
              marginBottom: 20,
            }}>
              {executionTrace.map((f, i) => {
                const color = f.isBugFrame ? '#E05252' : (EVENT_COLORS[f.eventType] || 'transparent');
                if (color === 'transparent') return null;
                return (
                  <div key={i} style={{
                    position: 'absolute',
                    left: `${(i / (total - 1)) * 100}%`,
                    bottom: 0,
                    width: Math.max(1, 4 / zoom), height: f.isBugFrame ? 16 : 8,
                    background: color,
                    opacity: 0.6,
                  }} />
                );
              })}
            </div>

            {/* Track Bar */}
            <div style={{ position: 'relative', height: 16 }}>
              {/* Background */}
              <div style={{
                position: 'absolute', top: 4, left: 0, right: 0, height: 8,
                background: 'var(--border)', borderRadius: 4,
              }}>
                {/* Progress Fill */}
                <div style={{
                  height: '100%', width: `${pct}%`,
                  background: 'var(--accent-sage)', borderRadius: 4,
                  transition: isPlaying ? 'none' : 'width 100ms ease',
                }} />
              </div>

              {/* Special Event Dots */}
              {executionTrace.map((f, i) => {
                const isSpecial = f.isBugFrame || ['function_call', 'loop_start', 'return'].includes(f.eventType);
                if (!isSpecial) return null;
                const size = f.isBugFrame ? 6 : 4;
                const color = f.isBugFrame ? '#E05252' : EVENT_COLORS[f.eventType];
                return (
                  <div key={i} style={{
                    position: 'absolute', top: 8, left: `${(i / (total - 1)) * 100}%`,
                    width: size, height: size, borderRadius: '50%',
                    background: color, transform: 'translate(-50%, -50%)',
                    zIndex: 2, pointerEvents: 'none',
                    boxShadow: f.isBugFrame ? '0 0 0 2px rgba(224,82,82,0.3)' : 'none',
                  }} />
                );
              })}

              {/* Playhead */}
              <div style={{
                position: 'absolute', top: 8, left: `${pct}%`,
                width: 14, height: 14, borderRadius: '50%',
                background: 'var(--accent-sage)',
                transform: 'translate(-50%, -50%)',
                boxShadow: '0 0 0 2px var(--bg-card), 0 0 0 4px var(--accent-sage)',
                zIndex: 3, pointerEvents: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: isPlaying ? 'none' : 'left 100ms ease',
              }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#fff' }} />
              </div>
              
              {/* Vertical line indicator */}
              <div style={{
                position: 'absolute', top: -30, bottom: -20, left: `${pct}%`,
                width: 1, background: 'var(--accent-sage)', opacity: 0.3,
                zIndex: 1, pointerEvents: 'none',
                transition: isPlaying ? 'none' : 'left 100ms ease',
              }} />
            </div>

            {/* Frame Markers (Tick Marks) */}
            <div style={{ position: 'relative', height: 20, marginTop: 4 }}>
              {executionTrace.map((_, i) => {
                const is50 = i % 50 === 0;
                const is10 = i % 10 === 0;
                if (!is10 && !is50 && i !== total - 1) return null;
                return (
                  <div key={i} style={{
                    position: 'absolute', left: `${(i / (total - 1)) * 100}%`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    transform: 'translateX(-50%)',
                  }}>
                    <div style={{
                      width: 1, height: is50 ? 6 : 4,
                      background: is50 ? 'var(--text-secondary)' : 'var(--text-muted)',
                      marginBottom: 2,
                    }} />
                    {(is50 || i === total - 1) && (
                      <span style={{
                        fontSize: 9, fontFamily: 'var(--font-mono)',
                        color: 'var(--text-muted)', fontWeight: is50 ? 600 : 400,
                      }}>{i}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Hover Tooltip */}
        {hoverFrame && (
          <div style={{
            position: 'absolute', top: 4, left: hoverFrame.x + 24 - scrollLeft,
            transform: 'translateX(-50%) translateY(-100%)',
            background: 'var(--text-primary)', color: 'var(--bg-card)',
            padding: '6px 10px', borderRadius: 6,
            fontSize: 11, fontFamily: 'var(--font-mono)',
            pointerEvents: 'none', zIndex: 20,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            animation: 'fadeIn 150ms ease forwards',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Frame {hoverFrame.frame}</div>
            <div style={{ opacity: 0.8, fontSize: 10 }}>{executionTrace[hoverFrame.frame]?.eventType}</div>
            {/* Caret */}
            <div style={{
              position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%) rotate(45deg)',
              width: 8, height: 8, background: 'var(--text-primary)',
            }} />
          </div>
        )}
      </div>

      {/* ── SECTION 3: FRAME INFO & SETTINGS (resizable) ── */}
      <div style={{
        width: rightWidth, padding: '12px 16px',
        borderLeft: '1px solid var(--border)', flexShrink: 0,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        position: 'relative', overflowY: 'auto', overflowX: 'hidden',
      }}>
        {/* Resize handle on left edge */}
        <div
          onMouseDown={startRightResize}
          style={{
            position: 'absolute', top: 0, left: 0, bottom: 0, width: 5,
            cursor: 'col-resize', zIndex: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{ width: 1, height: 24, background: 'var(--border)', borderRadius: 1 }} />
        </div>

        {/* Frame Number + Description */}
        <div style={{ paddingLeft: 6 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', lineHeight: 1 }}>
              {currentFrame}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              / {total - 1}
            </span>
          </div>
          <div style={{
            fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
            fontWeight: 600, lineHeight: 1.5, marginTop: 4,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {currentFrameObj?.codeWithValues || currentFrameObj?.description?.replace(/[\{\}\;]+$/g, '').replace(/^[\{\}\s]+/g, '').trim() || '–'}
          </div>
          {currentFrameObj?.explanation && (
            <div style={{
              fontSize: 10, fontFamily: 'var(--font-sans)', color: 'var(--text-secondary)',
              lineHeight: 1.3, marginTop: 2,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {currentFrameObj.explanation}
            </div>
          )}
        </div>

        {/* Quick Jumps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 6 }}>
          <form onSubmit={handleJumpSubmit} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)' }}>Go to:</span>
            <input
              type="text"
              value={jumpInput}
              onChange={e => setJumpInput(e.target.value)}
              placeholder="0"
              style={{
                width: 44, padding: '3px 6px', fontSize: 11, fontFamily: 'var(--font-mono)',
                background: 'var(--bg-canvas)', border: '1px solid var(--border)', borderRadius: 4,
                color: 'var(--text-primary)', outline: 'none',
              }}
            />
          </form>
          <div style={{ display: 'flex', gap: 6 }}>
            <QuickJumpBtn icon={<AlertTriangle size={10} />} label="First Bug" onClick={jumpToFirstBug} disabled={!detectedBugs.length} />
            <QuickJumpBtn icon={<CornerDownLeft size={10} />} label="Last Return" onClick={jumpToLastReturn} />
          </div>
          {state.isSummarized && !executionTrace[currentFrame]?._noExpandAvailable && (
            executionTrace[currentFrame]?.skippedNext || 
            executionTrace[currentFrame]?.variables?.skippedNext?.value
          ) && (
            <button
              onClick={handleGoDeeper}
              disabled={currentFrame >= total - 1}
              style={{
                padding: '6px', borderRadius: 4,
                background: 'rgba(143,175,157,0.1)', border: '1px solid rgba(143,175,157,0.3)',
                color: 'var(--accent-sage)', fontSize: 10, fontWeight: 600,
                cursor: currentFrame >= total - 1 ? 'not-allowed' : 'pointer',
                textTransform: 'uppercase', display: 'flex', justifyContent: 'center', gap: 4,
                alignItems: 'center', transition: 'all 150ms ease',
                opacity: currentFrame >= total - 1 ? 0.5 : 1
              }}
              onMouseEnter={e => { if(currentFrame < total - 1) e.currentTarget.style.background = 'rgba(143,175,157,0.2)' }}
              onMouseLeave={e => { if(currentFrame < total - 1) e.currentTarget.style.background = 'rgba(143,175,157,0.1)' }}
            >
              <ZoomIn size={12} />
              Expand Next Step
            </button>
          )}
        </div>
      </div>

    </div>
  );
});

// ── SUBCOMPONENTS ───────────────────────────────────────────

function ControlButton({ icon, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 32, height: 32, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none',
        color: 'var(--text-secondary)', cursor: 'pointer',
        transition: 'all 150ms ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
    >
      {icon}
    </button>
  );
}

function ZoomBtn({ icon, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 20, height: 20, borderRadius: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none',
        color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={e => { if(!disabled) e.currentTarget.style.background = 'var(--border)'; }}
      onMouseLeave={e => { if(!disabled) e.currentTarget.style.background = 'transparent'; }}
    >
      {icon}
    </button>
  );
}

function QuickJumpBtn({ icon, label, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1, padding: '4px', borderRadius: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        background: 'transparent', border: '1px solid var(--border)',
        fontSize: 9, fontFamily: 'var(--font-sans)', fontWeight: 600, textTransform: 'uppercase',
        color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={e => { if(!disabled) e.currentTarget.style.background = 'var(--bg-canvas)'; }}
      onMouseLeave={e => { if(!disabled) e.currentTarget.style.background = 'transparent'; }}
    >
      {icon}
      {label}
    </button>
  );
}
export default Timeline;
