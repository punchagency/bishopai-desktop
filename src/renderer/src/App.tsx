import { useCallback, useEffect, useState } from 'react';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { Overview } from './views/Overview';
import { ReviewQueue } from './views/ReviewQueue';
import { UnmatchedView } from './views/UnmatchedView';
import { CheckoutView } from './views/CheckoutView';
import { RefillsView } from './views/RefillsView';
import { EngagementView } from './views/EngagementView';
import { ScheduleView } from './views/ScheduleView';
import { ActivityView } from './views/ActivityView';
import { SettingsView } from './views/SettingsView';
import { Login } from './views/Login';
import { fetchAuthStatus, fetchOverview, fetchPocketStatus, setAuthToken, setUnauthorizedHandler } from './lib/api';
import type { AuthStatus, PocketStatus, ViewKey } from './lib/types';
import { Onboarding } from './views/Onboarding';

const DEFAULT_BACKEND = 'http://localhost:3000';
const TOKEN_KEY = 'innerlume.token';

export function App() {
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND);
  const [pocket, setPocket] = useState<PocketStatus | null>(null);
  const [view, setView] = useState<ViewKey>('overview');
  const [navCollapsed, setNavCollapsed] = useState(
    () => localStorage.getItem('innerlume.nav') === 'collapsed',
  );
  useEffect(() => {
    localStorage.setItem('innerlume.nav', navCollapsed ? 'collapsed' : 'open');
  }, [navCollapsed]);
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('innerlume.onboarded'));

  const dismissOnboarding = () => {
    localStorage.setItem('innerlume.onboarded', '1');
    setShowOnboarding(false);
  };
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

  // Pull app info (which backend to talk to).
  useEffect(() => {
    window.innerlume?.getAppInfo().then((i) => setBackendUrl(i.backendUrl)).catch(() => {});
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

  // Recording health comes from the backend now, not a local courier — the
  // ingest path doesn't pass through this machine at all. Polled on the same
  // cadence as the counts; a failure leaves it null, which the UI reads as
  // "checking" rather than inventing a problem.
  const refreshPocket = useCallback(() => {
    fetchPocketStatus(backendUrl)
      .then(setPocket)
      .catch(() => setPocket(null));
  }, [backendUrl]);

  // Refresh on view change + poll live every 20s (so counts track background work).
  useEffect(() => {
    refreshCounts();
    refreshPocket();
    const t = setInterval(() => {
      refreshCounts();
      refreshPocket();
    }, 20_000);
    return () => clearInterval(t);
  }, [refreshCounts, refreshPocket, view]);

  // Gate the whole app behind login when Nicole has it turned on.
  const needsLogin = authStatus?.enabled && !token;
  if (needsLogin) {
    return <Login backendUrl={backendUrl} onAuthenticated={(t) => applyToken(t)} />;
  }

  return (
    <div className="il-app">
      {showOnboarding && <Onboarding pocket={pocket} onDismiss={dismissOnboarding} />}
      <TopBar pocket={pocket} backendOnline={backendOnline} />

      <div className="il-body">
        <Sidebar
          active={view}
          counts={counts}
          onSelect={setView}
          collapsed={navCollapsed}
          onToggle={() => setNavCollapsed((c) => !c)}
        />
        <main className="il-main">
          {view === 'overview' && <Overview backendUrl={backendUrl} pocket={pocket} onNavigate={setView} />}
          {view === 'review' && <ReviewQueue backendUrl={backendUrl} onChanged={refreshCounts} />}
          {view === 'unmatched' && <UnmatchedView backendUrl={backendUrl} onChanged={refreshCounts} />}
          {view === 'checkout' && <CheckoutView backendUrl={backendUrl} onChanged={refreshCounts} />}
          {view === 'refills' && <RefillsView backendUrl={backendUrl} onChanged={refreshCounts} />}
          {view === 'engagement' && <EngagementView backendUrl={backendUrl} onChanged={refreshCounts} />}
          {view === 'schedule' && <ScheduleView backendUrl={backendUrl} />}
          {view === 'activity' && <ActivityView backendUrl={backendUrl} />}
          {view === 'settings' && (
            <SettingsView
              backendUrl={backendUrl}
              token={token}
              onAuthChanged={(s, t) => {
                setAuthStatus(s);
                if (t !== undefined) applyToken(t);
              }}
              onLock={() => applyToken(null)}
              onShowOnboarding={() => setShowOnboarding(true)}
            />
          )}
        </main>
      </div>
    </div>
  );
}
