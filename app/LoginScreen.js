'use client';
import { useState } from 'react';

export default function LoginScreen() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      window.location.reload();
    } else {
      setError('Incorrect password');
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">SLAN<span>.</span></div>
        <div className="login-sub">Lead Intelligence Console</div>
        <h1>Sign in</h1>
        <p>This console manages live broker leads. Sessions persist for 30 days.</p>
        <form onSubmit={submit}>
          <label>Access password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            placeholder="••••••••"
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Enter console'}
          </button>
          {error && <div className="login-error">{error}</div>}
        </form>
      </div>
    </div>
  );
}
