import { useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { InfoPopover } from '../components/InfoPopover';
import { fetchConversationDetail, reextractConversation } from '../lib/api';
import { formatDate } from '../lib/format';
import { SkeletonTranscript } from '../components/Skeleton';
import { stageList } from '../lib/errors';
import { REASONS, durationText, untilText } from '../lib/unprocessed';
import type { ConversationDetail, UnprocessedSession } from '../lib/types';
import { UnmatchedTranscriptViewer } from './UnmatchedDetail';

// Reading a session that has no note.
//
// The premise: a missing note is not missing content. The recording is the
// primary record and the note is derived from it, so being unable to open the
// transcript is a harder block than having no note — and until this pane
// existed that was exactly the situation. The only transcript reader in the app
// hung off /unmatched/:id, which refuses a recording that has an appointment,
// so a matched session waiting on tomorrow's model allowance showed a client
// name, a date, and nothing else at all.
//
// So this pane leads with the transcript and treats the extraction state as a
// footnote: a badge, one sentence about what happened, one about whether she
// needs to do anything. Never a stack trace, never a status code, and never the
// raw provider error — that goes behind a disclosure for whoever is debugging.

interface Props {
  backendUrl: string;
  /** The list row that was opened. Its client and date paint immediately, so
   *  the pane never flashes empty while the transcript loads. */
  row: UnprocessedSession;
  onClose: () => void;
  onChanged: () => void;
}

export function UnprocessedDetail({ backendUrl, row, onClose, onChanged }: Props) {
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const meaning = REASONS[row.reason];
  const until = untilText(row.next_attempt_at);
  // Queued and in-flight rows have nothing to ask for; offering a re-run invites
  // a second go at work already underway, on the allowance that is short.
  const canRetry = row.reason !== 'queued' && row.reason !== 'running';

  useEffect(() => {
    setDetail(null);
    setFailed(null);
    const ctrl = new AbortController();
    fetchConversationDetail(backendUrl, row.conversation_id, ctrl.signal)
      .then((r) => setDetail(r.conversation))
      .catch((err: Error) => {
        if (ctrl.signal.aborted) return;
        setFailed(err.message);
      });
    return () => ctrl.abort();
  }, [backendUrl, row.conversation_id]);

  const retry = async () => {
    setBusy(true);
    try {
      await reextractConversation(backendUrl, row.conversation_id);
      onChanged();
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'Could not start that re-run.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="il-detail">
      <header className="il-detail__head">
        {/* Only visible when the panes stack on a narrow window; the list is
            otherwise still on screen to the left. */}
        <Button variant="ghost" onClick={onClose}>
          ← Sessions
        </Button>
        <div className="il-detail__title">
          <h2>{row.client_name ?? 'Unknown client'}</h2>
          <span className="il-detail__kind">Session</span>
          <InfoPopover label="Why is this here?" title="Sessions with no note">
            The recording was matched to the right client and the transcript was saved, but it
            hasn't been turned into a note yet — or it was, and came back empty. The whole
            conversation is readable below either way. Nothing needs re-recording.
          </InfoPopover>
          <Badge tone={meaning.tone}>{meaning.label}</Badge>
        </div>
      </header>

      <div className="il-detail__body">
        {/* What happened, and whether she has to do anything about it. Two
            sentences, above the fold, before any transcript to scroll past. */}
        <div className="il-quota-banner" role="status">
          <strong>{meaning.blurb}</strong>
          {meaning.action && <> {meaning.action}</>}
          {until && row.reason === 'quota' && <> Next try {until}.</>}
        </div>

        <dl className="il-meta">
          <div className="il-meta__row">
            <dt>Session</dt>
            <dd>{formatDate(row.appointment_at ?? row.recorded_at)}</dd>
          </div>
          <div className="il-meta__row">
            <dt>Recording</dt>
            <dd>{durationText(row.duration_seconds)} long, saved</dd>
          </div>
          {row.findings > 0 && (
            <div className="il-meta__row">
              <dt>Note so far</dt>
              <dd>
                {row.findings} finding{row.findings === 1 ? '' : 's'}
                {row.reason === 'incomplete' && row.partial.length > 0 && (
                  <> — missing {stageList(row.partial)}</>
                )}
              </dd>
            </div>
          )}
          {detail?.source_id && (
            <div className="il-meta__row">
              <dt>Recording ID</dt>
              <dd className="il-meta__mono">{detail.source_id}</dd>
            </div>
          )}
        </dl>

        {/* The provider's own words. Folded away by default: on a quota refusal
            this is 900 characters of JSON about metrics and retry delays, which
            says nothing to the person reading a chart and everything to whoever
            is asked to look into it later. */}
        {detail?.extraction_error && (
          <details className="il-tech-details">
            <summary>Technical details</summary>
            <pre>{detail.extraction_error}</pre>
          </details>
        )}

        <h3 className="il-detail__section">Transcript</h3>
        {detail?.transcript ? (
          // No `segments` and no `onSplitAtTurn`: this recording is already
          // filed against one appointment, so there is nothing to split it into
          // and no session dividers to draw.
          <UnmatchedTranscriptViewer
            transcript={detail.transcript}
            sessionTurns={detail.turns}
          />
        ) : failed ? (
          <p className="il-empty">{failed}</p>
        ) : detail ? (
          <p className="il-empty">
            This recording has no transcript saved, so there is nothing to read. That is the
            one case where the note cannot be recovered from what we have.
          </p>
        ) : (
          <SkeletonTranscript />
        )}
      </div>

      {canRetry && (
        <footer className="il-detail__actions">
          <Button
            variant="primary"
            disabled={busy}
            onClick={retry}
            title={
              row.reason === 'quota'
                ? 'This runs automatically when the allowance resets. Only worth forcing if you know the allowance is back.'
                : 'Read this session again from its transcript'
            }
          >
            {busy ? 'Starting…' : 'Read again'}
          </Button>
        </footer>
      )}
    </div>
  );
}
