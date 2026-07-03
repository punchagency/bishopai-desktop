import { useCallback, useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { fetchRefillDigest, sendRefillOrders, skipRefill, snoozeRefill } from '../lib/api';
import type { RefillDigest, RefillItem, RefillTier } from '../lib/types';

// WF4: refill reminders timed off each supplement's run-out (projected nightly
// from dose × qty × start date). Nicole's daily digest — snooze, skip, or
// bulk-send the orders to Fullscript (dry-run until Fullscript is configured).

// Offline preview so the section renders standalone when the backend is down.
const SAMPLE: RefillDigest = {
  fullscript_configured: false,
  refills: [
    sample('s1', 'Maya Chen', 'Magnesium glycinate', 3, 'soon'),
    sample('s2', 'David Osei', 'B-complex', -2, 'overdue'),
    sample('s3', 'Lena Petrov', 'Omega-3', 12, 'soon'),
  ],
};
function sample(id: string, client: string, supp: string, daysLeft: number, tier: RefillTier): RefillItem {
  return {
    id, due_date: null, status: 'pending', days_left: daysLeft, client_id: null,
    client_name: client, supplement_name: supp, dose: null, qty: null, tier,
  };
}

const TONE: Record<RefillTier, 'warning' | 'accent' | 'neutral'> = {
  overdue: 'warning',
  soon: 'accent',
  coming: 'neutral',
};

export function RefillsView({ backendUrl, onChanged }: { backendUrl: string; onChanged?: () => void }) {
  const [digest, setDigest] = useState<RefillDigest | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null); // refill id being actioned
  const [sending, setSending] = useState(false);

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      return fetchRefillDigest(backendUrl, signal)
        .then((d) => {
          setDigest(d);
          setOffline(false);
        })
        .catch(() => {
          setDigest(SAMPLE);
          setOffline(true);
        })
        .finally(() => setLoading(false));
    },
    [backendUrl],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    if (offline) return; // sample rows aren't real
    setPending(id);
    try {
      await fn();
      await load();
      onChanged?.();
    } catch {
      /* surfaced on next load */
    } finally {
      setPending(null);
    }
  };

  const sendDue = async () => {
    if (offline || !d) return;
    const ids = d.refills.filter((r) => r.tier !== 'coming' && r.status === 'pending').map((r) => r.id);
    if (ids.length === 0) return;
    setSending(true);
    try {
      await sendRefillOrders(backendUrl, ids);
      await load();
      onChanged?.();
    } catch {
      /* surfaced on next load */
    } finally {
      setSending(false);
    }
  };

  if (loading && !digest) return <p className="il-empty">Loading refill digest…</p>;

  const d = digest ?? SAMPLE;
  const dueCount = d.refills.filter((r) => r.tier !== 'coming' && r.status === 'pending').length;

  return (
    <section className="il-view">
      <div className="il-view__head">
        <div>
          <h1 className="il-view__title">Refills</h1>
          <p className="il-view__sub">
            {d.refills.length} client{d.refills.length === 1 ? '' : 's'} to review
            {offline && <Badge tone="warning">&nbsp;offline preview&nbsp;</Badge>}
            {!offline && !d.fullscript_configured && <Badge tone="neutral">&nbsp;Fullscript dry-run&nbsp;</Badge>}
          </p>
        </div>
        <Button variant="primary" disabled={offline || sending || dueCount === 0} onClick={sendDue}>
          {sending ? 'Sending…' : `Send ${dueCount} due to Fullscript`}
        </Button>
      </div>

      <div className="il-grid">
        {d.refills.map((r) => (
          <Card
            key={r.id}
            title={r.client_name ?? 'Unknown client'}
            meta={r.supplement_name ?? 'supplement'}
            actions={<Badge tone={TONE[r.tier]}>{daysLabel(r.days_left)}</Badge>}
          >
            <div className="il-card__row">
              <Button variant="ghost" disabled={pending === r.id} onClick={() => act(r.id, () => skipRefill(backendUrl, r.id))}>
                Skip
              </Button>
              <Button variant="secondary" disabled={pending === r.id} onClick={() => act(r.id, () => snoozeRefill(backendUrl, r.id))}>
                Snooze
              </Button>
              <Button
                variant="primary"
                disabled={pending === r.id || r.status !== 'pending'}
                onClick={() => act(r.id, () => sendRefillOrders(backendUrl, [r.id]))}
              >
                {r.status === 'notified' ? 'Sent' : 'Send'}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {d.refills.length === 0 && <p className="il-empty">No refills due right now. 🌿</p>}
    </section>
  );
}

function daysLabel(daysLeft: number | null): string {
  if (daysLeft === null) return '—';
  if (daysLeft < 0) return `${Math.abs(daysLeft)}d overdue`;
  return `${daysLeft}d left`;
}
