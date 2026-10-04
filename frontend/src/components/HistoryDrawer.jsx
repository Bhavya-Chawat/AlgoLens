import { useEffect, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { deleteSolution, getSolution, listSolutions } from '../api/auth.js';

const LANGUAGE = { python: 'Python', javascript: 'JavaScript', java: 'Java', cpp: 'C++' };
const smallButton = {
  padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-canvas)', color: 'var(--text-primary)',
  fontSize: 11, fontWeight: 600, cursor: 'pointer',
};

const firstLine = (preview) => String(preview || '').split('\n').find((l) => l.trim()) || '(empty)';

function HistoryPanel() {
  const { state, update } = useApp();
  const { setHistoryOpen, removeAccount, user } = useAuth();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = false;
    listSolutions().then((r) => { if (!off) setItems(r.solutions); }).catch((e) => { if (!off) setError(e.message); });
    return () => { off = true; };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setHistoryOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setHistoryOpen]);

  const open = async (id) => {
    setError('');
    try {
      const { solution } = await getSolution(id);
      update({
        view: 'editor', editorMode: 'custom', leetcodeProblem: null, entryChoice: 'auto',
        language: solution.language, code: solution.code,
        codeByLanguage: { ...state.codeByLanguage, [state.language]: state.code, [solution.language]: solution.code },
      });
      setHistoryOpen(false);
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (id) => {
    try {
      await deleteSolution(id);
      setItems((list) => list.filter((s) => s.id !== id));
    } catch (e) {
      setError(e.message);
    }
  };

  const wipe = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await removeAccount(password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) setHistoryOpen(false); }}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="My history"
        style={{ width: 560, maxWidth: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 20px 50px rgba(0,0,0,0.3)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>My history</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>The code of the runs you made while signed in as {user.username}</div>
          </div>
          <button onClick={() => setHistoryOpen(false)} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {error && <div role="alert" style={{ fontSize: 12, color: '#C05540' }}>{error}</div>}
          {items === null && !error && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: 16 }}>Loading…</div>}
          {items && items.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: 24, textAlign: 'center', lineHeight: 1.6 }}>
              Nothing yet. Every run you visualise while signed in is kept here.
            </div>
          )}
          {items && items.map((s) => (
            <div key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-canvas)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.title || firstLine(s.preview)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span>{LANGUAGE[s.language] || s.language}</span>
                  {s.algorithm && <span>{s.algorithm}</span>}
                  <span>{s.runs} run{s.runs === 1 ? '' : 's'}</span>
                  <span>{new Date(s.updatedAt * 1000).toLocaleDateString()}</span>
                </div>
              </div>
              <button style={smallButton} onClick={() => open(s.id)}>Open</button>
              <button style={{ ...smallButton, padding: '5px 7px' }} onClick={() => remove(s.id)} aria-label={`Delete ${s.title || 'this solution'}`}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 18px' }}>
          {!confirming ? (
            <button onClick={() => setConfirming(true)} style={{ background: 'transparent', border: 'none', color: '#C05540', fontSize: 12, cursor: 'pointer', padding: 0 }}>
              Delete my account and all my data…
            </button>
          ) : (
            <form onSubmit={wipe} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Type your password to delete everything, for good:</span>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
                style={{ padding: '6px 9px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-canvas)', color: 'var(--text-primary)', fontSize: 12 }}
              />
              <button type="submit" disabled={busy} style={{ ...smallButton, background: '#C05540', borderColor: '#C05540', color: '#fff' }}>{busy ? 'Deleting…' : 'Delete'}</button>
              <button type="button" onClick={() => { setConfirming(false); setPassword(''); }} style={smallButton}>Cancel</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/** Mounted only while open: it loads the list each time it opens. */
export default function HistoryDrawer() {
  const { historyOpen, user } = useAuth();
  return historyOpen && user ? <HistoryPanel /> : null;
}
