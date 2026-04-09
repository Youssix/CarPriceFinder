// Content script qui tourne sur app.carlytics.fr
// Lit l'apiKey du localStorage du dashboard et la sync dans chrome.storage.local
// pour que l'extension (intercept.js sur Auto1/BCA) sache que le user est connecté.

console.log('[🔄 Carlytics Sync] Dashboard sync content script loaded');

const API_BASE = 'https://api.carlytics.fr';

async function syncAuthToExtension() {
  const apiKey = localStorage.getItem('apiKey');
  if (!apiKey) {
    console.log('[🔄 Sync] No apiKey in localStorage, skipping');
    return;
  }

  try {
    // Récupère le statut d'abonnement à jour depuis le serveur
    const res = await fetch(`${API_BASE}/api/check-subscription`, {
      headers: { 'X-API-Key': apiKey }
    });
    const data = await res.json();

    if (!data.active) {
      console.log('[🔄 Sync] Subscription inactive, skipping');
      return;
    }

    // Envoie au background service worker qui save dans chrome.storage.local
    const result = await chrome.runtime.sendMessage({
      type: 'SYNC_AUTH_FROM_DASHBOARD',
      apiKey,
      email: data.email,
      isPaid: data.isPaid === true,
      status: data.status || 'free'
    });

    console.log('[🔄 Sync] Auth synced to extension:', { email: data.email, isPaid: data.isPaid, status: data.status });
    return result;
  } catch (err) {
    console.error('[🔄 Sync] Error:', err.message);
  }
}

// Sync au chargement de la page
syncAuthToExtension();

// Sync quand le localStorage change dans un autre onglet
window.addEventListener('storage', (e) => {
  if (e.key === 'apiKey') {
    console.log('[🔄 Sync] localStorage apiKey changed (cross-tab)');
    syncAuthToExtension();
  }
});

// Polling pour détecter login/logout dans le même onglet
// (l'event 'storage' ne se déclenche pas pour le tab qui modifie le localStorage)
let lastApiKey = localStorage.getItem('apiKey');
setInterval(() => {
  const current = localStorage.getItem('apiKey');
  if (current !== lastApiKey) {
    lastApiKey = current;
    if (current) {
      console.log('[🔄 Sync] Polling detected login');
      syncAuthToExtension();
    } else {
      console.log('[🔄 Sync] Polling detected logout, clearing extension auth');
      chrome.runtime.sendMessage({ type: 'CLEAR_AUTH_FROM_DASHBOARD' });
    }
  }
}, 2000);
