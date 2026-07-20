import { Fragment } from 'react';
import type { PriorNote, SessionNote } from '../lib/types';
import {
  BODY_SCAN_FIELDS,
  FOUNDATION_FIELDS,
  LIFESTYLE_FIELDS,
} from '../lib/flowSheetFields';
import { formatDate } from '../lib/format';
import { InfoPopover } from '../components/InfoPopover';

// Every visit side by side, one column per session — the same shape as Nicole's
// paper flow sheet, which stacks each appointment's block down a single page so
// a field can be read across visits.
//
// The single "last time" line elsewhere answers "what changed since last time".
// It cannot answer "is this getting better", which is the question a running
// flow sheet exists for: sleep going 5h → 6h → 7h → 6h is a story, and the last
// value alone hides it.

const BLANK = '—';

function describeSupplements(note: SessionNote): string {
  if (!note.supplements.length) return '';
  const verb: Record<string, string> = {
    start: 'Start', stop: 'Stop', increase: 'Increase', decrease: 'Decrease', continue: 'Continue',
  };
  return note.supplements
    .map((s) => `${verb[s.change] ?? s.change} ${s.name}${s.dose ? ` ${s.dose}` : ''}`)
    .join('\n');
}

type Getter = (n: SessionNote) => string | null | undefined;

interface Row {
  label: string;
  get: Getter;
}

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: 'Notes',
    rows: LIFESTYLE_FIELDS.map((f) => ({
      label: f.label,
      get: (n: SessionNote) => n.lifestyle?.[f.key],
    })),
  },
  {
    title: 'Symptoms',
    rows: [{ label: 'Reported', get: (n) => n.concerns.join('; ') }],
  },
  {
    title: 'Foundation',
    rows: FOUNDATION_FIELDS.map((f) => ({
      label: f.label,
      get: (n: SessionNote) => n.nrt?.foundation?.[f.key],
    })),
  },
  {
    title: 'Body scan',
    rows: BODY_SCAN_FIELDS.map((f) => ({
      label: f.label,
      get: (n: SessionNote) => n.nrt?.body_scan?.[f.key],
    })),
  },
  {
    title: 'Protocol',
    rows: [{ label: 'Changes', get: describeSupplements }],
  },
];

const clean = (v?: string | null): string | null => (v && v.trim() ? v.trim() : null);

export function SessionHistoryPanel({
  note,
  sessions,
  total,
  loading,
}: {
  /** The session under review — always the first column. */
  note: SessionNote;
  /** Previous sessions, newest first. Capped by the backend. */
  sessions: PriorNote[];
  /** How many earlier sessions exist in total, capped or not. */
  total: number;
  loading: boolean;
}) {
  if (loading) return <p className="il-empty">Loading history…</p>;

  if (!sessions.length) {
    return (
      <p className="il-empty">
        No earlier sessions on file for this client yet. Once you approve a second session, every
        visit shows here side by side.
      </p>
    );
  }

  const columns: { label: string; note: SessionNote; current?: boolean }[] = [
    { label: 'This session', note, current: true },
    ...sessions.map((s) => ({ label: formatDate(s.date), note: s.note })),
  ];

  return (
    <div className="il-hist">
      <p className="il-hist__intro">
        {total > sessions.length
          ? `Showing the ${sessions.length} most recent of ${total} earlier sessions.`
          : `${sessions.length} earlier session${sessions.length === 1 ? '' : 's'}, newest first.`}{' '}
        A blank means that field was never recorded for that visit.{' '}
        <InfoPopover label="How to read this" title="Every visit side by side">
          One column per appointment, newest on the left, the same way your paper flow sheet
          stacks each visit down the page.
          <br />
          <br />
          Read <strong>across a row</strong> to see one field change over time — sleep going
          5 hours, 6, 7, then back to 6 is the kind of thing a single "last visit" comparison
          hides.
          <br />
          <br />
          The highlighted first column is the session you're reviewing now.
        </InfoPopover>
      </p>

      {/* Scrolls sideways rather than dropping columns — a visit missing from
          the comparison is exactly what would mislead. */}
      <div className="il-hist__scroll">
        <table className="il-hist__table">
          <thead>
            <tr>
              <th className="il-hist__corner" />
              {columns.map((c, i) => (
                <th key={i} className={c.current ? 'il-hist__col il-hist__col--now' : 'il-hist__col'}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map((section) => (
              <Fragment key={section.title}>
                <tr className="il-hist__sectionRow">
                  <th colSpan={columns.length + 1} className="il-hist__section">
                    {section.title}
                  </th>
                </tr>
                {section.rows.map((row) => (
                  <tr key={`${section.title}-${row.label}`}>
                    <th className="il-hist__rowLabel">{row.label}</th>
                    {columns.map((c, i) => {
                      const v = clean(row.get(c.note));
                      return (
                        <td
                          key={i}
                          className={[
                            'il-hist__cell',
                            c.current ? 'il-hist__cell--now' : '',
                            v ? '' : 'il-hist__cell--blank',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          {v ?? BLANK}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
