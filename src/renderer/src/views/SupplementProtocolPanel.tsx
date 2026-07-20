import type {
  DosingSchedule,
  ProtocolChange,
  ReviewContext,
  SessionNote,
  Supplement,
} from '../lib/types';
import { SCHEDULE_SLOTS } from '../lib/types';
import { Badge } from '../components/Badge';
import { InfoPopover } from '../components/InfoPopover';

const CHANGE_TONE: Record<ProtocolChange['type'], 'success' | 'warning' | 'accent' | 'neutral'> = {
  add: 'success',
  remove: 'warning',
  adjust: 'accent',
  continue: 'neutral',
};

// The Supplement Protocol grid as it will actually be written — the client's FULL
// running plan (continued supplements included, not just what this session
// mentioned), with this session's changes applied.
//
// Editable, because three of these columns cannot come from anywhere else. The
// dosing slots are only extracted when timing was spoken aloud, and "Here |
// Fullscript" is never spoken at all — so without editing here, those columns
// would go to the client permanently blank.
//
// Edits are written into THIS SESSION'S note, not straight to the client's plan.
// That keeps one rule for everything: changes are part of the session, versioned
// with it, refused once it is approved, and carried into the running plan by the
// same sync that approval already runs. A row that came from the plan and wasn't
// otherwise touched this session is added to the note as `continue` — which is
// what editing it honestly means.

