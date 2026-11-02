import { useState } from 'react';
import { api, type Role } from './api';

export function LoginForm({ onSuccess, viewerHint }: { onSuccess: (role: Role) => void; viewerHint?: boolean }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="login-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const r = await api.login(password);
          onSuccess(r.role);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="field">
        <span>Adgangskode</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </label>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary" disabled={busy || !password}>
        {busy ? 'Logger ind…' : 'Log ind'}
      </button>
      {viewerHint && <p className="muted small">Brug administratoradgangskoden for at redigere eller læseadgangskoden for at se skemaet.</p>}
    </form>
  );
}

export function LoginPage({ title, subtitle, onSuccess, viewerHint }: { title: string; subtitle: string; onSuccess: (role: Role) => void; viewerHint?: boolean }) {
  return (
    <div className="login-page">
      <div className="login-card">
        <span className="brand-kicker">Balletskolen · Ugeskema</span>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
        <LoginForm onSuccess={onSuccess} viewerHint={viewerHint} />
      </div>
    </div>
  );
}
