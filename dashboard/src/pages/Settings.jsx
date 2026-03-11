import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.carlytics.fr';

export default function Settings() {
  const { user } = useAuth();
  const [canceling, setCanceling] = useState(false);
  const [cancelDone, setCancelDone] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  async function handleResetPassword() {
    setResetLoading(true);
    try {
      await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      setResetSent(true);
    } finally {
      setResetLoading(false);
    }
  }

  async function handleCancel() {
    if (!confirm) { setConfirm(true); return; }
    setCanceling(true);
    setCancelError('');
    try {
      await api.cancelSubscription();
      setCancelDone(true);
      setConfirm(false);
    } catch (err) {
      setCancelError(err.message);
    } finally {
      setCanceling(false);
    }
  }

  return (
    <div className="page">
      <h2>Parametres</h2>

      <div className="settings-section">
        <h3>Compte</h3>
        <div className="setting-row">
          <span className="setting-label">Email</span>
          <span className="setting-value">{user?.email}</span>
        </div>
        <div className="setting-row">
          <span className="setting-label">Statut</span>
          <span className={`status-badge ${user?.status}`}>
            {user?.status === 'active' ? 'Actif' : user?.status}
          </span>
        </div>
        <div className="setting-row">
          <span className="setting-label">Mot de passe</span>
          {resetSent ? (
            <span style={{ fontSize: '0.875rem', color: '#16a34a' }}>Email envoyé ✓</span>
          ) : (
            <button className="btn btn-secondary" onClick={handleResetPassword} disabled={resetLoading} type="button" style={{ fontSize: '0.8rem', padding: '4px 12px' }}>
              {resetLoading ? 'Envoi...' : 'Changer de mot de passe'}
            </button>
          )}
        </div>
      </div>

      {user?.isPaid && (
        <div className="settings-section">
          <h3>Abonnement</h3>
          {cancelDone ? (
            <p className="setting-description" style={{ color: '#16a34a' }}>
              Annulation confirmée. Votre accès reste actif jusqu'à la fin de la période en cours.
            </p>
          ) : (
            <>
              <p className="setting-description">
                Vous pouvez résilier votre abonnement à tout moment. Vous conserverez l'accès jusqu'à la fin de la période déjà payée.
              </p>
              {cancelError && <p style={{ color: '#dc2626', marginBottom: '0.75rem', fontSize: '0.875rem' }}>{cancelError}</p>}
              {confirm ? (
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.875rem', color: '#374151' }}>Confirmer la résiliation ?</span>
                  <button className="btn btn-danger" onClick={handleCancel} disabled={canceling} type="button">
                    {canceling ? 'Annulation...' : 'Oui, résilier'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setConfirm(false)} type="button">Annuler</button>
                </div>
              ) : (
                <button className="btn btn-danger" onClick={handleCancel} type="button">
                  Résilier mon abonnement
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div className="settings-section">
        <h3>Extension Chrome</h3>
        <p className="setting-description">
          Installez l'extension puis connectez-vous avec votre email et mot de passe.
        </p>
        <ol className="install-steps">
          <li>
            <a href="https://chromewebstore.google.com/detail/enckjhmbkcinkhihbmehnkehflbcgdno" target="_blank" rel="noreferrer">
              Installer Carlytics depuis le Chrome Web Store
            </a>
          </li>
          <li>Cliquez sur l'icone Carlytics dans Chrome</li>
          <li>Connectez-vous avec votre email et mot de passe</li>
          <li>L'extension est prete — naviguez sur Auto1.com</li>
        </ol>
      </div>
    </div>
  );
}