export function SupplementProtocolPanel({
  plan,
  note,
  priorProtocol,
  onChange,
}: {
  plan: ReviewContext['supplementPlan'] | null;
  note: SessionNote;
  priorProtocol: SessionNote | null;
  /** Omitted when the session is approved — then the grid is read-only. */
  onChange?: (n: SessionNote) => void;
}) {
  if (!plan) return <p className="il-empty">Loading…</p>;

  const editable = !!onChange;

  // What actually lands in the document's NOTES box. follow_ups is a union of
  // legacy plain strings and {text, due_in_days} objects.
  const noteLines = note.follow_ups
    .map((f) => (typeof f === 'string' ? f : f.text))
    .filter((t) => t && t.trim());

  /** Apply an edit to the named supplement, creating the note entry if needed. */
  const edit = (name: string, patch: Partial<Supplement>) => {
    if (!onChange) return;
    const key = name.trim().toLowerCase();
    const existing = note.supplements.find((s) => s.name.trim().toLowerCase() === key);
    const planRow = plan.merged.find((r) => r.name.trim().toLowerCase() === key);
    const supplements = existing
      ? note.supplements.map((s) =>
          s.name.trim().toLowerCase() === key ? { ...s, ...patch } : s,
        )
      : [
          ...note.supplements,
          {
            name,
            dose: planRow?.dose ?? null,
            quantity: planRow?.qty ?? null,
            // It was already on the plan and she's adjusting how it's taken —
            // 'continue' records that without inventing a clinical change.
            change: 'continue' as const,
            schedule: planRow?.schedule ?? null,
            obtained_from: planRow?.obtained_from ?? null,
            ...patch,
          },
        ];
    onChange({ ...note, supplements });
  };

  const slotValue = (name: string, slot: keyof DosingSchedule): string => {
    const key = name.trim().toLowerCase();
    const fromNote = note.supplements.find((s) => s.name.trim().toLowerCase() === key)?.schedule;
    const fromPlan = plan.merged.find((r) => r.name.trim().toLowerCase() === key)?.schedule;
    return (fromNote?.[slot] ?? fromPlan?.[slot] ?? '') || '';
  };

  const setSlot = (name: string, slot: keyof DosingSchedule, value: string) => {
    const key = name.trim().toLowerCase();
    const cur =
      note.supplements.find((s) => s.name.trim().toLowerCase() === key)?.schedule ??
      plan.merged.find((r) => r.name.trim().toLowerCase() === key)?.schedule ??
      null;
    const base: DosingSchedule = {
      uponWaking: null, breakfast: null, midMorning: null, lunch: null,
      midAfternoon: null, dinner: null, beforeBed: null,
      ...(cur ?? {}),
    };
    edit(name, { schedule: { ...base, [slot]: value.trim() || null } });
  };

  return (
    <div className="il-suppgrid">
      <div className="il-suppgrid__section">
        <h4>
          What will be written to the Supplement Protocol{' '}
          <InfoPopover label="About this grid" title="The Daily Schedule grid">
            This is the client's <strong>full current protocol</strong>, not just what changed
            today — a supplement from an earlier session stays on the grid even if this session
            never mentioned it. It's the sheet they take home, so it has to stand alone.
          </InfoPopover>
        </h4>
        {plan.merged.length ? (
          /* Same column order as the sheet's Daily Schedule grid, so this reads
             as a preview of the document rather than a different summary of it.
             Scrolls horizontally rather than dropping columns — a missing
             dosing time is exactly what Nicole is checking for. */
          <div className="il-suppgrid__scroll">
            <table className="il-table">
              <thead>
                <tr>
                  <th>Supplements</th>
                  <th>Special instructions</th>
                  {SCHEDULE_SLOTS.map((s, i) => (
                    <th key={s.key}>
                      {s.label}
                      {i === 0 && (
                        <InfoPopover label="About dosing times" title="When it's taken">
                          Put the amount in the column for when they take it — "2 caps" under
                          Breakfast. A blank column means <strong>not taken then</strong>.
                          <br />
                          <br />
                          These are only picked up automatically when the timing is said out loud
                          in the session, so most of them need filling in here.
                          <br />
                          <br />
                          Your template's standing note still applies: Upon Waking, Mid-Morning,
                          Mid-Afternoon and Before Bed mean 20 minutes before food, or 2 hours
                          after.
                        </InfoPopover>
                      )}
                    </th>
                  ))}
                  <th>Bottle qty</th>
                  <th>
                    Here | Fullscript{' '}
                    <InfoPopover label="What this column means" title="Where they get it">
                      Where the client obtains this supplement:
                      <br />
                      <br />
                      <strong>Here</strong> — dispensed from your own stock at the visit.
                      <br />
                      <strong>Fullscript</strong> — they order it themselves through your
                      Fullscript dispensary.
                      <br />
                      <br />
                      It's almost never said out loud in a session, so it stays blank until you
                      set it. Blank means undecided, not "neither".
                    </InfoPopover>
                  </th>
                </tr>
              </thead>
              <tbody>
                {plan.merged.map((r) => {
                  const key = r.name.trim().toLowerCase();
                  const inNote = note.supplements.find(
                    (x) => x.name.trim().toLowerCase() === key,
                  );
                  return (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td>
                        {editable ? (
                          <input
                            className="il-input il-input--cell"
                            value={inNote?.dose ?? r.dose ?? ''}
                            placeholder="—"
                            onChange={(e) => edit(r.name, { dose: e.target.value || null })}
                          />
                        ) : (
                          r.dose || <span className="il-empty">—</span>
                        )}
                      </td>
                      {SCHEDULE_SLOTS.map((s) => {
                        const amount = slotValue(r.name, s.key);
                        return editable ? (
                          <td key={s.key} className="il-table__slot">
                            <input
                              className="il-input il-input--cell il-input--slot"
                              value={amount}
                              placeholder="·"
                              onChange={(e) => setSlot(r.name, s.key, e.target.value)}
                            />
                          </td>
                        ) : (
                          <td
                            key={s.key}
                            className={`il-table__slot ${amount ? '' : 'il-table__slot--off'}`}
                          >
                            {amount || '·'}
                          </td>
                        );
                      })}
                      <td>
                        {editable ? (
                          <input
                            className="il-input il-input--cell il-input--slot"
                            type="number"
                            value={inNote?.quantity ?? r.qty ?? ''}
                            placeholder="—"
                            onChange={(e) =>
                              edit(r.name, {
                                quantity: e.target.value === '' ? null : Number(e.target.value),
                              })
                            }
                          />
                        ) : (
                          r.qty ?? <span className="il-empty">—</span>
                        )}
                      </td>
                      <td>
                        {editable ? (
                          <select
                            className="il-input il-input--cell"
                            value={inNote?.obtained_from ?? r.obtained_from ?? ''}
                            onChange={(e) =>
                              edit(r.name, { obtained_from: e.target.value || null })
                            }
                          >
                            <option value="">—</option>
                            <option value="Here">Here</option>
                            <option value="Fullscript">Fullscript</option>
                          </select>
                        ) : (
                          r.obtained_from || <span className="il-empty">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="il-empty">No supplements on the plan.</p>
        )}
        <p className="il-suppgrid__note">
          {editable
            ? 'Dosing times are only picked up when spoken in the session, and "Here | Fullscript" never is — fill them in here and they go out with the protocol.'
            : 'A blank dosing column means no time of day was stated in the session — not that the supplement is skipped then.'}
        </p>
      </div>

      {/* The document has two free-text blocks under the grid that the preview
          never showed, so there was no way to see what would land in them. */}
      <div className="il-suppgrid__section">
        <h4>
          NOTES block{' '}
          <InfoPopover label="Where this comes from" title="The NOTES block">
            The free-text box under the grid on your sheet. It's filled from this session's
            <strong> follow-ups</strong> — one per line. Edit them on the Edit tab and they
            change here.
          </InfoPopover>
        </h4>
        {noteLines.length ? (
          <ul className="il-list">
            {noteLines.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        ) : (
          <p className="il-empty">Nothing to write — no follow-ups captured this session.</p>
        )}
      </div>

      <div className="il-suppgrid__section">
        <h4>
          TO DO block{' '}
          <InfoPopover label="Where this comes from" title="The TO DO block">
            The second free-text box on your sheet, beside NOTES. It's filled from this
            session's <strong>protocol changes</strong> — what to start, stop or adjust.
          </InfoPopover>
        </h4>
        {note.protocol_changes.length ? (
          <ul className="il-list">
            {note.protocol_changes.map((c, i) => (
              <li key={i}>{c.description}</li>
            ))}
          </ul>
        ) : (
          <p className="il-empty">Nothing to write — no protocol changes this session.</p>
        )}
      </div>

      <div className="il-suppgrid__section">
        <h4>This session's changes</h4>
        {note.protocol_changes.length ? (
          <ul className="il-list">
            {note.protocol_changes.map((c, i) => (
              <li key={i}><Badge tone={CHANGE_TONE[c.type]}>{c.type}</Badge> {c.description}</li>
            ))}
          </ul>
        ) : (
          <p className="il-empty">No protocol changes noted this session.</p>
        )}
      </div>

      <div className="il-suppgrid__section il-suppgrid__section--muted">
        <h4>Current plan (before this session)</h4>
        {plan.current.length ? (
          <p className="il-suppgrid__inline">{plan.current.map((r) => r.name).join(', ')}</p>
        ) : (
          <p className="il-empty">No prior supplements on file.</p>
        )}
      </div>

      {priorProtocol && (
        <div className="il-suppgrid__section il-suppgrid__section--muted">
          <h4>Previous session's changes</h4>
          {priorProtocol.protocol_changes.length ? (
            <ul className="il-list">
              {priorProtocol.protocol_changes.map((c, i) => (
                <li key={i}><Badge tone={CHANGE_TONE[c.type]}>{c.type}</Badge> {c.description}</li>
              ))}
            </ul>
          ) : (
            <p className="il-empty">No protocol changes that session.</p>
          )}
        </div>
      )}
    </div>
  );
}
