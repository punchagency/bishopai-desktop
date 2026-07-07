import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  meta?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export function Card({ title, meta, actions, children }: CardProps) {
  return (
    <div className="il-card">
      {(title || actions) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div style={{ minWidth: 0 }}>
            {title && <h3 className="il-card__title">{title}</h3>}
            {meta && <p className="il-card__meta">{meta}</p>}
          </div>
          {actions && <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{actions}</div>}
        </div>
      )}
      {children && <div style={{ marginTop: title ? '0.85rem' : 0 }}>{children}</div>}
    </div>
  );
}
