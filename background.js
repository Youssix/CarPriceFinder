// Background service worker - runs in extension context, no mixed content restrictions
// Handles fetch relay requests from content-bridge.js
// Handles auth sync from dashboard-sync.js (app.carlytics.fr)

console.log('[🔧 Background] Service worker initialized');

// Override User-Agent for LBC API requests to mimic mobile app (bypass DataDome fingerprint)
chrome.declarativeNetRequest.updateDynamicRules({
  removeRuleIds: [1],
  addRules: [{
    id: 1,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'User-Agent', operation: 'set', value: 'LBC;iOS;16.4.1;iPhone;phone;UUID;wifi;6.102.0;24.32.1930' }
      ]
    },
    condition: {
      urlFilter: 'api.leboncoin.fr',
      resourceTypes: ['xmlhttprequest', 'other']
    }
  }]
}).then(() => console.log('[🔧 Background] LBC User-Agent rule installed'))
  .catch(e => console.warn('[🔧 Background] DNR rule error:', e.message));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // --- Fetch relay (existant) ---
  if (message.type === 'FETCH_REQUEST_BG') {
    const { url, headers, method, body } = message;
    console.log('[🔧 Background] Fetching:', url, method || 'GET');

    const fetchOpts = { method: method || 'GET', headers: headers || {} };
    if (body) fetchOpts.body = body;

    fetch(url, fetchOpts)
      .then(async (response) => {
        const status = response.status;
        const ok = response.ok;
        const retryAfter = response.headers.get('Retry-After');
        let data = null;
        const rawText = await response.text();
        try { data = JSON.parse(rawText); } catch (_) {}
        // Diagnostic: log LBC responses to detect DataDome blocks
        if (url.includes('leboncoin.fr')) {
          const adsCount = data && Array.isArray(data.ads) ? data.ads.length : 'N/A';
          console.log(`[🔧 BG LBC] ${status} | ads=${adsCount} | raw=${rawText.substring(0, 200)}`);
        }
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
