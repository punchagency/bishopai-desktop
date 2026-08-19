import { useEffect, useState } from 'react';
import { StatCard } from '../components/StatCard';
import { ApprovalAlert } from '../components/ApprovalAlert';
import { Feed, type FeedRow } from '../components/Feed';
import { Badge } from '../components/Badge';
import { Skeleton, SkeletonView } from '../components/Skeleton';
import { fetchOverview, fetchTasks, fetchUpcomingReminders, setReminderCancelled, updateTask } from '../lib/api';
import { ConnectionError } from '../components/ConnectionError';
import { allowSampleData } from '../lib/preview';
import type {
  PocketStatus,
  Overview as OverviewData,
  ScheduledReminder,
  Task,
  TaskStatus,
  ViewKey,
} from '../lib/types';

const SAMPLE: OverviewData = {
  stats: { awaiting_review: 2, unmatched: 2, upcoming: 3, approved_today: 1 },
  recent_activity: [
    { ts: new Date().toISOString(), kind: 'conversation', text: 'Recording matched to an appointment' },
    { ts: new Date().toISOString(), kind: 'draft', text: 'Session note drafted for Maya Chen' },
  ],
  upcoming: [{ starts_at: new Date().toISOString(), status: 'confirmed', client_name: 'Maya Chen' }],
};

interface Props {
  backendUrl: string;
  pocket: PocketStatus | null;
  onNavigate: (v: ViewKey) => void;
}

export function Overview({ backendUrl, pocket, onNavigate }: Props) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [offline, setOffline] = useState(false);
  // Set when the fetch failed and we are NOT allowed to show samples (any
  // non-local backend). Distinct from `offline`, which means "showing samples".
  const [unreachable, setUnreachable] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchOverview(backendUrl, ctrl.signal)
      .then((d) => {
        setData(d);
        setOffline(false);
      })
      .catch((err: Error) => {
        if (ctrl.signal.aborted) return;
        if (allowSampleData(backendUrl)) {
          setData(SAMPLE);
          setOffline(true);
        } else {
          setUnreachable(err.message);
        }
      });
    return () => ctrl.abort();
  }, [backendUrl]);

  // Never paint SAMPLE while the first fetch is in flight. `data` is set on
  // success AND on failure (failure substitutes SAMPLE and raises `offline`),
  // so a null here means "still loading" and nothing else. Rendering the
  // sample in that window showed Nicole invented clients with no offline
  // badge to mark them — indistinguishable from her real queue.
  if (unreachable) return <ConnectionError backendUrl={backendUrl} detail={unreachable} onRetry={() => location.reload()} />;
  if (!data) return <SkeletonView stats={4} twoCol />;
  const d = data;
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
    notes.push({ id: 'unmatched', dot: 'warning', title: `${n(d.stats.unmatched)} recordings need tagging`, meta: 'Unmatched' });
  if (n(d.stats.awaiting_review) > 0)
    notes.push({ id: 'review', dot: 'accent', title: `${n(d.stats.awaiting_review)} items awaiting your review`, meta: 'Sessions' });
  // Recordings arrive server-side, so there is no action for her here — this
  // says what's true and who is fixing it, rather than offering a dead button.
  if (pocket && !pocket.healthy)
    notes.push({
      id: 'pocket',
      dot: 'warning',
      title: pocket.configured ? 'No recordings have arrived recently' : 'Pocket is not connected yet',
      meta: pocket.configured ? 'Check your Pocket app' : 'Richmond is setting this up',
    });
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

      {/* Above the stats, because it is the one thing on this page that is about
          to happen TO someone else. Everything below is work waiting for Nicole;
          this is mail waiting to leave, and it does not leave without her. */}
      <ApprovalAlert backendUrl={backendUrl} offline={offline} onNavigate={onNavigate} />

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

      {/* What's coming, on its own full-width row and above the working columns:
          the sessions Nicole will sit in, beside the emails that will go out
          before them. Side by side rather than stacked in the narrow column — a
          reminder row carries a client, a subject, a date and a Cancel button,
          and none of that survives 330px. Both are time-sensitive, so neither
          sits below a scrolling activity log. */}
      <div className="il-cols il-cols--split">
        <Feed title="Upcoming" rows={upcomingRows} empty="No upcoming sessions." />
        <EmailRemindersCard backendUrl={backendUrl} />
      </div>

      <div className="il-cols" style={{ marginTop: '1rem' }}>
        <div className="il-cols__stack">
          <TasksCard backendUrl={backendUrl} />
          <Feed title="Recent activity" rows={activityRows} empty="No activity yet." />
        </div>
        <div className="il-cols__stack">
          <Feed title="Notifications" rows={notes} />
        </div>
      </div>
    </section>
  );
}

