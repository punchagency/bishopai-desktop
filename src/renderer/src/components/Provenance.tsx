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

/**
 * The source line under a field. Three states, all of them meaningful:
 *
 *  - a verified quote      → confirm and move on
 *  - an UNVERIFIED quote   → the words aren't in the transcript; read closely
 *  - nothing at all        → the model filled this without pointing at anything
 *
 * The last two are exactly the fields worth Nicole's attention, so they are the
 * ones that get visual weight.
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
      <div className="il-prov il-prov--none" title="The model gave no supporting quote for this field.">
        no source quote
      </div>
    );
  }

  const cls = hit.unverified ? 'il-prov il-prov--unverified' : 'il-prov';
  return (
    <button
      type="button"
      className={cls}
      onClick={() => onSeek?.(hit.at_seconds, hit.quote)}
      title={
        hit.unverified
          ? 'These words were not found in the transcript — verify before approving.'
          : 'Jump to this moment in the transcript'
      }
    >
      {hit.at_seconds != null && <span className="il-prov__at">{stamp(hit.at_seconds)}</span>}
      <span className="il-prov__quote">“{hit.quote}”</span>
      {hit.unverified && <span className="il-prov__flag">not found in transcript</span>}
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
  const unverified = [...evidence.values()].filter((e) => e.unverified);
  const partial = meta?.partial ?? [];
  const conflicts = meta?.conflicts ?? [];
  const gaps = meta?.gaps ?? [];
  if (!partial.length && !conflicts.length && !gaps.length && !unverified.length) return null;

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
          <strong>{unverified.length} quote{unverified.length === 1 ? '' : 's'} not found in the
          transcript.</strong> Those fields may have been invented — they are marked below.
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
