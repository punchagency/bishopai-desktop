import { useCallback, useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { approveItem, fetchReviewQueue } from '../lib/api';
import { formatDate, humanize } from '../lib/format';
import { SkeletonView } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { InfoPopover } from '../components/InfoPopover';
import type { ReviewKind, ReviewQueue as Queue } from '../lib/types';
import { ReviewDetail } from './ReviewDetail';

// Sample data so the dashboard renders standalone when the backend isn't up
// (design preview / offline). Replaced by live data the moment /review/queue
// responds.
const SAMPLE: Queue = {
  sessions: [
    {
      appointment_id: 'sample-appt-1',
      client_id: 'c1',
      client_name: 'Jane Doe',
      starts_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'draft',
      sheet_id: 'sample-1',
      protocol_id: 'sample-2',
      content_json: {},
    },
  ],
};

interface Selection {
  /** Which document backs the detail view — the session's note is the same in
   *  both, so the sheet is preferred and the protocol is the fallback for a
   *  session that has no client attached yet. */
  kind: ReviewKind;
  id: string;
  appointmentId: string;
  clientName: string;
  clientId: string | null;
}

export function ReviewQueue({ backendUrl, onChanged }: { backendUrl: string; onChanged?: () => void }) {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [pending, setPending] = useState<string | null>(null); // id being approved inline
  // Approved sessions used to disappear from the app entirely. This is how a
  // finished session stays reachable — to look back at, or to correct.
  const [scope, setScope] = useState<'pending' | 'approved'>('pending');

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      return fetchReviewQueue(backendUrl, signal, scope)
        .then((q) => {
          setQueue(q);
          setOffline(false);
          // Drop a selection whose row is gone — approved out of this list,
          // deleted, or reseeded underneath us. Without this the detail pane
          // sits on a dead id showing "Loading…" against a 404 forever.
          setSelected((cur) =>
            cur && q.sessions.some((sn) => sn.appointment_id === cur.appointmentId) ? cur : null,
          );
        })
        .catch(() => {
          setQueue(SAMPLE);
          setOffline(true);
        })
        .finally(() => setLoading(false));
    },
    [backendUrl, scope],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    // The sidebar badge polls, so without this the list can sit stale beside a
    // count that has already moved — new sessions land here while the screen is
    // open. Refreshing the list doesn't touch the open detail pane, so it's safe
    // to do mid-review.
    const timer = setInterval(() => load(), 30_000);
    return () => {
      ctrl.abort();
      clearInterval(timer);
    };
  }, [load]);

  const switchScope = (next: 'pending' | 'approved') => {
    if (next === scope) return;
    setSelected(null); // the open row won't be in the new list
    setScope(next);
  };

  // Approving either document approves the whole session, so the row is keyed on
  // the appointment rather than on whichever document backs it.
  const approve = async (kind: ReviewKind, id: string, appointmentId: string) => {
    if (id.startsWith('sample-')) return;
    setPending(appointmentId);
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
  const total = q.sessions.length;

  return (
    <section className="il-view">
      <div className="il-view__head">
        <div>
          <h1 className="il-view__title">
            Sessions{' '}
            <InfoPopover label="How sessions work" title="How this works">
              After each session, the conversation is turned into a draft Appointment Sheet and an
              updated client Protocol. They wait under Awaiting review for you to read, edit and
              approve — approving writes the final documents to the client's Google Drive folder.
              Approved sessions stay under Approved, where you can look back at them, compare them
              against earlier visits, or amend one if something needs correcting.
            </InfoPopover>
          </h1>
          <p className="il-view__sub">
            {scope === 'pending'
              ? `${total} item${total === 1 ? '' : 's'} awaiting your approval`
              : `${total} approved item${total === 1 ? '' : 's'}`}
            {offline && <Badge tone="warning">&nbsp;offline preview&nbsp;</Badge>}
          </p>
        </div>
      </div>

      <div className="il-tabs il-tabs--scope">
        <button
          className={`il-tab ${scope === 'pending' ? 'il-tab--on' : ''}`}
          onClick={() => switchScope('pending')}
        >
          Awaiting review
        </button>
        <button
          className={`il-tab ${scope === 'approved' ? 'il-tab--on' : ''}`}
          onClick={() => switchScope('approved')}
        >
          Approved
        </button>
      </div>

      {total === 0 ? (
        scope === 'pending' ? (
          <EmptyState title="You're all caught up">
            New Appointment Sheets and Protocols land here after each session is captured and turned
            into a draft note. There's nothing waiting on your review right now.
          </EmptyState>
        ) : (
          <EmptyState title="Nothing approved yet">
            Sessions you approve move here, so you can look back at them or correct one after the
            fact.
          </EmptyState>
        )
      ) : (
        /* Split pane: the queue stays on screen while a session is open, so
           Nicole keeps her place and can move down the list without losing
           context. Collapses to one column on narrow windows. */
        <div className={`il-split ${selected ? 'il-split--open' : ''}`}>
          <div className="il-split__list">
            {q.sessions.map((sn) => {
              const kind: ReviewKind = sn.sheet_id ? 'sheets' : 'protocols';
              const id = sn.sheet_id ?? sn.protocol_id;
              if (!id) return null;
              return (
                <QueueRow
                  key={sn.appointment_id}
                  name={sn.client_name ?? 'Unknown client'}
                  kind="Session"
                  date={formatDate(sn.starts_at ?? sn.updated_at)}
                  status={sn.status}
                  active={selected?.appointmentId === sn.appointment_id}
                  approving={pending === sn.appointment_id}
                  canApprove={scope === 'pending'}
                  onOpen={() =>
                    setSelected({
                      kind,
                      id,
                      appointmentId: sn.appointment_id,
                      clientName: sn.client_name ?? 'Unknown client',
                      clientId: sn.client_id,
                    })
                  }
                  onApprove={() => approve(kind, id, sn.appointment_id)}
                />
              );
            })}
          </div>

          <div className="il-split__detail">
            {selected ? (
              <ReviewDetail
                key={`${selected.kind}:${selected.id}`}
                backendUrl={backendUrl}
                kind={selected.kind}
                id={selected.id}
                clientName={selected.clientName}
                clientId={selected.clientId}
                onClose={() => setSelected(null)}
                onChanged={() => {
                  load();
                  onChanged?.();
                }}
              />
            ) : (
              <div className="il-split__placeholder">
                <p>Pick a session to review it here.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * One line in the queue. This is a list to scan, not a set of cards to read, so
 * everything competing with the client's name is dialled down: status becomes a
 * dot rather than a pill, and Approve is a small quiet control that only fills
 * in on hover or when the row is the one open.
 */
function QueueRow({
  name, kind, date, status, active, approving, canApprove, onOpen, onApprove,
}: {
  name: string;
  kind: string;
  date: string;
  status: string;
  active: boolean;
  approving: boolean;
  /** Already-approved rows have nothing left to approve. */
  canApprove: boolean;
  onOpen: () => void;
  onApprove: () => void;
}) {
  return (
    <div className={`il-qrow ${active ? 'il-qrow--on' : ''}`}>
      {/* The row itself is the open affordance — one click, no "Open" button. */}
      <button className="il-qrow__main" onClick={onOpen} aria-current={active}>
        <span className={`il-qrow__status il-qrow__status--${status}`} title={humanize(status)} />
        <span className="il-qrow__text">
          {/* Long names ellipsise in a narrow column; keep the full one reachable. */}
          <span className="il-qrow__name" title={name}>{name}</span>
          <span className="il-qrow__meta">
            {kind}
            {date && ` · ${date}`}
          </span>
        </span>
      </button>
      {canApprove && (
        <Button
          className="il-qrow__approve"
          variant="ghost"
          size="sm"
          disabled={approving}
          onClick={onApprove}
        >
          {approving ? 'Approving…' : 'Approve'}
        </Button>
      )}
    </div>
  );
}
