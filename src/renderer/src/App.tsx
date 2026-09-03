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
import { ImportView } from './views/ImportView';
import { IconDownload } from './components/Icons';

// Files we know how to read as a transcript (.docx via mammoth, the rest as
// plain text). Anything else dropped is ignored rather than read as noise.
const TRANSCRIPT_EXT = /\.(txt|md|vtt|srt|docx)$/i;

const DEFAULT_BACKEND = 'http://localhost:3000';
const TOKEN_KEY = 'innerlume.token';

export function App() {
  // null until main tells us which backend this install talks to. It must NOT
  // default to localhost: every view fetches on mount, so a non-null seed sent
  // the whole dashboard at http://localhost:3000 for one round trip. On a build
  // pointed at the hosted backend that request fails, each view falls back to
  // its offline SAMPLE, and Nicole watches invented clients (Jane Doe, Maya
  // Chen, sarah.m@example.com) paint and then vanish when the real URL lands.
  const [backendUrl, setBackendUrl] = useState<string | null>(null);
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
  // Recordings still extracting — surfaced as a "processing" banner in the Review
  // Queue (not a nav badge, since these aren't yet actionable drafts).
  const [processing, setProcessing] = useState(0);
  // Matched recordings with no readable note. Deliberately NOT folded into the
  // `review` nav badge: those are drafts to read, these are sessions that were
  // never read, and adding them to the same number would hide the difference
  // behind an unchanged count.
  const [unprocessed, setUnprocessed] = useState(0);
  const [backendOnline, setBackendOnline] = useState(true);
  // Manual transcript import: whether the modal is open, what text to prefill it
  // with (from a dropped file), and whether a file is currently being dragged in.
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);

  // Keep the api layer's token in sync with our state + localStorage.
  const applyToken = useCallback((t: string | null) => {
    setAuthToken(t);
    setToken(t);
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }, []);

  // Pull app info (which backend to talk to). Outside Electron (or if the IPC
  // fails) there is no config to read, so fall back to the localhost default —
  // but only here, once, rather than as the initial state everything renders on.
  useEffect(() => {
    window.innerlume
      ?.getAppInfo()
      .then((i) => setBackendUrl(i.backendUrl || DEFAULT_BACKEND))
      .catch(() => setBackendUrl(DEFAULT_BACKEND));
    if (!window.innerlume) setBackendUrl(DEFAULT_BACKEND);
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
    if (!backendUrl) return;
    fetchAuthStatus(backendUrl)
      .then(setAuthStatus)
      .catch(() => setAuthStatus({ enabled: false, configured: false })); // offline → don't lock out
  }, [backendUrl]);

  // Nav badge counts from the overview endpoint (doubles as a backend-online probe).
  const refreshCounts = useCallback(() => {
    if (!backendUrl) return;
    const num = (v: number | string | undefined) => Number(v) || 0;
    console.log('[refreshCounts] Fetching overview stats...');
    fetchOverview(backendUrl)
      .then((d) => {
        console.log('[refreshCounts] Fetch success, raw stats:', d.stats);
        setBackendOnline(true);
        setCounts((prev) => {
          const next = {
            review: num(d.stats.awaiting_review),
            unmatched: num(d.stats.unmatched),
            refills: num(d.stats.refills_due),
            engagement: num(d.stats.engagement_pending),
            checkout: num(d.stats.checkouts_awaiting),
          };
          console.log('[refreshCounts] Transitioning counts state:', { prev, next });
          return next;
        });
        setProcessing(num(d.stats.processing));
        setUnprocessed(num(d.stats.unprocessed));
      })
      .catch((err) => {
        console.error('[refreshCounts] Fetch failed:', err);
        setBackendOnline(false);
        setCounts({});
        setProcessing(0);
        setUnprocessed(0);
      });
  }, [backendUrl]);

  // Recording health comes from the backend now, not a local courier — the
  // ingest path doesn't pass through this machine at all. Polled on the same
  // cadence as the counts; a failure leaves it null, which the UI reads as
  // "checking" rather than inventing a problem.
  const refreshPocket = useCallback(() => {
    if (!backendUrl) return;
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

  // Drag-and-drop a transcript file anywhere on the window. The preventDefault on
  // dragover/drop is not cosmetic: without it Electron treats the drop as a
  // navigation and replaces the app with the file's contents. A depth counter
  // keeps the overlay from flickering as the cursor crosses child elements.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file || !TRANSCRIPT_EXT.test(file.name)) return;
      // Hand the File to the import view, which reads it (.docx included). We
      // don't read it here — file.text() would corrupt a zipped .docx.
      setImportFile(file);
      setImportOpen(true);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const openImport = useCallback(() => {
    setImportFile(null);
    setImportOpen(true);
  }, []);

  // Nothing renders until we know which backend to talk to — see the backendUrl
  // state above. The splash window is still up during this tick, so this is a
  // held frame, not a blank one.
  if (!backendUrl) return <div className="il-app" aria-busy="true" />;

  // Gate the whole app behind login when Nicole has it turned on.
  const needsLogin = authStatus?.enabled && !token;
  if (needsLogin) {
    return <Login backendUrl={backendUrl} onAuthenticated={(t) => applyToken(t)} />;
  }

  return (
    <div className="il-app">
      {showOnboarding && (
        <Onboarding backendUrl={backendUrl} pocket={pocket} onDismiss={dismissOnboarding} />
      )}
      {importOpen && (
        <ImportView
          backendUrl={backendUrl}
          initialFile={importFile}
          onClose={() => setImportOpen(false)}
          onImported={refreshCounts}
          onNavigate={setView}
        />
      )}
      {dragging && (
        <div className="il-dropzone" aria-hidden="true">
          <div className="il-dropzone__card">
            <span className="il-dropzone__icon">
              <IconDownload size={32} />
            </span>
            <span className="il-dropzone__title">Drop to import transcript</span>
            <span className="il-dropzone__sub">.txt · .md · .docx · .vtt · .srt</span>
          </div>
        </div>
      )}
      <TopBar pocket={pocket} backendOnline={backendOnline} onImport={() => openImport()} />

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
          {view === 'review' && (
            <ReviewQueue
              backendUrl={backendUrl}
              onChanged={refreshCounts}
              processing={processing}
              unprocessed={unprocessed}
            />
          )}
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
