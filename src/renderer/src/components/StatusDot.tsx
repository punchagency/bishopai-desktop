type State = 'connected' | 'connecting' | 'disconnected' | 'error';

export function StatusDot({ state }: { state: State }) {
  return <span className={`il-dot il-dot--${state}`} aria-label={state} />;
}
