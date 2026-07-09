import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  meta?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export function Card({ title, meta, badge, actions, children }: CardProps) {
  return (
    <div className="il-card">
      {(title || badge || actions) && (
        <div>
          {(badge || actions) && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.35rem' }}>
              {badge ?? actions}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
            <div style={{ minWidth: 0 }}>
              {title && <h3 className="il-card__title">{title}</h3>}
              {meta && <p className="il-card__meta" style={{ marginTop: '0.3rem' }}>{meta}</p>}
            </div>
            {badge && actions && <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{actions}</div>}
          </div>
        </div>
      )}
      {children && <div style={{ marginTop: title ? '0.85rem' : 0 }}>{children}</div>}
    </div>
  );
}
