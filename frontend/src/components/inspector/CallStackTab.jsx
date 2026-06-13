import React from 'react';
import { Layers } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export default function CallStackTab() {
  const { state } = useApp();
  const { executionTrace, currentFrame } = state;
  const frame = executionTrace[currentFrame];
  const cs = frame?.callStack || [];

  if (!executionTrace.length) {
    return (
      <div className="animate-fade-in" style={{ padding: 16 }}>
        <div style={{
          padding: '10px 14px', borderRadius: 6,
          borderLeft: '3px solid var(--border)',
          background: 'var(--bg-canvas)',
          borderBottom: '1px solid var(--border)',
          opacity: 0.3
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 13,
            color: 'var(--text-primary)', fontWeight: 600,
          }}>
            main()
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--text-muted)', marginTop: 4,
          }}>
            Call stack appears here during execution.
          </div>
        </div>
      </div>
    );
  }

  const stack = [...cs].reverse();
  const depth = cs.length;

  let depthColor = '#28C840'; // green
  if (depth > 10) depthColor = '#FEBC2E'; // amber
  if (depth > 30) depthColor = '#FF5F57'; // red

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header / Depth Warning */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--bg-card)', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
          <Layers size={14} />
          <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Call Stack
          </span>
        </div>
        
        {depth > 3 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '2px 8px', borderRadius: 12,
            background: 'var(--bg-canvas)', border: `1px solid ${depthColor}40`,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: depthColor }} />
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              Depth: {depth}
            </span>
          </div>
        )}
      </div>

      {/* Stack Frames */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stack.map((entry, i) => {
            const isTop = i === 0;
            // Original depth (0 for main, 1 for inner...)
            // i=0 is the deepest (current) frame, which has the max depth
            const originalDepth = (cs.length - 1) - i;
            const indent = Math.min(originalDepth * 8, 32);

            return (
              <div
                key={`${entry.name}-${originalDepth}`}
                style={{
                  marginLeft: indent,
                  padding: '10px 14px', borderRadius: 6,
                  borderLeft: isTop ? '3px solid var(--accent-sage)' : '3px solid var(--border)',
                  background: isTop ? 'rgba(143,175,157,0.07)' : 'var(--bg-canvas)',
                  border: isTop ? undefined : '1px solid var(--border)',
                  borderLeftWidth: '3px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  animation: isTop ? 'fadeIn 200ms ease forwards' : 'none',
                  transition: 'all 200ms ease',
                }}
              >
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 13,
                  color: isTop ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: isTop ? 600 : 400,
                }}>
                  {entry.name}()
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: 'var(--text-muted)',
                }}>
                  line {entry.line}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
