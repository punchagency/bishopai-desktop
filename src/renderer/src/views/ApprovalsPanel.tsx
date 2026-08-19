import { useCallback, useEffect, useMemo, useState } from 'react';
import { approveEmails, dispatchApproved, fetchApprovals, rejectEmails, updateApproval } from '../lib/api';
import type { ApprovalItem, ApprovalList } from '../lib/types';
import { EmptyState } from '../components/EmptyState';

// The gate itself.
//
// Every automated email — cadence nudges, win-backs after a cancellation,
// reminders that someone's supplements are running out — lands here first and
// goes nowhere until a person says so. Before this existed the cadences called
// the mailer the moment a step fell due, and the only thing between them and a
// client's inbox was that no mailbox had been connected yet.
//
// Two lists, because they are two different conversations: winning back someone
// who cancelled reads differently from nudging a prospect, and Nicole asked to
// see them apart. Inside the normal list, items are grouped by WHY they exist so
// a week's worth can be read a group at a time rather than one row at a time.

const CATEGORY_LABEL: Record<string, string> = {
  enquiry: 'New enquiries',
  appointment_lapse: 'Haven’t rebooked',
  dose_lapse: 'Supplements running low',
  protocol: 'Protocols',
  cancelled: 'Cancelled bookings',
};

const CATEGORY_NOTE: Record<string, string> = {
  enquiry: 'Reached out but hasn’t booked yet.',
  appointment_lapse: 'Came once and never rebooked, or past the session gap.',
  dose_lapse: 'Their supply is running out or already has.',
  protocol: 'Protocol documents for the client.',
  cancelled: 'Cancelled a booking — this is the win-back note.',
};

function whenLabel(iso: string): string {
  const due = Date.parse(iso);
  if (!Number.isFinite(due)) return '';
  const days = Math.round((due - Date.now()) / 86_400_000);
  if (days < -1) return `due ${Math.abs(days)} days ago`;
  if (days === -1) return 'due yesterday';
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `due in ${days} days`;
}

