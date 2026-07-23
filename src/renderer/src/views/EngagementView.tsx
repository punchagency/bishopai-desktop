import { useCallback, useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { StatCard } from '../components/StatCard';
import { Feed, type FeedRow } from '../components/Feed';
import { fetchEngagementActivity, fetchEngagementLeads, runCadence, stopLead } from '../lib/api';
import { humanize } from '../lib/format';
import { SkeletonView } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { InfoPopover } from '../components/InfoPopover';
import { SearchBar } from '../components/SearchBar';
import type { EngagementData, EngagementLead, LeadActivityItem } from '../lib/types';

// WF3: lead re-engagement + site activity. Leads show their next cadence step
// (welcome / nudges / reschedule prompts); "Run cadence now" fires the pass
// (dry-run emails until Outlook is connected). Offline sample fallback.

const SAMPLE: EngagementData = {
  outlook_configured: false,
  outlook_sender: null,
  leads: [
    sLead('a', 'sarah.m@example.com', 'new', 'send', 'welcome', 2),
    sLead('b', 'james.t@example.com', 'contacted', 'send', 'nudge_3d', 2),
    sLead('c', 'nadia.k@example.com', 'cancelled', 'send', 'cancelled_7d', 1),
    sLead('d', 'tom.b@example.com', 'booked', 'none', null, 1),
  ],
};
function sLead(id: string, email: string, status: string, action: EngagementLead['next_action'], step: string | null, activity: number): EngagementLead {
  return { id, source: 'seed', email, status, last_touch: null, created_at: new Date().toISOString(), activity_count: activity, last_activity: null, sent_steps: [], next_action: action, next_step: step };
}
const SAMPLE_ACTIVITY: LeadActivityItem[] = [
  { id: '1', type: 'form_open', path: '/book-a-consult', detail: null, occurred_at: new Date().toISOString(), lead_email: 'sarah.m@example.com' },
  { id: '2', type: 'page_view', path: '/services', detail: null, occurred_at: new Date().toISOString(), lead_email: 'sarah.m@example.com' },
];

const STATUS_TONE: Record<string, 'accent' | 'success' | 'warning' | 'neutral'> = {
  new: 'accent', contacted: 'accent', nurturing: 'neutral',
  cancelled: 'warning', replied: 'success', booked: 'success', closed: 'neutral',
};

export function EngagementView({ backendUrl, onChanged }: { backendUrl: string; onChanged?: () => void }) {
  const [data, setData] = useState<EngagementData | null>(null);
  const [activity, setActivity] = useState<LeadActivityItem[]>([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      return Promise.all([
        fetchEngagementLeads(backendUrl, signal),
        fetchEngagementActivity(backendUrl, signal),
      ])
        .then(([d, a]) => {
          setData(d);
          setActivity(a.activity);
          setOffline(false);
        })
        .catch(() => {
          setData(SAMPLE);
          setActivity(SAMPLE_ACTIVITY);
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

  const stop = async (id: string) => {
    if (offline) return;
    setPending(id);
    try {
      await stopLead(backendUrl, id);
      await load();
      onChanged?.();
    } catch {
      /* surfaced on next load */
    } finally {
      setPending(null);
    }
  };

  const runNow = async () => {
    if (offline) return;
    setRunning(true);
    try {
      await runCadence(backendUrl);
      await load();
      onChanged?.();
    } catch {
      /* surfaced on next load */
    } finally {
      setRunning(false);
    }
  };

  if (loading && !data) return <SkeletonView stats={4} cards={4} twoCol />;

  const d = data ?? SAMPLE;
  const byStatus = (s: string) => d.leads.filter((l) => l.status === s).length;
  const dueCount = d.leads.filter((l) => l.next_action === 'send').length;
  // Search by email or status; stats above stay whole-list counts on purpose.
  const needle = query.trim().toLowerCase();
  const leads = needle
    ? d.leads.filter(
        (l) =>
          (l.email ?? '').toLowerCase().includes(needle) ||
          l.status.toLowerCase().includes(needle),
      )
    : d.leads;

  const activityRows: FeedRow[] = activity.map((a) => ({
    id: a.id,
    dot: a.type === 'form_submit' || a.type === 'reply' ? 'success' : a.type === 'booked' ? 'warning' : 'accent',
    title: `${humanize(a.type)}${a.path ? ` · ${a.path}` : a.detail ? ` · ${a.detail}` : ''}`,
    meta: a.lead_email ?? undefined,
  }));

  return (
    <section className="il-view">
      <div className="il-view__head">
        <div>
          <h1 className="il-view__title">
            Engagement{' '}
            <InfoPopover label="What is engagement?" title="How this works">
              New enquiries from the website land here as leads. Each moves through an automatic email
              cadence — a welcome, gentle nudges, and re-booking prompts — sent from Nicole's Outlook.
              Site activity (form opens, page views) shows on the right so you can see who's warming up.
            </InfoPopover>
          </h1>
          <p className="il-view__sub">
            {d.leads.length} lead{d.leads.length === 1 ? '' : 's'} · {dueCount} with a step due
            {offline && <Badge tone="warning">&nbsp;offline preview&nbsp;</Badge>}
            {!offline && !d.outlook_configured && <Badge tone="neutral">&nbsp;Outlook dry-run&nbsp;</Badge>}
          </p>
        </div>
        <Button variant="primary" disabled={offline || running || dueCount === 0} onClick={runNow}>
          {running ? 'Running…' : 'Run cadence now'}
        </Button>
      </div>

      <div className="il-stats">
        <StatCard label="New / contacted" value={byStatus('new') + byStatus('contacted')} tone="accent" />
        <StatCard label="Nurturing" value={byStatus('nurturing')} tone="neutral" />
        <StatCard label="Cancelled" value={byStatus('cancelled')} tone="warning" />
        <StatCard label="Replied" value={byStatus('replied')} tone="success" />
      </div>

      <div className="il-cols">
        {d.leads.length === 0 ? (
          <div className="il-view__empty">
            <EmptyState variant="leads" />
          </div>
        ) : (
        <div>
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search by email or status"
            count={leads.length}
            total={d.leads.length}
          />
          {leads.length === 0 ? (
            <p className="il-empty">No leads match "{query.trim()}".</p>
          ) : (
          <div className="il-grid">
          {leads.map((l) => (
            <Card
              key={l.id}
              title={l.email ?? 'Unknown lead'}
              meta={`${humanize(l.status)}${l.sent_steps.length ? ` · ${l.sent_steps.length} sent` : ''}`}
              actions={
                l.next_action === 'send' ? (
                  <Badge tone="accent">Next: {humanize(l.next_step)}</Badge>
                ) : l.next_action === 'deactivate' ? (
                  <Badge tone="warning">Deactivating</Badge>
                ) : (
                  <Badge tone={STATUS_TONE[l.status] ?? 'neutral'}>{humanize(l.status)}</Badge>
                )
              }
            >
              <div className="il-card__row">
                <span className="il-card__meta">{Number(l.activity_count)} site event{Number(l.activity_count) === 1 ? '' : 's'}</span>
                <Button
                  variant="ghost"
                  disabled={pending === l.id || l.status === 'closed'}
                  onClick={() => stop(l.id)}
                >
                  Stop
                </Button>
              </div>
            </Card>
          ))}
          </div>
          )}
        </div>
        )}
        <Feed title="Live site activity" rows={activityRows} empty="No site activity yet." />
      </div>
    </section>
  );
}
