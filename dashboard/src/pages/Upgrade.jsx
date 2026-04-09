import { useState } from 'react';
import { api } from '../api/client';

const PRO_PLAN = {
  id: 'pro',
  name: 'Pro',
  price: '89€',
  period: '/mois',
  features: [
    'Prix LBC ajusté visible sur chaque voiture',
    'Marge estimée en euros et en %',
    'Alertes push illimitées sur les bonnes affaires',
    'Compatible Auto1 + BCA Auto Enchères',
    'Sans engagement — résiliable en 1 clic',
  ],
};

export default function Upgrade() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleUpgrade() {
    setLoading(true);
    setError('');
    try {
      const { url } = await api.createCheckoutSession('pro');
      window.location.href = url;
    } catch (err) {
      setError(err.message || 'Erreur lors de la création du paiement');
      setLoading(false);
    }
  }

  return (
    <div className="upgrade-page">
      <div className="upgrade-header">
        <h1>Débloquez les chiffres complets</h1>
        <p>Passez Pro pour voir les prix LBC, la marge estimée et toutes les analyses en détail.</p>
      </div>

      {error && <div className="upgrade-error">{error}</div>}

      <div className="upgrade-plans upgrade-plans--single">
        <div className="upgrade-plan upgrade-plan--highlight">
          <div className="upgrade-plan__badge">Tout inclus</div>
          <div className="upgrade-plan__name">{PRO_PLAN.name}</div>
          <div className="upgrade-plan__price">
            {PRO_PLAN.price}<span className="upgrade-plan__period">{PRO_PLAN.period}</span>
          </div>
          <ul className="upgrade-plan__features">
            {PRO_PLAN.features.map((f) => (
              <li key={f}>✓ {f}</li>
            ))}
          </ul>
          <button
            className="upgrade-plan__btn upgrade-plan__btn--primary"
            onClick={handleUpgrade}
            disabled={loading}
          >
            {loading ? 'Redirection...' : 'Passer Pro — 89€/mois'}
          </button>
        </div>
      </div>

      <p className="upgrade-footer">Sans engagement · Annulable à tout moment · Paiement sécurisé par Stripe</p>
    </div>
  );
}
