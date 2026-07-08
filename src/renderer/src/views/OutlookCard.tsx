import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { disconnectOutlook, fetchOutlookStatus, setPrimaryOutlook, startOutlookConnect } from '../lib/api';
import type { OutlookStatus } from '../lib/types';

// Settings panel: connect Innerlume's Outlook mailboxes so WF3 re-engagement
// emails send from a real inbox (and replies are read). Supports MULTIPLE
// mailboxes — one is the primary sender; the poller reads them all. "Connect"
// opens Microsoft's consent screen in the browser; the backend captures the
// token and this card polls /auth/outlook/status until it appears. Until at least
// one is connected, emails dry-run. Refresh tokens live server-side only.
export function OutlookCard({ backendUrl }: { backendUrl: string }) {
  const [status, setStatus] = useState<OutlookStatus | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // sender being acted on
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(
    () =>
      fetchOutlookStatus(backendUrl)
        .then((s) => {
          setStatus(s);
          setOffline(false);
          return s;
        })
        .catch(() => {
          setOffline(true);
          return null;
        }),
    [backendUrl],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll while a connect handshake is in flight (user is off in their browser),
  // stopping once the mailbox count grows or after ~2 minutes. Cleaned up on unmount.
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setConnecting(false);
  }, []);
  useEffect(() => stopPolling, [stopPolling]);

  const connect = async () => {
    setError(null);
    stopPolling(); // clear any prior attempt
    const before = status?.accounts.length ?? 0;
    let url: string;
    try {
      ({ url } = await startOutlookConnect(backendUrl));
    } catch {
      setError('Couldn’t start the connection. Outlook may not be set up on the server yet.');
      return;
    }
    window.innerlume?.openExternal(url); // Microsoft's consent screen
    setConnecting(true);
    const startedAt = Date.now();
    pollRef.current = setInterval(async () => {
      const s = await refresh();
      const now = s?.accounts.length ?? 0;
      if (now > before || Date.now() - startedAt > 120_000) stopPolling();
    }, 3000);
  };

  const act = async (sender: string, fn: () => Promise<OutlookStatus>) => {
    setBusy(sender);
    setError(null);
    try {
      setStatus(await fn());
    } catch {
      setError('That didn’t work. Please try again.');
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const accounts = status?.accounts ?? [];
  const available = status?.available ?? false;
  const isStatic = status?.mode === 'static';

  return (
    <Card
      title="Outlook — re-engagement email"
      meta="Send follow-ups from Innerlume’s inbox and read replies (WF3)"
      actions={
        <Badge tone={accounts.length ? 'accent' : 'neutral'}>
          {offline ? 'offline' : accounts.length ? `${accounts.length} connected` : 'not connected'}
        </Badge>
      }
    >
      {offline ? (
        <p className="il-view__sub">Backend offline — can’t check Outlook status.</p>
      ) : (
        <>
          {accounts.length > 0 && (
            <ul className="il-list" style={{ listStyle: 'none', padding: 0, margin: '0 0 0.6rem' }}>
              {accounts.map((a) => (
                <li
                  key={a.sender}
                  className="il-card__row"
                  style={{ justifyContent: 'space-between', gap: '0.5rem', padding: '0.35rem 0' }}
                >
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <strong>{a.sender}</strong>{' '}
                    {a.primary ? (
                      <Badge tone="accent">primary sender</Badge>
                    ) : (
                      <Badge tone="neutral">reads replies</Badge>
                    )}
                    {isStatic && ' (static token)'}
                  </span>
                  {!isStatic && (
                    <span style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                      {!a.primary && (
                        <Button
                          variant="ghost"
                          disabled={!!busy}
                          onClick={() => act(a.sender, () => setPrimaryOutlook(backendUrl, a.sender))}
                        >
                          Make primary
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        disabled={busy === a.sender}
                        onClick={() => act(a.sender, () => disconnectOutlook(backendUrl, a.sender))}
                      >
                        {busy === a.sender ? 'Removing…' : 'Disconnect'}
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <p className="il-view__sub" style={{ marginTop: 0 }}>
            {accounts.length > 0
              ? 'WF3 sends from the primary mailbox; replies are read from all connected mailboxes.'
              : available
                ? 'Not connected — re-engagement emails are in dry-run (shown, not sent). Connect a mailbox to send for real.'
                : 'Not set up on the server yet. Re-engagement emails stay in dry-run until the Microsoft app is configured.'}
          </p>

          {!isStatic && (
            <div className="il-card__row" style={{ marginTop: '0.7rem' }}>
              {error && <span className="il-error">{error}</span>}
              <Button variant="primary" disabled={!available || connecting} onClick={connect}>
                {accounts.length ? '+ Connect another mailbox' : 'Connect Outlook'}
              </Button>
            </div>
          )}
          {available && connecting && (
            <p className="il-view__sub">
              Waiting for Microsoft sign-in… use <strong>“Use another account”</strong> to add a different mailbox.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
