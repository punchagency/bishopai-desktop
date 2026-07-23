import { useCallback, useEffect, useState } from 'react';
import { Badge } from '../components/Badge';
import { fetchUnmatched } from '../lib/api';
import { formatDate } from '../lib/format';
import { EmptyState } from '../components/EmptyState';
import { InfoPopover } from '../components/InfoPopover';
import type { UnmatchedConversation } from '../lib/types';
import { UnmatchedDetail } from './UnmatchedDetail';

const SAMPLE: UnmatchedConversation[] = [
  {
    id: 's1',
    bee_id: 'bee-unmatched-1',
    starts_at: new Date(Date.now() - 3 * 3600e3).toISOString(),
    ends_at: new Date(Date.now() - 2.5 * 3600e3).toISOString(),
    correlation_status: 'unmatched',
    transcript_preview: 'Nicole: quick chat about supplement timing. Client: I take them at night.',
  },
];

export function UnmatchedView({ backendUrl, onChanged }: { backendUrl: string; onChanged?: () => void }) {
  const [rows, setRows] = useState<UnmatchedConversation[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [selected, setSelected] = useState<UnmatchedConversation | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) =>
      fetchUnmatched(backendUrl, signal)
        .then((d) => {
          setRows(d.conversations);
          setOffline(false);
          // Drop a selection whose recording is gone — matched away, or reseeded
          // underneath us — so the detail pane never sits on a dead id.
          setSelected((cur) =>
            cur && d.conversations.some((c) => c.id === cur.id) ? cur : null,
          );
        })
        .catch(() => {
          setRows(SAMPLE);
          setOffline(true);
        }),
    [backendUrl],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const list = rows ?? SAMPLE;

  return (
    <section className="il-view">
      <div className="il-view__head">
        <div>
          <h1 className="il-view__title">
            Unmatched Conversations{' '}
            <InfoPopover label="What are unmatched conversations?" title="How this works">
              Bee captures each session's conversation and we try to tie it to the right appointment
              automatically. When we can't be sure, it lands here — you pick the client, and it flows
              into the review pipeline like any other session. We never auto-guess the match.
            </InfoPopover>
          </h1>
          <p className="il-view__sub">
            Bee conversations we couldn't tie to an appointment — open one to read it in full and tag
            the client (we never auto-guess){offline && ' · offline preview'}
          </p>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="il-view__empty">
          <EmptyState variant="unmatched" />
        </div>
      ) : (
        /* Split pane: the recordings list stays on screen while one is open, so
           Nicole keeps her place. Collapses to one column on narrow windows. */
        <div className={`il-split il-split--unmatched ${selected ? 'il-split--open' : ''}`}>
          <div className="il-split__list">
            {list.map((c) => (
              <UnmatchedRow
                key={c.id}
                conversation={c}
                active={selected?.id === c.id}
                onOpen={() => setSelected(c)}
              />
            ))}
          </div>

          <div className="il-split__detail">
            {selected ? (
              <UnmatchedDetail
                key={selected.id}
                backendUrl={backendUrl}
                conversation={selected}
                onClose={() => setSelected(null)}
                onMatched={() => {
                  load();
                  onChanged?.();
                }}
              />
            ) : (
              <div className="il-split__placeholder">
                <p>Pick a recording to read it here.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * One line in the recordings list. Time first — that's how Nicole places a
 * recording — with a short preview underneath, dialled down to a scannable row.
 */
function UnmatchedRow({
  conversation,
  active,
  onOpen,
}: {
  conversation: UnmatchedConversation;
  active: boolean;
  onOpen: () => void;
}) {
  const time = new Date(conversation.starts_at).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <div className={`il-qrow ${active ? 'il-qrow--on' : ''}`}>
      <button className="il-qrow__main" onClick={onOpen} aria-current={active}>
        <span className="il-qrow__status il-qrow__status--in_review" title="Unmatched" />
        <span className="il-qrow__text">
          <span className="il-qrow__name" title={formatDate(conversation.starts_at)}>{time}</span>
          <span className="il-qrow__meta" title={conversation.transcript_preview}>
            {conversation.transcript_preview || '(no transcript)'}
          </span>
        </span>
      </button>
    </div>
  );
}
