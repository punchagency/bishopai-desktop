import type { PriorNote, SessionNote } from '../lib/types';

// A read-only, template-shaped view of what this session's Appointment Flow
// Sheet block will contain — the same headings, prompt labels and order Nicole
// reads on the paper sheet (DATE / NOTES / SYMPTOMS / FOUNDATION / BODY SCAN /
// PROTOCOL), with the previous session's value under each field for comparison.
// Editing happens in the Edit tab; this is the WYSIWYG check before approving.
//
// Two rules carry the clinical weight here:
//  1. A blank is data. Null means the transcript never stated it — correct and
//     expected, never a bug to paper over with a plausible value.
//  2. Blanks must be scannable. Every row carries a gutter mark, so a column of
//     open rings down the left is the answer to "what didn't we cover?" without
//     reading a word.

const NOT_STATED = 'Not stated in transcript';
const NOT_MENTIONED = 'Not mentioned';

import {
  BODY_SCAN_FIELDS,
  FOUNDATION_FIELDS,
  LIFESTYLE_FIELDS,
} from '../lib/flowSheetFields';
import { formatDate } from '../lib/format';
import { InfoPopover } from '../components/InfoPopover';

function describeSupplements(note: SessionNote): string | null {
  if (!note.supplements.length) return null;
  const verb: Record<string, string> = {
    start: 'Start', stop: 'Stop', increase: 'Increase', decrease: 'Decrease', continue: 'Continue',
  };
  return note.supplements
    .map((s) => `${verb[s.change] ?? s.change} ${s.name}${s.dose ? ` ${s.dose}` : ''}${s.quantity != null ? ` (qty ${s.quantity})` : ''}`)
    .join('\n');
}

const clean = (v?: string | null): string | null => (v && v.trim() ? v.trim() : null);

/**
 * One field: gutter mark, label, this session's value, and — when it differs —
 * what the previous session recorded. The prior line sits directly under the
 * current one so a change reads as vertical displacement, the same way the paper
 * sheet stacks each session's block above the next.
 */
function Row({
  label,
  value,
  prior,
  hasPriorSession = false,
  placeholder = NOT_STATED,
}: {
  label: string;
  value?: string | null;
  prior?: string | null;
  hasPriorSession?: boolean;
  placeholder?: string;
}) {
  const v = clean(value);
  const p = clean(prior);
  const isChanged = Boolean(v && p && v !== p);
  const isNew = Boolean(v && !p && hasPriorSession);

  return (
    <div className={`il-fs__row ${v ? '' : 'il-fs__row--blank'}`}>
      <span className="il-fs__mark" aria-hidden="true" />
      <div className="il-fs__label">
        {label}
        {isChanged && <span className="il-fs__badge il-fs__badge--changed">Δ Changed</span>}
        {isNew && <span className="il-fs__badge il-fs__badge--new">+ New</span>}
      </div>
      <div className="il-fs__values">
        <div className={v ? 'il-fs__value' : 'il-fs__value il-fs__value--blank'}>
          {v ?? placeholder}
        </div>
        {p && p !== v && (
          <div className="il-fs__prior">
            <span className="il-fs__priorTag">Last time</span>
            {p}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="il-fs__section">
      <h3 className="il-fs__sectionTitle">{title}</h3>
      {children}
    </section>
  );
}

/** Count of fields with a recorded value, for the coverage line. */
function coverage(note: SessionNote): { filled: number; total: number } {
  const values: (string | null | undefined)[] = [
    note.concerns.join('; '),
    describeSupplements(note),
    ...LIFESTYLE_FIELDS.map((f) => note.lifestyle?.[f.key]),
    ...FOUNDATION_FIELDS.map((f) => note.nrt?.foundation?.[f.key]),
    ...BODY_SCAN_FIELDS.map((f) => note.nrt?.body_scan?.[f.key]),
  ];
  return { filled: values.filter(clean).length, total: values.length };
}

export function FlowSheetPanel({ note, prior }: { note: SessionNote; prior: PriorNote | null }) {
  const p = prior?.note;
  const hasPriorSession = Boolean(prior);
  const { filled, total } = coverage(note);

  return (
    <div className="il-fs">
      <div className="il-fs__head">
        <p className="il-fs__coverage">
          <strong>{filled}</strong> of {total} fields captured from this session{' '}
          <InfoPopover label="What the marks mean" title="Reading this panel">
            Each row is one field on your Appointment Flow Sheet.
            <br />
            <br />
            A <strong>filled dot</strong> means the session recorded something for it. An{' '}
            <strong>open ring</strong> means it didn't — the test wasn't run, or the client
            never mentioned it.
            <br />
            <br />
            Blanks are deliberate. Nothing is ever guessed from the recording, so an empty
            field is a true "not covered", not a failure to read it.
          </InfoPopover>
        </p>
        {prior ? (
          <p className="il-fs__compare">
            Compared against {formatDate(prior.date)}
          </p>
        ) : (
          <p className="il-fs__compare">
            First session on file — nothing to compare against yet.
          </p>
        )}
      </div>

      <Section title="Notes">
        {LIFESTYLE_FIELDS.map((f) => (
          <Row
            key={f.key}
            label={f.label}
            value={note.lifestyle?.[f.key]}
            prior={p?.lifestyle?.[f.key]}
            hasPriorSession={hasPriorSession}
            placeholder={NOT_MENTIONED}
          />
        ))}
      </Section>

      <Section title="Symptoms">
        <Row
          label="Reported"
          value={note.concerns.join('; ')}
          prior={p?.concerns.join('; ')}
          hasPriorSession={hasPriorSession}
        />
      </Section>

      <Section title="Foundation">
        {FOUNDATION_FIELDS.map((f) => (
          <Row
            key={f.key}
            label={f.label}
            value={note.nrt?.foundation?.[f.key]}
            prior={p?.nrt?.foundation?.[f.key]}
            hasPriorSession={hasPriorSession}
            placeholder="Not tested this session"
          />
        ))}
      </Section>

      <Section title="Body scan">
        {BODY_SCAN_FIELDS.map((f) => (
          <Row
            key={f.key}
            label={f.label}
            value={note.nrt?.body_scan?.[f.key]}
            prior={p?.nrt?.body_scan?.[f.key]}
            hasPriorSession={hasPriorSession}
            placeholder="Not tested this session"
          />
        ))}
      </Section>

      <Section title="Protocol">
        <Row
          label="Changes"
          value={describeSupplements(note)}
          prior={p ? describeSupplements(p) : null}
          hasPriorSession={hasPriorSession}
          placeholder="No supplement changes"
        />
      </Section>
    </div>
  );
}

