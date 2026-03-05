import { useAuth } from '../hooks/useAuth';

export default function Settings() {
  const { user } = useAuth();

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
