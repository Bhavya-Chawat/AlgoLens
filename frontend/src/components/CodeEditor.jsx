import { useApp } from '../context/AppContext';
import { PLACEHOLDER_CODE, CUSTOM_PLACEHOLDER_CODE, LANGUAGE_EXT } from '../constants/placeholders';
import CodeView from './CodeView';

/**
 * Framed code panel.
 *   mode 'edit'     the user's editable code (first screen)
 *   mode 'readonly' the code that was executed, with the running line highlighted
 */
export default function CodeEditor({ mode = 'edit', activeLineIndex = -1, code, bugLines = [], style = {} }) {
  const { state, update } = useApp();
  const placeholders = state.editorMode === 'leetcode' ? PLACEHOLDER_CODE : CUSTOM_PLACEHOLDER_CODE;
  const value = code ?? state.code ?? '';
  const readOnly = mode === 'readonly';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
      borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', background: 'var(--bg-canvas)',
      ...style,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 14px',
        borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-card)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
            <span key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c, opacity: 0.8 }} />
          ))}
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
          solution{LANGUAGE_EXT[state.language]}
          {readOnly && <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 10 }}>read-only</span>}
        </span>
      </div>

      <div id="code-editor" style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <CodeView
          value={value}
          language={state.language}
          onChange={readOnly ? undefined : (next) => update({ code: next })}
          activeLine={activeLineIndex >= 0 ? activeLineIndex + 1 : 0}
          bugLines={bugLines}
          placeholder={placeholders[state.language]}
        />
        {!readOnly && !value && (
          <div style={{
            position: 'absolute', top: 10, left: 62, right: 16, pointerEvents: 'none', fontFamily: 'var(--font-mono)',
            fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', lineHeight: 1.65,
          }}>
            {placeholders[state.language]}
          </div>
        )}
      </div>
    </div>
  );
}
