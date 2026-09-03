import { useEffect, useState } from 'react';
import { EmailPreview } from './EmailPreview';
import { fetchLeadSlots, renderLeadSlotBlock } from '../lib/api';

// Control over the booking buttons appended to a cadence email.
//
// These used to be untouchable: the block was rendered server-side at queue time
// and the editor could only show it. But the times in it are Nicole's, and the
// obvious things to want — drop one that no longer suits, offer a different
// morning, send no times at all — were impossible without editing raw markup.
//
// Choosing happens here; SIGNING happens on the server. Each button's link
// carries an HMAC keyed by BOOKING_LINK_SECRET, which the desktop app does not
// have and should not, so every change round-trips through
// POST /engagement/leads/:id/slot-block and comes back as rendered HTML. That
// also keeps one renderer for the markup rather than a copy over here.

interface Slot {
  starts_at: string;
  label: string;
}

/** The times a block is currently offering, read back out of its links. */
export function slotsInBlock(block: string): Slot[] {
  const out: Slot[] = [];
  const link = /<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = link.exec(block)) !== null) {
    const slot = /[?&]slot=([^&"]+)/.exec(m[1]);
    if (!slot) continue;
    out.push({
      starts_at: decodeURIComponent(slot[1]),
      label: m[2].replace(/<[^>]*>/g, '').trim(),
    });
  }
  return out;
}

export function SlotBlockEditor({
  backendUrl,
  leadId,
  block,
  onChange,
  disabled = false,
}: {
  backendUrl: string;
  leadId: string;
  /** The current block HTML, or '' when the email is offering no times. */
  block: string;
  onChange: (nextBlock: string) => void;
  disabled?: boolean;
}) {
  const chosen = slotsInBlock(block);
  const chosenKeys = new Set(chosen.map((s) => s.starts_at));

  const [available, setAvailable] = useState<Slot[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!open || available !== null) return;
    const ctrl = new AbortController();
    fetchLeadSlots(backendUrl, leadId, ctrl.signal)
      .then((r) => setAvailable(r.slots))
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setAvailable([]);
        setError("Could not load your open times.");
      });
    return () => ctrl.abort();
  }, [open, available, backendUrl, leadId]);

  const apply = async (next: Slot[]) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const r = await renderLeadSlotBlock(backendUrl, leadId, next.map((s) => s.starts_at));
      onChange(r.html);
      if (r.dropped) {
        setNote(
          r.dropped === 1
            ? 'One time was booked since you opened this, so it was left out.'
            : `${r.dropped} times were booked since you opened this, so they were left out.`,
        );
        setAvailable(null); // refetch, the menu is stale
      }
    } catch {
      setError('Could not update the times. Nothing was changed.');
    }
    setBusy(false);
  };

  const remove = (startsAt: string) => apply(chosen.filter((s) => s.starts_at !== startsAt));
  const add = (slot: Slot) => apply([...chosen, slot]);

  const menu = (available ?? []).filter((s) => !chosenKeys.has(s.starts_at));

  return (
    <div className="il-slotedit">
      <div className="il-slotedit__head">
        <span className="il-slotedit__title">
          {chosen.length === 0
            ? 'No booking times attached'
            : `${chosen.length} booking ${chosen.length === 1 ? 'time' : 'times'} attached`}
        </span>
        {chosen.length > 0 && (
          <button
            type="button"
            className="il-link il-link--sm"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? 'Hide' : 'Preview'}
          </button>
        )}
      </div>

      {chosen.length > 0 && (
        <ul className="il-slotedit__list">
          {chosen.map((s) => (
            <li key={s.starts_at} className="il-slotedit__row">
              <span className="il-slotedit__label">{s.label}</span>
              <button
                type="button"
                className="il-slotedit__x"
                onClick={() => void remove(s.starts_at)}
                disabled={disabled || busy}
                aria-label={`Remove ${s.label}`}
                title={`Remove ${s.label}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="il-slotedit__actions">
        <button
          type="button"
          className="il-link il-link--sm"
          onClick={() => setOpen(!open)}
          disabled={disabled || busy}
        >
          {open ? 'Done adding' : 'Add a time'}
        </button>
        {chosen.length > 0 && (
          <button
            type="button"
            className="il-link il-link--sm il-link--quiet"
            onClick={() => void apply([])}
            disabled={disabled || busy}
          >
            Remove all
          </button>
        )}
      </div>

      {open && (
        <div className="il-slotedit__menu">
          {available === null && <p className="il-slotedit__meta">Loading your open times…</p>}
          {available !== null && menu.length === 0 && (
            <p className="il-slotedit__meta">
              No other open times in the booking window. Office hours are set in Settings.
            </p>
          )}
          {menu.map((s) => (
            <button
              key={s.starts_at}
              type="button"
              className="il-slotedit__add"
              onClick={() => void add(s)}
              disabled={disabled || busy}
            >
              + {s.label}
            </button>
          ))}
        </div>
      )}

      {note && <p className="il-slotedit__meta il-slotedit__meta--warn">{note}</p>}
      {error && <p className="il-slotedit__meta il-slotedit__meta--warn">{error}</p>}
      {chosen.length === 0 && !busy && (
        <p className="il-slotedit__meta">This email will go out with no booking buttons.</p>
      )}

      {showPreview && block && <EmailPreview body={block} />}
    </div>
  );
}
