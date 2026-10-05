import { useState, type FormEvent } from 'react';
import { api, errorMessage, type Site } from '../api';
import { useAuth } from './AuthProvider';

const LAST_KEY = 'cdc-issue-tool.last-login';

/** The last username and database used on this machine, as the production tool does. */
function lastLogin(): { username: string; database: Site } {
  try {
    const saved = JSON.parse(window.localStorage.getItem(LAST_KEY) ?? '{}') as { username?: string; database?: string };
    return { username: saved.username ?? '', database: saved.database === 'AHM' ? 'AHM' : 'KOL' };
  } catch {
    return { username: '', database: 'KOL' };
  }
}

/**
 * Sign-in: ERP username + database, the same as the production entry tool.
 * `relogin` shows it as a dialog over the current screen after the session
 * expired, with the database fixed, so the form underneath stays valid.
 */
export function LoginForm({ relogin = false }: { relogin?: boolean }) {
  const { login, session } = useAuth();
  const remembered = lastLogin();
  const [username, setUsername] = useState(relogin ? (session?.user.userName?.replace(/ \(mock\)$/, '') ?? remembered.username) : remembered.username);
  const [database, setDatabase] = useState<Site>(session?.site ?? remembered.database);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), database);
      try {
        window.localStorage.setItem(LAST_KEY, JSON.stringify({ username: username.trim(), database }));
      } catch {
        // not important
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const form = (
    <form className="login-card" onSubmit={submit}>
      <h1>{relogin ? 'Session expired' : 'CDC Stock Issue'}</h1>
      {relogin && <p className="muted">Sign in again to continue. Your form is kept: after signing in, press Save again.</p>}
      {api.isMock && !relogin && <p className="notice notice-info">Mock API: any username works (“nobody” fails).</p>}
      <label>
        Username
        <input
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoFocus
        />
      </label>
      <label>
        Database
        <select value={database} onChange={(e) => setDatabase(e.target.value as Site)} disabled={relogin}>
          <option value="KOL">KOL — Kolkata</option>
          <option value="AHM">AHM — Ahmedabad</option>
        </select>
      </label>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy || !username.trim()}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );

  if (!relogin) return <div className="login-page">{form}</div>;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Sign in again">
      {form}
    </div>
  );
}
