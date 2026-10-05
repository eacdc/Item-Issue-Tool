import { useState } from 'react';
import { mockApi } from './api';
import { AuthProvider, useAuth, useSession } from './auth/AuthProvider';
import { LoginForm } from './auth/LoginForm';
import { PicklistTab } from './features/picklist/PicklistTab';
import { DirectTab } from './features/direct/DirectTab';
import { HistoryTab } from './features/history/HistoryTab';

type Tab = 'picklist' | 'direct' | 'history';

export function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

function Shell() {
  const { status, reloginRequired } = useAuth();
  if (status === 'loading') return <div className="login-page"><p className="muted">Loading…</p></div>;
  if (status === 'signedOut') return <LoginForm />;
  return (
    <>
      <Main />
      {reloginRequired && <LoginForm relogin />}
    </>
  );
}

function Main() {
  const session = useSession();
  // Tabs stay mounted, so switching to History and back keeps a half-filled form.
  const [tab, setTab] = useState<Tab>('picklist');
  return (
    <div className="app">
      <Header />
      {!session.writesEnabled && (
        <div className="dry-run-banner" role="status">
          <strong>DRY RUN</strong> — saves and deletes are tested on the server and rolled back. Nothing is written to the ERP and no voucher number is used.
        </div>
      )}
      {!session.canPost && (
        <div className="notice notice-warn banner">
          Your login is not linked to an ERP user, so you can look things up but not save or delete. Ask an admin to set your ERP UserID.
        </div>
      )}
      <nav className="tabs" role="tablist">
        <TabButton id="picklist" current={tab} onSelect={setTab}>Against picklist</TabButton>
        <TabButton id="direct" current={tab} onSelect={setTab}>Direct issue</TabButton>
        <TabButton id="history" current={tab} onSelect={setTab}>History</TabButton>
      </nav>
      <main>
        <div hidden={tab !== 'picklist'}><PicklistTab /></div>
        <div hidden={tab !== 'direct'}><DirectTab /></div>
        {tab === 'history' && <HistoryTab />}
      </main>
    </div>
  );
}

function TabButton({ id, current, onSelect, children }: { id: Tab; current: Tab; onSelect: (t: Tab) => void; children: string }) {
  return (
    <button type="button" role="tab" aria-selected={current === id} className={`tab${current === id ? ' active' : ''}`} onClick={() => onSelect(id)}>
      {children}
    </button>
  );
}

function Header() {
  const session = useSession();
  const { logout } = useAuth();
  return (
    <header className="app-header">
      <span className="brand">CDC Stock Issue</span>
      <span className="site">{session.site === 'KOL' ? 'Kolkata' : 'Ahmedabad'}</span>
      {!session.writesEnabled && <span className="badge badge-dry">DRY RUN</span>}
      <span className="spacer" />
      {mockApi && <MockControls />}
      <span className="user">{session.user.displayName ?? session.user.email}</span>
      <button type="button" className="btn btn-small" onClick={() => void logout()}>Sign out</button>
    </header>
  );
}

/** Only in mock mode: switch the server behaviours the UI must handle. */
function MockControls() {
  const { refreshSession } = useAuth();
  const [writes, setWrites] = useState(() => mockApi?.writesEnabled ?? false);
  const [failRefresh, setFailRefresh] = useState(false);
  if (!mockApi) return null;
  const m = mockApi;
  return (
    <details className="mock-controls">
      <summary>Mock API</summary>
      <div className="mock-menu">
        <label>
          <input
            type="checkbox"
            checked={writes}
            onChange={(e) => {
              m.writesEnabled = e.target.checked;
              setWrites(e.target.checked);
              void refreshSession();
            }}
          />
          Writes enabled (off = every save is a dry run)
        </label>
        <label>
          <input
            type="checkbox"
            checked={failRefresh}
            onChange={(e) => {
              m.failNextStockRefresh = e.target.checked;
              setFailRefresh(e.target.checked);
            }}
          />
          Fail the stock refresh on the next save
        </label>
        <button type="button" className="btn btn-small" onClick={() => m.expireSession()}>
          Expire session (next call gets 401)
        </button>
      </div>
    </details>
  );
}
