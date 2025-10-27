// Content script bridge for storage access
// This runs in the extension context and has access to chrome.storage

console.log('[🌉 Bridge] Content bridge initialized');

// Listen for messages from the page (intercept.js)
window.addEventListener('message', async (event) => {
  // Only accept messages from same origin
  if (event.source !== window) return;

  const message = event.data;

  // Check if it's a storage message
  if (!message || message.type !== 'STORAGE_REQUEST') return;

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
