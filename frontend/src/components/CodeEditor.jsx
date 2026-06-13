import React, { useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { PLACEHOLDER_CODE, CUSTOM_PLACEHOLDER_CODE, LANGUAGE_EXT } from '../constants/placeholders';

// ============================================================
// LINE NUMBERS
// ============================================================
function LineNumbers({ lines, activeLineIndex }) {
  return (
    <div style={{
      width: 44, flexShrink: 0,
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--text-muted)',
      textAlign: 'right',
      paddingTop: 14, paddingRight: 10,
      lineHeight: '1.65',
      userSelect: 'none',
      borderRight: '1px solid var(--border)',
    }}>
      {lines.map((_, i) => (
        <div key={i} style={{
          height: '1.65em',
          color: i === activeLineIndex ? 'var(--accent-amber)' : undefined,
          fontWeight: i === activeLineIndex ? 600 : undefined,
          transition: 'color var(--motion-standard)',
        }}>
          {i + 1}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// CODE EDITOR
// Modes: 'edit' (textarea) | 'readonly' (rendered lines)
// ============================================================
export default function CodeEditor({
  mode = 'edit',
  activeLineIndex = -1,
  style = {},
}) {
  const { state, update } = useApp();
  const textareaRef = useRef(null);
  const activeLineRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const placeholders = state.editorMode === 'leetcode' ? PLACEHOLDER_CODE : CUSTOM_PLACEHOLDER_CODE;
  // If code is empty, lines will just be [''] which correctly renders line 1
  const displayCode = state.code || '';
  const lines = displayCode.split('\n');

  // Smoothly scroll active line into view in readonly mode
  React.useEffect(() => {
    if (mode === 'readonly' && activeLineRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const el = activeLineRef.current;
      
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      
      const isVisible = (
        elRect.top >= containerRect.top &&
        elRect.bottom <= containerRect.bottom
      );
      
      if (!isVisible) {
        // Scroll so the active line is roughly in the middle
        const scrollTop = el.offsetTop - containerRect.height / 2 + elRect.height / 2;
        container.scrollTo({ top: scrollTop, behavior: 'smooth' });
      }
    }
  }, [activeLineIndex, mode]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const val = e.target.value;
      const next = val.substring(0, start) + '    ' + val.substring(end);
      update({ code: next });
      requestAnimationFrame(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 4;
      });
    }
  }, [update]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border)',
      background: 'var(--bg-canvas)',
      ...style,
    }}>
      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 14px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        background: 'var(--bg-card)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {/* Traffic-light dots */}
          {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
            <span key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c, opacity: 0.8 }} />
          ))}
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--text-muted)',
        }}>
          solution{LANGUAGE_EXT[state.language]}
          {mode === 'readonly' && (
            <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 10 }}>read-only</span>
          )}
        </span>
      </div>

      {/* Editor body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <LineNumbers lines={lines} activeLineIndex={activeLineIndex} />

        {mode === 'edit' ? (
          <textarea
            ref={textareaRef}
            id="code-editor"
            value={state.code}
            onChange={(e) => update({ code: e.target.value })}
            onKeyDown={handleKeyDown}
            placeholder={placeholders[state.language]}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            style={{
              flex: 1,
              resize: 'none',
              border: 'none', outline: 'none',
              background: 'transparent',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: 'var(--text-primary)',
              lineHeight: '1.65',
              padding: '14px 16px',
              overflowY: 'auto',
            }}
          />
        ) : (
          /* Read-only rendered lines */
          <div 
            ref={scrollContainerRef}
            style={{
              flex: 1, overflowY: 'auto',
              padding: '14px 0',
              scrollBehavior: 'smooth',
            }}
          >
            {lines.map((line, i) => (
              <div 
                key={i} 
                ref={i === activeLineIndex ? activeLineRef : null}
                style={{
                  minHeight: '1.65em',
                  lineHeight: '1.65',
                  padding: '0 16px',
                  borderLeft: i === activeLineIndex
                    ? '2px solid var(--accent-amber)'
                    : '2px solid transparent',
                  background: i === activeLineIndex
                    ? 'rgba(231, 195, 106, 0.07)'
                    : 'transparent',
                  transition: 'all 150ms ease',
                }}
              >
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12.5,
                  color: i === activeLineIndex ? 'var(--text-primary)' : 'var(--text-secondary)',
                  whiteSpace: 'pre',
                }}>
                  {line || ' '}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
