import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import {
  SkipBack, ChevronLeft, Play, Pause, ChevronRight, SkipForward,
  ZoomIn, ZoomOut, AlertTriangle, CornerDownLeft, ChevronsUpDown,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { itemIndexFor, representativeFrame } from '../core/beats';

// ============================================================
// CONSTANTS
// ============================================================
const EVENT_COLORS = {
  function_call: '#A78BFA',
  assignment: '#8FAF9D',
  loop_start: '#E7C36A',
  branch: '#FCD34D',
  return: '#D49B84',
  exception: '#E05252',
  comparison: '#7EB8D4',
  line: '#9CA3AF',
};
const FOLD_COLOR = '#B7A8E8';
const SPEEDS = [0.25, 0.5, 1, 2, 4];
const STRIP_HEIGHT = 34;

const cssVar = (name, fallback) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

// ============================================================
// TRACK — one canvas instead of thousands of DOM nodes
// ============================================================
function Track({ items, frames, current, width, onPick, onHover }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(STRIP_HEIGHT * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, STRIP_HEIGHT);

    const n = items.length;
    const slot = n > 0 ? width / n : width;
    const barW = Math.max(1, Math.min(slot - (slot > 4 ? 1 : 0), 14));
    ctx.font = '600 9px ui-monospace, monospace';
    ctx.textBaseline = 'middle';

    items.forEach((item, i) => {
      const x = i * slot + (slot - barW) / 2;
      if (item.type === 'fold') {
        const w = Math.max(barW, Math.min(slot - 1, 28));
        ctx.fillStyle = FOLD_COLOR;
        ctx.globalAlpha = 0.28;
        ctx.fillRect(x, 3, w, STRIP_HEIGHT - 6);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = FOLD_COLOR;
        ctx.strokeRect(x + 0.5, 3.5, w - 1, STRIP_HEIGHT - 7);
        if (w >= 20) {
          ctx.fillStyle = cssVar('--text-secondary', '#666');
          ctx.fillText(`×${item.count}`, x + 3, STRIP_HEIGHT / 2);
        }
        return;
      }
      const f = frames[item.index];
      const bug = f?.isBugFrame;
      ctx.fillStyle = bug ? '#E05252' : EVENT_COLORS[f?.eventType] || EVENT_COLORS.line;
      ctx.globalAlpha = bug ? 1 : 0.75;
      const h = bug ? STRIP_HEIGHT - 4 : f?.eventType === 'function_call' || f?.eventType === 'return' ? 22 : 14;
      ctx.fillRect(x, STRIP_HEIGHT - h - 2, barW, h);
    });
    ctx.globalAlpha = 1;

    if (n > 0) {
      const x = current * slot + slot / 2;
      ctx.fillStyle = cssVar('--accent-sage', '#8FAF9D');
      ctx.fillRect(x - 1, 0, 2, STRIP_HEIGHT);
    }
  }, [items, frames, current, width]);

  const indexAt = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width - 1));
    return Math.min(items.length - 1, Math.floor((x / rect.width) * items.length));
  }, [items.length]);

  const onDown = (e) => {
    onPick(indexAt(e));
    const move = (ev) => onPick(indexAt(ev));
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={onDown}
      onMouseMove={(e) => onHover({ index: indexAt(e), x: e.clientX - canvasRef.current.getBoundingClientRect().left })}
      onMouseLeave={() => onHover(null)}
      style={{ width, height: STRIP_HEIGHT, display: 'block', cursor: 'pointer' }}
    />
  );
}

