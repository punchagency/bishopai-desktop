import { useCallback, useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { approveCheckout, closeCheckout, fetchCheckouts, type CardInput } from '../lib/api';
import { ReconciliationPanel } from './ReconciliationPanel';
import { humanize } from '../lib/format';
import { SkeletonView } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { InfoPopover } from '../components/InfoPopover';
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
function systemsFor(status: string): { name: string; done: boolean; hint: string }[] {
  const r = RANK[status] ?? 0;
  return [
    { name: 'QuickBooks', done: r >= 2, hint: 'Card charged and the payment recorded in QuickBooks' },
    { name: 'Fullscript', done: r >= 2, hint: 'Any supplements sent to Fullscript for the client' },
    { name: 'Appt Sheet', done: r >= 3, hint: "The session's Appointment Sheet written to Drive" },
    { name: 'Protocol', done: r >= 3, hint: "The client's Protocol document updated" },
    { name: 'Practice Better', done: r >= 4, hint: 'The session marked billed/complete in Practice Better' },
  ];
}

const STATUS_TONE: Record<string, 'warning' | 'accent' | 'success' | 'neutral'> = {
  AWAITING_APPROVAL: 'warning', CHARGE_FAILED: 'warning',
  CHARGING: 'accent', CHARGED: 'accent', DOCS_UPDATED: 'accent', PB_MARKED: 'accent',
  CLOSED: 'success',
};
const STATUS_HINT: Record<string, string> = {
  AWAITING_APPROVAL: 'Ready for you to review and approve the charge.',
  CHARGING: 'The card is being charged through QuickBooks Payments.',
  CHARGED: 'Payment succeeded; finishing the follow-up steps.',
  CHARGE_FAILED: 'The charge did not go through — review it in QuickBooks.',
  DOCS_UPDATED: 'Documents written; marking the session in Practice Better.',
  PB_MARKED: 'Marked in Practice Better; ready to confirm and close.',
  CLOSED: 'Done — paid, documented, and recorded everywhere.',
};
const money = (cents: number, ccy = 'USD') =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: ccy }).format(cents / 100);

