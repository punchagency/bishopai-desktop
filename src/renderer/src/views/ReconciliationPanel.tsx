import { useCallback, useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { fetchReconciliations, retryReconciliation } from '../lib/api';
import type { Reconciliation, ReconciliationStatus } from '../lib/types';

// WF2 dead-letter surface: payments that were charged but whose write-back to
// QuickBooks needs attention (NEEDS_REVIEW = gave up / no mapping; FAILED =
// backing off). Nicole can re-drive each after fixing the cause (e.g. adding the
// customer mapping). Recorded/pending rows are summarized, not listed.

const money = (cents: number, ccy = 'USD') =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: ccy }).format(cents / 100);

const TONE: Record<ReconciliationStatus, 'success' | 'accent' | 'warning' | 'neutral'> = {
  RECORDED: 'success',
  PENDING: 'accent',
  RECORDING: 'accent',
  FAILED: 'warning',
  NEEDS_REVIEW: 'warning',
};
const pretty = (s: string) => s.replace(/_/g, ' ').toLowerCase();

export function ReconciliationPanel({ backendUrl, onChanged }: { backendUrl: string; onChanged?: () => void }) {
  const [rows, setRows] = useState<Reconciliation[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) =>
      fetchReconciliations(backendUrl, undefined)
        .then((d) => setRows(d.reconciliations))
        .catch(() => {
          if (!signal?.aborted) setRows(null);
        }),
    [backendUrl],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const retry = async (id: string) => {
    setBusy(id);
    setNote(null);
    try {
      const r = await retryReconciliation(backendUrl, id);
      setNote(r.status === 'RECORDED' ? 'Payment recorded in QuickBooks.' : `Still ${pretty(r.status)}${r.last_error ? ` — ${r.last_error}` : ''}.`);
      await load();
      onChanged?.();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Retry failed.');
    } finally {
      setBusy(null);
    }
  };

  if (!rows || rows.length === 0) return null; // nothing to reconcile yet / offline

  const needsReview = rows.filter((r) => r.status === 'NEEDS_REVIEW' || r.status === 'FAILED');
  const recorded = rows.filter((r) => r.status === 'RECORDED').length;
  const pending = rows.length - recorded - needsReview.length;

  return (
    <Card
      title="Payment reconciliation"
      meta={`${recorded} recorded · ${pending} pending · ${needsReview.length} need review`}
      actions={<Badge tone={needsReview.length ? 'warning' : 'success'}>{needsReview.length ? `${needsReview.length} need review` : 'all reconciled'}</Badge>}
    >
      {needsReview.length === 0 ? (
        <p className="il-view__sub">Every charged payment has been recorded in QuickBooks.</p>
      ) : (
        <>
          {note && <p className="il-view__sub">{note}</p>}
          <div className="il-maplist">
            {needsReview.map((r) => (
              <div key={r.id} className="il-maprow">
                <div className="il-maprow__who">
                  <span className="il-maprow__name">
                    {r.client_name ?? 'Unknown client'} · {money(r.amount_cents, r.currency)}
                  </span>
                  <span className="il-maprow__email">
                    {pretty(r.status)}
                    {r.attempts > 0 && ` · ${r.attempts} attempt${r.attempts === 1 ? '' : 's'}`}
                    {r.last_error && ` · ${r.last_error}`}
                  </span>
                </div>
                <div className="il-maprow__act">
                  <Badge tone={TONE[r.status]}>{pretty(r.status)}</Badge>
                  <Button variant="secondary" disabled={busy === r.id} onClick={() => retry(r.id)}>
                    {busy === r.id ? 'Retrying…' : 'Retry'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
