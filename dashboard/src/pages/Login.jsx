import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';

export default function Login() {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.requestCode(email);
      setStep('code');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.verifyCode(email, code);
      login(data.apiKey, email);
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleApiKeyLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      localStorage.setItem('apiKey', apiKey);
      const data = await api.checkSubscription();
      if (data.active) {
        login(apiKey, data.email);
        navigate('/');
      } else {
        setError('Cle API inactive ou expiree');
        localStorage.removeItem('apiKey');
      }
    } catch (err) {
      setError('Cle API invalide');
      localStorage.removeItem('apiKey');
    }
    setLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-logo">Carlytics</h1>
        <p className="login-subtitle">Trouvez les meilleures affaires VO</p>

        {error && (
          <div className="error-message" role="alert">{error}</div>
        )}

        {step === 'email' && (
          <>
            <form onSubmit={handleEmailSubmit}>
              <div className="form-group">
                <label htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.fr"
                  required
                  autoComplete="email"
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary btn-full"
                disabled={loading}
              >
                {loading ? 'Envoi...' : 'Recevoir le code'}
              </button>
            </form>
            <div className="login-divider"><span>ou</span></div>
            <button
              className="btn btn-secondary btn-full"
              onClick={() => setStep('apikey')}
              type="button"
            >
              Connexion avec cle API
            </button>
          </>
        )}

        {step === 'code' && (
          <form onSubmit={handleCodeSubmit}>
            <p className="code-info">
              Un code a 6 chiffres a ete envoye a <strong>{email}</strong>
            </p>
            <div className="form-group">
              <label htmlFor="login-code">Code de verification</label>
              <input
                id="login-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                maxLength={6}
                autoFocus
                required
                autoComplete="one-time-code"
                inputMode="numeric"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={loading}
            >
              {loading ? 'Verification...' : 'Se connecter'}
            </button>
            <button
              type="button"
              className="btn btn-link"
              onClick={() => setStep('email')}
            >
              Retour
            </button>
          </form>
        )}

        {step === 'apikey' && (
          <form onSubmit={handleApiKeyLogin}>
            <div className="form-group">
              <label htmlFor="login-apikey">Cle API</label>
              <input
                id="login-apikey"
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="cpf_live_..."
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={loading}
            >
              {loading ? 'Verification...' : 'Se connecter'}
            </button>
            <button
              type="button"
              className="btn btn-link"
              onClick={() => setStep('email')}
            >
              Retour
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
