// Background service worker - runs in extension context, no mixed content restrictions
// Handles fetch relay requests from content-bridge.js

console.log('[🔧 Background] Service worker initialized');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'FETCH_REQUEST_BG') return false;

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
});
