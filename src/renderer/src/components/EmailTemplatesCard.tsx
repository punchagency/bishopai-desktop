import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from './Badge';
import { Button } from './Button';
import { IconMail, IconChevronDown, IconChevronUp } from './Icons';
import { fetchEmailTemplates, saveEmailTemplate, resetEmailTemplate } from '../lib/api';
import { humanize } from '../lib/format';
import type { EmailTemplate } from '../lib/types';

// Settings card: Nicole's email template editor.
// All cadence tracks/steps are shown with their effective copy (DB override or
// hardcoded default). Click Edit to expand an inline edit form. Cmd+S / Ctrl+S
// saves. Reset restores the hardcoded default.

const TRACK_ORDER = ['inquiry', 'cancelled', 'maintenance', 'first_appointment'];
const TRACK_LABELS: Record<string, string> = {
  inquiry: 'New Inquiry',
  cancelled: 'Cancelled Appointment',
  maintenance: 'Maintenance',
  first_appointment: 'First Appointment',
};

export const SAMPLE_TEMPLATES: EmailTemplate[] = [
  {
    track: 'inquiry',
    step: 'welcome',
    subject: 'Thanks for reaching out to Innerlume',
    body: "Hi! Thanks for your interest in working together. When you're ready, you can book a consult here — I'd love to help.",
    is_custom: false,
    updated_at: null,
  },
  {
    track: 'inquiry',
    step: 'nudge_3d',
    subject: 'Still here when you’re ready',
    body: 'Just checking in — happy to answer any questions before you book your first session.',
    is_custom: false,
    updated_at: null,
  },
  {
    track: 'inquiry',
    step: 'nudge_7d',
    subject: 'A gentle nudge from Innerlume',
    body: 'No rush at all. If now’s a good time, here’s the link to book a consult whenever it suits you.',
    is_custom: false,
    updated_at: null,
  },
  {
    track: 'inquiry',
    step: 'final_14d',
    subject: 'Last note for now',
    body: "I'll leave the door open — reach out any time and we'll find a time that works.",
    is_custom: false,
    updated_at: null,
  },
  {
    track: 'cancelled',
    step: 'cancelled_7d',
    subject: 'Want to reschedule?',
    body: 'Sorry we missed each other — would you like to find a new time that works better?',
    is_custom: false,
    updated_at: null,
  },
  {
    track: 'cancelled',
    step: 'cancelled_14d',
    subject: 'Still happy to reschedule',
    body: 'The offer stands whenever you’re ready — just reply and we’ll get you booked.',
    is_custom: false,
    updated_at: null,
  },
  {
    track: 'maintenance',
    step: 'maintenance_7d',
    subject: 'Time for a check-in?',
    body: "It's been a while since your last visit — a maintenance session can help keep your progress on track. Want to book one?",
    is_custom: false,
    updated_at: null,
  },
  {
    track: 'maintenance',
    step: 'maintenance_14d',
    subject: 'Still here when you’re ready',
    body: 'No pressure at all — whenever you’d like a tune-up, just reply and we’ll find a time that works.',
    is_custom: false,
    updated_at: null,
  },
  {
    track: 'first_appointment',
    step: 'first_appt_7d',
    subject: 'How are you feeling after your first session?',
    body: "It was great meeting you! Booking your follow-up is the best way to build on what we started — want to find a time?",
    is_custom: false,
    updated_at: null,
  },
  {
    track: 'first_appointment',
    step: 'first_appt_14d',
    subject: 'A little something to get you started',
    body: "To help you commit to your plan, here's 15% off your next visit if you book this month. Just reply and we'll set it up.",
    is_custom: false,
    updated_at: null,
  },
];

interface TemplateRowProps {
  tpl: EmailTemplate;
  backendUrl: string;
  offline?: boolean;
  onSaved: (updated: EmailTemplate) => void;
}

