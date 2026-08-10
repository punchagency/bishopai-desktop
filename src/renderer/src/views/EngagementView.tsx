import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { StatCard } from '../components/StatCard';
import { Feed, type FeedRow } from '../components/Feed';
import { EmailTemplatesCard } from '../components/EmailTemplatesCard';
import { IconClock, IconEdit, IconCheckCircle, IconXCircle } from '../components/Icons';
import {
  fetchEngagementActivity,
  fetchEngagementLeads,
  fetchEmailQueue,
  fetchSentLog,
  fetchLeadHistory,
  runCadence,
  sendLeadEmail,
  saveLeadDraft,
  resetLeadDraft,
  stopLead,
} from '../lib/api';
import { humanize } from '../lib/format';
import { SkeletonView } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { InfoPopover } from '../components/InfoPopover';
import { SearchBar } from '../components/SearchBar';
import type { EngagementData, EngagementLead, LeadActivityItem, QueueItem, SentEmail } from '../lib/types';

// WF3: lead re-engagement + site activity. Four tabs:
//   Leads     — status + inline pending subject; customize upcoming email or view history
//   Queue     — upcoming sends sorted by date; customize or send now inline
//   Templates — first-class copy editor for all cadence tracks (inquiry, cancelled, maintenance, first_appt)
//   Sent      — unified log across all leads; expand body inline

const SAMPLE: EngagementData = {
  outlook_configured: false,
  outlook_sender: null,
  leads: [
    sLead('a', 'sarah.m@example.com', 'new', 'send', 'welcome', 2, 'Welcome to Nicole\'s practice', 'Hi Sarah, thanks for reaching out...', '2026-08-11T09:00:00Z', false),
    sLead('b', 'james.t@example.com', 'contacted', 'send', 'nudge_3d', 2, 'Just checking in', 'Hi James, just wanted to follow up...', '2026-08-12T09:00:00Z', true),
    sLead('c', 'nadia.k@example.com', 'cancelled', 'send', 'cancelled_7d', 1, 'We\'d love to welcome you back', 'Sorry we missed each other...', '2026-08-13T09:00:00Z', false),
    sLead('d', 'tom.b@example.com', 'booked', 'none', null, 1, null, null, null, false),
  ],
};
function sLead(
  id: string, email: string, status: string, action: EngagementLead['next_action'],
  step: string | null, activity: number, next_subject: string | null, next_body: string | null,
  next_send_at: string | null, is_custom_draft: boolean,
): EngagementLead {
  return { id, source: 'seed', email, status, last_touch: null, created_at: new Date().toISOString(),
    activity_count: activity, last_activity: null, sent_steps: [], next_action: action, next_step: step,
    next_subject, next_body, next_send_at, is_custom_draft };
}
const SAMPLE_ACTIVITY: LeadActivityItem[] = [
  { id: '1', type: 'form_open', path: '/book-a-consult', detail: null, occurred_at: new Date().toISOString(), lead_email: 'sarah.m@example.com' },
  { id: '2', type: 'page_view', path: '/services', detail: null, occurred_at: new Date().toISOString(), lead_email: 'sarah.m@example.com' },
];
const SAMPLE_QUEUE: QueueItem[] = [
  { lead_id: 'a', email: 'sarah.m@example.com', status: 'new', track: 'inquiry', step: 'welcome',
    subject: 'Welcome to Nicole\'s practice', body: 'Hi Sarah, thanks for reaching out...', send_at: '2026-08-11T09:00:00Z', is_custom_draft: false },
  { lead_id: 'b', email: 'james.t@example.com', status: 'contacted', track: 'inquiry', step: 'nudge_3d',
    subject: 'Just checking in', body: 'Hi James, just wanted to follow up...', send_at: '2026-08-12T09:00:00Z', is_custom_draft: true },
];
const SAMPLE_SENT: SentEmail[] = [
  { id: 's1', lead_id: 'a', track: 'inquiry', step: 'welcome', to_email: 'sarah.m@example.com',
    subject: 'Welcome to Nicole\'s practice', body: 'Hi Sarah, thanks for reaching out...', dry_run: true, ok: true, error: null, sent_at: new Date(Date.now() - 3_600_000).toISOString() },
];

