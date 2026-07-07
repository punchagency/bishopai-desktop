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