/**
 * Follow-ups Nicole committed to in session, now tracked. They arrive here only
 * once she has approved the note they came from. Ticking one off is the only write
 * — nothing on this card contacts a client.
 */
function TasksCard({ backendUrl }: { backendUrl: string }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchTasks(backendUrl, ctrl.signal)
      .then((r) => setTasks(r.tasks))
      .catch(() => setTasks([]));
    return () => ctrl.abort();
  }, [backendUrl]);

  const resolve = async (id: string, status: TaskStatus) => {
    setBusy(id);
    try {
      await updateTask(backendUrl, id, status);
      setTasks((cur) => (cur ?? []).filter((t) => t.id !== id));
    } catch {
      setBusy(null); // leave it in place; the next load will re-sync
      return;
    }
    setBusy(null);
  };

  const today = new Date().toISOString().slice(0, 10);
  const overdue = (tasks ?? []).filter((t) => t.due_date && t.due_date < today).length;

  return (
    <div className="il-card">
      <h3 className="il-card__title">
        Follow-ups{overdue > 0 && <Badge tone="warning"> {overdue} overdue</Badge>}
      </h3>

      {tasks === null && (
        <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.7rem' }}>
          {[85, 65, 75].map((w, i) => (
            <Skeleton key={i} width={`${w}%`} height="1rem" />
          ))}
        </div>
      )}

      {tasks?.length === 0 && (
        <p className="il-card__meta" style={{ marginTop: '0.6rem' }}>
          Nothing outstanding. Follow-ups appear here once you approve the session note they came from.
        </p>
      )}

      {tasks && tasks.length > 0 && (
        <ul className="il-feed">
          {tasks.map((t) => {
            const isOverdue = t.due_date !== null && t.due_date < today;
            return (
              <li key={t.id} className="il-feed__row" style={{ opacity: busy === t.id ? 0.5 : 1 }}>
                <span className={`il-dot il-dot--${isOverdue ? 'warning' : 'neutral'}`} />
                <span className="il-feed__title">
                  {t.title}
                  {t.client_name && <span className="il-card__meta"> · {t.client_name}</span>}
                </span>
                <span className="il-feed__meta" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {t.due_date ? (isOverdue ? `overdue ${t.due_date}` : t.due_date) : 'no date'}
                  <button
                    className="il-btn il-btn--ghost"
                    disabled={busy === t.id}
                    title="Mark done"
                    onClick={() => void resolve(t.id, 'done')}
                  >
                    Done
                  </button>
                  <button
                    className="il-btn il-btn--ghost"
                    disabled={busy === t.id}
                    title="Dismiss — it no longer applies"
                    onClick={() => void resolve(t.id, 'dismissed')}
                  >
                    Dismiss
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * The client emails the cadences are about to send — refill reminders and WF3
 * re-engagement steps — each with the date it goes out and a way to stop it.
 *
 * This is the only place Nicole can see automation before it reaches a client.
 * Cancelling silences that cadence and nothing else: a cancelled refill still
 * shows as running low under Refills, so stopping the email never hides the
 * clinical fact behind it. A cancelled row stays put with an Undo until the
 * next load, because an accidental cancel is otherwise unrecoverable from here.
 */
const VISIBLE_REMINDERS = 8;
const RESERVED_REFILL_ROWS = 4;

/**
 * Which reminders make the card. Soonest first is the server's order, but a
 * straight slice hides the wrong ones: a re-engagement cadence can queue thirty
 * nudges onto a single day and bury every refill behind them. Refills keep a
 * few reserved rows — a client about to run out of a prescribed supplement is
 * the row Nicole most needs to see before it sends. Unused slots go back to the
 * rest, and the shown set stays in date order.
 */
function pickVisible(all: ScheduledReminder[]): ScheduledReminder[] {
  const refills = all.filter((r) => r.kind === 'refill');
  const rest = all.filter((r) => r.kind !== 'refill');
  const refillRows = Math.min(refills.length, Math.max(RESERVED_REFILL_ROWS, VISIBLE_REMINDERS - rest.length));
  return [...refills.slice(0, refillRows), ...rest.slice(0, VISIBLE_REMINDERS - refillRows)].sort((a, b) =>
    a.send_at.localeCompare(b.send_at),
  );
}

function EmailRemindersCard({ backendUrl }: { backendUrl: string }) {
  const [reminders, setReminders] = useState<ScheduledReminder[] | null>(null);
  const [cancelled, setCancelled] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchUpcomingReminders(backendUrl, 30, ctrl.signal)
      .then((r) => setReminders(r.reminders))
      .catch(() => setReminders([]));
    return () => ctrl.abort();
  }, [backendUrl]);

  const toggle = async (r: ScheduledReminder, cancel: boolean) => {
    setBusy(r.id);
    setFailed(null);
    try {
      await setReminderCancelled(backendUrl, r.kind, r.source_id, cancel);
      setCancelled((cur) => ({ ...cur, [r.id]: cancel }));
    } catch {
      setFailed(r.id); // nothing changed server-side; the row keeps its old state
    } finally {
      setBusy(null);
    }
  };

  // The badge counts what will actually reach a client — cancelled rows and
  // ones with nowhere to send don't.
  const willSend = (reminders ?? []).filter((r) => !r.blocked_reason && !cancelled[r.id]).length;
  const shown = pickVisible(reminders ?? []);
  const hidden = (reminders?.length ?? 0) - shown.length;

  return (
    <div className="il-card">
      <h3 className="il-card__title">
        Email reminders
        {willSend > 0 && <Badge tone="neutral"> {willSend} scheduled</Badge>}
      </h3>
      <p className="il-card__meta" style={{ marginTop: '0.35rem' }}>
        Automatic emails to clients. Cancelling stops the reminder, not the refill.
      </p>

      {reminders === null && (
        <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.7rem' }}>
          {[80, 60, 70].map((w, i) => (
            <Skeleton key={i} width={`${w}%`} height="1rem" />
          ))}
        </div>
      )}

      {reminders?.length === 0 && (
        <p className="il-card__meta" style={{ marginTop: '0.6rem' }}>
          Nothing queued to send in the next 30 days.
        </p>
      )}

      {reminders && reminders.length > 0 && (
        <ul className="il-reminders">
          {shown.map((r) => {
            const isCancelled = cancelled[r.id] === true;
            const blocked = !!r.blocked_reason;
            return (
              <li key={r.id} className="il-reminder" style={{ opacity: busy === r.id || isCancelled ? 0.55 : 1 }}>
                <span className={`il-dot il-dot--${blocked ? 'connecting' : isCancelled ? 'disconnected' : 'connected'}`} />
                <div className="il-reminder__body">
                  <div className="il-reminder__who">{r.client_name}</div>
                  {/* What it's about — for a refill that's the supplement and the
                      dose the timing was computed from. The subject line the
                      client will read is one hover away. */}
                  <div className="il-reminder__what" title={`Subject: ${r.subject}`}>
                    {r.detail ?? r.subject}
                  </div>
                  <div className="il-reminder__when">
                    {isCancelled ? 'Cancelled — no email will be sent' : sendWhen(r.send_at)}
                    {blocked && <span className="il-reminder__blocked"> · won’t send: {r.blocked_reason}</span>}
                    {failed === r.id && <span className="il-error"> · couldn’t update, try again</span>}
                  </div>
                </div>
                <button
                  className="il-btn il-btn--ghost"
                  disabled={busy === r.id}
                  title={isCancelled ? 'Resume this cadence' : `Don’t send this — “${r.subject}”`}
                  onClick={() => void toggle(r, !isCancelled)}
                >
                  {isCancelled ? 'Undo' : 'Cancel'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {hidden > 0 && (
        <p className="il-card__meta" style={{ marginTop: '0.5rem' }}>
          + {hidden} more scheduled in the next 30 days.
        </p>
      )}
    </div>
  );
}

/** "sends today" / "sends tomorrow" / "sends Tue 4 Aug · in 6 days". */
function sendWhen(sendAt: string): string {
  const d = new Date(`${sendAt}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (days <= 0) return 'sends today';
  if (days === 1) return 'sends tomorrow';
  const date = d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  return `sends ${date} · in ${days}d`;
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
