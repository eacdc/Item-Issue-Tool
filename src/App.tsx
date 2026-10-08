import { useState } from 'react';
import { AuthProvider, useAuth, useSession } from './auth/AuthProvider';
import { LoginForm } from './auth/LoginForm';
import { PicklistTab } from './features/picklist/PicklistTab';
import { DirectTab } from './features/direct/DirectTab';
import { HistoryTab } from './features/history/HistoryTab';
import { ThemeToggle } from './components/ThemeToggle';
import { TabRefreshContext } from './hooks/useTabRefresh';

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
  // Each switch to a tab reloads its data from the server (see useTabRefresh).
  const [visits, setVisits] = useState<Record<Tab, number>>({ picklist: 0, direct: 0, history: 0 });
  const openTab = (t: Tab) => {
    setTab(t);
    if (t !== tab) setVisits((v) => ({ ...v, [t]: v[t] + 1 }));
  };
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
        <TabButton id="picklist" current={tab} onSelect={openTab}>Against picklist</TabButton>
        <TabButton id="direct" current={tab} onSelect={openTab}>Direct issue</TabButton>
        <TabButton id="history" current={tab} onSelect={openTab}>History</TabButton>
      </nav>
      <main>
        <TabRefreshContext.Provider value={visits.picklist}>
          <div hidden={tab !== 'picklist'}><PicklistTab /></div>
        </TabRefreshContext.Provider>
        <TabRefreshContext.Provider value={visits.direct}>
          <div hidden={tab !== 'direct'}><DirectTab /></div>
        </TabRefreshContext.Provider>
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
      <ThemeToggle />
      <span className="user">{session.user.userName ?? `User ${session.user.userId}`}</span>
      <button type="button" className="btn btn-small" onClick={() => void logout()}>Sign out</button>
    </header>
  );
}
