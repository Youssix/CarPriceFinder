import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';

export default function Login() {
  const [mode, setMode] = useState('password'); // 'password' | 'otp-request' | 'otp-verify'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
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

  const handleOtpRequest = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/request-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur envoi code');
      setMode('otp-verify');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleOtpVerify = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Code invalide');
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
        <p className="login-subtitle">Tableau de bord</p>

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
            <div style={{ textAlign: 'center', marginTop: '12px' }}>
              <button type="button" className="btn btn-link" onClick={() => { setMode('otp-request'); setError(''); }}>
                Se connecter avec un code par email →
              </button>
            </div>
          </form>
        )}

        {mode === 'otp-request' && (
          <form onSubmit={handleOtpRequest}>
            <div className="form-group">
              <label htmlFor="otp-email">Email</label>
              <input id="otp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.fr" required autoFocus />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? 'Envoi...' : 'Recevoir un code →'}
            </button>
            <div style={{ textAlign: 'center', marginTop: '12px' }}>
              <button type="button" className="btn btn-link" onClick={() => { setMode('password'); setError(''); }}>
                ← Connexion avec mot de passe
              </button>
            </div>
          </form>
        )}

        {mode === 'otp-verify' && (
          <form onSubmit={handleOtpVerify}>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '16px', textAlign: 'center' }}>
              Code envoyé à <strong style={{ color: 'rgba(255,255,255,0.8)' }}>{email}</strong>
            </p>
            <div className="form-group">
              <label htmlFor="otp-code">Code à 6 chiffres</label>
              <input id="otp-code" type="text" value={otpCode} onChange={(e) => setOtpCode(e.target.value)}
                placeholder="123456" maxLength={6} required autoFocus
                style={{ textAlign: 'center', letterSpacing: '8px', fontSize: '20px' }} />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? 'Vérification...' : 'Confirmer →'}
            </button>
            <div style={{ textAlign: 'center', marginTop: '12px' }}>
              <button type="button" className="btn btn-link" onClick={() => { setMode('otp-request'); setError(''); }}>
                ← Changer d'email
              </button>
            </div>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>Pas encore de compte ?</p>
          <a href="https://carlytics.fr/#pricing" target="_blank" rel="noopener noreferrer"
            className="btn btn-link" style={{ fontSize: '13px' }}>
            Voir les offres →
          </a>
        </div>

        <div style={{ textAlign: 'center', marginTop: '12px' }}>
          <a href="https://carlytics.fr" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)', textDecoration: 'none' }}>
            ← Retour à carlytics.fr
          </a>
        </div>
      </div>
    </div>
  );
}
