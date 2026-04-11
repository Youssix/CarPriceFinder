// Content script bridge for storage access AND fetch relay
// This runs in the extension context and has access to chrome.storage
// It also relays fetch() calls from intercept.js to bypass mixed content restrictions

console.log('[🌉 Bridge] Content bridge initialized');

// Relayer les mises à jour de settings du popup vers intercept.js (page context)
// Le popup envoie chrome.tabs.sendMessage → content-bridge reçoit → window.postMessage → intercept.js reçoit
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SETTINGS_UPDATED') {
    window.postMessage({ type: 'SETTINGS_PUSH', settings: message.settings }, '*');
    sendResponse({ success: true });
  } else if (message.type === 'VEHICLE_REMOVED') {
    // Relayer vers intercept.js (page context) pour remettre le bouton "Ajouter"
    window.postMessage({ type: 'VEHICLE_REMOVED', stockNumber: message.stockNumber }, '*');
    sendResponse({ success: true });
  }
  return false;
});

// Listen for messages from the page (intercept.js)
window.addEventListener('message', async (event) => {
  // Only accept messages from same origin
  if (event.source !== window) return;

  const message = event.data;
  if (!message || !message.type) return;

  // --- FETCH RELAY via background service worker (bypasses mixed content HTTPS→HTTP) ---
  // Supports POST with body for Track 2 (direct LBC scraping + new /api/estimation-from-ads)
  if (message.type === 'FETCH_REQUEST') {
    const { url, headers, method, body, requestId } = message;
    try {
      // Forward to background service worker which has no mixed content restrictions
      const response = await chrome.runtime.sendMessage({
        type: 'FETCH_REQUEST_BG',
        url,
        headers,
        method,
        body
      });
      window.postMessage({
        type: 'FETCH_RESPONSE',
        requestId,
        ...response
      }, '*');
    } catch (error) {
      window.postMessage({
        type: 'FETCH_RESPONSE',
        requestId,
        ok: false,
        error: error.message
      }, '*');
    }
    return;
  }

  // Check if it's a storage message
  if (message.type !== 'STORAGE_REQUEST') return;

  console.log('[🌉 Bridge] Received storage request:', message.action);

  try {
    let result;

    switch (message.action) {
      case 'get':
        result = await chrome.storage.local.get(message.keys);
        window.postMessage({
          type: 'STORAGE_RESPONSE',
          action: 'get',
          requestId: message.requestId,
          data: result
        }, '*');
        break;

      case 'set':
        await chrome.storage.local.set(message.data);
        window.postMessage({
          type: 'STORAGE_RESPONSE',
          action: 'set',
          requestId: message.requestId,
          success: true
        }, '*');
        break;

      case 'remove':
        await chrome.storage.local.remove(message.keys);
        window.postMessage({
          type: 'STORAGE_RESPONSE',
          action: 'remove',
          requestId: message.requestId,
          success: true
        }, '*');
        break;

      default:
        console.warn('[🌉 Bridge] Unknown storage action:', message.action);
    }
  } catch (error) {
    console.error('[🌉 Bridge] Storage error:', error);
    window.postMessage({
      type: 'STORAGE_RESPONSE',
      requestId: message.requestId,
      error: error.message
    }, '*');
  }
});
