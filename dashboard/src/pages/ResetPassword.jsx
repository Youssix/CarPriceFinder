import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.carlytics.fr';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas'); return; }
    if (password.length < 8) { setError('8 caractères minimum'); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lien invalide ou expiré');
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  if (!token) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1 className="login-logo">Carlytics</h1>
          <div className="error-message">Lien invalide. Demandez un nouveau lien depuis les paramètres.</div>
          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <a href="/login" style={{ color: '#3b82f6', fontSize: '13px' }}>← Retour à la connexion</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-logo">Carlytics</h1>
        <p className="login-subtitle">Nouveau mot de passe</p>

        {success ? (
          <div style={{ textAlign: 'center', color: '#16a34a', fontSize: '14px', padding: '16px 0' }}>
            Mot de passe mis à jour. Redirection...
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="error-message" role="alert">{error}</div>}
            <div className="form-group">
              <label htmlFor="rp-password">Nouveau mot de passe</label>
              <input id="rp-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="8 caractères minimum" minLength={8} required autoFocus />
            </div>
            <div className="form-group">
              <label htmlFor="rp-confirm">Confirmer</label>
              <input id="rp-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••" minLength={8} required />
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? 'Enregistrement...' : 'Enregistrer →'}
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <a href="/login" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)', textDecoration: 'none' }}>
            ← Retour à la connexion
          </a>
        </div>
      </div>
    </div>
  );
}
