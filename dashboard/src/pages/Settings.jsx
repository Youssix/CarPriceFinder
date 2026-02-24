import { useAuth } from '../hooks/useAuth';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export default function Settings() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const copyKey = () => {
    navigator.clipboard.writeText(user.apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
      </div>

      <div className="settings-section">
        <h3>Cle API</h3>
        <p className="setting-description">
          Utilisez cette cle dans l'extension Chrome CarPriceFinder.
        </p>
        <div className="api-key-display">
          <code>{user?.apiKey}</code>
          <button
            className="btn-icon"
            onClick={copyKey}
            title="Copier"
            aria-label="Copier la cle API"
            type="button"
          >
            {copied ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Copy size={16} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3>Extension Chrome</h3>
        <p className="setting-description">
          Installez l'extension pour analyser les vehicules directement sur Auto1.
        </p>
        <ol className="install-steps">
          <li>
            Ouvrez <code>chrome://extensions/</code>
          </li>
          <li>Activez le "Mode developpeur"</li>
          <li>Cliquez sur "Charger l'extension non empaquetee"</li>
          <li>Selectionnez le dossier CarPriceFinder</li>
          <li>Collez votre cle API dans les parametres de l'extension</li>
        </ol>
      </div>
    </div>
  );
}
