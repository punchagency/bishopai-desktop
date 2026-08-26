import { EmptyState } from './EmptyState';
import { Button } from './Button';
import { IconAlertTriangle } from './Icons';
import { OFFLINE_MESSAGE } from '../lib/errors';

/**
 * What a view shows when it cannot load and sample data is not allowed (i.e.
 * anywhere but a local dev backend — see lib/preview.ts).
 *
 * Deliberately says nothing about the data. The previous behaviour substituted
 * a SAMPLE constant here, which answered "is my queue empty?" with a confident
 * and completely fabricated "no". An unreachable backend knows nothing about
 * the queue, and this screen says exactly that.
 *
 * Two different failures land here and they are not the same news, so they no
 * longer share one headline: nothing answered (check the connection) versus the
 * server answered badly (nothing to check, try again shortly). `detail` arrives
 * already in plain language from lib/errors.ts — this only decides which of the
 * two it is, and never prints a status code either way.
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
  const offline = !detail || detail === OFFLINE_MESSAGE;
  return (
    <section className="il-view">
      <EmptyState
        icon={<IconAlertTriangle size={24} />}
        title={offline ? "Can't reach the server" : "Couldn't load this screen"}
        action={onRetry ? <Button variant="primary" onClick={onRetry}>Try again</Button> : undefined}
      >
        {offline ? (
          <>
            Nothing on this screen could be loaded, so it isn't showing you anything — an empty
            list here would be a guess, not an answer. Check your internet connection and try
            again.
          </>
        ) : (
          <>
            {detail} Nothing on this screen could be loaded, so it isn't showing you anything —
            an empty list here would be a guess, not an answer.
          </>
        )}
        <br />
        {/* The address, not a status code: it is what identifies WHICH server
            this install talks to when someone needs to ask for help. */}
        <span className="il-conn__meta">{backendUrl}</span>
      </EmptyState>
    </section>
  );
}
