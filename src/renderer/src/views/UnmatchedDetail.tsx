import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { InfoPopover } from '../components/InfoPopover';
import { fetchUnmatchedDetail, fetchSegments, type SessionSegment, type SessionTurn } from '../lib/api';
import { formatDate, humanize } from '../lib/format';
import type { UnmatchedConversation, UnmatchedDetail as Detail } from '../lib/types';
import { MatchModal } from './MatchModal';
import { MultiSessionSplitterModal } from '../components/MultiSessionSplitterModal';
import { IconRefresh, IconScissors } from '../components/Icons';
import { SkeletonTranscript } from '../components/Skeleton';

interface Props {
  backendUrl: string;
  /** The list row that was opened — its timing shows immediately while the full
   *  transcript loads, so the pane never flashes empty. */
  conversation: UnmatchedConversation;
  onClose: () => void;
  onMatched: () => void;
}

/** Seeded sample rows use short ids and have no backend row to fetch. */
function isSampleId(id: string): boolean {
  return id.length < 20;
}

function duration(startsAt: string, endsAt: string): string | null {
  const ms = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

interface ParsedTurn {
  index: number;
  speakerRaw: string;
  role: 'PRACTITIONER' | 'CLIENT' | 'SYSTEM' | 'UNKNOWN';
  label: string;
  text: string;
}

/**
 * Turn a backend turn into a display row.
 *
 * Deliberately NOT a parser. This pane used to re-parse the transcript in the
 * renderer, which gave it its own turn numbering — so `segment.from_turn ===
 * turn.index`, the test that decides where a session divider is drawn, was
 * comparing two different countings of the same recording. The numbers come
 * from the backend now; all that is left here is what to call each speaker.
 */
function toDisplayTurn(turn: SessionTurn, swapRoles: boolean): ParsedTurn {
  const upper = turn.speaker.toUpperCase().trim();
  let role: ParsedTurn['role'] = turn.role;
  let label = turn.speaker || 'Unattributed';

  if (upper.includes('POCKET') || upper.includes('SYSTEM')) {
    role = 'SYSTEM';
    label = 'Pocket (System)';
  } else {
    if (swapRoles && role === 'PRACTITIONER') role = 'CLIENT';
    else if (swapRoles && role === 'CLIENT') role = 'PRACTITIONER';

    if (role === 'PRACTITIONER') label = 'Nicole (Practitioner)';
    else if (role === 'CLIENT') label = `Client (${turn.speaker.replace(/_/g, ' ')})`;
    else label = turn.speaker.replace(/_/g, ' ');
  }

  return { index: turn.index, speakerRaw: turn.speaker, role, label, text: turn.text };
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} style={{ backgroundColor: '#fef08a', color: '#854d0e', padding: '0 2px', borderRadius: '2px' }}>
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

/**
 * The transcript reader: search, role swap, numbered turns, session dividers.
 *
 * Exported because the "Not extracted" pane needs exactly this and nothing
 * beside it. `onSplitAtTurn` and `segments` were already optional, and that is
 * what makes the reuse honest rather than a fork: omit them and the split
 * affordance and the encounter dividers simply do not render, which is right
 * for a recording already filed against one appointment — there is nothing left
 * to split it into.
 */
export function UnmatchedTranscriptViewer({
  transcript,
  sessionTurns,
  segments = [],
  onSplitAtTurn,
}: {
  transcript: string;
  sessionTurns: SessionTurn[];
  segments?: SessionSegment[];
  onSplitAtTurn?: (turnIndex: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [swapRoles, setSwapRoles] = useState(false);

  // Until the segments call lands there are no numbered turns to show. Falling
  // back to a local parse is exactly the drift this pane just stopped doing, so
  // it shows the raw text instead and gains the turns when they arrive.
  const turns = useMemo(
    () => sessionTurns.map((t) => toDisplayTurn(t, swapRoles)),
    [sessionTurns, swapRoles],
  );
  const detectionNote = segments.find((s) => s.detection_note)?.detection_note ?? null;

  const query = search.trim().toLowerCase();
  const filteredTurns = useMemo(() => {
    if (!query) return turns;
    return turns.filter(
      (t) => t.text.toLowerCase().includes(query) || t.label.toLowerCase().includes(query),
    );
  }, [turns, query]);

  return (
    <div className="il-srcpane" style={{ marginTop: '0.5rem', border: '1px solid var(--border)', borderRadius: '8px' }}>
      <div
        className="il-srcpane__bar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.6rem 0.8rem',
          background: 'var(--il-color-surface-raised, rgba(0,0,0,0.02))',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <input
          type="text"
          className="il-input il-srcpane__search"
          placeholder="Search in transcript..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <Button variant="ghost" onClick={() => setSearch('')} style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}>
            Clear
          </Button>
        )}
        <span className="il-srcpane__count" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--il-color-text-subtle)' }}>
          {query ? `${filteredTurns.length} / ${turns.length} turns` : `${turns.length} turns`}
        </span>
        <Button
          variant="ghost"
          onClick={() => setSwapRoles(!swapRoles)}
          title="Swap Speaker 00 and Speaker 01 roles"
          style={{ fontSize: '0.75rem', marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
        >
          <IconRefresh size={14} />
          {swapRoles ? 'Reset Roles' : 'Swap Roles'}
        </Button>
      </div>

      <div className="il-srcpane__body" style={{ maxHeight: '420px', overflowY: 'auto', padding: '0.75rem' }}>
        {detectionNote && (
          <p
            className="il-empty"
            style={{ padding: '0.6rem 0.85rem', marginBottom: '0.75rem', fontSize: '0.8rem', border: '1px dashed var(--il-color-border, #d9cfc7)', borderRadius: '6px' }}
          >
            {detectionNote}
          </p>
        )}
        {sessionTurns.length === 0 ? (
          // No numbered turns yet (still loading, or the backend could not find
          // any). Show the text rather than an empty pane — but plainly, with no
          // turn numbers, since inventing them here is what caused the drift.
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: '0.85rem', lineHeight: 1.5 }}>
            {transcript}
          </pre>
        ) : filteredTurns.length === 0 ? (
          <p className="il-empty" style={{ padding: '1rem', textAlign: 'center' }}>
            No transcript turns match "{search}"
          </p>
        ) : (
          filteredTurns.map((turn) => {
            const isPractitioner = turn.role === 'PRACTITIONER';
            const isClient = turn.role === 'CLIENT';
            const isSystem = turn.role === 'SYSTEM';

            const boundarySegmentIdx = segments.findIndex((s) => s.from_turn === turn.index);
            const boundarySegment = boundarySegmentIdx >= 0 ? segments[boundarySegmentIdx] : null;

            return (
              <div key={turn.index}>
                {boundarySegment && (
                  <div
                    style={{
                      margin: boundarySegmentIdx === 0 ? '0 0 0.75rem 0' : '1.25rem 0 0.75rem 0',
                      padding: '0.5rem 0.85rem',
                      borderRadius: '6px',
                      background: 'rgba(200, 120, 80, 0.08)',
                      border: '1px dashed #c87850',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.8rem', color: '#c87850' }}>
                      <IconScissors size={14} />
                      <span>Session Encounter #{boundarySegmentIdx + 1} (Turns #{boundarySegment.from_turn} to #{boundarySegment.to_turn})</span>
                    </div>
                    {boundarySegment.client_name_hint && (
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--il-color-text-subtle)', background: 'var(--il-color-surface-raised, rgba(0,0,0,0.04))', padding: '0.25rem 0.6rem', borderRadius: '12px' }}>
                        Candidate: {boundarySegment.client_name_hint}
                      </span>
                    )}
                  </div>
                )}
                <div
                  className={`il-srcpane__turn ${
                    isPractitioner
                      ? 'il-srcpane__turn--practitioner'
                      : isClient
                      ? 'il-srcpane__turn--client'
                      : 'il-srcpane__turn--unknown'
                  }`}
                  style={{
                    marginBottom: '0.75rem',
                    padding: '0.6rem 0.8rem',
                    borderRadius: '6px',
                    background: isPractitioner
                      ? 'rgba(200, 120, 80, 0.06)'
                      : isClient
                      ? 'rgba(0, 0, 0, 0.02)'
                      : 'rgba(0, 0, 0, 0.04)',
                    borderLeft: isPractitioner
                      ? '3px solid #c87850'
                      : isClient
                      ? '3px solid #3b82f6'
                      : isSystem
                      ? '3px solid #8b5cf6'
                      : '3px solid var(--border)',
                  }}
                >
                  <div className="il-srcpane__head" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <span className="il-srcpane__num" style={{ fontSize: '0.7rem', color: 'var(--il-color-text-subtle)', fontWeight: 600 }}>
                      #{turn.index}
                    </span>
                    <span
                      className="il-srcpane__role"
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: isPractitioner ? '#c87850' : isClient ? '#2563eb' : isSystem ? '#7c3aed' : 'inherit',
                      }}
                    >
                      {turn.label}
                    </span>

                    {onSplitAtTurn && turn.index > 1 && (
                      <button
                        type="button"
                        className="il-srcpane__split-hover"
                        onClick={() => onSplitAtTurn(turn.index)}
                        style={{
                          marginLeft: 'auto',
                          fontSize: '0.7rem',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          border: '1px solid #c87850',
                          background: 'rgba(200, 120, 80, 0.1)',
                          color: '#c87850',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}
                        title={`Split recording at Turn #${turn.index}`}
                      >
                        <IconScissors size={12} /> Split at Turn #{turn.index}
                      </button>
                    )}
                  </div>
                  <div className="il-srcpane__line" style={{ fontSize: '0.875rem', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                    <HighlightedText text={turn.text} query={search} />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function UnmatchedDetail({ backendUrl, conversation, onClose, onMatched }: Props) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [segments, setSegments] = useState<SessionSegment[]>([]);
  const [sessionTurns, setSessionTurns] = useState<SessionTurn[]>([]);
  const [failed, setFailed] = useState(false);
  const [matching, setMatching] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const isSample = isSampleId(conversation.id);

  useEffect(() => {
    if (isSample) return; // sample rows only have the preview
    setDetail(null);
    setFailed(false);
    const ctrl = new AbortController();
    fetchUnmatchedDetail(backendUrl, conversation.id, ctrl.signal)
      .then((r) => setDetail(r.conversation))
      .catch((e) => {
        if (!ctrl.signal.aborted) setFailed(true);
        void e;
      });

    setSessionTurns([]);
    fetchSegments(backendUrl, conversation.id)
      .then((r) => {
        setSegments(r.segments);
        setSessionTurns(r.turns ?? []);
      })
      .catch(() => {
        setSegments([]);
        setSessionTurns([]);
      });

    return () => ctrl.abort();
  }, [backendUrl, conversation.id, isSample]);

  const dur = duration(conversation.starts_at, conversation.ends_at);
  // The full transcript once it lands, otherwise the list preview so there's
  // always something to read while the fetch is in flight.
  const transcript = detail?.transcript ?? (isSample ? conversation.transcript_preview : null);

  return (
    <div className="il-detail">
      <header className="il-detail__head">
        {/* Only shows when the panes stack (narrow window); the list is otherwise
            still on screen to the left. */}
        <Button variant="ghost" onClick={onClose}>
          ← Recordings
        </Button>
        <div className="il-detail__title">
          <h2>
            {new Date(conversation.starts_at).toLocaleString([], {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </h2>
          <span className="il-detail__kind">Recording</span>
          <InfoPopover label="Why is this here?" title="Unmatched recordings">
            Pocket captured this session but we couldn't tie it to an appointment with
            confidence — no booking overlapped its time, or more than one did. We never
            auto-guess the client. Read it through, then assign it to the right appointment
            (or straight to a client if it was a walk-in). Assigning kicks off the same
            note extraction a matched session gets.
          </InfoPopover>
          <Badge tone="warning">{humanize(conversation.correlation_status ?? 'unmatched')}</Badge>
        </div>
      </header>

      <div className="il-detail__body">
        <dl className="il-meta">
          <div className="il-meta__row">
            <dt>Recorded</dt>
            <dd>{formatDate(conversation.starts_at)}</dd>
          </div>
          <div className="il-meta__row">
            <dt>Length</dt>
            <dd>{dur ?? 'unknown'}</dd>
          </div>
          <div className="il-meta__row">
            <dt>Recording ID</dt>
            <dd className="il-meta__mono">{conversation.source_id}</dd>
          </div>
          {detail?.extraction_status && (
            <div className="il-meta__row">
              <dt>Extraction</dt>
              <dd>{humanize(detail.extraction_status)}</dd>
            </div>
          )}
        </dl>

        <h3 className="il-detail__section">Transcript</h3>
        {transcript ? (
          <UnmatchedTranscriptViewer
            transcript={transcript}
            sessionTurns={sessionTurns}
            segments={segments}
            onSplitAtTurn={() => setMatching(true)}
          />
        ) : failed ? (
          <p className="il-empty">
            This recording couldn't be opened — it may have just been matched from another window.
            Pick another from the list.
          </p>
        ) : isSample ? (
          <p className="il-empty">The full transcript needs a running backend — this is offline sample data.</p>
        ) : (
          <SkeletonTranscript />
        )}
      </div>

      {/* Sticky, so the assign action stays reachable however long the transcript runs. */}
      <footer className="il-detail__actions">
        <Button variant="secondary" onClick={() => setSplitting(true)} disabled={isSample} title="Split a recording containing multiple client sessions" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <IconScissors size={14} />
          Split multi-session recording
        </Button>
        <Button variant="primary" onClick={() => setMatching(true)} disabled={isSample}>
          Assign this recording
        </Button>
      </footer>

      {matching && (
        <MatchModal
          backendUrl={backendUrl}
          conversation={conversation}
          onClose={() => setMatching(false)}
          onMatched={() => {
            setMatching(false);
            onMatched();
          }}
        />
      )}

      {splitting && (
        <MultiSessionSplitterModal
          backendUrl={backendUrl}
          conversation={conversation}
          onClose={() => setSplitting(false)}
          onTreatAsSingleSession={() => setMatching(true)}
          onSplitCompleted={() => {
            setSplitting(false);
            onMatched();
          }}
        />
      )}
    </div>
  );
}