function TemplateRow({ tpl, backendUrl, offline = false, onSaved }: TemplateRowProps) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(tpl.subject);
  const [body, setBody] = useState(tpl.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Keep local state in sync when props change (e.g. after reset).
  useEffect(() => {
    if (!editing) {
      setSubject(tpl.subject);
      setBody(tpl.body);
    }
  }, [tpl.subject, tpl.body, editing]);

  const save = useCallback(async () => {
    if (!subject.trim() || !body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (offline) {
        onSaved({
          ...tpl,
          subject: subject.trim(),
          body: body.trim(),
          is_custom: true,
          updated_at: new Date().toISOString(),
        });
        setEditing(false);
        return;
      }
      const updated = await saveEmailTemplate(backendUrl, tpl.track, tpl.step, subject.trim(), body.trim());
      onSaved(updated);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setBusy(false);
    }
  }, [backendUrl, tpl, subject, body, onSaved, offline]);

  const reset = useCallback(async () => {
    if (!window.confirm('Reset this template to the default text?')) return;
    setBusy(true);
    setError(null);
    try {
      if (offline) {
        const original = SAMPLE_TEMPLATES.find((t) => t.track === tpl.track && t.step === tpl.step);
        onSaved({
          ...tpl,
          subject: original?.subject ?? '',
          body: original?.body ?? '',
          is_custom: false,
          updated_at: null,
        });
        setEditing(false);
        return;
      }
      const updated = await resetEmailTemplate(backendUrl, tpl.track, tpl.step);
      onSaved(updated);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset.');
    } finally {
      setBusy(false);
    }
  }, [backendUrl, tpl, onSaved, offline]);

  // Cmd+S / Ctrl+S to save while editing.
  useEffect(() => {
    if (!editing) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editing, save]);

  // Auto-resize textarea.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [body, editing]);

  return (
    <div className={`il-tpl-row${tpl.is_custom ? ' il-tpl-row--custom' : ''}`}>
      <div className="il-tpl-row__head">
        <div className="il-tpl-row__info">
          <span className="il-tpl-row__step">{humanize(tpl.step)}</span>
          {tpl.is_custom ? (
            <Badge tone="accent">Custom</Badge>
          ) : (
            <Badge tone="neutral">Default</Badge>
          )}
        </div>
        {!editing && (
          <Button variant="ghost" onClick={() => setEditing(true)} id={`edit-tpl-${tpl.track}-${tpl.step}`}>
            Edit
          </Button>
        )}
      </div>

      {!editing ? (
        <div className="il-tpl-row__preview">
          <p className="il-tpl-row__subject-preview">
            <IconMail size={13} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '0.35rem', opacity: 0.7 }} />
            {tpl.subject}
          </p>
          <p className="il-tpl-row__body-preview">{tpl.body.slice(0, 120)}{tpl.body.length > 120 ? '…' : ''}</p>
        </div>
      ) : (
        <div className="il-tpl-row__form">
          <div className="il-field">
            <label className="il-field__label" htmlFor={`subj-${tpl.track}-${tpl.step}`}>Subject</label>
            <input
              id={`subj-${tpl.track}-${tpl.step}`}
              className="il-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={busy}
              autoFocus
            />
          </div>
          <div className="il-field">
            <label className="il-field__label" htmlFor={`body-${tpl.track}-${tpl.step}`}>
              Body
              <span className="il-tpl-row__charcount"> · {body.length} chars</span>
            </label>
            <textarea
              id={`body-${tpl.track}-${tpl.step}`}
              ref={bodyRef}
              className="il-input il-tpl-row__textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={busy}
              rows={4}
            />
          </div>
          {error && <p className="il-error">{error}</p>}
          <div className="il-tpl-row__foot">
            <span className="il-tpl-row__hint">⌘S to save</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {tpl.is_custom && (
                <Button variant="ghost" disabled={busy} onClick={reset}>Reset to default</Button>
              )}
              <Button variant="ghost" disabled={busy} onClick={() => { setEditing(false); setSubject(tpl.subject); setBody(tpl.body); }}>
                Cancel
              </Button>
              <Button variant="primary" disabled={busy || !subject.trim() || !body.trim()} onClick={save}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export function EmailTemplatesCard({
  backendUrl,
  defaultOpen = false,
  embedded = false,
  offline = false,
}: {
  backendUrl: string;
  defaultOpen?: boolean;
  embedded?: boolean;
  offline?: boolean;
}) {
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(defaultOpen);

  const load = useCallback(
    (signal?: AbortSignal) => {
      if (offline) {
        setTemplates((prev) => prev || SAMPLE_TEMPLATES);
        setLoading(false);
        return Promise.resolve();
      }
      return fetchEmailTemplates(backendUrl, signal)
        .then((d) => setTemplates(d.templates))
        .catch(() => {
          setTemplates((prev) => prev || SAMPLE_TEMPLATES);
        })
        .finally(() => setLoading(false));
    },
    [backendUrl, offline],
  );

  useEffect(() => {
    if (!open && !embedded) return;
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [open, embedded, load]);

  const handleSaved = (updated: EmailTemplate) => {
    setTemplates((prev) =>
      prev?.map((t) => t.track === updated.track && t.step === updated.step ? updated : t) ?? null,
    );
  };

  // Group by track.
  const byTrack = templates
    ? TRACK_ORDER.reduce<Record<string, EmailTemplate[]>>((acc, track) => {
        acc[track] = templates.filter((t) => t.track === track);
        return acc;
      }, {})
    : {};

  const customCount = templates?.filter((t) => t.is_custom).length ?? 0;

  const content = (
    <div className={embedded ? 'il-tpl-embedded' : 'il-tpl-card__body'}>
      {loading ? (
        <p className="il-card__meta">Loading templates…</p>
      ) : !templates || templates.length === 0 ? (
        <p className="il-card__meta">No templates found.</p>
      ) : (
        TRACK_ORDER.filter((track) => (byTrack[track]?.length ?? 0) > 0).map((track) => (
          <div key={track} className="il-tpl-group">
            <h4 className="il-tpl-group__label">{TRACK_LABELS[track] ?? humanize(track)}</h4>
            {byTrack[track].map((tpl) => (
              <TemplateRow
                key={`${tpl.track}:${tpl.step}`}
                tpl={tpl}
                backendUrl={backendUrl}
                offline={offline}
                onSaved={handleSaved}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
  if (embedded) {
    return (
      <div className="il-tpl-view">
        <div className="il-tpl-view__head">
          <div>
            <h3 className="il-view__section-title">Cadence Email Templates</h3>
            <p className="il-card__meta">
              Global copy sent from Nicole's Outlook across each re-engagement track. Edits here apply to all future automated sends.
              {customCount > 0 && ` · ${customCount} custom override${customCount === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
        {content}
      </div>
    );
  }

  return (
    <div className="il-card il-tpl-card">
      <button className="il-tpl-card__toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open} id="email-templates-toggle">
        <div className="il-tpl-card__toggle-left">
          <span className="il-card__title">Email Templates</span>
          <span className="il-card__meta">
            Cadence copy sent from Nicole's Outlook
            {customCount > 0 && ` · ${customCount} customised`}
          </span>
        </div>
        <span className="il-tpl-card__chevron">{open ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}</span>
      </button>

      {open && content}
    </div>
  );
}
