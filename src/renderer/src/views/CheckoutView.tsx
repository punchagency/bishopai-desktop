import { useCallback, useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { approveCheckout, closeCheckout, fetchCheckouts } from '../lib/api';
import type { CheckoutData, CheckoutItem } from '../lib/types';

// WF2 (§6): the one custom, auditable money flow. Two Nicole actions — approve
// charge, confirm close — over a unified 5-system view. Charges are dry-run
// until QuickBooks is configured; the state machine runs identically either way.

const SAMPLE: CheckoutData = {
  quickbooks_configured: false,
  checkouts: [
    sCheckout('a', 'Maya Chen', 'AWAITING_APPROVAL', 20000),
    sCheckout('b', 'David Osei', 'CLOSED', 17500),
  ],
};
function sCheckout(id: string, client: string, status: string, total: number): CheckoutItem {
  return {
    id, status, qb_txn_id: status === 'CLOSED' ? 'demo-txn' : null, updated_at: new Date().toISOString(),
    client_name: client, starts_at: new Date().toISOString(),
    summary_snapshot: { currency: 'USD', qb_invoice_id: 'demo', total_cents: total,
      line_items: [{ label: 'Consultation', amount_cents: 15000 }, { label: 'Magnesium', amount_cents: 2500 }],
      fullscript_changes: ['Magnesium'] },
  };
}

// Progress rank so the 5-system view lights up in order.
const RANK: Record<string, number> = {
  AWAITING_APPROVAL: 0, CHARGE_FAILED: 0, CHARGING: 1, CHARGED: 2, DOCS_UPDATED: 3, PB_MARKED: 4, CLOSED: 5,
};
function systemsFor(status: string): { name: string; done: boolean }[] {
  const r = RANK[status] ?? 0;
  return [
    { name: 'QuickBooks', done: r >= 2 },
    { name: 'Fullscript', done: r >= 2 },
    { name: 'Appt Sheet', done: r >= 3 },
    { name: 'Protocol', done: r >= 3 },
    { name: 'Practice Better', done: r >= 4 },
  ];
}

const STATUS_TONE: Record<string, 'warning' | 'accent' | 'success' | 'neutral'> = {
  AWAITING_APPROVAL: 'warning', CHARGE_FAILED: 'warning',
  CHARGING: 'accent', CHARGED: 'accent', DOCS_UPDATED: 'accent', PB_MARKED: 'accent',
  CLOSED: 'success',
};
const money = (cents: number, ccy = 'USD') =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: ccy }).format(cents / 100);

export function CheckoutView({ backendUrl, onChanged }: { backendUrl: string; onChanged?: () => void }) {
  const [data, setData] = useState<CheckoutData | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      return fetchCheckouts(backendUrl, signal)
        .then((d) => {
          setData(d);
          setOffline(false);
        })
        .catch(() => {
          setData(SAMPLE);
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
    if (offline) return;
    setPending(id);
    try {
      await fn();
      await load();
      onChanged?.();
    } catch {
      await load(); // status reflects the outcome (e.g. CHARGE_FAILED)
    } finally {
      setPending(null);
    }
  };

  if (loading && !data) return <p className="il-empty">Loading checkout…</p>;

  const d = data ?? SAMPLE;
  const awaiting = d.checkouts.filter((c) => c.status === 'AWAITING_APPROVAL').length;

  return (
    <section className="il-view">
      <div className="il-view__head">
        <div>
          <h1 className="il-view__title">Checkout</h1>
          <p className="il-view__sub">
            {awaiting} awaiting approval
            {offline && <Badge tone="warning">&nbsp;offline preview&nbsp;</Badge>}
            {!offline && !d.quickbooks_configured && <Badge tone="neutral">&nbsp;QuickBooks dry-run&nbsp;</Badge>}
          </p>
        </div>
      </div>

      <div className="il-grid">
        {d.checkouts.map((c) => {
          const total = c.summary_snapshot?.total_cents ?? 0;
          const ccy = c.summary_snapshot?.currency ?? 'USD';
          return (
            <Card
              key={c.id}
              title={c.client_name ?? 'Unknown client'}
              meta={`${money(total, ccy)}${c.summary_snapshot ? ` · ${c.summary_snapshot.line_items.length} items` : ''}`}
              actions={<Badge tone={STATUS_TONE[c.status] ?? 'neutral'}>{prettyStatus(c.status)}</Badge>}
            >
              <div className="il-systems">
                {systemsFor(c.status).map((s) => (
                  <span key={s.name} className="il-system">
                    <span className={`il-dot il-dot--${s.done ? 'connected' : 'disconnected'}`} /> {s.name}
                  </span>
                ))}
              </div>
              <div className="il-card__row">
                {c.status === 'AWAITING_APPROVAL' && (
                  <Button variant="primary" disabled={pending === c.id} onClick={() => act(c.id, () => approveCheckout(backendUrl, c.id))}>
                    {pending === c.id ? 'Charging…' : `Approve ${money(total, ccy)}`}
                  </Button>
                )}
                {c.status === 'PB_MARKED' && (
                  <Button variant="primary" disabled={pending === c.id} onClick={() => act(c.id, () => closeCheckout(backendUrl, c.id))}>
                    {pending === c.id ? 'Closing…' : 'Confirm & close'}
                  </Button>
                )}
                {c.status === 'CHARGE_FAILED' && <span className="il-error">Charge failed — review in QuickBooks</span>}
                {c.status === 'CLOSED' && c.qb_txn_id && (
                  <span className="il-card__meta">Receipt · {c.qb_txn_id.slice(0, 22)}</span>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {d.checkouts.length === 0 && <p className="il-empty">No checkouts yet. They appear when a session is marked complete.</p>}
    </section>
  );
}

function prettyStatus(s: string): string {
  return s.replace(/_/g, ' ').toLowerCase();
}
