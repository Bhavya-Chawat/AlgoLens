import React from 'react';

export function UnionFindVisualizer({ parentArray, rankArray, isBugFrame }) {
  if (!parentArray || !Array.isArray(parentArray)) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto' }}>
      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginBottom: 8 }}>
        <strong>Union Find (Disjoint Set)</strong>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', width: 40, textAlign: 'right' }}>index</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {parentArray.map((_, i) => (
            <div key={i} style={{ width: 32, textAlign: 'center', fontSize: 10, color: 'var(--text-muted)' }}>{i}</div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', width: 40, textAlign: 'right', fontWeight: 'bold' }}>parent</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {parentArray.map((p, i) => (
            <div key={i} style={{
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: p === i ? 'rgba(16,185,129,0.1)' : 'var(--bg-canvas)',
              border: `1px solid ${p === i ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
              borderRadius: 4, fontSize: 12, fontFamily: 'var(--font-mono)',
              color: p === i ? '#10B981' : 'var(--text-primary)',
              fontWeight: p === i ? 'bold' : 'normal',
            }}>
              {p}
            </div>
          ))}
        </div>
      </div>

      {rankArray && Array.isArray(rankArray) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', width: 40, textAlign: 'right' }}>rank</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {rankArray.map((r, i) => (
              <div key={i} style={{
                width: 32, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-canvas)', border: '1px dashed var(--border)',
                borderRadius: 4, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
              }}>
                {r}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
