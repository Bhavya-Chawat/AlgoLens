import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import * as authApi from '../api/auth.js';

/**
 * Who is signed in. The app works without an account (Python and JavaScript run in the browser), so a missing
 * or unreachable server never blocks it; only ALGOLENS_REQUIRE_LOGIN on the server turns the sign-in screen
 * into a gate.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState({ requireLogin: false, allowRegistration: true });
  const [ready, setReady] = useState(false);
  const [dialog, setDialog] = useState(null); // null | 'signin' | 'signup'
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cfg, me] = await Promise.all([authApi.getAuthConfig(), authApi.getMe()]);
        if (cancelled) return;
        setConfig(cfg);
        setUser(me.user);
      } catch {
        /* no server, or accounts unavailable: carry on signed out */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const signIn = useCallback(async (username, password) => {
    const { user: next } = await authApi.login(username, password);
    setUser(next);
    setDialog(null);
    return next;
  }, []);

  const signUp = useCallback(async (username, password, shareStats) => {
    const { user: next } = await authApi.register(username, password, shareStats);
    setUser(next);
    setDialog(null);
    return next;
  }, []);

  const signOut = useCallback(async () => {
    try { await authApi.logout(); } catch { /* the cookie is cleared server-side; local state is what matters */ }
    setUser(null);
    setHistoryOpen(false);
  }, []);

  const setShare = useCallback(async (share) => {
    const { user: next } = await authApi.setShareStats(share);
    setUser(next);
  }, []);

  const removeAccount = useCallback(async (password) => {
    await authApi.deleteAccount(password);
    setUser(null);
    setHistoryOpen(false);
  }, []);

  const value = useMemo(() => ({
    user, config, ready, dialog, historyOpen,
    openAuth: (mode = 'signin') => setDialog(mode),
    closeAuth: () => setDialog(null),
    setHistoryOpen,
    signIn, signUp, signOut, setShare, removeAccount,
  }), [user, config, ready, dialog, historyOpen, signIn, signUp, signOut, setShare, removeAccount]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- the hook lives next to its provider on purpose
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
