import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.carlytics.fr';

export default function Login() {
  // 'password' = email + mot de passe, 'otp-email' = demander code, 'otp-code' = saisir code
  const [mode, setMode] = useState('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.loginWithPassword(email, password);
      login(data.apiKey, data.email, data.status || 'active');
      navigate('/');
    } catch (err) {
      setError(err.message || 'Email ou mot de passe incorrect');
    }
    setLoading(false);
  };

  const handleRequestCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/request-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Impossible d\'envoyer le code');
      setMode('otp-code');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Code invalide ou expiré');
      login(data.apiKey, data.email, data.status || 'free');
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-logo">Carlytics</h1>
        <p className="login-subtitle">
          {mode === 'password' && 'Tableau de bord'}
          {mode === 'otp-email' && 'Connexion par code email'}
          {mode === 'otp-code' && 'Vérifiez votre email'}
        </p>

        {error && <div className="error-message" role="alert">{error}</div>}

        {mode === 'password' && (
          <form onSubmit={handlePasswordLogin}>
            <div className="form-group">
              <label htmlFor="login-email">Email</label>
              <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.fr" required autoComplete="email" autoFocus />
            </div>
            <div className="form-group">
              <label htmlFor="login-password">Mot de passe</label>
              <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" required autoComplete="current-password" />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>

            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => { setMode('otp-email'); setError(''); setPassword(''); }}
                className="btn btn-link"
                style={{ fontSize: '13px' }}
              >
                Pas de mot de passe ? Recevoir un code par email
              </button>
            </div>

            <div style={{ textAlign: 'center', marginTop: '8px' }}>
              <a href="/reset-password" className="btn btn-link" style={{ fontSize: '12px' }}>
                Mot de passe oublié ?
              </a>
            </div>
          </form>
        )}

        {mode === 'otp-email' && (
          <form onSubmit={handleRequestCode}>
            <div className="form-group">
              <label htmlFor="otp-login-email">Email</label>
              <input id="otp-login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.fr" required autoComplete="email" autoFocus />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? 'Envoi en cours...' : 'Recevoir le code par email'}
            </button>
            <div style={{ textAlign: 'center', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => { setMode('password'); setError(''); setCode(''); }}
                className="btn btn-link"
                style={{ fontSize: '12px' }}
              >
                ← Connexion par mot de passe
              </button>
            </div>
          </form>
        )}

        {mode === 'otp-code' && (
          <form onSubmit={handleVerifyCode}>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px', textAlign: 'center' }}>
              Un code à 6 chiffres a été envoyé à <strong>{email}</strong>
            </p>
            <div className="form-group">
              <label htmlFor="login-code">Code de vérification</label>
              <input
                id="login-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                required
                autoFocus
                style={{ letterSpacing: '4px', textAlign: 'center', fontSize: '18px' }}
              />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading || code.length !== 6}>
              {loading ? 'Vérification...' : 'Se connecter'}
            </button>
            <div style={{ textAlign: 'center', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => { setMode('otp-email'); setCode(''); setError(''); }}
                className="btn btn-link"
                style={{ fontSize: '12px' }}
              >
                Changer d'email
              </button>
            </div>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>Pas encore de compte ?</p>
          <a href="/signup" style={{ fontSize: '14px', color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}>
            Créer un compte gratuit →
          </a>
        </div>

        <div style={{ textAlign: 'center', marginTop: '12px' }}>
          <a href="https://carlytics.fr" style={{ fontSize: '12px', color: 'var(--color-text-muted)', textDecoration: 'none' }}>
            ← Retour à carlytics.fr
          </a>
        </div>
      </div>
    </div>
  );
}
