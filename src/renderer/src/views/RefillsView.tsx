import { useCallback, useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { DropdownMenu } from '../components/DropdownMenu';
import { InfoPopover } from '../components/InfoPopover';
import { fetchRefillDigest, sendRefillOrders, skipRefill, snoozeRefill } from '../lib/api';
import { SkeletonView } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import type { RefillDigest, RefillItem, RefillTier, RefillSendResponse } from '../lib/types';

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
  const [result, setResult] = useState<RefillSendResponse | null>(null); // last send outcome

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

  // Send a set of refills and surface the per-line outcome (created plans,
  // invitation links, and any failures like a missing email or no product match).
  const send = async (ids: string[]) => {
    if (offline || ids.length === 0) return;
    setSending(true);
    try {
      const res = await sendRefillOrders(backendUrl, ids);
      setResult(res);
      await load();
      onChanged?.();
    } catch {
      setResult(null); // surfaced on next load
    } finally {
      setSending(false);
    }
  };

  const sendDue = () => {
    if (!d) return;
    send(d.refills.filter((r) => r.tier !== 'coming' && r.status === 'pending').map((r) => r.id));
  };

  if (loading && !digest) return <SkeletonView cards={6} />;

  const d = digest ?? SAMPLE;
  const dueCount = d.refills.filter((r) => r.tier !== 'coming' && r.status === 'pending').length;
  // Index the last send outcome by refill id so each card can show its result.
  const outcomeByRefill = new Map((result?.results ?? []).map((r) => [r.refill_id ?? '', r]));

  return (
    <section className="il-view">
      <div className="il-view__head">
        <div>
          <h1 className="il-view__title">
            Refills{' '}
            <InfoPopover label="How refills reach Fullscript" title="How this works">
              Each supplement's run-out date is projected nightly from its dose, quantity, and start
              date. Sending creates a <strong>draft treatment plan</strong> per client in Fullscript
              (one recommendation per supplement, with the dose carried over). The client gets an
              invitation link to review and purchase — nothing is charged here.
            </InfoPopover>
          </h1>
          <p className="il-view__sub">
            {d.refills.length} client{d.refills.length === 1 ? '' : 's'} to review{' '}
            <InfoPopover label="What do the tiers mean?" title="Timing tiers">
              <strong>Overdue</strong> — the supply has run out. <strong>Soon</strong> — running low
              (within ~2 weeks). <strong>Coming</strong> — plenty left; shown for context, not yet due.
            </InfoPopover>
            {offline && <Badge tone="warning">&nbsp;offline preview&nbsp;</Badge>}
            {!offline && !d.fullscript_configured && (
              <>
                <Badge tone="neutral">&nbsp;Fullscript dry-run&nbsp;</Badge>{' '}
                <InfoPopover label="What is dry-run?" title="Dry-run mode">
                  Fullscript isn't connected yet, so “Send” runs the full flow but doesn't create real
                  plans — it's safe to try. Add the Fullscript credentials to go live; nothing else
                  changes.
                </InfoPopover>
              </>
            )}
          </p>
        </div>
        <Button variant="primary" disabled={offline || sending || dueCount === 0} onClick={sendDue}>
          {sending ? 'Sending…' : `Send ${dueCount} due to Fullscript`}
        </Button>
      </div>

      {result && (
        <div className="il-refill-result">
          <span>
            <strong>{result.sent}</strong> plan{result.sent === 1 ? '' : 's'} created
            {result.failed > 0 && <>, <strong className="il-error">{result.failed} failed</strong></>}
            {!d.fullscript_configured && ' (dry-run)'}
          </span>
          {result.results.filter((r) => !r.ok).length > 0 && (
            <ul className="il-refill-result__errors">
              {result.results
                .filter((r) => !r.ok)
                .map((r, i) => (
                  <li key={i}>
                    {r.client_name ?? 'A client'}
                    {r.supplement_name ? ` · ${r.supplement_name}` : ''} — {r.error}
                  </li>
                ))}
            </ul>
          )}
          <button type="button" className="il-refill-result__dismiss" onClick={() => setResult(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="il-grid">
        {d.refills.map((r) => {
          const outcome = outcomeByRefill.get(r.id);
          return (
            <Card
              key={r.id}
              title={r.client_name ?? 'Unknown client'}
              meta={r.supplement_name ?? 'supplement'}
              actions={<Badge tone={TONE[r.tier]}>{daysLabel(r.days_left)}</Badge>}
            >
              <div className="il-refill-actions">
                <Button
                  variant="primary"
                  className="il-refill-actions__send"
                  disabled={sending || r.status !== 'pending'}
                  onClick={() => send([r.id])}
                >
                  {r.status === 'notified' ? 'Sent' : 'Send to Fullscript'}
                </Button>
                <DropdownMenu
                  label="⋮"
                  disabled={!!pending || offline}
                  items={[
                    { label: 'Snooze', disabled: pending === r.id, onClick: () => act(r.id, () => snoozeRefill(backendUrl, r.id)) },
                    { label: 'Skip',   disabled: pending === r.id, onClick: () => act(r.id, () => skipRefill(backendUrl, r.id)) },
                  ]}
                />
              </div>
              {outcome && !outcome.ok ? (
                <p className="il-card__note il-error">Couldn’t send — {outcome.error}</p>
              ) : (
                // Fresh send link, or the one persisted from a previous send.
                (outcome?.invitation_url ?? r.invitation_url) && (
                  <p className="il-card__note">
                    Plan created ·{' '}
                    <a href={(outcome?.invitation_url ?? r.invitation_url)!} target="_blank" rel="noreferrer">
                      open in Fullscript
                    </a>
                  </p>
                )
              )}
            </Card>
          );
        })}
      </div>

      {d.refills.length === 0 && (
        <EmptyState icon="↻" title="No refills due">
          Clients appear here as their supplements run low — usually within about two weeks of running
          out, projected nightly from each supplement's dose and quantity.
        </EmptyState>
      )}
    </section>
  );
}

function daysLabel(daysLeft: number | null): string {
  if (daysLeft === null) return '—';
  if (daysLeft < 0) return `${Math.abs(daysLeft)}d overdue`;
  return `${daysLeft}d left`;
}
