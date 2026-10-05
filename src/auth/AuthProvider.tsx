/**
 * Session handling.
 *
 * A 401 from any call raises `reloginRequired` instead of tearing the app
 * down, so the screen (and a half-filled issue form) stays mounted under the
 * sign-in dialog. After signing in again the user presses Save again; the form
 * kept its request ID, so a save that did go through is not duplicated.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, errorMessage, type SessionInfo, type Site } from '../api';
import { getToken, setToken } from './token';

type Status = 'loading' | 'signedOut' | 'ready';

interface AuthContextValue {
  status: Status;
  session: SessionInfo | null;
  reloginRequired: boolean;
  login: (email: string, password: string, site: Site) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(getToken() ? 'loading' : 'signedOut');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [reloginRequired, setReloginRequired] = useState(false);

  useEffect(() => {
    api.setUnauthorizedListener(() => setReloginRequired(true));
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const info = await api.session();
      setSession(info);
      setStatus('ready');
      setReloginRequired(false);
    } catch (err) {
      console.warn('Session check failed:', errorMessage(err));
      setToken(null);
      setSession(null);
      setStatus('signedOut');
      setReloginRequired(false);
    }
  }, []);

  useEffect(() => {
    if (getToken()) void refreshSession();
  }, [refreshSession]);

  const login = useCallback(async (email: string, password: string, site: Site) => {
    await api.login({ email, password, site });
    const info = await api.session();
    setSession(info);
    setStatus('ready');
    setReloginRequired(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // The token is dropped either way.
    }
    setSession(null);
    setStatus('signedOut');
    setReloginRequired(false);
  }, []);

  const value = useMemo(
    () => ({ status, session, reloginRequired, login, logout, refreshSession }),
    [status, session, reloginRequired, login, logout, refreshSession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function useSession(): SessionInfo {
  const { session } = useAuth();
  if (!session) throw new Error('useSession needs a signed-in session');
  return session;
}
