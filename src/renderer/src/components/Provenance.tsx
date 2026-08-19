import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import type { Evidence, ExtractionMeta, SessionNote, TranscriptTurn } from '../lib/types';
import { createPortal } from 'react-dom';
import { locate } from '../lib/locateQuote';

// Provenance in the review pane.
//
// Every extracted value used to arrive as a bare string, and this editor showed
// ~50 of them with no reference to the transcript at all — Nicole was confirming
// clinical findings from memory. Pairing each finding with the practitioner's own
// words turns reviewing into confirming, and it makes the one thing the pipeline
// must never do visible: a quote that isn't in the transcript is a fabricated
// finding, and it arrives here already flagged.

export type EvidenceIndex = Map<string, Evidence>;

export function useEvidence(note: SessionNote | null): EvidenceIndex {
  return useMemo(
    () => new Map((note?.evidence ?? []).map((e) => [e.path, e])),
    [note?.evidence],
  );
}

function stamp(seconds: number | null): string {
  if (seconds == null) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Where a dropped range sits, in whatever units the recording actually has.
 *
 * Timestamps first, because minutes are how Nicole scrubs a recording. But the
 * recorder in use emits none, and the earlier version rendered time alone — so a
 * real partial extraction announced its gaps as "–, –, –", which is strictly
 * worse than saying nothing. Turn numbers are ours and always present, and they
 * match the #133 markers already shown beside every quote.
 */
function gapLabel(g: {
  from: number | null;
  to: number | null;
  from_turn?: number | null;
  to_turn?: number | null;
  stage?: string | null;
}): string {
  const where =
    g.from != null && g.to != null
      ? `${stamp(g.from)}–${stamp(g.to)}`
      : g.from_turn != null && g.to_turn != null
        ? `turns #${g.from_turn}–#${g.to_turn}`
        : 'an unlabelled stretch';
  return g.stage ? `${where} (${g.stage})` : where;
}

/** What each verification state means where Nicole is reading, not in schema terms. */
const NOTE: Record<string, { label: string | null; title: string }> = {
  span: {
    label: null,
    title: 'Quoted word for word from this turn of the transcript. Click to jump to it.',
  },
  span_near: {
    label: 'reworded',
    title:
      'This turn is about this finding, but the wording below is the model’s, not the practitioner’s. Read the turn — a reversed meaning looks exactly like this.',
  },
  exact: {
    label: null,
    title: 'These words appear in the transcript. Click to jump to them.',
  },
  near: {
    label: 'paraphrased',
    title: 'Close to the transcript but not word for word, and no turn was cited.',
  },
  misattributed: {
    label: 'cites the wrong turn',
    title:
      'The model pointed at a specific turn that does not say this. Verify before approving.',
  },
  bad_span: {
    label: 'cites a turn that does not exist',
    title: 'The citation points at no real part of the transcript. Verify before approving.',
  },
  unsupported: {
    label: 'not found in transcript',
    title: 'Nothing in the transcript backs this. Verify before approving.',
  },
};

/** What the review pane should scroll to and mark. */
export interface SeekTarget {
  turn: number | null;
  quote: string;
  at_seconds: number | null;
}

/**
 * The source under a field: a marker, with the words on hover.
 *
 * Printing every quote inline was the honest version and the unreadable one. A
 * turn runs past a hundred words in the real sessions — 117, 277 and 435 in the
 * three on file — and this form has around fifty fields, so provenance rendered
 * in full turns the editor into a transcript with inputs lost inside it. The
 * words are wanted for one field at a time, which is exactly what hover is for.
 *
 * What does NOT move into the tooltip is the STATUS. A finding the transcript
 * does not back has to be visible to someone who never hovers, because that is
 * the person who approves it — so the marker itself carries the flag, and only
 * the reading matter is deferred.
 */
export function SourceQuote({
  path,
  evidence,
  onSeek,
  /** Only warn about a missing quote where the field actually has a value. */
  hasValue = true,
}: {
  path: string;
  evidence: EvidenceIndex;
  onSeek?: (target: SeekTarget) => void;
  hasValue?: boolean;
}) {
  const hit = evidence.get(path);
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // The card sits below the marker with a gap, so a straight mouseleave would
  // close it the moment the pointer set off towards it. A long turn has to stay
  // reachable to be read.
  const closing = useRef<number | undefined>(undefined);
  const show = () => {
    window.clearTimeout(closing.current);
    setOpen(true);
  };
  const hide = () => {
    window.clearTimeout(closing.current);
    closing.current = window.setTimeout(() => setOpen(false), 140);
  };
  useEffect(() => () => window.clearTimeout(closing.current), []);

  if (!hit) {
    if (!hasValue || evidence.size === 0) return null;
    return (
      <span
        className="il-prov il-prov--none"
        title="The model gave no source for this field."
      >
        no source
      </span>
    );
  }

  const note = NOTE[hit.verification ?? ''] ?? {
    label: hit.unverified ? 'not found in transcript' : null,
    title: 'Jump to this moment in the transcript',
  };
  // Prefer the transcript's own words. The model's quote is the fallback for
  // notes extracted before citations existed.
  const source = hit.turn_text?.trim() || hit.quote;
  const reworded = hit.verification === 'span_near' && !!hit.turn_text;

  const cls = [
    'il-prov',
    hit.unverified ? 'il-prov--unverified' : '',
    reworded ? 'il-prov--reworded' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={cls}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={() =>
          onSeek?.({ turn: hit.turn ?? null, quote: hit.quote, at_seconds: hit.at_seconds })
        }
        aria-label={`Source: ${source}`}
      >
        <span className="il-prov__dot" aria-hidden />
        {hit.at_seconds != null && <span className="il-prov__at">{stamp(hit.at_seconds)}</span>}
        {hit.turn != null && <span className="il-prov__turn">#{hit.turn}</span>}
        {/* A recorder that emits no timestamps and a note extracted before turn
            citations existed leave nothing to print — and a bare 7px dot is not
            a thing anyone discovers they can hover. */}
        {hit.at_seconds == null && hit.turn == null && !note.label && (
          <span className="il-prov__turn">source</span>
        )}
        {/* A flag is never deferred to hover — see the note above. */}
        {note.label && <span className="il-prov__flag">{note.label}</span>}
      </button>
      {open && (
        <SourcePopover
          anchor={ref.current}
          status={note}
          source={source}
          hit={hit}
          reworded={reworded}
          onEnter={show}
          onLeave={hide}
        />
      )}
    </>
  );
}

/**
 * The turn itself, floating beside the marker.
 *
 * Rendered into `document.body` rather than beside the field: the form and the
 * pane beside it both scroll and both clip, and a source quote that gets cut off
 * by an overflow rule is worse than one that was never shown — it looks like the
 * transcript stops there.
 */
function SourcePopover({
  anchor,
  status,
  source,
  hit,
  reworded,
  onEnter,
  onLeave,
}: {
  anchor: HTMLElement | null;
  status: { label: string | null; title: string };
  /** The turn's own words — the whole turn, not a window of it. There is room
   *  here, and the sentence around a finding is often what decides it. */
  source: string;
  hit: Evidence;
  reworded: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const clean = useMemo(() => source.replace(/\s+/g, ' ').trim(), [source]);
  // Where the finding sits inside the turn. Only meaningful when the turn's own
  // words are known — otherwise the quote IS the text, and marking all of it
  // says nothing.
  const at = useMemo(
    () => (hit.turn_text ? locate(clean, hit.quote) : null),
    [clean, hit.turn_text, hit.quote],
  );

  // Measured after paint, so a card that would open past the bottom or the right
  // edge of the window flips instead of being half off-screen.
  useEffect(() => {
    if (!anchor || !cardRef.current) return;
    const a = anchor.getBoundingClientRect();
    const c = cardRef.current.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, Math.min(a.left, window.innerWidth - c.width - margin));
    const below = a.bottom + margin;
    const top = below + c.height > window.innerHeight - margin
      ? Math.max(margin, a.top - c.height - margin)
      : below;
    setPos({ top, left });
  }, [anchor]);

  const cls = [
    'il-provpop',
    hit.unverified ? 'il-provpop--unverified' : '',
    reworded ? 'il-provpop--reworded' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <div
      ref={cardRef}
      className={cls}
      role="tooltip"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        // Hidden until measured — one frame at the wrong coordinates reads as a
        // flicker in the corner of the screen.
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      <div className="il-provpop__head">
        {hit.at_seconds != null && <span>{stamp(hit.at_seconds)}</span>}
        {hit.turn != null && <span>turn #{hit.turn}</span>}
        {status.label && <span className="il-provpop__flag">{status.label}</span>}
      </div>
      <p className="il-provpop__quote">
        {at ? (
          <>
            {clean.slice(0, at.start)}
            {/* Marked, not quoted: where the model reworded the turn these are
                the words the two share, not a quotation of the model. */}
            <mark className={`il-provpop__hit${at.exact ? '' : ' il-provpop__hit--near'}`}>
              {clean.slice(at.start, at.end)}
            </mark>
            {clean.slice(at.end)}
          </>
        ) : (
          clean
        )}
      </p>
      {reworded && (
        /* Both renderings at once, or the reversal ("not high" for "high") has
           nothing to be caught against. */
        <p className="il-provpop__model">model wrote: “{hit.quote}”</p>
      )}
      <p className="il-provpop__note">{status.title}</p>
    </div>,
    document.body,
  );
}

/**
 * What the extraction itself wants Nicole to know before she trusts the draft:
 * which parts of the session were never read, where two passes disagreed, and
 * how many quotes failed verification. None of this was surfaced before — a
 * partial extraction looked exactly like a quiet session.
 */
export function ExtractionBanner({
  meta,
  evidence,
}: {
  meta?: ExtractionMeta;
  evidence: EvidenceIndex;
}) {
  const all = [...evidence.values()];
  const unverified = all.filter((e) => e.unverified);
  // A citation that points somewhere real and wrong is a stronger fabrication
  // signal than a quote that merely failed to match, so it gets counted apart.
  const miscited = unverified.filter(
    (e) => e.verification === 'misattributed' || e.verification === 'bad_span',
  );
  const reworded = all.filter((e) => e.verification === 'span_near');
  const partial = meta?.partial ?? [];
  const conflicts = meta?.conflicts ?? [];
  const gaps = meta?.gaps ?? [];
  const unstated = meta?.unstated_numbers ?? [];
  if (
    !partial.length &&
    !conflicts.length &&
    !gaps.length &&
    !unverified.length &&
    !reworded.length &&
    !unstated.length
  )
    return null;

  return (
    <div className="il-extract-banner">
      {partial.length > 0 && (
        <div className="il-extract-banner__row il-extract-banner__row--warn">
          <strong>Incomplete extraction.</strong> These parts were not read:{' '}
          {partial.join(', ')}. Fields they would have filled are blank because they were
          never looked at — not because nothing was said.
        </div>
      )}
      {gaps.length > 0 && (
        <div className="il-extract-banner__row il-extract-banner__row--warn">
          <strong>Gaps in coverage:</strong>{' '}
          {gaps.map((g, i) => (
            <span key={i}>
              {i > 0 && ', '}
              {gapLabel(g)}
            </span>
          ))}
        </div>
      )}
      {conflicts.length > 0 && (
        <div className="il-extract-banner__row il-extract-banner__row--warn">
          <strong>Conflicting readings — please confirm:</strong>
          <ul className="il-extract-banner__list">
            {conflicts.map((c) => (
              <li key={c.path}>
                <code>{c.path}</code>: kept <strong>{c.chosen}</strong> over{' '}
                {c.candidates.filter((v) => v !== c.chosen).join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
      {unverified.length > 0 && (
        <div className="il-extract-banner__row il-extract-banner__row--danger">
          <strong>
            {unverified.length} finding{unverified.length === 1 ? '' : 's'} the transcript does
            not back.
          </strong>{' '}
          {miscited.length > 0 && (
            <>
              {miscited.length} of them point at a specific part of the session that does not say
              it.{' '}
            </>
          )}
          Those fields may have been invented — they are marked below.
        </div>
      )}
      {unstated.length > 0 && (
        <div className="il-extract-banner__row il-extract-banner__row--danger">
          <strong>
            {unstated.length} finding{unstated.length === 1 ? '' : 's'} state a number nobody
            said.
          </strong>{' '}
          The source quote can still check out — a real turn, about the right thing, with a
          figure added to it. Read these against the transcript:
          <ul className="il-extract-banner__list">
            {unstated.map((u) => (
              <li key={u.path}>
                <code>{u.path}</code>: {u.value}{' '}
                <em>({u.numbers.join(', ')} not in the session)</em>
              </li>
            ))}
          </ul>
        </div>
      )}
      {reworded.length > 0 && (
        <div className="il-extract-banner__row il-extract-banner__row--warn">
          <strong>
            {reworded.length} finding{reworded.length === 1 ? '' : 's'} reworded rather than
            quoted.
          </strong>{' '}
          The right part of the session is cited, but the wording is the model’s. Read the
          transcript line — a reversed meaning ("not high" for "high") looks like this.
        </div>
      )}
    </div>
  );
}

/**
 * The transcript beside the note.
 *
 * Split into the SAME numbered turns the citations point at, because "#133" is
 * only checkable if #133 is a thing on screen. The previous pane split the file
 * on newlines and found the active quote by substring search — which silently
 * found nothing whenever a turn had been merged from several lines, so clicking
 * a finding appeared to do nothing at all. Scrolling to a turn by its number
 * cannot miss.
 */
export function TranscriptPane({
  text,
  turns,
  target,
}: {
  text: string;
  turns?: TranscriptTurn[];
  target: SeekTarget | null;
}) {
  const [query, setQuery] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLParagraphElement>(null);

  const q = query.trim().toLowerCase();
  const lines = useMemo(() => (turns?.length ? [] : text.split(/\r?\n/)), [text, turns]);

  // Which block is the one to scroll to: the cited turn, else the first search
  // hit. Falls back to matching on the quote's text for notes extracted before
  // citations existed.
  const activeKey = useMemo(() => {
    if (turns?.length) {
      if (target?.turn != null && turns.some((t) => t.index === target.turn)) return target.turn;
      const needle = target?.quote?.trim().toLowerCase();
      if (needle && needle.length > 2) {
        const hit = turns.find((t) => t.text.toLowerCase().includes(needle.slice(0, 60)));
        if (hit) return hit.index;
      }
      if (q.length > 2) return turns.find((t) => t.text.toLowerCase().includes(q))?.index ?? null;
      return null;
    }
    const needle = (target?.quote ?? query).trim().toLowerCase();
    if (needle.length <= 2) return null;
    return lines.findIndex((l) => l.toLowerCase().includes(needle));
  }, [turns, target, q, query, lines]);

  // Scroll only when the thing being looked at changes. The old pane scrolled
  // from a ref callback, so every keystroke in the form re-ran it and yanked the
  // pane back to whatever was last clicked.
  useEffect(() => {
    if (activeKey == null || activeKey < 0) return;
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeKey]);

  const count = turns?.length
    ? turns.filter((t) => q.length > 2 && t.text.toLowerCase().includes(q)).length
    : 0;

  return (
    <div className="il-srcpane">
      <div className="il-srcpane__bar">
        <input
          className="il-input il-srcpane__search"
          placeholder="Search the transcript…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {q.length > 2 && turns?.length ? (
          <span className="il-srcpane__count">
            {count} turn{count === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>
      <div className="il-srcpane__body" ref={bodyRef}>
        {turns?.length
          ? turns.map((t) => (
              <TurnBlock
                key={t.index}
                turn={t}
                active={t.index === activeKey}
                quote={t.index === activeKey ? target?.quote ?? null : null}
                query={q}
                ref={t.index === activeKey ? activeRef : undefined}
              />
            ))
          : lines.map((line, i) => (
              <p
                key={i}
                ref={i === activeKey ? activeRef : undefined}
                className={`il-srcpane__line${i === activeKey ? ' il-srcpane__line--hit' : ''}`}
              >
                {line || ' '}
              </p>
            ))}
      </div>
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = {
  PRACTITIONER: 'Practitioner',
  CLIENT: 'Client',
  UNKNOWN: 'Unattributed',
};

/**
 * One turn, headed by the number a finding cites it as. The header is what makes
 * the citation verifiable by eye, and the role is what makes the note's central
 * distinction — the client's concern against the practitioner's assessment —
 * checkable rather than assumed.
 */
const TurnBlock = forwardRef<
  HTMLParagraphElement,
  { turn: TranscriptTurn; active: boolean; quote: string | null; query: string }
>(function TurnBlock({ turn, active, quote, query }, ref) {
  const clean = useMemo(() => turn.text.replace(/\s+/g, ' ').trim(), [turn.text]);
  const hit = !active && query.length > 2 && clean.toLowerCase().includes(query);
  // The whole turn is shown here — this only says which part of it to mark.
  const at = active && quote ? locate(clean, quote) : null;

  return (
    <p
      ref={ref}
      id={`il-srcpane-turn-${turn.index}`}
      className={[
        'il-srcpane__turn',
        `il-srcpane__turn--${turn.role.toLowerCase()}`,
        active ? 'il-srcpane__turn--active' : '',
        hit ? 'il-srcpane__turn--hit' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="il-srcpane__head">
        <span className="il-srcpane__num">#{turn.index}</span>
        <span className="il-srcpane__role">{ROLE_LABEL[turn.role] ?? turn.speaker}</span>
        {turn.at_seconds != null && (
          <span className="il-srcpane__at">{stamp(turn.at_seconds)}</span>
        )}
      </span>
      {/* Marked inside the turn, so arriving here is a glance and not a second
          search through a hundred words. */}
      {at ? (
        <>
          {clean.slice(0, at.start)}
          <mark className="il-srcpane__mark">{clean.slice(at.start, at.end)}</mark>
          {clean.slice(at.end)}
        </>
      ) : (
        clean
      )}
    </p>
  );
});

/** "model said *hold* → stop" — the mapping shown rather than assumed. */
export function MappedValueNote({
  raw,
  unresolved,
  mapped,
}: {
  raw?: string | null;
  unresolved?: boolean;
  mapped: string;
}) {
  if (!raw) return null;
  return (
    <div className={`il-mapped${unresolved ? ' il-mapped--unresolved' : ''}`}>
      {unresolved ? (
        <>
          could not read “{raw}” — defaulted to <strong>{mapped}</strong>, please set it
        </>
      ) : (
        <>
          heard “{raw}” → <strong>{mapped}</strong>
        </>
      )}
    </div>
  );
}