export function CheckoutView({ backendUrl, onChanged }: { backendUrl: string; onChanged?: () => void }) {
  const [data, setData] = useState<CheckoutData | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  // Which checkout is entering a card, and the in-progress card fields. Cleared
  // (never persisted) as soon as the charge is submitted.
  const [cardFor, setCardFor] = useState<string | null>(null);
  const [card, setCard] = useState<CardInput>({ number: '', expMonth: '', expYear: '', cvc: '', name: '' });
  const resetCard = () => {
    setCardFor(null);
    setCard({ number: '', expMonth: '', expYear: '', cvc: '', name: '' });
  };

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

  if (loading && !data) return <SkeletonView cards={6} />;

  const d = data ?? SAMPLE;
  const awaiting = d.checkouts.filter((c) => c.status === 'AWAITING_APPROVAL').length;

  return (
    <section className="il-view">
      <div className="il-view__head">
        <div>
          <h1 className="il-view__title">
            Checkout{' '}
            <InfoPopover label="How checkout works" title="How this works">
              When a session is marked complete, a checkout is assembled here with the session fee and
              any supplements. You review it and approve — the card is charged through QuickBooks
              Payments and the payment is recorded against the client's books automatically.
            </InfoPopover>
          </h1>
          <p className="il-view__sub">
            {awaiting} awaiting approval
            {offline && <Badge tone="warning">&nbsp;offline preview&nbsp;</Badge>}
            {!offline && !d.quickbooks_configured && (
              <>
                <Badge tone="neutral">&nbsp;QuickBooks dry-run&nbsp;</Badge>{' '}
                <InfoPopover label="What is dry-run?" title="Dry-run mode">
                  QuickBooks isn't connected yet, so approving runs the whole flow but doesn't move any
                  money — safe to try. Add the QuickBooks credentials to go live; nothing else changes.
                </InfoPopover>
              </>
            )}
          </p>
        </div>
      </div>

      {!offline && <ReconciliationPanel backendUrl={backendUrl} onChanged={onChanged} />}

      <div className="il-grid">
        {d.checkouts.map((c) => {
          const total = c.summary_snapshot?.total_cents ?? 0;
          const ccy = c.summary_snapshot?.currency ?? 'USD';
          return (
            <Card
              key={c.id}
              title={c.client_name ?? 'Unknown client'}
              meta={`${money(total, ccy)}${c.summary_snapshot ? ` · ${c.summary_snapshot.line_items.length} items` : ''}`}
              actions={
                <Badge tone={STATUS_TONE[c.status] ?? 'neutral'} title={STATUS_HINT[c.status]}>
                  {humanize(c.status)}
                </Badge>
              }
            >
              <div className="il-systems">
                {systemsFor(c.status).map((s) => (
                  <span key={s.name} className="il-system" title={`${s.name} — ${s.hint}${s.done ? ' ✓' : ' (pending)'}`}>
                    <span className={`il-dot il-dot--${s.done ? 'connected' : 'disconnected'}`} /> {s.name}
                  </span>
                ))}
              </div>
              <div className="il-card__row">
                {c.status === 'AWAITING_APPROVAL' &&
                  // Dry-run (no QuickBooks): one-click approve, no card needed.
                  (!d.quickbooks_configured ? (
                    <Button variant="primary" disabled={pending === c.id} onClick={() => act(c.id, () => approveCheckout(backendUrl, c.id))}>
                      {pending === c.id ? 'Charging…' : `Approve ${money(total, ccy)}`}
                    </Button>
                  ) : cardFor !== c.id ? (
                    // Live: reveal the card form before charging.
                    <Button variant="primary" disabled={pending !== null} onClick={() => setCardFor(c.id)}>
                      {`Approve ${money(total, ccy)}`}
                    </Button>
                  ) : (
                    <form
                      className="il-cardform"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const payload: CardInput = { ...card, name: card.name?.trim() || undefined };
                        void act(c.id, () => approveCheckout(backendUrl, c.id, payload)).then(resetCard);
                      }}
                    >
                      <input
                        className="il-input il-input--sm" placeholder="Card number" inputMode="numeric" autoComplete="off"
                        value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value.replace(/\D/g, '') })} required
                      />
                      <div className="il-cardform__row">
                        <input className="il-input il-input--sm" placeholder="MM" inputMode="numeric" autoComplete="off" maxLength={2}
                          value={card.expMonth} onChange={(e) => setCard({ ...card, expMonth: e.target.value.replace(/\D/g, '') })} required />
                        <input className="il-input il-input--sm" placeholder="YYYY" inputMode="numeric" autoComplete="off" maxLength={4}
                          value={card.expYear} onChange={(e) => setCard({ ...card, expYear: e.target.value.replace(/\D/g, '') })} required />
                        <input className="il-input il-input--sm" placeholder="CVC" inputMode="numeric" autoComplete="off" maxLength={4}
                          value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, '') })} required />
                      </div>
                      <input className="il-input il-input--sm" placeholder="Name on card (optional)" autoComplete="off"
                        value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} />
                      <div className="il-cardform__row">
                        <Button variant="primary" type="submit" disabled={pending === c.id}>
                          {pending === c.id ? 'Charging…' : `Charge ${money(total, ccy)}`}
                        </Button>
                        <Button variant="ghost" type="button" disabled={pending === c.id} onClick={resetCard}>Cancel</Button>
                      </div>
                    </form>
                  ))}
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

      {d.checkouts.length === 0 && (
        <EmptyState icon="＄" title="No checkouts yet">
          A checkout appears here when a session is marked complete in Practice Better — with the
          session fee and any supplements ready to review and charge.
        </EmptyState>
      )}
    </section>
  );
}
