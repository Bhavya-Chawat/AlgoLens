import { useEffect, useRef, useState } from 'react';
import { User, History, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const pill = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', whiteSpace: 'nowrap', flexShrink: 0, background: 'transparent',
  border: '1px solid var(--border)', borderRadius: 20, color: 'var(--text-secondary)', fontSize: 'var(--text-body)',
  fontFamily: 'var(--font-sans)', cursor: 'pointer',
};

const row = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'transparent', border: 'none',
  color: 'var(--text-primary)', fontSize: 12.5, textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-sans)',
};

/** Top bar: "Sign in" when signed out, otherwise the person's initial with history, sharing and sign out. */
export default function AccountMenu() {
  const { user, ready, openAuth, setHistoryOpen, signOut, setShare } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!ready) return null;

  if (!user) {
    return (
      <button onClick={() => openAuth('signin')} title="Sign in to keep your runs" aria-label="Sign in" style={pill}>
        <User size={13} />
        <span className="hide-on-tablet">Sign in</span>
      </button>
    );
  }

  const toggleShare = async (e) => {
    setSaving(true);
    try { await setShare(e.target.checked); } catch { /* the box simply stays as it was */ } finally { setSaving(false); }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.username}
        aria-label={`Account: ${user.username}`}
        style={{ ...pill, padding: 0, width: 30, height: 30, justifyContent: 'center', borderRadius: '50%', background: 'var(--accent-sage)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13 }}
      >
        {user.username.slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 250, background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 12, boxShadow: 'var(--shadow-panel)', zIndex: 300, overflow: 'hidden',
          }}
        >
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
            Signed in as <b style={{ color: 'var(--text-primary)' }}>{user.username}</b>
          </div>
          <button role="menuitem" style={row} onClick={() => { setOpen(false); setHistoryOpen(true); }}>
            <History size={14} /> My history
          </button>
          <label style={{ ...row, alignItems: 'flex-start', cursor: 'pointer', lineHeight: 1.45 }}>
            <input type="checkbox" checked={user.shareStats} disabled={saving} onChange={toggleShare} style={{ marginTop: 3 }} />
            <span>
              Share the algorithm I used on a problem
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>Never your code. Only counts, and only once two people share.</span>
            </span>
          </label>
          <button role="menuitem" style={{ ...row, borderTop: '1px solid var(--border)' }} onClick={() => { setOpen(false); signOut(); }}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
