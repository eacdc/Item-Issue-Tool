import { useState, type FormEvent } from 'react';
import { api, errorMessage, type Site } from '../api';
import { useAuth } from './AuthProvider';

const SITE_KEY = 'cdc-issue-tool.site';

function lastSite(): Site {
  try {
    return window.localStorage.getItem(SITE_KEY) === 'AHM' ? 'AHM' : 'KOL';
  } catch {
    return 'KOL';
  }
}

/** Sign-in form. `relogin` shows it as a dialog over the current screen. */
export function LoginForm({ relogin = false }: { relogin?: boolean }) {
  const { login, session } = useAuth();
  const [email, setEmail] = useState(session?.user.email ?? '');
  const [password, setPassword] = useState('');
  const [site, setSite] = useState<Site>(session?.site ?? lastSite());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password, site);
      try {
        window.localStorage.setItem(SITE_KEY, site);
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
      {api.isMock && !relogin && <p className="notice notice-info">Mock API: any email and password work (password “wrong” fails).</p>}
      <label>
        Email
        <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={!relogin || !email} />
      </label>
      <label>
        Password
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus={relogin && !!email} />
      </label>
      <label>
        Plant
        <select value={site} onChange={(e) => setSite(e.target.value as Site)} disabled={relogin}>
          <option value="KOL">Kolkata</option>
          <option value="AHM">Ahmedabad</option>
        </select>
      </label>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );

  if (!relogin) return <div className="login-page">{form}</div>;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Sign in again">
      {form}
    </div>
  );
}
