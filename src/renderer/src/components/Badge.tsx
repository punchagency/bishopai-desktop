import type { ReactNode } from 'react';

type Tone = 'accent' | 'neutral' | 'success' | 'warning';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`il-badge il-badge--${tone}`}>{children}</span>;
}
