import { useCallback, useEffect, useState } from 'react';
import { fetchActivity } from '../lib/api';
import { formatDate } from '../lib/format';
import { SkeletonView } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { InfoPopover } from '../components/InfoPopover';
import { Badge } from '../components/Badge';
import type { AuditEvent } from '../lib/types';

// A category groups related entity types into a filter chip. The value is what
// the API's ?type= expects; 'all' clears the filter.
const CATEGORIES: { key: string; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'checkout', label: 'Payments' },
  { key: 'session', label: 'Sessions' },
  { key: 'task', label: 'Tasks' },
  { key: 'refill', label: 'Refills' },
  { key: 'lead', label: 'Leads' },
  { key: 'customer_map', label: 'QuickBooks' },
  { key: 'outlook', label: 'Outlook' },
  { key: 'office_hours', label: 'Schedule' },
];

// Tone by the kind of action, so the eye can scan for money + failures.
function toneFor(action: string): 'accent' | 'success' | 'warning' | 'danger' | 'neutral' {
  if (action.includes('charge_review') || action.includes('charge_failed')) return 'danger';
  if (action.includes('captured') || action.includes('approved') || action.includes('closed')) return 'success';
  if (action.includes('unmatched') || action.includes('dismissed') || action.includes('cleared') || action.includes('disconnected')) return 'warning';
  return 'accent';
}

const SAMPLE: AuditEvent[] = [
  { id: 's1', entity_type: 'checkout', entity_id: 'c1', action: 'checkout.charge_captured', actor: 'nicole', summary: 'Charged USD 150.00', metadata: null, created_at: new Date().toISOString() },
  { id: 's2', entity_type: 'session', entity_id: 'a1', action: 'session.approved', actor: 'nicole', summary: 'Approved session for Jane Doe — documents published', metadata: null, created_at: new Date(Date.now() - 3600e3).toISOString() },
];

export function ActivityView({ backendUrl }: { backendUrl: string }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [category, setCategory] = useState('all');

  const load = useCallback(
    (signal?: AbortSignal) =>
      fetchActivity(backendUrl, { type: category === 'all' ? undefined : category, limit: 200 }, signal)
        .then((d) => {
          setEvents(d.events);
          setOffline(false);
        })
        .catch(() => {
          setEvents(SAMPLE);
          setOffline(true);
        }),
    [backendUrl, category],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    // The trail grows as she works elsewhere; keep it fresh without a reload.
    const timer = setInterval(() => load(), 30_000);
    return () => {
      ctrl.abort();
      clearInterval(timer);
    };
  }, [load]);

  if (!events) return <SkeletonView cards={8} />;

  return (
    <section className="il-view">
      <div className="il-view__head">
        <div>
          <h1 className="il-view__title">
            Activity{' '}
            <InfoPopover label="What is Activity?" title="How this works">
              Every meaningful action across the app is recorded here — approvals, charges, matches,
              amendments, task and refill changes, and settings updates — newest first. It's an
              append-only trail: nothing here can be edited or deleted, so it's a faithful record of
              what happened and who did it.
            </InfoPopover>
          </h1>
          <p className="il-view__sub">
            Everything that's happened across the practice{offline && ' · offline preview'}
          </p>
        </div>
      </div>

      <div className="il-tabs il-tabs--scope">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            className={`il-tab ${category === c.key ? 'il-tab--on' : ''}`}
            onClick={() => setCategory(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {events.length === 0 ? (
        <div className="il-view__empty">
          <EmptyState variant="activity" />
        </div>
      ) : (
        <ul className="il-timeline">
          {events.map((e) => (
            <li key={e.id} className="il-timeline__row">
              <span className={`il-dot il-dot--${dotClass(toneFor(e.action))}`} />
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
      )}
    </section>
  );
}

function dotClass(tone: 'accent' | 'success' | 'warning' | 'danger' | 'neutral'): string {
  switch (tone) {
    case 'success': return 'connected';
    case 'warning': return 'connecting';
    case 'danger': return 'error';
    default: return 'disconnected';
  }
}
