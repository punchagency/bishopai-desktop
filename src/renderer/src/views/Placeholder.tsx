import type { ReactNode } from 'react';
import type { WorkflowStatus } from '../lib/types';

const STATUS_TEXT: Record<WorkflowStatus, string> = {
  live: 'Live',
  pending: 'Coming soon — blocked on an external dependency',
  planned: 'Planned',
};

/**
 * Shell for workflow sections whose backend isn't live yet (Checkout / Refills /
 * Engagement). Shows what the section will do + its dependency, then renders
 * representative sample content so the cockpit reads as a whole. Clearly marked
 * so nobody mistakes the sample rows for real data.
 */
export function Placeholder({
  title,
  status,
  blurb,
  dependency,
  children,
}: {
  title: string;
  status: WorkflowStatus;
  blurb: string;
  dependency?: string;
  children?: ReactNode;
}) {
  return (
    <section className="il-view">
      <div className="il-view__head">
        <div>
          <h1 className="il-view__title">{title}</h1>
          <p className="il-view__sub">{blurb}</p>
        </div>
      </div>

      <div className={`il-notice il-notice--${status}`}>
        <strong>{STATUS_TEXT[status]}.</strong>
        {dependency && <span> {dependency}</span>}
        <span> The layout below is a preview with sample data.</span>
      </div>

      {children}
    </section>
  );
}
