import { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { fetchAuthStatus, login, updateAuthSettings } from '../lib/api';
import { CustomerMapCard } from './CustomerMapCard';
import { OutlookCard } from './OutlookCard';
import type { AuthStatus } from '../lib/types';

// Settings — where Nicole controls the local dashboard login: turn it on/off and
// set/change the password. Enforcement is server-side; this just drives it.
export function SettingsView({
  backendUrl,
  token,
  onAuthChanged,
  onLock,
  onShowOnboarding,
}: {
  backendUrl: string;
  token: string | null;
  onAuthChanged: (status: AuthStatus, token?: string | null) => void;
  onLock: () => void;
  onShowOnboarding?: () => void;
}) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    fetchAuthStatus(backendUrl)
      .then((s) => {
        setStatus(s);
        setEnabled(s.enabled);
        setOffline(false);
      })
      .catch(() => setOffline(true));
  }, [backendUrl]);

  const save = async () => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const body: { enabled?: boolean; password?: string } = { enabled };
      if (password) body.password = password;
      const next = await updateAuthSettings(backendUrl, body, token);

      // If she just turned login on and set a password, log her in seamlessly so
      // she isn't immediately bounced to the login screen.
      let nextToken: string | null | undefined = undefined;
      if (next.enabled && !token && password) {
        nextToken = await login(backendUrl, password).catch(() => null);
      }
      setStatus(next);
      setPassword('');
      setMsg('Saved.');
      onAuthChanged(next, nextToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setBusy(false);
    }
  };

  const dirty = status ? enabled !== status.enabled || password.length > 0 : false;
  const needsPassword = enabled && status !== null && !status.configured && password.length === 0;

  return (
    <section className="il-view">
      <div className="il-view__head">
        <div>
          <h1 className="il-view__title">Settings</h1>
          <p className="il-view__sub">
            Dashboard access
            {offline && <Badge tone="warning">&nbsp;backend offline&nbsp;</Badge>}
          </p>
          {onShowOnboarding && (
            <button className="il-link" onClick={onShowOnboarding}>Show welcome guide</button>
          )}
        </div>
      </div>

      <Card
        title="Require a password to open the dashboard"
        meta={status?.enabled ? 'Login is on' : 'Login is off'}
        actions={<Badge tone={status?.enabled ? 'accent' : 'neutral'}>{status?.enabled ? 'on' : 'off'}</Badge>}
      >
        <label className="il-row" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} disabled={offline} onChange={(e) => setEnabled(e.target.checked)} />
          <span>Require password on launch</span>
        </label>

        <div className="il-field" style={{ marginTop: '0.4rem' }}>
          <label className="il-field__label" htmlFor="il-set-pw">
            {status?.configured ? 'Change password' : 'Set password'} (min 6 characters)
          </label>
          <input
            id="il-set-pw"
            className="il-input"
            type="password"
            placeholder={status?.configured ? 'Leave blank to keep current' : 'Choose a password'}
            value={password}
            disabled={offline}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="il-card__row" style={{ marginTop: '0.7rem' }}>
          {error && <span className="il-error">{error}</span>}
          {msg && !error && <span className="il-error" style={{ color: 'var(--text-muted)' }}>{msg}</span>}
          {status?.enabled && token && (
            <Button variant="ghost" onClick={onLock}>
              Lock now
            </Button>
          )}
          <Button
            variant="primary"
            disabled={busy || offline || !dirty || needsPassword || (password.length > 0 && password.length < 6)}
            onClick={save}
          >
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
        {needsPassword && <p className="il-view__sub">Set a password before turning login on.</p>}
      </Card>

      <OutlookCard backendUrl={backendUrl} />

      <CustomerMapCard backendUrl={backendUrl} />
    </section>
  );
}
