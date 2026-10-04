import { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { apiJson, getGroqKey, setGroqKey } from '../api/client';

const GROQ_KEYS_URL = 'https://console.groq.com/keys';

/**
 * Groq key settings. The key is optional: tracing never needs it. It is only used for AI hints.
 */
export default function ApiKeySettings() {
  const { state, update } = useApp();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(getGroqKey());
  const [check, setCheck] = useState({ status: 'idle', text: '' }); // idle | busy | ok | bad
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const save = (key) => {
    setGroqKey(key);
    update({ hasApiKey: Boolean(key) });
  };

  const verify = async () => {
    const key = draft.trim();
    if (!key) return setCheck({ status: 'bad', text: 'Paste a key first.' });
    setCheck({ status: 'busy', text: 'Checking…' });
    try {
      const info = await apiJson('/ai/validate', { body: {}, groqKey: key });
      save(key);
      setCheck({ status: 'ok', text: `Key works. Using ${info.model}.` });
    } catch (err) {
      setCheck({ status: 'bad', text: err.message });
    }
  };

  const clear = () => {
    setDraft('');
    save('');
    setCheck({ status: 'idle', text: '' });
  };

  const color = { ok: '#2E8B57', bad: '#C05540', busy: 'var(--text-muted)', idle: 'var(--text-muted)' }[check.status];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={state.hasApiKey ? 'Groq key set (AI hints)' : 'Add a Groq key for AI hints'}
        aria-label={state.hasApiKey ? 'AI key set' : 'AI key'}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', whiteSpace: 'nowrap', flexShrink: 0,
          background: state.hasApiKey ? 'rgba(143,175,157,0.1)' : 'transparent',
          border: `1px solid ${state.hasApiKey ? 'var(--accent-sage)' : 'var(--border)'}`,
          borderRadius: 20,
          color: state.hasApiKey ? 'var(--accent-sage)' : 'var(--text-secondary)',
          fontSize: 'var(--text-body)', fontFamily: 'var(--font-sans)', cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 12 }}>🔑</span>
        <span className="hide-on-tablet" style={{ fontWeight: 500 }}>{state.hasApiKey ? 'AI key set' : 'AI key'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 340, padding: 16,
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-panel)', zIndex: 200,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Groq API key (optional)</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
            Tracing runs locally and never needs a key. A key only enables AI hints. It is free:{' '}
            <a href={GROQ_KEYS_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-sage)' }}>get one at console.groq.com</a>.
            It is stored on this device only.
          </div>
          <input
            type="password"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setCheck({ status: 'idle', text: '' }); }}
            placeholder="gsk_..."
            autoComplete="off"
            style={{
              width: '100%', padding: '8px 10px', background: 'var(--bg-canvas)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none',
            }}
          />
          {check.text && <div style={{ fontSize: 11, color, marginTop: 8, lineHeight: 1.4 }}>{check.text}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={clear} style={{
              flex: 1, padding: '6px', background: 'var(--bg-canvas)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, cursor: 'pointer',
            }}>Remove</button>
            <button onClick={verify} disabled={check.status === 'busy'} style={{
              flex: 1, padding: '6px', background: 'var(--accent-sage)', color: '#fff',
              border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>Check &amp; save</button>
          </div>
        </div>
      )}
    </div>
  );
}
