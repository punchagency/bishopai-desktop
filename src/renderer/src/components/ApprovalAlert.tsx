import { useEffect, useState } from 'react';
import { fetchApprovalSummary } from '../lib/api';
import type { ApprovalSummary, ViewKey } from '../lib/types';

// "Nothing goes out without you" made visible.
//
// The cadences generate mail on their own schedule; the approval queue holds it.
// That guarantee is only worth something if Nicole knows there is something to
// approve — an invisible queue is just a slower way of never sending. So this
// sits at the top of Overview whenever anything is waiting, and renders nothing
// at all when the queue is clear.

const CATEGORY_LABEL: Record<string, string> = {
  enquiry: 'new enquiries',
  appointment_lapse: 'not rebooked',
  dose_lapse: 'supplements running low',
  protocol: 'protocols',
  cancelled: 'cancelled bookings',
};

/** Whole hours until an instant, floored at 0. Null when there's nothing to time. */
function hoursUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor(ms / 3_600_000));
}

/** Whole days something has been waiting, or null if it isn't due yet. */
function daysWaiting(oldest: string | null): number | null {
  if (!oldest) return null;
  const ms = Date.now() - Date.parse(oldest);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / 86_400_000);
}

export function ApprovalAlert({
  backendUrl,
  offline,
  onNavigate,
}: {
  backendUrl: string;
  offline?: boolean;
  onNavigate: (view: ViewKey) => void;
}) {
  const [summary, setSummary] = useState<ApprovalSummary | null>(null);

  useEffect(() => {
    if (offline) return;
    const ctrl = new AbortController();
    fetchApprovalSummary(backendUrl, ctrl.signal)
      .then(setSummary)
      .catch(() => {
        // An abort is not an empty queue. This component renders nothing when
        // `summary` is null, so treating a cancelled request as a failure made
        // the alert silently disappear — and a queue nobody can see is just a
        // slower way of never sending.
        if (ctrl.signal.aborted) return;
        setSummary(null);
      });
    return () => ctrl.abort();
  }, [backendUrl, offline]);

  if (!summary || summary.total === 0) return null;

  const waited = daysWaiting(summary.oldestSendAfter);
  // A new enquiry's reply is only worth sending today, so it is the one thing
  // this alert leads with rather than folding into a total. Before the approval
  // gate covered it, this email sent itself; the queue is only an improvement if
  // she actually sees it in time.
  const urgent = summary.urgent ?? 0;
  const urgentHours = urgent > 0 ? hoursUntil(summary.nextExpiresAt) : null;
  const cancelled = summary.byList.cancelled ?? 0;
  const normal = summary.byList.normal ?? 0;
  // Ordered biggest-first: with a week's worth queued, the useful sentence is
  // what most of it IS, not an alphabetical tour of the categories.
  const reasons = Object.entries(summary.byCategory)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => `${n} ${CATEGORY_LABEL[key] ?? key}`);

  return (
    <button
      type="button"
      className={`il-approval-alert${urgent > 0 ? ' il-approval-alert--urgent' : ''}`}
      onClick={() => onNavigate('engagement')}
    >
      <span className="il-approval-alert__count">{summary.total}</span>
      <span className="il-approval-alert__text">
        <strong>
          {urgent > 0 ? (
            <>
              {urgent} {urgent === 1 ? 'reply needs' : 'replies need'} you today
              {summary.total > urgent && ` · ${summary.total - urgent} can wait`}
            </>
          ) : (
            <>{summary.total === 1 ? 'email is' : 'emails are'} waiting for your approval</>
          )}
        </strong>
        {urgent > 0 && (
          <span className="il-approval-alert__urgent">
            Someone has just written in.{' '}
            {urgentHours !== null &&
              (urgentHours >= 1
                ? `Dropped in ${urgentHours} hour${urgentHours === 1 ? '' : 's'} if not approved`
                : 'Dropped within the hour if not approved')}
            {' '}— a welcome that lands days late reads worse than none.
          </span>
        )}
        <span className="il-approval-alert__detail">
          {normal > 0 && `${normal} normal`}
          {normal > 0 && cancelled > 0 && ' · '}
          {cancelled > 0 && `${cancelled} cancelled win-back`}
          {reasons.length > 0 && ` — ${reasons.join(', ')}`}
        </span>
        {waited !== null && waited >= 1 && (
          <span className="il-approval-alert__stale">
            Oldest has waited {waited} day{waited === 1 ? '' : 's'}; unapproved mail is
            dropped after 7 rather than sent late.
          </span>
        )}
      </span>
      <span className="il-approval-alert__go">Review →</span>
    </button>
  );
}
