import type { ProtocolChange, SessionNote, Supplement } from '../lib/types';
import { Button } from '../components/Button';

const CHANGE_TYPES: ProtocolChange['type'][] = ['add', 'remove', 'adjust', 'continue'];
const SUPP_CHANGES: Supplement['change'][] = ['start', 'stop', 'increase', 'decrease', 'continue'];

/**
 * Structured editor for a SessionNote — the content_json behind a sheet/protocol.
 * String lists edit as one-item-per-line; the two object lists edit as rows.
 * Deliberately field-level (no raw JSON) so it's usable by a non-technical user.
 */
export function NoteEditor({ note, onChange }: { note: SessionNote; onChange: (n: SessionNote) => void }) {
  const concerns = note?.concerns || [];
  const assessments = note?.assessments || [];
  const protocol_changes = note?.protocol_changes || [];
  const supplements = note?.supplements || [];
  const follow_ups = note?.follow_ups || [];

  const set = (patch: Partial<SessionNote>) =>
    onChange({
      ...note,
      concerns,
      assessments,
      protocol_changes,
      supplements,
      follow_ups,
      ...patch,
    });
  const lines = (v: string) => v.split('\n').map((s) => s.trim()).filter(Boolean);

  return (
    <div className="il-form">
      <Field label="Concerns">
        <textarea
          className="il-input il-input--area"
          value={concerns.join('\n')}
          onChange={(e) => set({ concerns: lines(e.target.value) })}
          placeholder="One concern per line"
        />
      </Field>

      <Field label="Assessments">
        <textarea
          className="il-input il-input--area"
          value={assessments.join('\n')}
          onChange={(e) => set({ assessments: lines(e.target.value) })}
          placeholder="One assessment per line"
        />
      </Field>

      <Field label="Protocol changes">
        {protocol_changes.map((c, i) => (
          <div className="il-row" key={i}>
            <select
              className="il-input il-input--select"
              value={c.type}
              onChange={(e) =>
                set({
                  protocol_changes: protocol_changes.map((x, j) =>
                    j === i ? { ...x, type: e.target.value as ProtocolChange['type'] } : x,
                  ),
                })
              }
            >
              {CHANGE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              className="il-input"
              value={c.description}
              placeholder="Description"
              onChange={(e) =>
                set({
                  protocol_changes: protocol_changes.map((x, j) =>
                    j === i ? { ...x, description: e.target.value } : x,
                  ),
                })
              }
            />
            <button className="il-toggle" onClick={() => set({ protocol_changes: removeAt(protocol_changes, i) })}>
              ✕
            </button>
          </div>
        ))}
        <Button variant="ghost" onClick={() => set({ protocol_changes: [...protocol_changes, { type: 'add', description: '' }] })}>
          + Add change
        </Button>
      </Field>

      <Field label="Supplements">
        {supplements.map((s, i) => (
          <div className="il-row" key={i}>
            <input
              className="il-input"
              value={s.name}
              placeholder="Name"
              onChange={(e) => set({ supplements: patchAt(supplements, i, { name: e.target.value }) })}
            />
            <input
              className="il-input il-input--sm"
              value={s.dose ?? ''}
              placeholder="Dose"
              onChange={(e) => set({ supplements: patchAt(supplements, i, { dose: e.target.value || null }) })}
            />
            <input
              className="il-input il-input--sm"
              type="number"
              value={s.quantity ?? ''}
              placeholder="Qty"
              onChange={(e) =>
                set({ supplements: patchAt(supplements, i, { quantity: e.target.value === '' ? null : Number(e.target.value) }) })
              }
            />
            <select
              className="il-input il-input--select"
              value={s.change}
              onChange={(e) => set({ supplements: patchAt(supplements, i, { change: e.target.value as Supplement['change'] }) })}
            >
              {SUPP_CHANGES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button className="il-toggle" onClick={() => set({ supplements: removeAt(supplements, i) })}>
              ✕
            </button>
          </div>
        ))}
        <Button
          variant="ghost"
          onClick={() => set({ supplements: [...supplements, { name: '', dose: null, quantity: null, change: 'start' }] })}
        >
          + Add supplement
        </Button>
      </Field>

      <Field label="Follow-ups">
        <textarea
          className="il-input il-input--area"
          value={follow_ups.join('\n')}
          onChange={(e) => set({ follow_ups: lines(e.target.value) })}
          placeholder="One follow-up per line"
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="il-field">
      <label className="il-field__label">{label}</label>
      {children}
    </div>
  );
}

function removeAt<T>(arr: T[], i: number): T[] {
  return arr.filter((_, j) => j !== i);
}
function patchAt<T>(arr: T[], i: number, patch: Partial<T>): T[] {
  return arr.map((x, j) => (j === i ? { ...x, ...patch } : x));
}
