// Background service worker - runs in extension context, no mixed content restrictions
// Handles fetch relay requests from content-bridge.js
// Handles auth sync from dashboard-sync.js (app.carlytics.fr)

console.log('[🔧 Background] Service worker initialized');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // --- Fetch relay (existant) ---
  if (message.type === 'FETCH_REQUEST_BG') {
    const { url, headers } = message;
    console.log('[🔧 Background] Fetching:', url);

    fetch(url, { headers: headers || {} })
      .then(async (response) => {
        const status = response.status;
        const ok = response.ok;
        const retryAfter = response.headers.get('Retry-After');
        let data = null;
        try { data = await response.json(); } catch (_) {}
        sendResponse({ ok, status, retryAfter, data });
      })
      .catch((error) => {
        console.error('[🔧 Background] Fetch error:', error.message);
        sendResponse({ ok: false, error: error.message });
      });

    return true; // Keep the message channel open for async response
  }

  // --- Sync auth depuis le dashboard (app.carlytics.fr) ---
  if (message.type === 'SYNC_AUTH_FROM_DASHBOARD') {
    const { apiKey, email, isPaid, status } = message;
    console.log('[🔧 Background] Auth sync from dashboard:', { email, isPaid, status });

    chrome.storage.local.get(['carFinderSettings'], (result) => {
      const settings = result.carFinderSettings || {};
      settings.apiKey = apiKey;
      settings.email = email;
      settings.isPaid = isPaid;
      settings.subscription_status = status;

      chrome.storage.local.set({ carFinderSettings: settings }, () => {
        console.log('[🔧 Background] Saved auth to chrome.storage.local');

        // Notifier tous les onglets Auto1 et BCA pour qu'ils reload leurs settings
        const targetUrls = ['https://www.auto1.com/*', 'https://www.bcautoencheres.fr/*'];
        targetUrls.forEach((urlPattern) => {
          chrome.tabs.query({ url: urlPattern }, (tabs) => {
            tabs.forEach((tab) => {
              chrome.tabs.sendMessage(tab.id, {
                type: 'SETTINGS_UPDATED',
                settings
              }).catch(() => {
                // Tab might not have content script loaded yet, ignore
              });
            });
          });
        });

        sendResponse({ ok: true });
      });
    });

    return true; // async
  }

  // --- Clear auth (logout depuis le dashboard) ---
  if (message.type === 'CLEAR_AUTH_FROM_DASHBOARD') {
    console.log('[🔧 Background] Clearing auth (logout from dashboard)');

    chrome.storage.local.get(['carFinderSettings'], (result) => {
      const settings = result.carFinderSettings || {};
      settings.apiKey = '';
      settings.email = '';
      settings.isPaid = false;
      settings.subscription_status = '';

      chrome.storage.local.set({ carFinderSettings: settings }, () => {
        const targetUrls = ['https://www.auto1.com/*', 'https://www.bcautoencheres.fr/*'];
        targetUrls.forEach((urlPattern) => {
          chrome.tabs.query({ url: urlPattern }, (tabs) => {
            tabs.forEach((tab) => {
              chrome.tabs.sendMessage(tab.id, {
                type: 'SETTINGS_UPDATED',
                settings
              }).catch(() => {});
            });
          });
        });

        sendResponse({ ok: true });
      });
    });

    return true; // async
  }

  return false;
});
