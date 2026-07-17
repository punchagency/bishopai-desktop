import type { PriorNote, SessionNote } from '../lib/types';

// A read-only, template-shaped view of what this session's Appointment Flow
// Sheet block will actually contain — same section order/labels Nicole
// already reads on the real sheet (DATE / SYMPTOMS / FOUNDATION / BODY SCAN /
// PROTOCOL / lifestyle log) — plus the previous session's block alongside it
// for comparison. Editing happens in the Edit tab; this is the WYSIWYG check
// before approving.

const NOT_STATED = 'Not stated in transcript';
const NOT_MENTIONED = 'Not mentioned';

function describeSupplements(note: SessionNote): string | null {
  if (!note.supplements.length) return null;
  const verb: Record<string, string> = {
    start: 'Start', stop: 'Stop', increase: 'Increase', decrease: 'Decrease', continue: 'Continue',
  };
  return note.supplements
    .map((s) => `${verb[s.change] ?? s.change} ${s.name}${s.dose ? ` ${s.dose}` : ''}${s.quantity != null ? ` (qty ${s.quantity})` : ''}`)
    .join('\n');
}

function Row({ label, value, placeholder = NOT_STATED }: { label: string; value?: string | null; placeholder?: string }) {
  return (
    <div className="il-flowsheet__row">
      <div className="il-flowsheet__label">{label}</div>
      <div className={value ? 'il-flowsheet__value' : 'il-flowsheet__value il-flowsheet__value--blank'}>
        {value || placeholder}
      </div>
    </div>
  );
}

function Block({ title, date, note }: { title: string; date?: string; note: SessionNote }) {
  const ls = note.lifestyle;
  return (
    <div className="il-flowsheet__block">
      <div className="il-flowsheet__blockTitle">
        {title}
        {date && <span className="il-flowsheet__date">{new Date(date).toLocaleDateString()}</span>}
      </div>
      <Row label="SYMPTOMS" value={note.concerns.join('; ')} />
      <Row label="FOUNDATION" value={note.nrt?.foundation ?? (note.assessments.length ? note.assessments.join('\n') : null)} />
      <Row label="BODY SCAN" value={note.nrt?.body_scan} />
      <Row label="PROTOCOL" value={describeSupplements(note)} placeholder="No supplement changes" />
      <div className="il-flowsheet__lifestyle">
        <Row label="BM" value={ls?.bm} placeholder={NOT_MENTIONED} />
        <Row label="SLEEP" value={ls?.sleep} placeholder={NOT_MENTIONED} />
        <Row label="WATER" value={ls?.water} placeholder={NOT_MENTIONED} />
        <Row label="CYCLE" value={ls?.cycle} placeholder={NOT_MENTIONED} />
        <Row label="EXERCISE" value={ls?.exercise} placeholder={NOT_MENTIONED} />
        <Row label="DIET" value={ls?.diet} placeholder={NOT_MENTIONED} />
      </div>
    </div>
  );
}

export function FlowSheetPanel({ note, prior }: { note: SessionNote; prior: PriorNote | null }) {
  return (
    <div className="il-flowsheet">
      <Block title="This session (new block)" note={note} />
      {prior ? (
        <Block title="Previous session" date={prior.date} note={prior.note} />
      ) : (
        <div className="il-flowsheet__block il-flowsheet__block--empty">
          <div className="il-flowsheet__blockTitle">Previous session</div>
          <p className="il-empty">No prior approved session for this client yet — this will be the first block.</p>
        </div>
      )}
    </div>
  );
}
