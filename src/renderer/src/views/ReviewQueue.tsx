import { useCallback, useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { approveItem, fetchReviewQueue } from '../lib/api';
import { humanize } from '../lib/format';
import { SkeletonView } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { InfoPopover } from '../components/InfoPopover';
import type { ReviewKind, ReviewQueue as Queue } from '../lib/types';
import { ReviewDetail } from './ReviewDetail';

// Sample data so the dashboard renders standalone when the backend isn't up
// (design preview / offline). Replaced by live data the moment /review/queue
// responds.
const SAMPLE: Queue = {
  appointment_sheets: [
    {
      id: 'sample-1',
      status: 'draft',
      updated_at: new Date().toISOString(),
      appointment_id: 'appt-1',
      starts_at: new Date().toISOString(),
      client_id: 'c1',
      client_name: 'Jane Doe',
      content_json: {},
    },
  ],
  protocols: [
    {
      id: 'sample-2',
      status: 'draft',
      updated_at: new Date().toISOString(),
      appointment_id: 'appt-1',
      client_id: 'c1',
      client_name: 'Jane Doe',
      content_json: {},
    },
  ],
};

interface Selection {
  kind: ReviewKind;
  id: string;
  clientName: string;
}

export function ReviewQueue({ backendUrl, onChanged }: { backendUrl: string; onChanged?: () => void }) {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [pending, setPending] = useState<string | null>(null); // id being approved inline

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      return fetchReviewQueue(backendUrl, signal)
        .then((q) => {
          setQueue(q);
          setOffline(false);
        })
        .catch(() => {
          setQueue(SAMPLE);
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

  const approve = async (kind: ReviewKind, id: string) => {
    if (id.startsWith('sample-')) return;
    setPending(id);
    try {
      await approveItem(backendUrl, kind, id);
      await load();
      onChanged?.();
    } catch {
      /* surfaced on next load; keep it quiet inline */
    } finally {
      setPending(null);
    }
  };

  if (loading && !queue) return <SkeletonView cards={6} />;

  const q = queue ?? SAMPLE;
  const total = q.appointment_sheets.length + q.protocols.length;

  return (
    <section className="il-view">
      <div className="il-view__head">
        <div>
          <h1 className="il-view__title">
            Review Queue{' '}
            <InfoPopover label="What is the review queue?" title="How this works">
              After each session, the conversation is turned into a draft Appointment Sheet and an
              updated client Protocol. They wait here for you to read, edit, and approve — approving
              writes the final documents to the client's Google Drive folder.
            </InfoPopover>
          </h1>
          <p className="il-view__sub">
            {total} item{total === 1 ? '' : 's'} awaiting your approval
            {offline && <Badge tone="warning">&nbsp;offline preview&nbsp;</Badge>}
          </p>
        </div>
      </div>

      <div className="il-grid">
        {q.appointment_sheets.map((s) => (
          <Card
            key={s.id}
            title={s.client_name ?? 'Unknown client'}
            meta={`Appointment sheet · ${fmt(s.starts_at ?? s.updated_at)}`}
            actions={<Badge tone="accent">{humanize(s.status)}</Badge>}
          >
            <div className="il-card__row">
              <Button variant="ghost" onClick={() => setSelected({ kind: 'sheets', id: s.id, clientName: s.client_name ?? 'Unknown client' })}>
                Open
              </Button>
              <Button variant="primary" disabled={pending === s.id} onClick={() => approve('sheets', s.id)}>
                {pending === s.id ? 'Approving…' : 'Approve'}
              </Button>
            </div>
          </Card>
        ))}

        {q.protocols.map((p) => (
          <Card
            key={p.id}
            title={p.client_name ?? 'Unknown client'}
            meta={`Protocol · ${fmt(p.updated_at)}`}
            actions={<Badge tone="neutral">{humanize(p.status)}</Badge>}
          >
            <div className="il-card__row">
              <Button variant="ghost" onClick={() => setSelected({ kind: 'protocols', id: p.id, clientName: p.client_name ?? 'Unknown client' })}>
                Open
              </Button>
              <Button variant="primary" disabled={pending === p.id} onClick={() => approve('protocols', p.id)}>
                {pending === p.id ? 'Approving…' : 'Approve'}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {total === 0 && (
        <EmptyState title="You're all caught up">
          New Appointment Sheets and Protocols land here after each session is captured and turned into
          a draft note. There's nothing waiting on your review right now.
        </EmptyState>
      )}

      {selected && (
        <ReviewDetail
          backendUrl={backendUrl}
          kind={selected.kind}
          id={selected.id}
          clientName={selected.clientName}
          onClose={() => setSelected(null)}
          onChanged={() => {
            load();
            onChanged?.();
          }}
        />
      )}
    </section>
  );
}

function fmt(v?: string): string {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}
