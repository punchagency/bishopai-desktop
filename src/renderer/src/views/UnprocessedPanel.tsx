import { useCallback, useEffect, useState } from 'react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { fetchUnprocessed, reextractConversation } from '../lib/api';
import { formatDate } from '../lib/format';
import { stageList } from '../lib/errors';
import { REASONS, attemptText, coverageText, durationText, queuePositionText, untilText } from '../lib/unprocessed';
import { SkeletonRows } from '../components/Skeleton';
import type { UnprocessedReason, UnprocessedSession } from '../lib/types';

// Matched recordings that never became a note.
//
// This tab exists because of a state that had nowhere to be seen. A recording
// can be correctly matched to the right client, hold a full transcript, and
// still produce nothing — and when that happened by way of a spent model
// allowance, the session was filed as extracted and appeared under Awaiting
// review as an ordinary draft with every field empty. Nothing on screen
// distinguished "we read this session and she said little" from "we never read
// this session at all", and seven of them sat that way for two days.
//
// So the rule for everything below: never show an empty note without saying
// why it is empty, and never say "failed" about a session that is only waiting
// for tomorrow's allowance.
//
// It is now also the queue itself, not just its wreckage. Every matched
// transcript enters here the moment it is transcribed and leaves when it has a
// note, so the same list covers "third in line", "being read now", "tried twice
// and failed" and "waiting for tomorrow's allowance". That is one list because
// it is one question — where is my note? — and splitting it by which stage of
// not-having-one a session is in would make Nicole ask it four times.

