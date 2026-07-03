import type { ReactNode } from 'react';

export interface FeedRow {
  id: string;
  dot?: 'accent' | 'success' | 'warning' | 'danger' | 'neutral';
  title: ReactNode;
  meta?: string;
}

export function Feed({ title, rows, empty }: { title: string; rows: FeedRow[]; empty?: string }) {
  return (
    <div className="il-card">
      <h3 className="il-card__title">{title}</h3>
      {rows.length === 0 ? (
        <p className="il-card__meta" style={{ marginTop: '0.6rem' }}>
          {empty ?? 'Nothing yet.'}
        </p>
      ) : (
        <ul className="il-feed">
          {rows.map((r) => (
            <li key={r.id} className="il-feed__row">
              <span className={`il-dot il-dot--${dotClass(r.dot)}`} />
              <span className="il-feed__title">{r.title}</span>
              {r.meta && <span className="il-feed__meta">{r.meta}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Map feed dot tone to the existing status-dot classes.
function dotClass(d?: FeedRow['dot']): string {
  switch (d) {
    case 'success':
      return 'connected';
    case 'warning':
      return 'connecting';
    case 'danger':
      return 'error';
    default:
      return 'disconnected';
  }
}
