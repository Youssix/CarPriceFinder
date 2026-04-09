import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
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

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-logo">Carlytics</h1>
        <p className="login-subtitle">Tableau de bord</p>

        {error && <div className="error-message" role="alert">{error}</div>}

        <form onSubmit={handleSubmit}>
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
        </form>

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <a href="/reset-password" className="btn btn-link">
            Mot de passe oublié ?
          </a>
        </div>

        <div style={{ textAlign: 'center', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>Pas encore de compte ?</p>
          <a href="/signup" style={{ fontSize: '14px', color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}>
            Créer un compte gratuit →
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
