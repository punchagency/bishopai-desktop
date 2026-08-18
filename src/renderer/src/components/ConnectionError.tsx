import { EmptyState } from './EmptyState';
import { Button } from './Button';
import { IconAlertTriangle } from './Icons';

/**
 * What a view shows when it cannot reach the backend and sample data is not
 * allowed (i.e. anywhere but a local dev backend — see lib/preview.ts).
 *
 * Deliberately says nothing about the data. The previous behaviour substituted
 * a SAMPLE constant here, which answered "is my queue empty?" with a confident
 * and completely fabricated "no". An unreachable backend knows nothing about
 * the queue, and this screen says exactly that.
 */
export function ConnectionError({
  backendUrl,
  detail,
  onRetry,
}: {
  backendUrl: string;
  detail?: string | null;
  onRetry?: () => void;
}) {
  return (
    <section className="il-view">
      <EmptyState
        icon={<IconAlertTriangle size={24} />}
        title="Can't reach the server"
        action={onRetry ? <Button variant="primary" onClick={onRetry}>Try again</Button> : undefined}
      >
        Nothing on this screen could be loaded, so it isn't showing you anything — an empty
        list here would be a guess, not an answer. Check your internet connection and try
        again.
        <br />
        <span className="il-conn__meta">{backendUrl}{detail ? ` — ${detail}` : ''}</span>
      </EmptyState>
    </section>
  );
}
