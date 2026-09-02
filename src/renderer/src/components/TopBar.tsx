import { StatusDot } from './StatusDot';
import { ThemeToggle } from './ThemeToggle';
import { Button } from './Button';
import type { PocketStatus } from '../lib/types';
import emblemUrl from '../assets/emblem.png';

interface TopBarProps {
  pocket: PocketStatus | null;
  backendOnline: boolean;
  onImport: () => void;
}

/**
 * How the recorder is doing, in a phrase.
 *
 * There is no button here any more. Pocket delivers to the backend, so there is
 * nothing on this machine to connect, retry, or approve — the honest thing to
 * show is whether sessions are arriving, and every fix for "they aren't" lives
 * on the server or in the Pocket app.
 */
function pocketLabel(p: PocketStatus | null): { state: 'connected' | 'connecting' | 'disconnected' | 'error'; text: string; title: string } {
  if (!p) return { state: 'disconnected', text: 'Recordings —', title: 'Checking with the backend…' };
  if (!p.configured && !p.webhookVerified) {
    return {
      state: 'error',
      text: 'Recordings not set up',
      title: 'No Pocket API key or webhook secret is configured on the server.',
    };
  }
  if (p.healthy) {
    const when = p.lastRecordingAt ? new Date(p.lastRecordingAt).toLocaleDateString() : '';
    return {
      state: 'connected',
      text: p.recordingsLast24h > 0 ? `Recordings · ${p.recordingsLast24h} today` : 'Recordings up to date',
      title: `Last recording arrived ${when}.`,
    };
  }
  // Configured but nothing has landed lately. Not an error — she may simply not
  // have recorded — so this stays a nudge rather than an alarm.
  return {
    state: 'connecting',
    text: p.lastRecordingAt ? 'No recent recordings' : 'Waiting for the first recording',
    title: p.lastRecordingAt
      ? `Nothing since ${new Date(p.lastRecordingAt).toLocaleDateString()}.`
      : 'Pocket is configured, but no recording has arrived yet.',
  };
}

export function TopBar({ pocket, backendOnline, onImport }: TopBarProps) {
  const p = pocketLabel(pocket);
  return (
    <header className="il-topbar">
      <span className="il-topbar__brand">
        <img className="il-topbar__logo" src={emblemUrl} alt="Innerlume" />
        Innerlume
      </span>
      <div className="il-topbar__spacer" />
      <span className="il-topbar__status" title={backendOnline ? 'Connected to the backend' : 'Backend unreachable'}>
        <StatusDot state={backendOnline ? 'connected' : 'error'} />
        {backendOnline ? 'Backend' : 'Backend offline'}
      </span>
      <span className="il-topbar__status" title={p.title}>
        <StatusDot state={p.state} />
        {p.text}
      </span>
      <div className="il-topbar__actions">
        <Button
          variant="secondary"
          size="sm"
          onClick={onImport}
          title="Paste or drop a transcript recorded elsewhere"
        >
          Import transcript
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