// ============================================================
// TIMELINE COMPONENT
// ============================================================
const Timeline = React.memo(function Timeline({ trace }) {
  const { state, update, beats } = useApp();
  const isMain = !trace;
  const frames = trace || state.executionTrace;

  // Diff panes show every frame; the main timeline shows the Beats plan.
  const frameItems = useMemo(() => frames.map((_, index) => ({ type: 'frame', index })), [frames]);
  const items = isMain ? beats.items : frameItems;

  const { currentFrame, isPlaying, playbackSpeed, detectedBugs } = state;
  const total = frames.length;
  const current = itemIndexFor(items, currentFrame);
  const item = items[current];
  const onFold = item?.type === 'fold';

  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState(null);
  const [jumpInput, setJumpInput] = useState('');
  const [rightWidth, setRightWidth] = useState(210);
  const [boxWidth, setBoxWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const boxRef = useRef(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setBoxWidth(el.clientWidth));
    ro.observe(el);
    setBoxWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [total]);

  const trackWidth = Math.max(0, Math.round(boxWidth * zoom));

  // keep the playhead in view while zoomed
  useEffect(() => {
    if (zoom > 1 && boxRef.current && items.length > 1) {
      const target = (current / (items.length - 1)) * trackWidth - boxWidth / 2;
      boxRef.current.scrollTo({ left: target, behavior: isPlaying ? 'smooth' : 'auto' });
    }
  }, [current, zoom, isPlaying, items.length, trackWidth, boxWidth]);

  const pick = useCallback((index) => {
    const it = items[index];
    if (it) update({ currentFrame: representativeFrame(it), isPlaying: false });
  }, [items, update]);

  const startRightResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = rightWidth;
    const onMove = (ev) => setRightWidth(Math.max(150, Math.min(380, startW + (startX - ev.clientX))));
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  if (total === 0) {
    return (
      <div className="animate-slide-up" style={{
        height: '100%', background: 'var(--bg-card)', borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.6,
        color: 'var(--text-muted)', fontSize: 12,
      }}>
        No execution trace
      </div>
    );
  }

  const frame = frames[currentFrame];
  const jumpToFirstBug = () => detectedBugs.length && beats.goToFrame(detectedBugs[0].frameId);
  const jumpToLastReturn = () => {
    for (let i = total - 1; i >= 0; i -= 1) {
      if (frames[i].eventType === 'return') { beats.goToFrame(i); return; }
    }
  };
  const submitJump = (e) => {
    e.preventDefault();
    const v = parseInt(jumpInput, 10);
    if (!Number.isNaN(v) && v >= 0 && v < total) { beats.goToFrame(v); setJumpInput(''); }
  };
  const cycleSpeed = () => update({ playbackSpeed: SPEEDS[(SPEEDS.indexOf(playbackSpeed) + 1) % SPEEDS.length] });

  const folded = isMain ? items.some((i) => i.type === 'fold') : false;
  const effective = items.length === total ? 'full' : 'overview';
  const hoverItem = hover ? items[hover.index] : null;
  const hoverText = !hoverItem ? '' : hoverItem.type === 'fold'
    ? `${hoverItem.label} (frames ${hoverItem.start}–${hoverItem.end})`
    : `Frame ${hoverItem.index} · ${frames[hoverItem.index]?.eventType || ''}`;

  const stepBy = (d) => (isMain
    ? beats.stepBy(d)
    : update({ currentFrame: Math.max(0, Math.min(total - 1, currentFrame + d)), isPlaying: false }));

  return (
    <div style={{
      height: '100%', background: 'var(--bg-card)', borderTop: '1px solid var(--border)',
      display: 'flex', flexShrink: 0, userSelect: 'none', position: 'relative',
    }}>
      {/* ── SECTION 1: PLAYBACK CONTROLS ── */}
      <div style={{
        width: 220, padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', borderRight: '1px solid var(--border)', flexShrink: 0, gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ControlButton icon={<SkipBack size={18} />} onClick={() => stepBy(-Infinity)} title="First (Home)" />
          <ControlButton icon={<ChevronLeft size={18} />} onClick={() => stepBy(-1)} title="Step back (←)" />
          <button
            onClick={() => update({ isPlaying: !isPlaying })}
            style={{
              width: 44, height: 44, borderRadius: '50%', background: 'var(--accent-sage)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(143,175,157,0.3)', margin: '0 4px',
            }}
            title="Play / Pause (Space)"
          >
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>
          <ControlButton icon={<ChevronRight size={18} />} onClick={() => stepBy(1)} title="Step forward (→)" />
          <ControlButton icon={<SkipForward size={18} />} onClick={() => stepBy(Infinity)} title="Last (End)" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Speed</span>
          <button onClick={cycleSpeed} style={{
            padding: '2px 10px', borderRadius: 12, background: 'var(--bg-canvas)', border: '1px solid var(--border)',
            fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer',
          }}>{playbackSpeed}x</button>
        </div>
      </div>

      {/* ── SECTION 2: TRACK ── */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column', padding: '14px 24px' }}>
        <div style={{
          position: 'absolute', top: 10, right: 24, zIndex: 10, display: 'flex', alignItems: 'center', gap: 4,
          background: 'var(--glass-bg)', padding: 4, borderRadius: 8, border: '1px solid var(--border)',
        }}>
          <ZoomBtn icon={<ZoomOut size={14} />} onClick={() => setZoom(Math.max(1, zoom - 1))} disabled={zoom <= 1} />
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', width: 24, textAlign: 'center', color: 'var(--text-muted)' }}>{zoom}x</span>
          <ZoomBtn icon={<ZoomIn size={14} />} onClick={() => setZoom(Math.min(10, zoom + 1))} disabled={zoom >= 10} />
        </div>

        {/* paddingRight: the zoom control floats over the top-right corner of this panel */}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', flexWrap: 'wrap', columnGap: 10, rowGap: 2, alignItems: 'center', paddingRight: 104 }}>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
            {items.length} beat{items.length === 1 ? '' : 's'}
          </span>
          <span>from {total.toLocaleString()} recorded steps</span>
          {folded && <span style={{ color: '#6D5BB5' }}>▮ folded run: select it, then “Expand”</span>}
        </div>

        <div ref={boxRef} onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)} style={{ flex: 1, overflowX: zoom > 1 ? 'auto' : 'hidden', overflowY: 'hidden', position: 'relative' }}>
          {boxWidth > 0 && (
            <Track
              items={items} frames={frames} current={current} width={trackWidth}
              onPick={pick} onHover={setHover}
            />
          )}
        </div>

        {hover && hoverText && (
          <div style={{
            position: 'absolute', top: 4,
            left: Math.min(Math.max(hover.x + 24 - scrollLeft, 60), Math.max(boxWidth - 60, 60)),
            transform: 'translateX(-50%)', background: 'var(--text-primary)', color: 'var(--bg-card)',
            padding: '5px 9px', borderRadius: 6, fontSize: 11, fontFamily: 'var(--font-mono)', pointerEvents: 'none',
            zIndex: 20, whiteSpace: 'nowrap', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {hoverText}
          </div>
        )}
      </div>

      {/* ── SECTION 3: FRAME INFO ── */}
      <div style={{
        width: rightWidth, padding: '12px 16px', borderLeft: '1px solid var(--border)', flexShrink: 0,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative',
        overflowY: 'auto', overflowX: 'hidden',
      }}>
        <div onMouseDown={startRightResize} style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 5, cursor: 'col-resize', zIndex: 10 }} />

        <div style={{ paddingLeft: 6 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', lineHeight: 1 }}>{currentFrame}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>/ {total - 1}</span>
          </div>
          <div style={{
            fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600, marginTop: 4,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {onFold ? item.label : frame?.codeWithValues || frame?.description?.replace(/[{};]+$/g, '').replace(/^[{}\s]+/g, '').trim() || '–'}
          </div>
          {!onFold && frame?.explanation && (
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.3, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {frame.explanation}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingLeft: 6 }}>
          {isMain && (
            <div style={{ display: 'flex', gap: 4 }}>
              {['overview', 'full'].map((mode) => {
                const active = (state.detail === 'auto' ? effective : state.detail) === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => update({ detail: mode })}
                    title={mode === 'full' ? 'Every recorded step, one by one' : 'Fold repeated loop iterations (nothing is lost)'}
                    style={{
                      flex: 1, padding: '4px 0', borderRadius: 4, fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                      border: `1px solid ${active ? 'var(--accent-sage)' : 'var(--border)'}`, cursor: 'pointer',
                      background: active ? 'rgba(143,175,157,0.15)' : 'transparent',
                      color: active ? 'var(--accent-sage)' : 'var(--text-muted)',
                    }}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
          )}

          {onFold && isMain && (
            <button
              onClick={() => beats.goToFrame(item.start)}
              style={{
                padding: '6px', borderRadius: 4, background: 'rgba(183,168,232,0.18)', border: `1px solid ${FOLD_COLOR}`,
                color: '#6D5BB5', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', gap: 4,
                justifyContent: 'center', alignItems: 'center', textTransform: 'uppercase',
              }}
            >
              <ChevronsUpDown size={12} /> Expand ×{item.count}
            </button>
          )}

          <form onSubmit={submitJump} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)' }}>Go to:</span>
            <input
              type="text" value={jumpInput} onChange={(e) => setJumpInput(e.target.value)} placeholder="0"
              style={{
                width: 48, padding: '3px 6px', fontSize: 11, fontFamily: 'var(--font-mono)', background: 'var(--bg-canvas)',
                border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', outline: 'none',
              }}
            />
          </form>
          <div style={{ display: 'flex', gap: 6 }}>
            <QuickJumpBtn icon={<AlertTriangle size={10} />} label="First Bug" onClick={jumpToFirstBug} disabled={!detectedBugs.length} />
            <QuickJumpBtn icon={<CornerDownLeft size={10} />} label="Last Return" onClick={jumpToLastReturn} />
          </div>
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
        width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
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
        width: 20, height: 20, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none', color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
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
        flex: 1, padding: '4px', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        background: 'transparent', border: '1px solid var(--border)', fontSize: 9, fontFamily: 'var(--font-sans)',
        fontWeight: 600, textTransform: 'uppercase', color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

export default Timeline;
