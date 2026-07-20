import type { Lifestyle, NrtFindings, PriorNote, ProtocolChange, SessionNote, Supplement } from '../lib/types';
import { formatDate } from '../lib/format';
import { Button } from '../components/Button';
import {
  BODY_SCAN_FIELDS,
  EMPTY_BODY_SCAN,
  EMPTY_FOUNDATION,
  FOUNDATION_FIELDS,
  LIFESTYLE_FIELDS,
} from '../lib/flowSheetFields';

const CHANGE_TYPES: ProtocolChange['type'][] = ['add', 'remove', 'adjust', 'continue'];
const SUPP_CHANGES: Supplement['change'][] = ['start', 'stop', 'increase', 'decrease', 'continue'];

// Every one of these fields lands directly on the ROF and the Flow Sheet. A
// null here means the transcript never stated it — that's correct, not a bug —
// so it gets a distinct "not stated" placeholder rather than looking like an
// empty, possibly-broken input.
const NOT_STATED = 'Not stated in transcript — fill in if needed';
const NOT_MENTIONED = 'Not mentioned';
const NOT_TESTED = 'Not tested';

/**
 * Structured editor for a SessionNote — the content_json behind a sheet/protocol.
 * String lists edit as one-item-per-line; the two object lists edit as rows.
 * Deliberately field-level (no raw JSON) so it's usable by a non-technical user.
 */
export function NoteEditor({
  note,
  prior,
  onChange,
}: {
  note: SessionNote;
  /** The client's previous session, shown under each field. Editing a clinical
   *  note without knowing what was recorded last time means re-reading the old
   *  session elsewhere; the comparison belongs where the typing happens. */
  prior?: PriorNote | null;
  onChange: (n: SessionNote) => void;
}) {
  const concerns = note?.concerns || [];
  const assessments = note?.assessments || [];
  const protocol_changes = note?.protocol_changes || [];
  const supplements = note?.supplements || [];
  const follow_ups = note?.follow_ups || [];
  const nrt: NrtFindings = note?.nrt ?? {
    pulse0: null,
    priority1: null,
    k27: null,
    stressors: null,
    foundation: null,
    body_scan: null,
  };
  // Editing a single prompt shouldn't require the whole pass to already exist.
  const foundation = nrt.foundation ?? EMPTY_FOUNDATION;
  const bodyScan = nrt.body_scan ?? EMPTY_BODY_SCAN;
  const lifestyle: Lifestyle = note?.lifestyle ?? {
    bm: null,
    sleep: null,
    water: null,
    cycle: null,
    exercise: null,
    diet: null,
  };

  // follow_ups is a union of plain strings (legacy) and {text, due_in_days} objects.
  // Flatten to plain strings for the textarea; reconstruct objects on edit.
  const followUpStrings = follow_ups.map((f) =>
    typeof f === 'string' ? f : f.text,
  );

  const p = prior?.note;
  const priorDate = prior ? formatDate(prior.date) : '';

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
        <Prior value={p?.concerns.join('\n')} date={priorDate} />
      </Field>

      <Field label="Assessments">
        <textarea
          className="il-input il-input--area"
          value={assessments.join('\n')}
          onChange={(e) => set({ assessments: lines(e.target.value) })}
          placeholder="One assessment per line"
        />
        <Prior value={p?.assessments.join('\n')} date={priorDate} />
      </Field>

      <Field label="NRT findings">
        <div className="il-prompts">
          {NRT_FIELDS.map((f) => (
            <label key={f.key} className="il-prompt">
              <span className="il-prompt__label">{f.label}</span>
              <input
                className="il-input"
                value={nrt[f.key] ?? ''}
                placeholder={NOT_STATED}
                onChange={(e) => set({ nrt: { ...nrt, [f.key]: e.target.value || null } })}
              />
              <Prior value={p?.nrt?.[f.key]} date={priorDate} />
            </label>
          ))}
        </div>
      </Field>

      {/* One input per muscle-testing prompt, in sheet order — so a value goes
          where Nicole expects to read it back, and an untouched prompt stays
          visibly empty rather than being buried in a paragraph. */}
      <Field label="Foundation (Flow Sheet FOUNDATION column)">
        <div className="il-prompts">
          {FOUNDATION_FIELDS.map((f) => (
            <label key={f.key} className="il-prompt">
              <span className="il-prompt__label">{f.label}</span>
              <input
                className="il-input"
                value={foundation[f.key] ?? ''}
                placeholder={NOT_TESTED}
                onChange={(e) =>
                  set({ nrt: { ...nrt, foundation: { ...foundation, [f.key]: e.target.value || null } } })
                }
              />
              <Prior value={p?.nrt?.foundation?.[f.key]} date={priorDate} />
            </label>
          ))}
        </div>
      </Field>

      <Field label="Body scan (Flow Sheet BODY SCAN column)">
        <div className="il-prompts">
          {BODY_SCAN_FIELDS.map((f) => (
            <label key={f.key} className="il-prompt">
              <span className="il-prompt__label">{f.label}</span>
              <input
                className="il-input"
                value={bodyScan[f.key] ?? ''}
                placeholder={NOT_TESTED}
                onChange={(e) =>
                  set({ nrt: { ...nrt, body_scan: { ...bodyScan, [f.key]: e.target.value || null } } })
                }
              />
              <Prior value={p?.nrt?.body_scan?.[f.key]} date={priorDate} />
            </label>
          ))}
        </div>
      </Field>

      <Field label="Lifestyle log">
        <div className="il-prompts">
          {LIFESTYLE_FIELDS.map((f) => (
            <label key={f.key} className="il-prompt">
              <span className="il-prompt__label">{f.label}</span>
              <input
                className="il-input"
                value={lifestyle[f.key] ?? ''}
                placeholder={NOT_MENTIONED}
                onChange={(e) => set({ lifestyle: { ...lifestyle, [f.key]: e.target.value || null } })}
              />
              <Prior value={p?.lifestyle?.[f.key]} date={priorDate} />
            </label>
          ))}
        </div>
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
            {/* The ROF's Function column. Left blank it prints an empty cell on
                the client's Report of Findings, which is honest but unhelpful —
                this is where it gets written. */}
            <input
              className="il-input"
              value={s.func ?? ''}
              placeholder="What it's for (ROF)"
              onChange={(e) => set({ supplements: patchAt(supplements, i, { func: e.target.value || null }) })}
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
          value={followUpStrings.join('\n')}
          onChange={(e) =>
            set({
              follow_ups: lines(e.target.value).map((text, i) => ({
                text,
                due_in_days:
                  typeof follow_ups[i] === 'object' && follow_ups[i] !== null
                    ? (follow_ups[i] as { due_in_days: number | null }).due_in_days
                    : null,
              })),
            })
          }
          placeholder="One follow-up per line"
        />
      </Field>
    </div>
  );
}

const NRT_FIELDS: { key: 'pulse0' | 'priority1' | 'k27' | 'stressors'; label: string }[] = [
  { key: 'pulse0', label: 'Pulse 0' },
  { key: 'priority1', label: 'Priority #1' },
  { key: 'k27', label: 'K-27' },
  { key: 'stressors', label: 'Stressors' },
];

/**
 * What the previous session recorded for this field. Rendered only when there is
 * something to show — an empty line under every blank field would be noise, and
 * the blank itself already reads as "not stated".
 */
function Prior({ value, date }: { value?: string | null; date?: string }) {
  const v = value?.trim();
  if (!v) return null;
  return (
    <span className="il-prior">
      <span className="il-prior__tag">{date ? `Last time · ${date}` : 'Last time'}</span>
      {v}
    </span>
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
