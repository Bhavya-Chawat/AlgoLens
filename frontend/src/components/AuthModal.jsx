import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const field = {
  width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-canvas)',
  color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box',
};

/**
 * Sign in / create account. `forced` is the gate used when the server requires an account: it cannot be closed.
 * Mounted only while open, so its fields start empty every time.
 */
export default function AuthModal({ initialMode = 'signin', forced = false }) {
  const { closeAuth, signIn, signUp, config } = useAuth();
  const canRegister = config.allowRegistration;
  const [mode, setMode] = useState(initialMode === 'signup' && canRegister ? 'signup' : 'signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const signup = mode === 'signup';

  useEffect(() => {
    if (forced) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeAuth(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [forced, closeAuth]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (signup) await signUp(username.trim(), password, share);
      else await signIn(username.trim(), password);
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  const tab = (value, label) => (
    <button
      type="button"
      onClick={() => { setMode(value); setError(''); }}
      style={{
        flex: 1, padding: '9px 0', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 600,
        color: mode === value ? 'var(--text-primary)' : 'var(--text-muted)',
        borderBottom: mode === value ? '2px solid var(--accent-sage)' : '2px solid transparent',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      onMouseDown={(e) => { if (!forced && e.target === e.currentTarget) closeAuth(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label={signup ? 'Create account' : 'Sign in'}
        style={{ width: 380, maxWidth: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 20px 50px rgba(0,0,0,0.3)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingRight: 8 }}>
          {tab('signin', 'Sign in')}
          {canRegister && tab('signup', 'Create account')}
          {!forced && (
            <button type="button" onClick={closeAuth} aria-label="Close" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6 }}>
              <X size={16} />
            </button>
          )}
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
            {forced
              ? 'Sign in to use AlgoLens on this server.'
              : 'An account keeps your runs and solutions so you can come back to them. AlgoLens works without one.'}
          </p>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 5 }}>
            Username
            <input
              style={field} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required
              autoComplete="username" spellCheck={false} maxLength={30} placeholder="bhavya_01"
            />
          </label>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 5 }}>
            Password
            <input
              style={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              autoComplete={signup ? 'new-password' : 'current-password'} maxLength={200} placeholder={signup ? 'At least 8 characters' : ''}
            />
          </label>
          {signup && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} style={{ marginTop: 2 }} />
              <span>Share which algorithm I used on a problem (never my code), so people can compare approaches. You can change this later.</span>
            </label>
          )}
          {error && <div role="alert" style={{ fontSize: 12, color: '#C05540' }}>{error}</div>}
          <button
            type="submit"
            disabled={busy}
            style={{ padding: '10px', borderRadius: 8, border: 'none', background: 'var(--accent-sage)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}
          >
            {busy ? 'One moment…' : signup ? 'Create account' : 'Sign in'}
          </button>
          {signup && <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>There is no email, so a lost password cannot be reset. You can delete your account and all its data at any time.</div>}
        </div>
      </form>
    </div>
  );
}
