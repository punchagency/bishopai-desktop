import type { ReactNode } from 'react';

// A proper empty state — an emblem, a reassuring title, and a line explaining
// *why* it's empty and what will make something appear here. Used wherever a
// list can legitimately have zero rows, so a blank view never reads as "broken".

export function EmptyState({
  icon = '🌿',
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="il-emptystate">
      <div className="il-emptystate__icon" aria-hidden="true">
        {icon}
      </div>
      <h3 className="il-emptystate__title">{title}</h3>
      {children && <p className="il-emptystate__body">{children}</p>}
      {action && <div className="il-emptystate__action">{action}</div>}
    </div>
  );
}
