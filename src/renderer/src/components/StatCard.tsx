import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'accent' | 'success' | 'warning' | 'neutral';
}

export function StatCard({ label, value, hint, tone = 'neutral' }: StatCardProps) {
  return (
    <div className={`il-stat il-stat--${tone}`}>
      <span className="il-stat__value">{value}</span>
      <span className="il-stat__label">{label}</span>
      {hint && <span className="il-stat__hint">{hint}</span>}
    </div>
  );
}
