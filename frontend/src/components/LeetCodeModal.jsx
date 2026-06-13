import React from 'react';
import { X } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function LeetCodeModal() {
  const { state, update } = useApp();
  
  // We can store leetcode data in state or pass as props. 
  // For now we'll assume it's in state if a leetcode problem was fetched.
  const { leetcodeProblem, isLeetcodeModalOpen } = state;

  if (!isLeetcodeModalOpen || !leetcodeProblem) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(4px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '800px',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-canvas)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', color: 'var(--text-primary)' }}>
              {leetcodeProblem.title || 'LeetCode Problem'}
            </h2>
            {leetcodeProblem.difficulty && (
              <span style={{
                fontSize: '12px',
                padding: '4px 8px',
                borderRadius: '12px',
                background: leetcodeProblem.difficulty === 'Easy' ? 'rgba(44, 187, 93, 0.15)' : 
                            leetcodeProblem.difficulty === 'Medium' ? 'rgba(255, 192, 30, 0.15)' : 'rgba(255, 55, 95, 0.15)',
                color: leetcodeProblem.difficulty === 'Easy' ? '#2cbb5d' : 
                       leetcodeProblem.difficulty === 'Medium' ? '#ffc01e' : '#ff375f',
                fontWeight: 'bold'
              }}>
                {leetcodeProblem.difficulty}
              </span>
            )}
          </div>
          <button 
            onClick={() => update({ isLeetcodeModalOpen: false })}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              borderRadius: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div 
          style={{
            padding: '24px',
            overflowY: 'auto',
            color: 'var(--text-secondary)',
            lineHeight: '1.6',
            fontSize: '14px',
          }}
          dangerouslySetInnerHTML={{ __html: leetcodeProblem.content }}
        />
      </div>
    </div>
  );
}
