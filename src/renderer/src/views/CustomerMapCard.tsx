import { useCallback, useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { InfoPopover } from '../components/InfoPopover';
import { clearCustomerMap, fetchCustomerMap, setCustomerMap, syncCustomerMap } from '../lib/api';
import type { CustomerMapData, CustomerSyncReport } from '../lib/types';

// Settings panel: map each client to their QuickBooks customer so live checkout
// can pull the right invoice and reconciliation posts against the right account.
// "Sync from QuickBooks" auto-maps unambiguous exact matches; ambiguous /
// unmatched clients are set by hand (paste the QBO customer id).
export function CustomerMapCard({ backendUrl }: { backendUrl: string }) {
  const [data, setData] = useState<CustomerMapData | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<CustomerSyncReport | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      fetchCustomerMap(backendUrl)
        .then((d) => {
          setData(d);
          setOffline(false);
        })
        .catch(() => setOffline(true)),
    [backendUrl],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const runSync = () =>
    run(async () => {
      const r = await syncCustomerMap(backendUrl);
      setReport(r);
      if (!r.ok && r.error) throw new Error(r.error);
    });

  const saveOne = (clientId: string) => {
    const val = (drafts[clientId] ?? '').trim();
    if (!val) return;
    void run(async () => {
      await setCustomerMap(backendUrl, clientId, val);
      setDrafts((d) => {
        const next = { ...d };
        delete next[clientId];
        return next;
      });
    });
  };

  const configured = data?.quickbooks_configured ?? false;
  const mappedCount = data?.clients.filter((c) => c.qbo_customer_id).length ?? 0;
  const total = data?.clients.length ?? 0;

  return (
    <Card
      title="QuickBooks customer mapping"
      meta={data ? `${mappedCount}/${total} clients mapped` : 'Loading…'}
      actions={
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Badge tone={configured ? 'accent' : 'neutral'}>{configured ? 'QuickBooks connected' : 'dry-run'}</Badge>
          <InfoPopover label="What is QuickBooks customer mapping?" title="How this works">
            <p style={{ margin: '0 0 0.5rem' }}>
              Every client here needs to be linked to their matching <strong>Customer</strong> record in
              QuickBooks. When you approve a checkout, that link is how the app knows which QuickBooks
              customer to charge and which books to post the payment against.
            </p>
            <p style={{ margin: '0 0 0.5rem' }}>
              A client with no mapping can't be charged or reconciled automatically — their checkout gets
              held for you to resolve by hand instead of guessing who to bill.
            </p>
            <p style={{ margin: '0 0 0.5rem' }}>
              <strong>Sync from QuickBooks</strong> auto-links clients whose email or exact name matches a
              QuickBooks customer — but only when the match is unambiguous. Anything with more than one
              possible match is flagged below for you to pick, never guessed automatically.
            </p>
            <p style={{ margin: 0 }}>
              Clients with no match at all (e.g. not yet a QuickBooks customer) can be linked by hand —
              paste their QuickBooks customer id into the field next to their name.
            </p>
          </InfoPopover>
        </span>
      }
    >
      {offline ? (
        <p className="il-view__sub">Backend offline.</p>
      ) : (
        <>
          <div className="il-card__row" style={{ marginBottom: '0.6rem' }}>
            <Button variant="primary" disabled={busy || !configured} onClick={runSync}>
              {busy ? 'Working…' : 'Sync from QuickBooks'}
            </Button>
            {!configured && <span className="il-view__sub">Connect QuickBooks to auto-match customers.</span>}
          </div>

          {error && <p className="il-error">{error}</p>}

          {report?.ok && (
            <p className="il-view__sub">
              Mapped {report.mapped.length} · Needs review {report.ambiguous.length} · Unmatched {report.unmatched.length}
            </p>
          )}
          {report?.ambiguous.map((a) => (
            <div key={a.clientId} className="il-view__sub">
              ⚠ {a.clientName}: multiple matches ({a.candidateIds.join(', ')}) — set one below.
            </div>
          ))}

          <div className="il-maplist">
            {(data?.clients ?? []).map((c) => (
              <div key={c.client_id} className="il-maprow">
                <div className="il-maprow__who">
                  <span className="il-maprow__name">{c.client_name}</span>
                  {c.email && <span className="il-maprow__email">{c.email}</span>}
                </div>
                {c.qbo_customer_id ? (
                  <div className="il-maprow__act">
                    <Badge tone="success">#{c.qbo_customer_id}</Badge>
                    <Button variant="ghost" disabled={busy} onClick={() => run(() => clearCustomerMap(backendUrl, c.client_id))}>
                      Clear
                    </Button>
                  </div>
                ) : (
                  <div className="il-maprow__act">
                    <input
                      className="il-input il-input--sm"
                      placeholder="QBO id"
                      value={drafts[c.client_id] ?? ''}
                      onChange={(e) => setDrafts((s) => ({ ...s, [c.client_id]: e.target.value }))}
                    />
                    <Button variant="secondary" disabled={busy || !(drafts[c.client_id] ?? '').trim()} onClick={() => saveOne(c.client_id)}>
                      Set
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {total === 0 && <p className="il-view__sub">No clients yet.</p>}
          </div>
        </>
      )}
    </Card>
  );
}
