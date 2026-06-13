import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Play, Sun, Moon, ArrowLeft } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { LANGUAGE_LABELS, CUSTOM_PLACEHOLDER_CODE } from '../constants/placeholders';

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
                const updates = { language: lang.value };
                
                // If we are in LeetCode mode and have a fetched problem, switch to the new language's snippet
                if (state.editorMode === 'leetcode' && state.leetcodeProblem?.snippets) {
                  const snippet = state.leetcodeProblem.snippets.find(s => s.langSlug.toLowerCase() === lang.value.toLowerCase());
                  if (snippet) updates.code = snippet.code;
                } else if (state.editorMode === 'custom') {
                  // Fallback for custom mode
                  updates.code = CUSTOM_PLACEHOLDER_CODE[lang.value];
                }

                update(updates); 
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
// API KEY SETTINGS
// ============================================================
function ApiKeySettings() {
  const { state, update } = useApp();
  const [open, setOpen] = useState(false);
  const [groqKeyInput, setGroqKeyInput] = useState(state.customApiKey);
  const [judge0KeyInput, setJudge0KeyInput] = useState(state.judge0ApiKey);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSave = () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('algolens-apikey', groqKeyInput);
      localStorage.setItem('algolens-judge0-apikey', judge0KeyInput);
    }
    update({ customApiKey: groqKeyInput, judge0ApiKey: judge0KeyInput });
    setOpen(false);
  };

  const handleClear = () => {
    setGroqKeyInput('');
    setJudge0KeyInput('');
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('algolens-apikey');
      localStorage.removeItem('algolens-judge0-apikey');
    }
    update({ customApiKey: '', judge0ApiKey: '' });
    setOpen(false);
  };

  const isCustomGroq = !!state.customApiKey;
  const isCustomJudge0 = !!state.judge0ApiKey;
  const isCustom = isCustomGroq || isCustomJudge0;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px',
          background: isCustom ? 'rgba(143,175,157,0.1)' : 'transparent',
          border: `1px solid ${isCustom ? 'var(--accent-sage)' : 'var(--border)'}`,
          borderRadius: 20,
          color: isCustom ? 'var(--accent-sage)' : 'var(--text-secondary)',
          fontSize: 'var(--text-body)',
          fontFamily: 'var(--font-sans)',
          cursor: 'pointer',
          transition: 'all var(--motion-standard)',
        }}
      >
        <span style={{ fontSize: 12 }}>🔑</span>
        <span style={{ fontWeight: 500 }}>{isCustom ? 'Custom Keys' : 'API Settings'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 320, padding: 16,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-panel)',
          zIndex: 200, animation: 'fadeIn 140ms ease forwards',
        }}>
          <button 
            onClick={() => setOpen(false)}
            style={{
              position: 'absolute', top: 12, right: 12,
              background: 'transparent', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 4
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-canvas)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>×</span>
          </button>
          
          {/* Groq Key Input */}
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Groq API Key</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.4 }}>
            Overrides the <code style={{background:'var(--bg-canvas)', padding:'2px 4px', borderRadius:4}}>.env</code> key for code tracing and testcase extraction.
          </div>
          <input
            type="password"
            value={groqKeyInput}
            onChange={(e) => setGroqKeyInput(e.target.value)}
            placeholder="gsk_..."
            style={{
              width: '100%', padding: '8px 10px',
              background: 'var(--bg-canvas)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text-primary)',
              fontSize: 12, fontFamily: 'var(--font-mono)', marginBottom: 16,
              outline: 'none'
            }}
          />

          {/* Judge0 Key Input */}
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Judge0 API Key (RapidAPI)</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.4 }}>
            Enables cloud execution. If left empty, AlgoLens will use your local machine's native compilers instead.
          </div>
          <input
            type="password"
            value={judge0KeyInput}
            onChange={(e) => setJudge0KeyInput(e.target.value)}
            placeholder="RapidAPI Key..."
            style={{
              width: '100%', padding: '8px 10px',
              background: 'var(--bg-canvas)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text-primary)',
              fontSize: 12, fontFamily: 'var(--font-mono)', marginBottom: 16,
              outline: 'none'
            }}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleClear} style={{
              flex: 1, padding: '6px', background: 'var(--bg-canvas)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, cursor: 'pointer'
            }}>Clear Both</button>
            <button onClick={handleSave} style={{
              flex: 1, padding: '6px', background: 'var(--accent-sage)', color: '#fff',
              border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer'
            }}>Save Keys</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// DEBUG BUTTON (Editor View CTA in topbar)
// ============================================================
function DebugButton({ onRun }) {
  const { state } = useApp();
  const busy = state.isRunning;

  return (
    <button
      id="debug-visually-btn"
      onClick={onRun}
      disabled={busy}
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
        flexShrink: 0,
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
          Running…
        </>
      ) : (
        <>
          <Play size={11} fill="currentColor" />
          Debug Visually
        </>
      )}
    </button>
  );
}


// ============================================================
// TOPBAR — adapts per view
// ============================================================
export default function TopBar({ onRun }) {
  const { state, update } = useApp();
  const isVisualizer = state.view === 'visualizer';

  return (
    <header style={{
      height: 'var(--topbar-height)',
      display: 'flex', alignItems: 'center',
      gap: 'var(--space-md)',
      padding: '0 var(--space-xl)',
      background: 'var(--bg-card)',
      borderBottom: '1px solid var(--border)',
      boxShadow: 'var(--shadow-subtle)',
      zIndex: 50, flexShrink: 0,
      position: 'relative',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, width: '200px' }}>
        <Search size={13} style={{ color: 'var(--accent-sage)' }} />
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontWeight: 600, fontSize: 14,
          color: 'var(--accent-sage)',
          letterSpacing: '-0.02em',
        }}>
          AlgoLens
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
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

      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '16px' }}>
        <ApiKeySettings />
        <LanguageSelector />
        <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
        {!isVisualizer && <DebugButton onRun={onRun} />}
        <ThemeToggle />
      </div>
    </header>
  );
}
