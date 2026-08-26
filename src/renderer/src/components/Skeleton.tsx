// Loading skeletons — shimmering placeholders that mirror a view's real layout
// (header, optional stat row, card grid) so the jump to loaded content is
// seamless rather than a spinner-to-content pop. Shimmer is pure CSS (.il-skel)
// and stills under prefers-reduced-motion via the global motion guard.

/** A single shimmering block. Size via width/height (any CSS length). */
export function Skeleton({
  width = '100%',
  height = '1rem',
  radius,
  className,
}: {
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  className?: string;
}) {
  return (
    <span
      className={`il-skel${className ? ` ${className}` : ''}`}
      style={{ width, height, ...(radius != null ? { borderRadius: radius } : {}) }}
    />
  );
}

function SkeletonCard() {
  return (
    <div className="il-card il-skel-card">
      <div className="il-skel-card__head">
        <div className="il-skel-card__titles">
          <Skeleton width="62%" height="1rem" />
          <Skeleton width="40%" height="0.75rem" />
        </div>
        <Skeleton width="3.4rem" height="1.35rem" radius="999px" />
      </div>
      <Skeleton width="90%" height="0.7rem" />
      <Skeleton width="55%" height="0.7rem" />
    </div>
  );
}

/**
 * Full-view loading state: a header block, an optional stat row, and a grid of
 * placeholder cards — optionally beside a feed column (twoCol) for views like
 * Engagement/Overview.
 */
export function SkeletonView({
  stats = 0,
  cards = 6,
  twoCol = false,
  feedRows = 5,
}: {
  stats?: number;
  cards?: number;
  twoCol?: boolean;
  feedRows?: number;
}) {
  const grid = (
    <div className="il-grid">
      {Array.from({ length: cards }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );

  return (
    <section className="il-view" aria-busy="true">
      <div className="il-view__head">
        <Skeleton width="16rem" height="1.6rem" />
        <div style={{ marginTop: '0.5rem' }}>
          <Skeleton width="22rem" height="0.85rem" />
        </div>
      </div>

      {stats > 0 && (
        <div className="il-stats">
          {Array.from({ length: stats }).map((_, i) => (
            <div key={i} className="il-stat il-skel-card">
              <Skeleton width="3.5rem" height="1.6rem" />
              <Skeleton width="70%" height="0.7rem" />
            </div>
          ))}
        </div>
      )}

      {twoCol ? (
        <div className="il-cols">
          {grid}
          <div className="il-card il-skel-card">
            <Skeleton width="45%" height="1rem" />
            <div className="il-skel-feed">
              {Array.from({ length: feedRows }).map((_, i) => (
                <Skeleton key={i} width={`${90 - i * 6}%`} height="0.8rem" />
              ))}
            </div>
          </div>
        </div>
      ) : (
        grid
      )}
    </section>
  );
}

/**
 * Placeholder rows for a narrow list column.
 *
 * `SkeletonView` is a whole-PAGE shape — a title block, an optional stat row, a
 * card grid — so dropping it into a 20rem list column paints a fake page header
 * where the list belongs and cards wider than the column. This is the list's
 * own shape: two lines per row, ragged widths so it reads as text rather than
 * as a progress bar.
 */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="il-skel-rows" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="il-skel-row">
          <Skeleton width={`${52 + ((i * 17) % 32)}%`} height="0.9rem" />
          <Skeleton width={`${64 + ((i * 11) % 26)}%`} height="0.7rem" />
        </div>
      ))}
    </div>
  );
}

/**
 * Placeholder for the transcript reader — the search bar, then turns.
 *
 * Replaces the words "Loading transcript…", which said the right thing in the
 * wrong register: a line of prose where a document is about to appear reads as
 * the answer ("this session's transcript is: Loading transcript…") rather than
 * as the wait. Turns alternate sides and vary in length, so the pane it stands
 * in for is recognisable before a word of it has arrived.
 */
export function SkeletonTranscript({ turns = 6 }: { turns?: number }) {
  return (
    <div className="il-skel-tx" aria-busy="true" aria-label="Loading transcript">
      <div className="il-skel-tx__bar">
        <Skeleton width="11rem" height="1.7rem" radius="6px" />
        <Skeleton width="4.5rem" height="0.75rem" />
      </div>
      <div className="il-skel-tx__body">
        {Array.from({ length: turns }).map((_, i) => (
          <div key={i} className={`il-skel-tx__turn${i % 2 ? ' il-skel-tx__turn--alt' : ''}`}>
            <Skeleton width="6.5rem" height="0.7rem" />
            <Skeleton width={`${94 - ((i * 13) % 34)}%`} height="0.8rem" />
            {i % 3 !== 0 && <Skeleton width={`${68 - ((i * 9) % 24)}%`} height="0.8rem" />}
          </div>
        ))}
      </div>
    </div>
  );
}
