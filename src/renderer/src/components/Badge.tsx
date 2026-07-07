import type { ReactNode } from 'react';

type Tone = 'accent' | 'neutral' | 'success' | 'warning';

export function Badge({
  tone = 'neutral',
  children,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  /** Optional hover tooltip — e.g. an explanation of what a status means. */
  title?: string;
}) {
  return (
    <span className={`il-badge il-badge--${tone}`} title={title}>
      {children}
    </span>
  );
}
