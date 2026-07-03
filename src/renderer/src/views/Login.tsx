import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { login } from '../lib/api';

// Shown only when Nicole has turned login on (auth status.enabled). Exchanges
// the password for a session token; the app persists it and proceeds.
export function Login({
  backendUrl,
  onAuthenticated,
}: {
  backendUrl: string;
  onAuthenticated: (token: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const token = await login(backendUrl, password);
      if (!token) {
        setError('Incorrect password.');
        return;
      }
      onAuthenticated(token);
    } catch {
      setError('Could not reach the backend.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="il-login">
      <form className="il-login__card il-form" onSubmit={submit}>
        <div>
          <h1 className="il-login__title">Innerlume</h1>
          <p className="il-login__sub">Enter your password to open the dashboard.</p>
        </div>
        <div className="il-field">
          <label className="il-field__label" htmlFor="il-login-pw">Password</label>
          <input
            id="il-login-pw"
            className="il-input"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="il-error">{error}</p>}
        <Button type="submit" variant="primary" disabled={busy || !password}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </Button>
      </form>
    </div>
  );
}
