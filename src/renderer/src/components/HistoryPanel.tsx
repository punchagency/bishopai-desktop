import { useEffect, useState } from 'react';
import { fetchEntityHistory } from '../lib/api';
import { formatDate } from '../lib/format';
import { Badge } from './Badge';
import type { AuditEvent } from '../lib/types';

// One entity's audit trail (checkout, session, …), rendered inline in a detail
// pane. Read-only; the trail is written by the actions themselves.
function dotClass(action: string): string {
  if (action.includes('charge_review') || action.includes('charge_failed')) return 'error';
  if (action.includes('captured') || action.includes('approved') || action.includes('closed')) return 'connected';
  if (action.includes('unmatched') || action.includes('dismissed')) return 'connecting';
  return 'disconnected';
}

export function HistoryPanel({
  backendUrl,
  entityType,
  entityId,
}: {
  backendUrl: string;
  entityType: string;
  entityId: string;
}) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setEvents(null);
    setFailed(false);
    fetchEntityHistory(backendUrl, entityType, entityId, ctrl.signal)
      .then((d) => setEvents(d.events))
      .catch(() => {
        if (!ctrl.signal.aborted) setFailed(true);
      });
    return () => ctrl.abort();
  }, [backendUrl, entityType, entityId]);

  if (failed) return <p className="il-empty">History couldn't be loaded.</p>;
  if (!events) return <p className="il-empty">Loading history…</p>;
  if (events.length === 0) return <p className="il-empty">No recorded activity yet.</p>;

  return (
    <ul className="il-timeline il-history">
      {events.map((e) => (
        <li key={e.id} className="il-timeline__row">
          <span className={`il-dot il-dot--${dotClass(e.action)}`} />
          <div className="il-timeline__body">
            <span className="il-timeline__summary">{e.summary}</span>
            <span className="il-timeline__meta">
              <Badge tone="neutral">{e.actor}</Badge>
              <span className="il-timeline__time">{formatDate(e.created_at)}</span>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
