import React, { useRef, useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';

export default function MemoryTab() {
  const { state } = useApp();
  const { executionTrace, currentFrame } = state;

  const stackContainerRef = useRef(null);
  const heapContainerRef  = useRef(null);
  const [links, setLinks] = useState([]);

  const frame = executionTrace[currentFrame];
  const vars  = frame?.variables || {};
  const cs    = frame?.callStack || [];

  // Filter reference types for heap
  const refTypes = ['list', 'dict', 'set', 'tuple'];
  const heapVars = Object.entries(vars).filter(([, info]) => refTypes.includes(info.type));
  // Filter value types for stack only
  const stackVars = Object.entries(vars).filter(([, info]) => !refTypes.includes(info.type));

  // Compute positions for SVG arrows after render
  useEffect(() => {
    if (!stackContainerRef.current || !heapContainerRef.current) return;

    const newLinks = [];
    heapVars.forEach(([name]) => {
      const startEl = document.getElementById(`stack-var-${name}`);
      const endEl   = document.getElementById(`heap-obj-${name}`);
      if (startEl && endEl) {
        // We only care about relative positions to the container
        const sRect = startEl.getBoundingClientRect();
        const eRect = endEl.getBoundingClientRect();
        const pRect = startEl.closest('.memory-scroll-container').getBoundingClientRect();
        
        newLinks.push({
          id: name,
          x1: sRect.right - pRect.left,
          y1: sRect.top + sRect.height / 2 - pRect.top,
          x2: eRect.left - pRect.left,
          y2: eRect.top + eRect.height / 2 - pRect.top,
        });
      }
    });
    setLinks(newLinks);
  }, [currentFrame, heapVars]);

  if (!executionTrace.length) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        Memory visualization will appear here.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-card)', position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
          Memory Map
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Simplified Model</span>
      </div>

      {/* Split View */}
      <div className="memory-scroll-container" style={{ flex: 1, display: 'flex', overflowY: 'auto', position: 'relative', padding: '16px 0' }}>
        
        {/* SVG Arrows Overlay */}
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}>
          <defs>
            <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="var(--accent-sage)" />
            </marker>
          </defs>
          {links.map(link => (
            <path
              key={link.id}
              d={`M ${link.x1} ${link.y1} C ${link.x1 + 30} ${link.y1}, ${link.x2 - 30} ${link.y2}, ${link.x2} ${link.y2}`}
              fill="none"
              stroke="var(--accent-sage)"
              strokeWidth="1.5"
              markerEnd="url(#arrowhead)"
              style={{ transition: 'all 300ms ease' }}
            />
          ))}
        </svg>

        {/* ── STACK (Left 40%) ── */}
        <div ref={stackContainerRef} style={{ width: '40%', paddingLeft: 16, paddingRight: 8, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'center', marginBottom: 8 }}>
            Stack
          </div>
          
          {/* Active Frame */}
          <div style={{ border: '2px solid var(--accent-sage)', borderRadius: 8, background: 'rgba(143,175,157,0.05)', padding: 8 }}>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, textAlign: 'center' }}>
              {cs.length > 0 ? cs[cs.length - 1].name : 'main'}()
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Reference vars (arrows go from here) */}
              {heapVars.map(([name]) => (
                <div key={name} id={`stack-var-${name}`} style={{
                  padding: '4px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4,
                  fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  {name}
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-sage)' }} />
                </div>
              ))}
              
              {/* Value vars */}
              {stackVars.map(([name, info]) => (
                <div key={name} style={{
                  padding: '4px 8px', background: 'var(--bg-canvas)', border: '1px solid var(--border)', borderRadius: 4,
                  fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)',
                  display: 'flex', justifyContent: 'space-between'
                }}>
                  <span>{name}</span>
                  <span>{String(info.value).slice(0, 10)}</span>
                </div>
              ))}
              
              {Object.keys(vars).length === 0 && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' }}>no locals</div>
              )}
            </div>
          </div>

          {/* Suspended Parent Frames */}
          {[...cs].reverse().slice(1).map((c, i) => (
            <div key={i} style={{
              border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-canvas)', padding: 8, opacity: 0.7
            }}>
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', textAlign: 'center' }}>
                {c.name}()
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>[suspended]</div>
            </div>
          ))}
        </div>

        {/* ── HEAP (Right 60%) ── */}
        <div ref={heapContainerRef} style={{ width: '60%', paddingRight: 16, paddingLeft: 8, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'center', marginBottom: 8 }}>
            Heap (Objects)
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {heapVars.map(([name, info]) => {
              const count = Array.isArray(info.value) ? info.value.length : Object.keys(info.value || {}).length;
              return (
                <div key={name} id={`heap-obj-${name}`} style={{
                  padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
                  boxShadow: 'var(--shadow-subtle)', position: 'relative'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#1E6480' }}>
                      {info.type}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>size: {count}</span>
                  </div>
                  <div style={{
                    fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {String(info.value)}
                  </div>
                </div>
              );
            })}
            
            {heapVars.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 20 }}>
                No heap objects allocated.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
