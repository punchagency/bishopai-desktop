import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'accent' | 'success' | 'warning' | 'neutral';
  onClick?: () => void;
  active?: boolean;
}

export function StatCard({ label, value, hint, tone = 'neutral', onClick, active }: StatCardProps) {
  const cardContent = (
    <div
      className={`il-stat il-stat--${tone}${active ? ' il-stat--active' : ''}${onClick ? ' il-stat--interactive' : ''}`}
      style={onClick ? { cursor: 'pointer', transition: 'all 0.15s ease' } : undefined}
    >
      <span className="il-stat__value">{value}</span>
      <span className="il-stat__label">{label}</span>
      {hint && <span className="il-stat__hint">{hint}</span>}
    </div>
  );

  if (onClick) {
    return (
      <button
        className="il-stat-btn"
        onClick={onClick}
        style={{ display: 'flex', width: '100%', border: 'none', background: 'none', padding: 0 }}
        aria-pressed={active}
      >
        {cardContent}
      </button>
    );
  }

  return cardContent;
}
