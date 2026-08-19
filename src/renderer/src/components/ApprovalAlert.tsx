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
      .catch(() => setSummary(null));
    return () => ctrl.abort();
  }, [backendUrl, offline]);

  if (!summary || summary.total === 0) return null;

  const waited = daysWaiting(summary.oldestSendAfter);
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
      className="il-approval-alert"
      onClick={() => onNavigate('engagement')}
    >
      <span className="il-approval-alert__count">{summary.total}</span>
      <span className="il-approval-alert__text">
        <strong>
          {summary.total === 1 ? 'email is' : 'emails are'} waiting for your approval
        </strong>
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
