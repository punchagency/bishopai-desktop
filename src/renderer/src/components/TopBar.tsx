import { StatusDot } from './StatusDot';
import { ThemeToggle } from './ThemeToggle';
import { Button } from './Button';
import type { BeePhase, CourierState } from '../lib/types';

interface TopBarProps {
  courierState: CourierState;
  courierPhase: BeePhase;
  courierMessage: string;
  backendOnline: boolean;
  onConnectBee: () => void;
}

// Onboarding-aware button copy. A Bee action is always available except once
// connected — so a stalled/failed login can always be restarted. Driven by
// `state` (always present) so it works even if `phase` is absent.
function beeButtonLabel(state: CourierState, phase?: BeePhase): string | null {
  if (state === 'connected') return null;
  if (state === 'error' || phase === 'attention') return 'Retry Bee';
  if (state === 'connecting' || phase === 'approving') return 'Start over';
  return 'Connect Bee';
}

export function TopBar({ courierState, courierPhase, courierMessage, backendOnline, onConnectBee }: TopBarProps) {
  const buttonLabel = beeButtonLabel(courierState, courierPhase);
  return (
    <header className="il-topbar">
      <span className="il-topbar__brand">
        <img className="il-topbar__logo" src="/mark.png" alt="Innerlume" />
        Innerlume
      </span>
      <div className="il-topbar__spacer" />
      <span className="il-topbar__status" title={backendOnline ? 'Connected to the backend' : 'Backend unreachable'}>
        <StatusDot state={backendOnline ? 'connected' : 'error'} />
        {backendOnline ? 'Backend' : 'Backend offline'}
      </span>
      <span className="il-topbar__status" title={courierMessage}>
        <StatusDot state={courierState} />
        {courierMessage}
      </span>
      <div className="il-topbar__actions">
        {buttonLabel && (
          <Button variant="secondary" onClick={onConnectBee}>
            {buttonLabel}
          </Button>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}