const STATUS_TONE: Record<string, 'accent' | 'success' | 'warning' | 'neutral'> = {
  new: 'accent', contacted: 'accent', nurturing: 'neutral',
  cancelled: 'warning', replied: 'success', booked: 'success', closed: 'neutral',
};

type Tab = 'leads' | 'queue' | 'templates' | 'sent';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function relativeFromNow(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return 'overdue';
  if (diff < 3_600_000) return 'less than 1h';
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 86_400_000 * 2) return 'tomorrow';
  return `in ${Math.floor(diff / 86_400_000)}d`;
}

// ── Inline Email Customization Editor ─────────────────────────────────────────
interface EmailEditorProps {
  leadId: string;
  step: string;
  initialSubject: string;
  initialBody: string;
  isCustomDraft?: boolean;
  recipientEmail?: string | null;
  backendUrl: string;
  onSaved: () => void;
  onSent: () => void;
  onClose: () => void;
}

function InlineEmailEditor({
  leadId,
  step,
  initialSubject,
  initialBody,
  isCustomDraft,
  recipientEmail,
  backendUrl,
  onSaved,
  onSent,
  onClose,
}: EmailEditorProps) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(120, el.scrollHeight)}px`;
  }, [body]);

  const handleSaveDraft = async () => {
    if (!subject.trim() || !body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await saveLeadDraft(backendUrl, leadId, step, subject.trim(), body.trim());
      setSuccess('Draft saved for scheduled send');
      setTimeout(() => {
        onSaved();
        onClose();
      }, 500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save draft');
      setBusy(false);
    }
  };

  const handleSendNow = async () => {
    if (!subject.trim() || !body.trim()) return;
    if (!window.confirm(`Send this email to ${recipientEmail ?? 'lead'} right now?`)) return;
    setBusy(true);
    setError(null);
    try {
      await sendLeadEmail(backendUrl, leadId, { step, subject: subject.trim(), body: body.trim() });
      setSuccess('Email sent!');
      setTimeout(() => {
        onSent();
        onClose();
      }, 500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send email');
      setBusy(false);
    }
  };

  const handleResetDraft = async () => {
    if (!window.confirm('Reset this custom draft back to the track template?')) return;
    setBusy(true);
    setError(null);
    try {
      await resetLeadDraft(backendUrl, leadId, step);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset draft');
      setBusy(false);
    }
  };

  return (
    <div className="il-inline-editor">
      <div className="il-inline-editor__head">
        <div className="il-inline-editor__title-row">
          <span className="il-lead__step-chip">{humanize(step)}</span>
          <span className="il-inline-editor__target">
            {recipientEmail ? `Customizing email for ${recipientEmail}` : 'Customize email before sending'}
          </span>
          {isCustomDraft && <Badge tone="accent">Customized</Badge>}
        </div>
      </div>

      <div className="il-field">
        <label className="il-field__label" htmlFor={`subj-${leadId}`}>Subject</label>
        <input
          id={`subj-${leadId}`}
          className="il-input"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={busy}
          placeholder="Email subject..."
        />
      </div>

      <div className="il-field">
        <label className="il-field__label" htmlFor={`body-${leadId}`}>
          Body
          <span className="il-tpl-row__charcount"> · {body.length} chars</span>
        </label>
        <textarea
          id={`body-${leadId}`}
          ref={bodyRef}
          className="il-input il-inline-editor__textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={busy}
          rows={5}
          placeholder="Email message..."
        />
      </div>

      {error && <p className="il-error">{error}</p>}
      {success && <p className="il-success">{success}</p>}

      <div className="il-inline-editor__actions">
        <div className="il-inline-editor__left">
          {isCustomDraft && (
            <Button variant="ghost" disabled={busy} onClick={handleResetDraft}>
              Reset to template
            </Button>
          )}
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
        </div>
        <div className="il-inline-editor__right">
          <Button variant="secondary" disabled={busy || !subject.trim() || !body.trim()} onClick={handleSaveDraft}>
            Save draft
          </Button>
          <Button variant="primary" disabled={busy || !subject.trim() || !body.trim()} onClick={handleSendNow}>
            {busy ? 'Sending…' : 'Send now'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Lead card with inline history & email customization ───────────────────────
function LeadCard({
  lead, pending, onStop, onReload, backendUrl, offline,
}: {
  lead: EngagementLead;
  pending: string | null;
  onStop: (id: string) => void;
  onReload: () => void;
  backendUrl: string;
  offline: boolean;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [history, setHistory] = useState<SentEmail[] | null>(null);
  const [histLoading, setHistLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    if (offline) return;
    setHistLoading(true);
    try {
      const { history: rows } = await fetchLeadHistory(backendUrl, lead.id);
      setHistory(rows);
    } catch {
      setHistory([]);
    } finally {
      setHistLoading(false);
    }
  }, [backendUrl, lead.id, offline]);

  const toggleHistory = () => {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next && history === null) void loadHistory();
  };

  const hasNextStep = !!(lead.next_step && lead.next_subject);

  return (
    <div className="il-lead-card">
      <Card
        title={lead.email ?? 'Unknown lead'}
        meta={`${humanize(lead.status)}${lead.sent_steps.length ? ` · ${lead.sent_steps.length} sent` : ''}`}
        actions={
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            {lead.is_custom_draft && (
              <Badge tone="accent">
                <IconEdit size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '0.3rem' }} />
                Custom draft
              </Badge>
            )}
            {lead.next_action === 'send' ? (
              <Badge tone="accent">Next: {humanize(lead.next_step)}</Badge>
            ) : lead.next_action === 'deactivate' ? (
              <Badge tone="warning">Deactivating</Badge>
            ) : (
              <Badge tone={STATUS_TONE[lead.status] ?? 'neutral'}>{humanize(lead.status)}</Badge>
            )}
          </div>
        }
      >
        {/* Pending subject — glanceable without any click */}
        {lead.next_subject && (
          <p className="il-lead__next-subject" title="Next email subject">
            <span className="il-lead__next-label">Next email: </span>
            {lead.next_subject}
            {lead.next_send_at && (
              <span className="il-lead__next-when"> · {relativeFromNow(lead.next_send_at)}</span>
            )}
          </p>
        )}
        <div className="il-card__row">
          <span className="il-card__meta">{Number(lead.activity_count)} site event{Number(lead.activity_count) === 1 ? '' : 's'}</span>
          <div className="il-lead__actions">
            {hasNextStep && (
              <Button
                variant={lead.is_custom_draft ? 'secondary' : 'ghost'}
                onClick={() => setEditOpen(!editOpen)}
                id={`edit-lead-${lead.id}`}
              >
                {editOpen ? 'Close edit' : lead.is_custom_draft ? 'Edit draft' : 'Customize email'}
              </Button>
            )}
            <Button variant="ghost" onClick={toggleHistory} id={`history-${lead.id}`}>
              {historyOpen ? 'Hide history' : 'History'}
            </Button>
            <Button
              variant="ghost"
              disabled={pending === lead.id || lead.status === 'closed'}
              onClick={() => onStop(lead.id)}
            >
              Stop
            </Button>
          </div>
        </div>
      </Card>

      {/* Inline email customization drawer */}
      {editOpen && lead.next_step && (
        <InlineEmailEditor
          leadId={lead.id}
          step={lead.next_step}
          initialSubject={lead.next_subject ?? ''}
          initialBody={lead.next_body ?? ''}
          isCustomDraft={lead.is_custom_draft}
          recipientEmail={lead.email}
          backendUrl={backendUrl}
          onSaved={onReload}
          onSent={onReload}
          onClose={() => setEditOpen(false)}
        />
      )}

      {/* History timeline */}
      {historyOpen && (
        <div className="il-lead-history">
          {histLoading ? (
            <p className="il-lead-history__empty">Loading…</p>
          ) : !history || history.length === 0 ? (
            <p className="il-lead-history__empty">No emails sent yet.</p>
          ) : (
            <ul className="il-timeline il-history">
              {history.map((h) => (
                <HistoryRow key={h.id} item={h} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Single history timeline row with body expand ──────────────────────────────
function HistoryRow({ item }: { item: SentEmail }) {
  const [showBody, setShowBody] = useState(false);
  return (
    <li className="il-timeline__row">
      <span className={`il-dot il-dot--${item.ok ? 'connected' : 'error'}`} style={{ marginTop: '0.4rem' }} />
      <div className="il-timeline__body">
        <div className="il-timeline__summary">
          {item.step && <span className="il-lead__step-chip">{humanize(item.step)}</span>}
          {item.step && ' '}
          {item.subject}
        </div>
        <div className="il-timeline__meta">
          <span className="il-timeline__time">{relativeTime(item.sent_at)}</span>
          {item.dry_run && <Badge tone="neutral">dry run</Badge>}
          {!item.dry_run && item.ok && <Badge tone="success">sent</Badge>}
          {!item.ok && <Badge tone="warning">failed</Badge>}
          <button className="il-link il-link--sm" onClick={() => setShowBody(!showBody)}>
            {showBody ? 'Hide' : 'Show email'}
          </button>
        </div>
        {showBody && <pre className="il-email-body">{item.body}</pre>}
      </div>
    </li>
  );
}

// ── Queue tab row with inline customize & send ────────────────────────────────
function QueueRow({
  item,
  backendUrl,
  onReload,
  onCancel,
  cancelling,
}: {
  item: QueueItem;
  backendUrl: string;
  onReload: () => void;
  onCancel: (id: string) => void;
  cancelling: boolean;
}) {
  const [showBody, setShowBody] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <div className="il-queue-item-card">
      <div className="il-queue-row">
        <div className="il-queue-row__main">
          <div className="il-queue-row__head">
            <span className="il-lead__step-chip">{humanize(item.step)}</span>
            <span className="il-queue-row__email">{item.email}</span>
            <Badge tone={STATUS_TONE[item.status] ?? 'neutral'}>{humanize(item.status)}</Badge>
            {item.is_custom_draft && (
              <Badge tone="accent">
                <IconEdit size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '0.3rem' }} />
                Custom draft
              </Badge>
            )}
          </div>
          <p className="il-queue-row__subject">{item.subject}</p>
          <div className="il-queue-row__foot">
            <span className="il-queue-row__when">
              <IconClock size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '0.3rem', opacity: 0.7 }} />
              {relativeFromNow(item.send_at)}
            </span>
            <button className="il-link il-link--sm" onClick={() => setShowBody(!showBody)}>
              {showBody ? 'Hide preview' : 'Preview body'}
            </button>
          </div>
        </div>
        <div className="il-queue-row__actions">
          <Button
            variant={item.is_custom_draft ? 'secondary' : 'ghost'}
            onClick={() => setEditing(!editing)}
            id={`customize-queue-${item.lead_id}`}
          >
            {editing ? 'Close edit' : item.is_custom_draft ? 'Edit draft' : 'Customize'}
          </Button>
          <Button
            variant="ghost"
            disabled={cancelling}
            onClick={() => onCancel(item.lead_id)}
            id={`cancel-${item.lead_id}`}
          >
            Cancel
          </Button>
        </div>
        {showBody && !editing && <pre className="il-email-body il-queue-row__body">{item.body}</pre>}
      </div>

      {editing && (
        <InlineEmailEditor
          leadId={item.lead_id}
          step={item.step}
          initialSubject={item.subject}
          initialBody={item.body}
          isCustomDraft={item.is_custom_draft}
          recipientEmail={item.email}
          backendUrl={backendUrl}
          onSaved={onReload}
          onSent={onReload}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

// ── Sent tab row ──────────────────────────────────────────────────────────────
function SentRow({ item }: { item: SentEmail }) {
  const [showBody, setShowBody] = useState(false);
  return (
    <div className="il-sent-row">
      <div className="il-sent-row__main">
        <div className="il-sent-row__head">
          {item.step && <span className="il-lead__step-chip">{humanize(item.step)}</span>}
          <span className="il-sent-row__to">{item.to_email}</span>
          {item.dry_run ? (
            <Badge tone="neutral">dry run</Badge>
          ) : item.ok ? (
            <Badge tone="success">
              <IconCheckCircle size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '0.25rem' }} />
              sent
            </Badge>
          ) : (
            <Badge tone="warning">
              <IconXCircle size={11} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '0.25rem' }} />
              failed
            </Badge>
          )}
        </div>
        <p className="il-sent-row__subject">{item.subject}</p>
        <div className="il-sent-row__foot">
          <span className="il-sent-row__time">{relativeTime(item.sent_at)}</span>
          <button className="il-link il-link--sm" onClick={() => setShowBody(!showBody)}>
            {showBody ? 'Hide' : 'Show email'}
          </button>
        </div>
      </div>
      {showBody && <pre className="il-email-body">{item.body}</pre>}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────
export function EngagementView({ backendUrl, onChanged }: { backendUrl: string; onChanged?: () => void }) {
  const [tab, setTab] = useState<Tab>('leads');
  const [data, setData] = useState<EngagementData | null>(null);
  const [activity, setActivity] = useState<LeadActivityItem[]>([]);
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [sent, setSent] = useState<{ rows: SentEmail[]; total: number } | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [query, setQuery] = useState('');
  const sentOffset = useRef(0);

  const loadLeads = useCallback(
    (signal?: AbortSignal) =>
      Promise.all([
        fetchEngagementLeads(backendUrl, signal),
        fetchEngagementActivity(backendUrl, signal),
      ]).then(([d, a]) => {
        setData(d);
        setActivity(a.activity);
        setOffline(false);
      }),
    [backendUrl],
  );

  const loadQueue = useCallback(
    (signal?: AbortSignal) =>
      fetchEmailQueue(backendUrl, signal).then((q) => setQueue(q.queue)),
    [backendUrl],
  );

  const loadSent = useCallback(
    (signal?: AbortSignal) =>
      fetchSentLog(backendUrl, 50, 0, signal).then((s) => {
        setSent({ rows: s.sent, total: s.total });
        sentOffset.current = s.sent.length;
      }),
    [backendUrl],
  );

  const loadAll = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      return Promise.all([loadLeads(signal), loadQueue(signal), loadSent(signal)])
        .catch(() => {
          setData(SAMPLE);
          setActivity(SAMPLE_ACTIVITY);
          setQueue(SAMPLE_QUEUE);
          setSent({ rows: SAMPLE_SENT, total: SAMPLE_SENT.length });
          setOffline(true);
        })
        .finally(() => setLoading(false));
    },
    [loadLeads, loadQueue, loadSent],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void loadAll(ctrl.signal);
    return () => ctrl.abort();
  }, [loadAll]);

  const reloadData = () => {
    const ctrl = new AbortController();
    void loadAll(ctrl.signal);
    onChanged?.();
  };

  const stop = async (id: string) => {
    if (offline) return;
    setPending(id);
    const ctrl = new AbortController();
    try {
      await stopLead(backendUrl, id);
      await loadAll(ctrl.signal);
      onChanged?.();
    } catch { /* surfaced on next load */ } finally {
      setPending(null);
    }
  };

  const runNow = async () => {
    if (offline) return;
    setRunning(true);
    const ctrl = new AbortController();
    try {
      await runCadence(backendUrl);
      await loadAll(ctrl.signal);
      onChanged?.();
    } catch { /* surfaced on next load */ } finally {
      setRunning(false);
    }
  };

  const loadMoreSent = async () => {
    if (offline) return;
    try {
      const s = await fetchSentLog(backendUrl, 50, sentOffset.current);
      setSent((prev) => ({
        rows: [...(prev?.rows ?? []), ...s.sent],
        total: s.total,
      }));
      sentOffset.current += s.sent.length;
    } catch { /* ignore */ }
  };

  if (loading && !data) return <SkeletonView stats={4} cards={4} twoCol />;

  const d = data ?? SAMPLE;
  const byStatus = (s: string) => d.leads.filter((l) => l.status === s).length;
  const dueCount = d.leads.filter((l) => l.next_action === 'send').length;
  const needle = query.trim().toLowerCase();
  const leads = needle
    ? d.leads.filter((l) => (l.email ?? '').toLowerCase().includes(needle) || l.status.toLowerCase().includes(needle))
    : d.leads;

  const activityRows: FeedRow[] = activity.map((a) => ({
    id: a.id,
    dot: a.type === 'form_submit' || a.type === 'reply' ? 'success' : a.type === 'booked' ? 'warning' : 'accent',
    title: `${humanize(a.type)}${a.path ? ` · ${a.path}` : a.detail ? ` · ${a.detail}` : ''}`,
    meta: a.lead_email ?? undefined,
  }));

  const queueRows = queue ?? SAMPLE_QUEUE;
  const sentData = sent ?? { rows: SAMPLE_SENT, total: SAMPLE_SENT.length };

  return (
    <section className="il-view">
      <div className="il-view__head">
        <div>
          <h1 className="il-view__title">
            Engagement{' '}
            <InfoPopover label="What is engagement?" title="How this works">
              New enquiries from the website land here as leads. Each moves through an automatic email
              cadence — a welcome, gentle nudges, and re-booking prompts — sent from Nicole's Outlook.
              You can edit global templates or personalize individual emails before they are sent.
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

      {/* Tab bar */}
      <div className="il-tabs" role="tablist">
        <button
          id="tab-leads" role="tab" aria-selected={tab === 'leads'}
          className={`il-tab${tab === 'leads' ? ' il-tab--on' : ''}`}
          onClick={() => setTab('leads')}
        >
          Leads
        </button>
        <button
          id="tab-queue" role="tab" aria-selected={tab === 'queue'}
          className={`il-tab${tab === 'queue' ? ' il-tab--on' : ''}`}
          onClick={() => setTab('queue')}
        >
          Queue {queueRows.length > 0 && <span className="il-tab__count">{queueRows.length}</span>}
        </button>
        <button
          id="tab-templates" role="tab" aria-selected={tab === 'templates'}
          className={`il-tab${tab === 'templates' ? ' il-tab--on' : ''}`}
          onClick={() => setTab('templates')}
        >
          Templates
        </button>
        <button
          id="tab-sent" role="tab" aria-selected={tab === 'sent'}
          className={`il-tab${tab === 'sent' ? ' il-tab--on' : ''}`}
          onClick={() => setTab('sent')}
        >
          Sent {sentData.total > 0 && <span className="il-tab__count">{sentData.total}</span>}
        </button>
      </div>

      {/* ── Leads tab ──────────────────────────────────────────────────────── */}
      {tab === 'leads' && (
        <div className="il-cols">
          {d.leads.length === 0 ? (
            <div className="il-view__empty"><EmptyState variant="leads" /></div>
          ) : (
            <div>
              <SearchBar
                value={query} onChange={setQuery}
                placeholder="Search by email or status"
                count={leads.length} total={d.leads.length}
              />
              {leads.length === 0 ? (
                <p className="il-empty">No leads match "{query.trim()}".</p>
              ) : (
                <div className="il-grid">
                  {leads.map((l) => (
                    <LeadCard
                      key={l.id} lead={l} pending={pending}
                      onStop={stop} onReload={reloadData} backendUrl={backendUrl} offline={offline}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          <Feed title="Live site activity" rows={activityRows} empty="No site activity yet." />
        </div>
      )}

      {/* ── Queue tab ──────────────────────────────────────────────────────── */}
      {tab === 'queue' && (
        <div className="il-queue">
          {queueRows.length === 0 ? (
            <div className="il-queue__empty">
              <p className="il-card__meta">No emails scheduled — all leads are up to date.</p>
            </div>
          ) : (
            <div className="il-queue__list">
              {queueRows.map((item) => (
                <QueueRow
                  key={item.lead_id}
                  item={item}
                  backendUrl={backendUrl}
                  onReload={reloadData}
                  onCancel={stop}
                  cancelling={pending === item.lead_id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Templates tab ──────────────────────────────────────────────────── */}
      {tab === 'templates' && (
        <div className="il-templates-tab">
          <EmailTemplatesCard backendUrl={backendUrl} embedded={true} defaultOpen={true} />
        </div>
      )}

      {/* ── Sent tab ───────────────────────────────────────────────────────── */}
      {tab === 'sent' && (
        <div className="il-sent">
          {sentData.rows.length === 0 ? (
            <p className="il-card__meta">No emails sent yet.</p>
          ) : (
            <>
              <div className="il-sent__list">
                {sentData.rows.map((item) => (
                  <SentRow key={item.id} item={item} />
                ))}
              </div>
              {sentData.rows.length < sentData.total && (
                <div className="il-sent__more">
                  <Button variant="secondary" onClick={loadMoreSent}>
                    Load more ({sentData.total - sentData.rows.length} remaining)
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
