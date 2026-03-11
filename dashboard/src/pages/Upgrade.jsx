import { useState } from 'react';
import { api } from '../api/client';

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: '49€',
    period: '/mois',
    features: ['200 analyses/mois', '3 alertes prix', 'Historique 30 jours', 'Support email'],
    highlight: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '89€',
    period: '/mois',
    features: ['Analyses illimitées', '10 alertes prix', 'Historique complet', 'Support prioritaire', 'Export CSV'],
    highlight: true,
  },
  {
    id: 'agency',
    name: 'Agence',
    price: '149€',
    period: '/mois',
    features: ['Analyses illimitées', 'Alertes illimitées', 'Historique complet', 'Support dédié', 'Export CSV', 'Multi-utilisateurs'],
    highlight: false,
  },
];

export default function Upgrade() {
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState('');

  async function handleUpgrade(planId) {
    setLoading(planId);
    setError('');
    try {
      const { url } = await api.createCheckoutSession(planId);
      window.location.href = url;
    } catch (err) {
      setError(err.message || 'Erreur lors de la création du paiement');
      setLoading(null);
    }
  }

  return (
    <div className="upgrade-page">
      <div className="upgrade-header">
        <h1>Débloquez les chiffres complets</h1>
        <p>Passez Premium pour voir les prix LBC, la marge estimée et toutes les analyses en détail.</p>
      </div>

      {error && <div className="upgrade-error">{error}</div>}

      <div className="upgrade-plans">
        {PLANS.map((plan) => (
          <div key={plan.id} className={`upgrade-plan ${plan.highlight ? 'upgrade-plan--highlight' : ''}`}>
            {plan.highlight && <div className="upgrade-plan__badge">Populaire</div>}
            <div className="upgrade-plan__name">{plan.name}</div>
            <div className="upgrade-plan__price">
              {plan.price}<span className="upgrade-plan__period">{plan.period}</span>
            </div>
            <ul className="upgrade-plan__features">
              {plan.features.map((f) => (
                <li key={f}>✓ {f}</li>
              ))}
            </ul>
            <button
              className={`upgrade-plan__btn ${plan.highlight ? 'upgrade-plan__btn--primary' : ''}`}
              onClick={() => handleUpgrade(plan.id)}
              disabled={loading === plan.id}
            >
              {loading === plan.id ? 'Redirection...' : 'Choisir ce plan'}
            </button>
          </div>
        ))}
      </div>

      <p className="upgrade-footer">Sans engagement · Annulable à tout moment · Paiement sécurisé par Stripe</p>
    </div>
  );
}