export function UnprocessedPanel({
  backendUrl,
  onChanged,
  selectedId = null,
  onSelect,
  /** Bumped by the parent after a re-run so the list refetches without the
   *  detail pane needing to know how the list loads itself. */
  reloadKey = 0,
}: {
  backendUrl: string;
  onChanged?: () => void;
  /** conversation_id of the open row, so it can show as selected. */
  selectedId?: string | null;
  /** Opening a row. Without it the rows stay static text, which is what the
   *  panel did before there was anywhere for a click to go. */
  onSelect?: (row: UnprocessedSession) => void;
  reloadKey?: number;
}) {
  const [rows, setRows] = useState<UnprocessedSession[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) =>
      fetchUnprocessed(backendUrl, signal)
        .then((d) => {
          setRows(d.sessions);
          setError(null);
        })
        .catch((err: Error) => {
          if (signal?.aborted) return;
          // No SAMPLE fallback here on purpose. An invented row in a list whose
          // entire message is "these real sessions have no note" would be read
          // as a real problem with a real client.
          setRows([]);
          setError(err.message);
        }),
    [backendUrl],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    // Rows leave this list on their own once an extraction succeeds, so it has
    // to keep up with background work the same way the queue does.
    const timer = setInterval(() => load(), 30_000);
    return () => {
      ctrl.abort();
      clearInterval(timer);
    };
  }, [load, reloadKey]);

  const retry = async (row: UnprocessedSession) => {
    setBusy(row.conversation_id);
    try {
      await reextractConversation(backendUrl, row.conversation_id);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start that re-run.');
    } finally {
      setBusy(null);
    }
  };

  // Rows, not a SkeletonView: this panel lives inside the split's list column,
  // where a full-page skeleton painted a title block and cards wider than the
  // column they were in.
  if (!rows) return <SkeletonRows rows={4} />;

  // The row at the front, and the ones behind it. `queue_position` comes from
  // the backend's own drain query rather than from this list's order, so it
  // stays true even though the list also holds rows that are not in line at all.
  const reading = rows.find((r) => r.reason === 'running') ?? null;
  const waiting = rows.filter((r) => r.queue_position != null);

  const waitingOnQuota = rows.filter((r) => r.reason === 'quota');
  // The soonest reset among them — they all park on the same one, but reading it
  // off the data keeps this honest if that ever stops being true.
  const resetAt = waitingOnQuota
    .map((r) => r.next_attempt_at)
    .filter((v): v is string => !!v)
    .sort()[0];

  return (
    <div className="il-unprocessed">
      {error && (
        <div className="il-extract-banner__row il-extract-banner__row--danger" role="alert">
          {error}
        </div>
      )}

      {/* The allowance banner. This is the whole reason the tab is worth opening
          on a bad day: it turns a screen full of "failed" into one sentence
          about a cap that resets, which is a wait rather than a fault. */}
      {waitingOnQuota.length > 0 && (
        <div className="il-quota-banner" role="status">
          <strong>The day's AI allowance is used up.</strong>{' '}
          {waitingOnQuota.length} session{waitingOnQuota.length === 1 ? '' : 's'}{' '}
          {waitingOnQuota.length === 1 ? 'is' : 'are'} waiting to be read
          {untilText(resetAt ?? null) ? ` — retrying ${untilText(resetAt ?? null)}` : ''}. The
          recordings are safe and nothing needs redoing; they are picked up automatically once
          the allowance resets.
        </div>
      )}

      {/* The queue in one line, above the reasons. Sessions are read one at a
          time, so "4 waiting" is a wait Nicole can plan around, where four rows
          each saying "In line" is a list she has to count. */}
      {(reading || waiting.length > 0) && (
        <div className="il-queue-banner" role="status">
          {reading ? (
            <>
              <span className="il-queue-banner__dot" aria-hidden="true" />
              <strong>Reading {reading.client_name ?? 'a session'} now.</strong>
            </>
          ) : (
            <strong>{waiting.length} waiting to be read.</strong>
          )}{' '}
          {reading && waiting.length > 0 && (
            <>
              {waiting.length} more in line.{' '}
            </>
          )}
          Sessions are read one at a time.
        </div>
      )}

      {rows.length === 0 ? (
        <div className="il-view__empty">
          {/* Not the review queue's "you're all caught up" — that answers a
              different question. Here, empty means every recording became a
              real note, which is the good news worth stating plainly. */}
          <EmptyState title="Every session has a note">
            Recordings that couldn't be turned into a note appear here, with the reason.
            There are none right now.
          </EmptyState>
        </div>
      ) : (
        <div className="il-unprocessed__rows">
          {rows.map((row) => {
            const meaning = REASONS[row.reason];
            const waiting = row.reason === 'queued' || row.reason === 'running';
            const until = untilText(row.next_attempt_at);
            const position = queuePositionText(row.queue_position);
            const tried = attemptText(row);
            const active = selectedId === row.conversation_id;
            // The row opens the transcript when there is somewhere to open it.
            // Without `onSelect` it stays static text rather than becoming a
            // button that does nothing — a dead affordance on a screen whose
            // whole job is explaining why something is missing would be its own
            // small betrayal.
            const Row = onSelect ? 'button' : 'div';
            return (
              <div
                className={`il-qrow il-qrow--stack ${active ? 'il-qrow--on' : ''}`}
                key={row.conversation_id}
              >
                <Row
                  className={`il-qrow__main ${onSelect ? '' : 'il-qrow__main--static'}`}
                  {...(onSelect
                    ? {
                        type: 'button' as const,
                        onClick: () => onSelect(row),
                        'aria-current': active,
                        title: 'Read the transcript of this session',
                      }
                    : {})}
                >
                  <span className="il-qrow__text">
                    <span className="il-qrow__name" title={row.client_name ?? 'Unknown client'}>
                      {row.client_name ?? 'Unknown client'}{' '}
                      <Badge tone={meaning.tone} title={meaning.blurb}>
                        {meaning.label}
                      </Badge>
                    </span>
                    <span className="il-qrow__meta">
                      {/* Place in line leads, when there is one: it is the only
                          part of this row that answers "when", and everything
                          after it answers "what". */}
                      {position && (
                        <>
                          <strong>{position}</strong>
                          {' · '}
                        </>
                      )}
                      {formatDate(row.appointment_at ?? row.recorded_at)}
                      {' · '}
                      {/* Say the recording is safe. The instinct on seeing an
                          empty note is that the recording failed, and re-recording
                          a session is not something anyone can do. Its LENGTH is
                          how she recognises which session this was; a character
                          count told her nothing and sounded like a fault code. */}
                      {durationText(row.duration_seconds)} recording, saved
                      {row.findings > 0 &&
                        ` · ${row.findings} finding${row.findings === 1 ? '' : 's'} found so far`}
                      {until && ` · tries again ${until}`}
                      {tried && ` · ${tried.toLowerCase()}`}
                    </span>
                    {/* Which parts of the NOTE are missing — not which stages of
                        the pipeline dropped.
                        Shown for 'unread' as well as 'incomplete': the badge
                        says the reading failed, and this says how much of it,
                        which is the difference between one section lost and the
                        whole session. Without it the row asserted a scale it had
                        no way to know. */}
                    {/* Independent of the reason, and shown in every state.
                        A recording can be too short AND queued, too short AND
                        failed, too short AND blank — the badge can only say one
                        thing, and this is the fact that explains all three. It
                        is phrased as an observation because it is a heuristic:
                        a session that ran short is not a wrong one. */}
                    {row.too_short_for_appointment && (
                      <span className="il-qrow__meta il-qrow__meta--flag">
                        Only {coverageText(row.duration_seconds, row.appointment_seconds)} — check
                        this is the right recording
                      </span>
                    )}
                    {(row.reason === 'incomplete' || row.reason === 'unread') &&
                      row.partial.length > 0 && (
                        <span className="il-qrow__meta">
                          Missing: {stageList(row.partial)}
                        </span>
                      )}
                  </span>
                </Row>
                {/* A queued or in-flight row has nothing to ask for — offering
                    "Re-extract" on it invites a second run of work already
                    underway, on the exact allowance that is short. */}
                {!waiting && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="il-qrow__retry"
                    disabled={busy === row.conversation_id}
                    onClick={() => retry(row)}
                    title={
                      row.reason === 'quota'
                        ? 'This runs automatically when the allowance resets. Only worth forcing if you know the allowance is back.'
                        : 'Read this session again from its transcript'
                    }
                  >
                    {busy === row.conversation_id ? 'Starting…' : 'Read again'}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
