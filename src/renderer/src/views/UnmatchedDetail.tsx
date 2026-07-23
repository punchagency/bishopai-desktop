import { useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { InfoPopover } from '../components/InfoPopover';
import { fetchUnmatchedDetail } from '../lib/api';
import { formatDate, humanize } from '../lib/format';
import type { UnmatchedConversation, UnmatchedDetail as Detail } from '../lib/types';
import { MatchModal } from './MatchModal';

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

export function UnmatchedDetail({ backendUrl, conversation, onClose, onMatched }: Props) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);
  const [matching, setMatching] = useState(false);
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
          <span className="il-detail__kind">Bee recording</span>
          <InfoPopover label="Why is this here?" title="Unmatched recordings">
            Bee captured this conversation but we couldn't tie it to an appointment with
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
            <dt>Bee ID</dt>
            <dd className="il-meta__mono">{conversation.bee_id}</dd>
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
          <div className="il-transcript">{transcript}</div>
        ) : failed ? (
          <p className="il-empty">
            This recording couldn't be opened — it may have just been matched from another window.
            Pick another from the list.
          </p>
        ) : isSample ? (
          <p className="il-empty">The full transcript needs a running backend — this is offline sample data.</p>
        ) : (
          <p className="il-empty">Loading transcript…</p>
        )}
      </div>

      {/* Sticky, so the assign action stays reachable however long the transcript runs. */}
      <footer className="il-detail__actions">
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
    </div>
  );
}
