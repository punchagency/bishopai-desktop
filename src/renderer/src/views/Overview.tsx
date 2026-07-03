import { useEffect, useState } from 'react';
import { StatCard } from '../components/StatCard';
import { Feed, type FeedRow } from '../components/Feed';
import { fetchOverview } from '../lib/api';
import type { CourierStatus, Overview as OverviewData, ViewKey } from '../lib/types';

const SAMPLE: OverviewData = {
  stats: { awaiting_review: 2, unmatched: 2, upcoming: 3, approved_today: 1 },
  recent_activity: [
    { ts: new Date().toISOString(), kind: 'conversation', text: 'Bee conversation matched' },
    { ts: new Date().toISOString(), kind: 'draft', text: 'Session note drafted for Maya Chen' },
  ],
  upcoming: [{ starts_at: new Date().toISOString(), status: 'confirmed', client_name: 'Maya Chen' }],
};

interface Props {
  backendUrl: string;
  courier: CourierStatus;
  onNavigate: (v: ViewKey) => void;
}

export function Overview({ backendUrl, courier, onNavigate }: Props) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchOverview(backendUrl, ctrl.signal)
      .then((d) => {
        setData(d);
        setOffline(false);
      })
      .catch(() => {
        setData(SAMPLE);
        setOffline(true);
      });
    return () => ctrl.abort();
  }, [backendUrl]);

  const d = data ?? SAMPLE;
  const n = (v: number | string) => Number(v) || 0;

  const activityRows: FeedRow[] = d.recent_activity.map((a, i) => ({
    id: `${a.ts}-${i}`,
    dot: a.kind === 'approval' ? 'success' : a.kind === 'conversation' ? 'accent' : 'neutral',
    title: a.text,
    meta: timeAgo(a.ts),
  }));

  const upcomingRows: FeedRow[] = d.upcoming.map((u, i) => ({
    id: `${u.starts_at}-${i}`,
    dot: 'accent',
    title: u.client_name ?? 'Unknown client',
    meta: when(u.starts_at),
  }));

  // Notifications are derived from live state + known roadmap blockers.
  const notes: FeedRow[] = [];
  if (n(d.stats.unmatched) > 0)
    notes.push({ id: 'unmatched', dot: 'warning', title: `${n(d.stats.unmatched)} Bee conversations need tagging`, meta: 'Unmatched' });
  if (n(d.stats.awaiting_review) > 0)
    notes.push({ id: 'review', dot: 'accent', title: `${n(d.stats.awaiting_review)} items awaiting your review`, meta: 'Review Queue' });
  if (courier.state !== 'connected')
    notes.push({ id: 'bee', dot: 'warning', title: 'Bee is not connected', meta: 'Click Connect Bee' });
  notes.push({ id: 'pb', dot: 'neutral', title: 'PB REST API beta — approval pending', meta: 'blocks Checkout' });
  notes.push({ id: 'qb', dot: 'neutral', title: 'QuickBooks Payments not yet enabled', meta: 'blocks Checkout' });

  return (
    <section className="il-view">
      <div className="il-view__head">
        <div>
          <h1 className="il-view__title">Overview</h1>
          <p className="il-view__sub">Your practice at a glance{offline && ' · offline preview'}</p>
        </div>
      </div>

      <div className="il-stats">
        <button className="il-stat-btn" onClick={() => onNavigate('review')}>
          <StatCard label="Awaiting review" value={n(d.stats.awaiting_review)} tone="accent" />
        </button>
        <button className="il-stat-btn" onClick={() => onNavigate('unmatched')}>
          <StatCard label="Unmatched" value={n(d.stats.unmatched)} tone={n(d.stats.unmatched) ? 'warning' : 'neutral'} />
        </button>
        <StatCard label="Upcoming sessions" value={n(d.stats.upcoming)} tone="neutral" />
        <StatCard label="Approved today" value={n(d.stats.approved_today)} tone="success" />
      </div>

      <div className="il-cols">
        <Feed title="Recent activity" rows={activityRows} empty="No activity yet." />
        <div className="il-cols__stack">
          <Feed title="Notifications" rows={notes} />
          <Feed title="Upcoming" rows={upcomingRows} empty="No upcoming sessions." />
        </div>
      </div>
    </section>
  );
}

function timeAgo(ts: string): string {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function when(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}
