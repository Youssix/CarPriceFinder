import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.carlytics.fr';

export default function Signup() {
  const [step, setStep] = useState('email'); // 'email' | 'code' | 'setup-password'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tempApiKey, setTempApiKey] = useState('');
  const [tempEmail, setTempEmail] = useState('');
  const [tempStatus, setTempStatus] = useState('free');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleRequestCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/signup-free`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.alreadyPaid) {
          setError('Vous avez deja un compte payant. Connectez-vous avec votre mot de passe.');
          setTimeout(() => navigate('/login'), 2500);
          return;
        }
        throw new Error(data.error || 'Impossible d\'envoyer le code');
      }
      setStep('code');
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
      if (!res.ok) throw new Error(data.error || 'Code invalide ou expire');
      // Stocker temporairement et passer au setup mot de passe
      setTempApiKey(data.apiKey);
      setTempEmail(data.email);
      setTempStatus(data.status || 'free');
      setStep('setup-password');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleSetupPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Mot de passe trop court (8 caracteres minimum)');
      return;
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/update-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': tempApiKey,
        },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      // Login + redirect dashboard
      login(tempApiKey, tempEmail, tempStatus);
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
          {step === 'email' && 'Creer un compte gratuit'}
          {step === 'code' && 'Verifiez votre email'}
          {step === 'setup-password' && 'Choisissez un mot de passe'}
        </p>

        {error && <div className="error-message" role="alert">{error}</div>}

        {step === 'email' && (
          <form onSubmit={handleRequestCode}>
            <div className="form-group">
              <label htmlFor="signup-email">Email</label>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.fr"
                required
                autoComplete="email"
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? 'Envoi en cours...' : 'Recevoir le code par email'}
            </button>
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center', marginTop: '12px' }}>
              Gratuit pour tester, sans carte bancaire
            </p>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={handleVerifyCode}>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px', textAlign: 'center' }}>
              Un code a 6 chiffres a ete envoye a <strong>{email}</strong>
            </p>
            <div className="form-group">
              <label htmlFor="signup-code">Code de verification</label>
              <input
                id="signup-code"
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
              {loading ? 'Verification...' : 'Valider le code'}
            </button>
            <div style={{ textAlign: 'center', marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => { setStep('email'); setCode(''); setError(''); }}
                className="btn btn-link"
                style={{ fontSize: '12px' }}
              >
                Changer d'email
              </button>
            </div>
          </form>
        )}

        {step === 'setup-password' && (
          <form onSubmit={handleSetupPassword}>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px', textAlign: 'center' }}>
              Email verifie. Choisissez un mot de passe pour vous reconnecter facilement.
            </p>
            <div className="form-group">
              <label htmlFor="setup-password">Mot de passe</label>
              <input
                id="setup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                autoFocus
                minLength={8}
              />
            </div>
            <div className="form-group">
              <label htmlFor="setup-password-confirm">Confirmer le mot de passe</label>
              <input
                id="setup-password-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading || password.length < 8}>
              {loading ? 'Enregistrement...' : 'Creer mon compte'}
            </button>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', textAlign: 'center', marginTop: '12px' }}>
              8 caracteres minimum
            </p>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>Deja un compte ?</p>
          <a href="/login" style={{ fontSize: '13px', color: '#3b82f6', textDecoration: 'none' }}>
            Se connecter →
          </a>
        </div>
      </div>
    </div>
  );
}
