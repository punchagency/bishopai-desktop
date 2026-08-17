import { useMemo, useState } from 'react';
import type { Evidence, ExtractionMeta, SessionNote } from '../lib/types';

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

/**
 * The source line under a field.
 *
 * What it shows is the TRANSCRIPT's words wherever they are known, not the
 * model's rendering of them. That distinction is the whole point of citing a
 * turn: a model that reworded "high cholesterol, but I'm not on anything" into
 * "cholesterol is not high" produces a quote that reads as a clean finding, and
 * the only way Nicole catches it is by seeing what was actually said.
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
  onSeek?: (seconds: number | null, quote: string) => void;
  hasValue?: boolean;
}) {
  const hit = evidence.get(path);

  if (!hit) {
    if (!hasValue || evidence.size === 0) return null;
    return (
      <div className="il-prov il-prov--none" title="The model gave no source for this field.">
        no source
      </div>
    );
  }

  const note = NOTE[hit.verification ?? ''] ?? {
    label: hit.unverified ? 'not found in transcript' : null,
    title: 'Jump to this moment in the transcript',
  };
  // Prefer the transcript's own words. The model's quote is the fallback for
  // notes extracted before citations existed.
  const shown = hit.turn_text?.trim() || hit.quote;
  const reworded = hit.verification === 'span_near' && hit.turn_text;

  const cls = [
    'il-prov',
    hit.unverified ? 'il-prov--unverified' : '',
    reworded ? 'il-prov--reworded' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={cls}
      onClick={() => onSeek?.(hit.at_seconds, hit.turn_text?.trim() || hit.quote)}
      title={note.title}
    >
      {hit.at_seconds != null && <span className="il-prov__at">{stamp(hit.at_seconds)}</span>}
      {hit.turn != null && <span className="il-prov__turn">#{hit.turn}</span>}
      <span className="il-prov__quote">“{shown}”</span>
      {note.label && <span className="il-prov__flag">{note.label}</span>}
      {reworded && (
        <span className="il-prov__model-quote">model wrote: “{hit.quote}”</span>
      )}
    </button>
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
  if (
    !partial.length && !conflicts.length && !gaps.length && !unverified.length && !reworded.length
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
              {stamp(g.from)}–{stamp(g.to)}
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
 * The transcript beside the note. Speaker-attributed, with the active quote
 * highlighted and scrolled to, so checking a field is a glance rather than a
 * search.
 */
export function TranscriptPane({
  text,
  highlight,
}: {
  text: string;
  highlight: string | null;
}) {
  const [query, setQuery] = useState('');
  const needle = (highlight ?? query).trim().toLowerCase();

  const lines = useMemo(() => text.split(/\r?\n/), [text]);

  return (
    <div className="il-transcript">
      <div className="il-transcript__bar">
        <input
          className="il-input il-transcript__search"
          placeholder="Search the transcript…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="il-transcript__body">
        {lines.map((line, i) => {
          const isHit = needle.length > 2 && line.toLowerCase().includes(needle);
          return (
            <p
              key={i}
              ref={
                isHit
                  ? (el) => el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                  : undefined
              }
              className={`il-transcript__line${isHit ? ' il-transcript__line--hit' : ''}`}
            >
              {line || ' '}
            </p>
          );
        })}
      </div>
    </div>
  );
}

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