export function ApprovalsPanel({
  backendUrl,
  offline,
  onChanged,
}: {
  backendUrl: string;
  offline?: boolean;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<ApprovalItem[] | null>(null);
  const [list, setList] = useState<ApprovalList>('normal');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(() => {
    if (offline) {
      setItems([]);
      return;
    }
    fetchApprovals(backendUrl)
      .then((r) => setItems(r.approvals))
      .catch(() => setItems([]));
  }, [backendUrl, offline]);

  useEffect(load, [load]);

  const inList = useMemo(() => (items ?? []).filter((i) => i.list === list), [items, list]);
  const counts = useMemo(() => {
    const c = { normal: 0, cancelled: 0 };
    for (const i of items ?? []) c[i.list] = (c[i.list] ?? 0) + 1;
    return c;
  }, [items]);

  const grouped = useMemo(() => {
    const g = new Map<string, ApprovalItem[]>();
    for (const i of inList) g.set(i.category, [...(g.get(i.category) ?? []), i]);
    return [...g.entries()];
  }, [inList]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setSelected(new Set());
      load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAllInList = () => setSelected(new Set(inList.map((i) => i.id)));

  if (items === null) return <p className="il-card__meta">Loading…</p>;

  return (
    <div className="il-approvals">
      <div className="il-approvals__lists" role="tablist" aria-label="Approval lists">
        <button
          role="tab"
          aria-selected={list === 'normal'}
          className={`il-tab${list === 'normal' ? ' il-tab--on' : ''}`}
          onClick={() => setList('normal')}
        >
          Normal {counts.normal > 0 && <span className="il-tab__count">{counts.normal}</span>}
        </button>
        <button
          role="tab"
          aria-selected={list === 'cancelled'}
          className={`il-tab${list === 'cancelled' ? ' il-tab--on' : ''}`}
          onClick={() => setList('cancelled')}
        >
          Cancelled win-back{' '}
          {counts.cancelled > 0 && <span className="il-tab__count">{counts.cancelled}</span>}
        </button>
      </div>

      <p className="il-card__meta il-approvals__note">
        Nothing here has been sent. Anything left unapproved for 7 days is dropped rather
        than delivered late.
      </p>

      {error && <p className="il-approvals__error">{error}</p>}

      {inList.length === 0 ? (
        <div className="il-view__empty">
          <EmptyState variant="leads" />
          <p className="il-card__meta">Nothing waiting in this list.</p>
        </div>
      ) : (
        <>
          <div className="il-approvals__bulk">
            <button className="il-btn" onClick={selectAllInList} disabled={busy}>
              Select all ({inList.length})
            </button>
            <button
              className="il-btn il-btn--primary"
              disabled={busy || selected.size === 0}
              onClick={() => act(() => approveEmails(backendUrl, [...selected]))}
            >
              Approve {selected.size > 0 && `(${selected.size})`}
            </button>
            <button
              className="il-btn"
              disabled={busy || selected.size === 0}
              onClick={() => act(() => rejectEmails(backendUrl, [...selected]))}
            >
              Don’t send {selected.size > 0 && `(${selected.size})`}
            </button>
            <button
              className="il-btn"
              disabled={busy}
              title="Send everything already approved, without waiting for the daily run"
              onClick={() => act(() => dispatchApproved(backendUrl))}
            >
              Send approved now
            </button>
          </div>

          {grouped.map(([category, rows]) => (
            <section key={category} className="il-approvals__group">
              <h3 className="il-approvals__group-title">
                {CATEGORY_LABEL[category] ?? category}
                <span className="il-approvals__group-count">{rows.length}</span>
              </h3>
              <p className="il-card__meta">{CATEGORY_NOTE[category] ?? ''}</p>

              {rows.map((item) => (
                <ApprovalRow
                  key={item.id}
                  item={item}
                  checked={selected.has(item.id)}
                  busy={busy}
                  editing={editing === item.id}
                  onToggle={() => toggle(item.id)}
                  onEdit={() => setEditing(editing === item.id ? null : item.id)}
                  onSave={(subject, body) =>
                    act(async () => {
                      await updateApproval(backendUrl, item.id, subject, body);
                      setEditing(null);
                    })
                  }
                  onApprove={() => act(() => approveEmails(backendUrl, [item.id]))}
                  onReject={() => act(() => rejectEmails(backendUrl, [item.id]))}
                />
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function ApprovalRow({
  item,
  checked,
  busy,
  editing,
  onToggle,
  onEdit,
  onSave,
  onApprove,
  onReject,
}: {
  item: ApprovalItem;
  checked: boolean;
  busy: boolean;
  editing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onSave: (subject: string, body: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [subject, setSubject] = useState(item.subject);
  const [body, setBody] = useState(item.body);

  return (
    <div className="il-approval">
      <label className="il-approval__pick">
        <input type="checkbox" checked={checked} onChange={onToggle} disabled={busy} />
      </label>

      <div className="il-approval__main">
        <div className="il-approval__head">
          <span className="il-approval__to">{item.to_email}</span>
          <span className="il-approval__when">{whenLabel(item.send_after)}</span>
        </div>

        {editing ? (
          <div className="il-approval__edit">
            <input
              className="il-input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              aria-label="Subject"
            />
            <textarea
              className="il-textarea"
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              aria-label="Body"
            />
            <div className="il-approval__actions">
              <button className="il-btn" onClick={() => onSave(subject, body)} disabled={busy}>
                Save changes
              </button>
              <button className="il-btn" onClick={onEdit} disabled={busy}>
                Cancel
              </button>
            </div>
            <p className="il-card__meta">Saving keeps it waiting — it still needs approving.</p>
          </div>
        ) : (
          <>
            <p className="il-approval__subject">{item.subject}</p>
            <p className="il-approval__body">{item.body}</p>
            <div className="il-approval__actions">
              <button className="il-btn il-btn--primary" onClick={onApprove} disabled={busy}>
                Approve
              </button>
              <button className="il-btn" onClick={onEdit} disabled={busy}>
                Edit
              </button>
              <button className="il-btn" onClick={onReject} disabled={busy}>
                Don’t send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
