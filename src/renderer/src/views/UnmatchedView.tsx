import { useCallback, useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { fetchUnmatched } from '../lib/api';
import { humanize } from '../lib/format';
import { EmptyState } from '../components/EmptyState';
import { InfoPopover } from '../components/InfoPopover';
import type { UnmatchedConversation } from '../lib/types';
import { MatchModal } from './MatchModal';

const SAMPLE: UnmatchedConversation[] = [
  {
    id: 's1',
    bee_id: 'bee-unmatched-1',
    starts_at: new Date(Date.now() - 3 * 3600e3).toISOString(),
    ends_at: new Date().toISOString(),
    correlation_status: 'unmatched',
    transcript_preview: 'Nicole: quick chat about supplement timing. Client: I take them at night.',
  },
];

export function UnmatchedView({ backendUrl, onChanged }: { backendUrl: string; onChanged?: () => void }) {
  const [rows, setRows] = useState<UnmatchedConversation[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [matching, setMatching] = useState<UnmatchedConversation | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) =>
      fetchUnmatched(backendUrl, signal)
        .then((d) => {
          setRows(d.conversations);
          setOffline(false);
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
            Bee conversations we couldn't tie to an appointment — tag the client manually (we never
            auto-guess){offline && ' · offline preview'}
          </p>
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState title="Everything's matched">
          Bee conversations we can't automatically tie to an appointment land here so you can tag the
          client by hand. There's nothing waiting right now.
        </EmptyState>
      ) : (
        <div className="il-grid">
          {list.map((c) => (
            <Card
              key={c.id}
              title={new Date(c.starts_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              meta={`${c.bee_id}`}
              actions={<Badge tone="warning">{humanize(c.correlation_status ?? 'unmatched')}</Badge>}
            >
              <p className="il-preview">{c.transcript_preview || '(no transcript)'}</p>
              <div className="il-card__row">
                <Button variant="secondary" onClick={() => setMatching(c)}>
                  Match to appointment
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {matching && (
        <MatchModal
          backendUrl={backendUrl}
          conversation={matching}
          onClose={() => setMatching(null)}
          onMatched={() => {
            load();
            onChanged?.();
          }}
        />
      )}
    </section>
  );
}
