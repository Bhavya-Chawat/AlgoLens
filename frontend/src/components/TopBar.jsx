import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Play, Sun, Moon, Eye } from 'lucide-react';
import { useApp } from '../context/AppContext';
import ApiKeySettings from './ApiKeySettings';
import ExamplesMenu from './ExamplesMenu';
import AccountMenu from './AccountMenu';
import { LANGUAGE_LABELS, LEETCODE_LANG } from '../constants/placeholders';

// ============================================================
// LANGUAGE SELECTOR DROPDOWN
// ============================================================
const LANGUAGES = Object.entries(LANGUAGE_LABELS).map(([value, label]) => ({ value, label }));

function LanguageSelector() {
  const { state, update } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = LANGUAGES.find((l) => l.value === state.language);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        id="language-selector"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 10px',
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 20,
          color: 'var(--text-secondary)',
          fontSize: 'var(--text-body)',
          fontFamily: 'var(--font-sans)',
          cursor: 'pointer',
          transition: 'all var(--motion-standard)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
      >
        {selected?.label}
        <ChevronDown size={11} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-panel)',
          zIndex: 200, minWidth: 140, overflow: 'hidden',
          animation: 'fadeIn 140ms ease forwards',
        }}>
          {LANGUAGES.map((lang) => (
            <button
              key={lang.value}
              onClick={() => { 
                const oldLang = state.language;
                const newLang = lang.value;
                if (oldLang === newLang) { setOpen(false); return; }

                // Save current code into codeByLanguage
                const updatedCodeByLang = { ...state.codeByLanguage, [oldLang]: state.code };
                
                let newCode;
                // If we are in LeetCode mode and have a fetched problem, switch to the new language's snippet
                if (state.editorMode === 'leetcode' && state.leetcodeProblem?.snippets) {
                  const snippet = state.leetcodeProblem.snippets.find(s => s.langSlug === LEETCODE_LANG[newLang]);
                  newCode = snippet ? snippet.code : (updatedCodeByLang[newLang] || '');
                } else {
                  // Restore previously saved code for this language, or empty
                  newCode = updatedCodeByLang[newLang] || '';
                }

                update({ language: newLang, code: newCode, codeByLanguage: updatedCodeByLang }); 
                setOpen(false); 
              }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 14px',
                background: lang.value === state.language ? 'var(--bg-canvas)' : 'transparent',
                border: 'none',
                color: lang.value === state.language ? 'var(--accent-sage)' : 'var(--text-primary)',
                fontSize: 'var(--text-body)',
                fontFamily: 'var(--font-sans)',
                fontWeight: lang.value === state.language ? 500 : 400,
                cursor: 'pointer',
                transition: 'background var(--motion-standard)',
              }}
              onMouseEnter={(e) => { if (lang.value !== state.language) e.currentTarget.style.background = 'var(--bg-canvas)'; }}
              onMouseLeave={(e) => { if (lang.value !== state.language) e.currentTarget.style.background = 'transparent'; }}
            >
              {lang.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// THEME TOGGLE
// ============================================================
function ThemeToggle() {
  const { state, update } = useApp();
  const isDark = state.theme === 'dark';

  return (
    <button
      id="theme-toggle"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => update({ theme: isDark ? 'light' : 'dark' })}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32,
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
        background: 'transparent',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        transition: 'all var(--motion-standard)',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-canvas)'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--border-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}

// ============================================================
// ============================================================
// DEBUG BUTTONS (Editor View CTAs in topbar)
// ============================================================
function ActionButtons({ onRun, onVisualise }) {
  const { state } = useApp();
  const busy = state.isRunning;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {state.editorMode === 'custom' && (
        <button
          onClick={onRun}
          disabled={busy}
          title="Run"
          aria-label="Run"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 16px',
            background: busy ? 'var(--bg-canvas)' : 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            color: busy ? 'var(--text-muted)' : 'var(--text-primary)',
            fontSize: 'var(--text-body)',
            fontWeight: 500,
            fontFamily: 'var(--font-sans)',
            cursor: busy ? 'not-allowed' : 'pointer',
            transition: 'all var(--motion-standard)',
          }}
          onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = 'var(--bg-canvas)'; }}
          onMouseLeave={(e) => { if (!busy) e.currentTarget.style.background = 'var(--bg-card)'; }}
        >
          <Play size={11} fill="currentColor" />
          <span className="hide-on-tablet">Run</span>
        </button>
      )}

      <button
        id="debug-visually-btn"
        onClick={onVisualise}
        disabled={busy}
        title="Visualise"
        aria-label="Visualise"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 16px',
          background: busy ? 'var(--accent-sage-hover)' : 'var(--accent-sage)',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          color: '#fff',
          fontSize: 'var(--text-body)',
          fontWeight: 500,
          fontFamily: 'var(--font-sans)',
          cursor: busy ? 'not-allowed' : 'pointer',
          letterSpacing: '0.01em',
          transition: 'all var(--motion-standard)',
        }}
        onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = 'var(--accent-sage-hover)'; }}
        onMouseLeave={(e) => { if (!busy) e.currentTarget.style.background = 'var(--accent-sage)'; }}
        onMouseDown={(e) => { if (!busy) e.currentTarget.style.transform = 'scale(0.97)'; }}
        onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        {busy ? (
          <>
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.4)',
              borderTopColor: '#fff',
              animation: 'spin 600ms linear infinite',
              display: 'inline-block', flexShrink: 0,
            }} />
            <span className="hide-on-tablet">Running…</span>
          </>
        ) : (
          <>
            <Eye size={12} strokeWidth={2.5} />
            <span className="hide-on-tablet">Visualise</span>
          </>
        )}
      </button>
    </div>
  );
}


