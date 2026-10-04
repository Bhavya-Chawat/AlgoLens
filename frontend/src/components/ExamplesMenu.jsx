import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Search, Eye, ChevronDown } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EXAMPLES, LANGUAGES, inputsFor } from '../constants/examples/index.js';
import { LANGUAGE_LABELS } from '../constants/placeholders';

/**
 * Examples: classic and hard problems, grouped by topic, in every language they exist in.
 * Picking one loads the program and its arguments into the editor; the eye button also runs it.
 */
export default function ExamplesMenu({ onVisualise }) {
  const { state, update } = useApp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [runTick, setRunTick] = useState(0);
  const handled = useRef(0);
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    setTimeout(() => inputRef.current?.focus(), 0);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  // run after the editor state holds the example (the handler closes over the latest state on re-render)
  useEffect(() => {
    if (runTick === handled.current) return;
    handled.current = runTick;
    onVisualise?.();
  }, [runTick, onVisualise]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const by = new Map();
    for (const e of EXAMPLES) {
      if (q && !`${e.title} ${e.category} ${e.blurb}`.toLowerCase().includes(q)) continue;
      if (!by.has(e.category)) by.set(e.category, []);
      by.get(e.category).push(e);
    }
    return [...by.entries()];
  }, [query]);

  const load = (example, run) => {
    const language = example[state.language] ? state.language : LANGUAGES.find((l) => example[l]);
    const code = example[language].code;
    update({
      view: 'editor',
      editorMode: 'custom',
      leetcodeProblem: null,
      language,
      code,
      codeByLanguage: { ...state.codeByLanguage, [state.language]: state.code, [language]: code },
      customInputs: inputsFor(example, language),
      entryChoice: 'auto',
      stdin: '',
    });
    setOpen(false);
    if (run) setRunTick((t) => t + 1);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        id="examples-menu"
        title="Examples"
        aria-label="Examples"
        onClick={() => { if (!open) setQuery(''); setOpen((o) => !o); }} // a fresh search each time it opens
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 11px', background: 'transparent',
          border: '1px solid var(--border)', borderRadius: 20, color: 'var(--text-secondary)', fontSize: 'var(--text-body)',
          fontFamily: 'var(--font-sans)', cursor: 'pointer', transition: 'all var(--motion-standard)',
        }}
      >
        <BookOpen size={12} />
        <span className="hide-on-tablet">Examples</span>
        <ChevronDown size={11} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Examples"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 420, maxHeight: 'min(70vh, 560px)',
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-panel)',
            zIndex: 300, display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'fadeIn 140ms ease forwards',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <Search size={13} style={{ color: 'var(--text-muted)' }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search: dijkstra, union-find, trie, dp…"
              aria-label="Search examples"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-sans)' }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{EXAMPLES.length}</span>
          </div>
          <div style={{ overflowY: 'auto', padding: '4px 6px 10px' }}>
            {groups.length === 0 && <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>No example matches “{query}”.</div>}
            {groups.map(([category, list]) => (
              <div key={category}>
                <div style={{ padding: '10px 8px 4px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{category}</div>
                {list.map((e) => {
                  const here = Boolean(e[state.language]);
                  return (
                    <div
                      key={e.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, cursor: 'pointer' }}
                      onMouseEnter={(ev) => { ev.currentTarget.style.background = 'var(--bg-canvas)'; }}
                      onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; }}
                    >
                      <button
                        onClick={() => load(e, false)}
                        style={{ all: 'unset', flex: 1, minWidth: 0, cursor: 'pointer' }}
                        aria-label={`Load ${e.title}`}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{e.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, lineHeight: 1.35 }}>{e.blurb}</div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                          {LANGUAGES.filter((l) => e[l]).map((l) => (
                            <span key={l} style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: l === state.language ? 'var(--accent-sage)' : 'var(--bg-canvas)', color: l === state.language ? '#fff' : 'var(--text-muted)' }}>
                              {LANGUAGE_LABELS[l] || l}
                            </span>
                          ))}
                        </div>
                      </button>
                      <button
                        onClick={() => load(e, true)}
                        title={here ? 'Load and visualise' : `Load (${LANGUAGE_LABELS[LANGUAGES.find((l) => e[l])]}) and visualise`}
                        aria-label={`Visualise ${e.title}`}
                        style={{ all: 'unset', cursor: 'pointer', width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--accent-sage)', color: '#fff', flexShrink: 0 }}
                      >
                        <Eye size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
