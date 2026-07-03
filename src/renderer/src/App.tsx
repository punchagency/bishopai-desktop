import { useCallback, useEffect, useState } from 'react';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { Button } from './components/Button';
import { Overview } from './views/Overview';
import { ReviewQueue } from './views/ReviewQueue';
import { UnmatchedView } from './views/UnmatchedView';
import { CheckoutView } from './views/CheckoutView';
import { RefillsView } from './views/RefillsView';
import { EngagementView } from './views/EngagementView';
import { SettingsView } from './views/SettingsView';
import { Login } from './views/Login';
import { fetchAuthStatus, fetchOverview, setAuthToken, setUnauthorizedHandler } from './lib/api';
import type { AuthStatus, CourierStatus, ViewKey } from './lib/types';

const DEFAULT_BACKEND = 'http://localhost:3000';
const TOKEN_KEY = 'innerlume.token';
const DISCONNECTED: CourierStatus = {
  state: 'disconnected',
  phase: 'setup',
  lastSyncedAt: null,
  message: 'Bee not connected — click Connect Bee to start.',
};

export function App() {
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND);
  const [courier, setCourier] = useState<CourierStatus>(DISCONNECTED);
  const [view, setView] = useState<ViewKey>('overview');
  const [counts, setCounts] = useState<Partial<Record<ViewKey, number>>>({});
  const [backendOnline, setBackendOnline] = useState(true);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);

  // Keep the api layer's token in sync with our state + localStorage.
  const applyToken = useCallback((t: string | null) => {
    setAuthToken(t);
    setToken(t);
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }, []);

  // Pull app info + initial status, then subscribe to live courier updates.
  useEffect(() => {
    const bridge = window.innerlume;
    if (!bridge) return;
    bridge.getAppInfo().then((i) => setBackendUrl(i.backendUrl)).catch(() => {});
    bridge.bee.getStatus().then(setCourier).catch(() => {});
    return bridge.bee.onStatus(setCourier);
  }, []);

  // Seed the api token from storage, and when any guarded call 401s (login was
  // turned on elsewhere, or the token expired) drop it and require login.
  useEffect(() => {
    setAuthToken(localStorage.getItem(TOKEN_KEY));
    setUnauthorizedHandler(() => {
      applyToken(null);
      setAuthStatus((s) => ({ enabled: true, configured: s?.configured ?? true }));
    });
  }, [applyToken]);

  // Is login required? (Re-checked when the backend changes.)
  useEffect(() => {
    fetchAuthStatus(backendUrl)
      .then(setAuthStatus)
      .catch(() => setAuthStatus({ enabled: false, configured: false })); // offline → don't lock out
  }, [backendUrl]);

  // Nav badge counts from the overview endpoint (doubles as a backend-online probe).
  const refreshCounts = useCallback(() => {
    const num = (v: number | string | undefined) => Number(v) || 0;
    fetchOverview(backendUrl)
      .then((d) => {
        setBackendOnline(true);
        setCounts({
          review: num(d.stats.awaiting_review),
          unmatched: num(d.stats.unmatched),
          refills: num(d.stats.refills_due),
          engagement: num(d.stats.leads_active),
          checkout: num(d.stats.checkouts_awaiting),
        });
      })
      .catch(() => {
        setBackendOnline(false);
        setCounts({});
      });
  }, [backendUrl]);

  // Refresh on view change + poll live every 20s (so counts track background work).
  useEffect(() => {
    refreshCounts();
    const t = setInterval(refreshCounts, 20_000);
    return () => clearInterval(t);
  }, [refreshCounts, view]);

  const connectBee = () => {
    window.innerlume?.bee.connect().then(setCourier).catch(() => {});
  };

  // Gate the whole app behind login when Nicole has it turned on.
  const needsLogin = authStatus?.enabled && !token;
  if (needsLogin) {
    return <Login backendUrl={backendUrl} onAuthenticated={(t) => applyToken(t)} />;
  }

  return (
    <div className="il-app">
      <TopBar
        courierState={courier.state}
        courierPhase={courier.phase}
        courierMessage={courier.message}
        backendOnline={backendOnline}
        onConnectBee={connectBee}
      />

      {courier.state === 'connecting' && courier.authUrl && (
        <div className="il-banner">
          <span>Approve Bee access in your browser to start syncing conversations.</span>
          <Button variant="primary" onClick={() => window.innerlume?.openExternal(courier.authUrl!)}>
            Open approval link
          </Button>
        </div>
      )}

      <div className="il-body">
        <Sidebar active={view} counts={counts} onSelect={setView} />
        <main className="il-main">
          {view === 'overview' && <Overview backendUrl={backendUrl} courier={courier} onNavigate={setView} />}
          {view === 'review' && <ReviewQueue backendUrl={backendUrl} onChanged={refreshCounts} />}
          {view === 'unmatched' && <UnmatchedView backendUrl={backendUrl} onChanged={refreshCounts} />}
          {view === 'checkout' && <CheckoutView backendUrl={backendUrl} onChanged={refreshCounts} />}
          {view === 'refills' && <RefillsView backendUrl={backendUrl} onChanged={refreshCounts} />}
          {view === 'engagement' && <EngagementView backendUrl={backendUrl} onChanged={refreshCounts} />}
          {view === 'settings' && (
            <SettingsView
              backendUrl={backendUrl}
              token={token}
              onAuthChanged={(s, t) => {
                setAuthStatus(s);
                if (t !== undefined) applyToken(t);
              }}
              onLock={() => applyToken(null)}
            />
          )}
        </main>
      </div>
    </div>
  );
}