// ============================================================
// TOPBAR — adapts per view
// ============================================================
export default function TopBar({ onRun, onVisualise }) {
  const { state, update } = useApp();
  const isVisualizer = state.view === 'visualizer';

  return (
    // three columns (logo | view tabs | tools): the middle one stays centred and no column can slide under another
    <header style={{
      height: 'var(--topbar-height)',
      display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center',
      columnGap: 'var(--space-md)',
      padding: '0 var(--space-xl)',
      background: 'var(--bg-card)',
      borderBottom: '1px solid var(--border)',
      boxShadow: 'var(--shadow-subtle)',
      zIndex: 50, flexShrink: 0,
      position: 'relative',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifySelf: 'start' }}>
        <Search size={13} style={{ color: 'var(--accent-sage)' }} />
        <span className="hide-on-tablet" style={{
          fontFamily: 'var(--font-mono)',
          fontWeight: 600, fontSize: 14,
          color: 'var(--accent-sage)',
          letterSpacing: '-0.02em',
        }}>
          AlgoLens
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {/* Editor / Visualizer Segmented Control */}
        <div style={{
          display: 'flex',
          background: 'var(--bg-canvas)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '4px'
        }}>
          <button
            onClick={() => update({ view: 'editor' })}
            style={{
              padding: '6px 16px',
              border: 'none',
              borderRadius: '6px',
              background: !isVisualizer ? 'var(--bg-card)' : 'transparent',
              color: !isVisualizer ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: !isVisualizer ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            Editor
          </button>
          <button
            onClick={() => update({ view: 'visualizer' })}
            style={{
              padding: '6px 16px',
              border: 'none',
              borderRadius: '6px',
              background: isVisualizer ? 'var(--bg-card)' : 'transparent',
              color: isVisualizer ? 'var(--text-primary)' : 'var(--text-muted)',
              boxShadow: isVisualizer ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            Visualizer
          </button>
        </div>
      </div>

      <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 'clamp(8px, 1.4vw, 16px)' }}>
        <ExamplesMenu onVisualise={onVisualise} />
        <ApiKeySettings />
        <LanguageSelector />
        <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
        {!isVisualizer && <ActionButtons onRun={onRun} onVisualise={onVisualise} />}
        <AccountMenu />
        <ThemeToggle />
      </div>
    </header>
  );
}
