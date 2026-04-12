// Carlytics shared utilities — loaded before intercept.js and bca-intercept.js
// Provides bridge helpers, margin indicators, fetch relay, and server call wrapper.
(function() {
  'use strict';

  // --- Storage bridge helpers ---
  // Generic get via content-bridge.js STORAGE_REQUEST
  function bridgeGet(keys, prefix) {
    return new Promise((resolve) => {
      const requestId = (prefix || 'shared') + '_get_' + Math.random().toString(36).substr(2, 9);
      const timer = setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve({});
      }, 2000);

      function handler(event) {
        if (event.source !== window) return;
        const msg = event.data;
        if (!msg || msg.type !== 'STORAGE_RESPONSE' || msg.requestId !== requestId) return;
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        resolve(msg.data || {});
      }

      window.addEventListener('message', handler);
      window.postMessage({
        type: 'STORAGE_REQUEST',
        action: 'get',
        keys: keys,
        requestId: requestId
      }, '*');
    });
  }

  // Generic set via content-bridge.js STORAGE_REQUEST (fire-and-forget)
  function bridgeSet(data, prefix) {
    const requestId = (prefix || 'shared') + '_set_' + Math.random().toString(36).substr(2, 9);
    window.postMessage({
      type: 'STORAGE_REQUEST',
      action: 'set',
      data: data,
      requestId: requestId
    }, '*');
  }

  // --- First reveal helpers (parameterized by flag name) ---
  function getFirstRevealUsed(flagName) {
    return new Promise((resolve) => {
      const requestId = 'fru_get_' + Math.random().toString(36).substr(2, 9);
      const timer = setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(false); // fail-open
      }, 2000);

      function handler(event) {
        if (event.source !== window) return;
        const msg = event.data;
        if (!msg || msg.type !== 'STORAGE_RESPONSE' || msg.requestId !== requestId) return;
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        resolve(!!(msg.data && msg.data[flagName] === true));
      }

      window.addEventListener('message', handler);
      window.postMessage({
        type: 'STORAGE_REQUEST',
        action: 'get',
        keys: [flagName],
        requestId: requestId
      }, '*');
    });
  }

  function setFirstRevealUsed(flagName) {
    const data = {};
    data[flagName] = true;
    const requestId = 'fru_set_' + Math.random().toString(36).substr(2, 9);
    window.postMessage({
      type: 'STORAGE_REQUEST',
      action: 'set',
      data: data,
      requestId: requestId
    }, '*');
  }

  // --- Margin indicator ---
  // thresholdType: 'percent' (Auto1 — uses profitPercent + isProfit) or 'euros' (BCA — uses raw margin €)
  function computeMarginIndicator(value, isProfit, thresholdType) {
    if (thresholdType === 'euros') {
      // BCA thresholds in euros
      if (value > 500) return { emoji: '🟢', label: 'Bonne affaire', color: '#2ecc71' };
      if (value > 0)   return { emoji: '🟡', label: 'Affaire correcte', color: '#f39c12' };
      return { emoji: '🔴', label: 'À éviter', color: '#e74c3c' };
    }
    // Auto1 thresholds in percent
    if (isProfit && value >= 15) return { emoji: '🟢', label: 'Bonne affaire', color: '#2ecc71' };
    if (isProfit && value >= 5)  return { emoji: '🟡', label: 'Affaire correcte', color: '#f39c12' };
    return { emoji: '🔴', label: 'À éviter', color: '#e74c3c' };
  }

  // --- Fetch bridge ---
  // Relays fetch through content-bridge.js → background.js to bypass mixed content.
  function fetchViaBridge(opts, headersLegacy) {
    let url, headers, method, body;
    if (typeof opts === 'string') {
      url = opts;
      headers = headersLegacy || {};
      method = 'GET';
      body = null;
    } else {
      ({ url, headers = {}, method = 'GET', body = null } = opts || {});
    }
    return new Promise((resolve, reject) => {
      const requestId = Math.random().toString(36).substr(2, 9);
      const timeout = (window.__carlyticsSettings && window.__carlyticsSettings.requestTimeout) || 10000;

      const timer = setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('Failed to fetch'));
      }, timeout);

      function handler(event) {
        if (event.source !== window) return;
        const msg = event.data;
        if (!msg || msg.type !== 'FETCH_RESPONSE' || msg.requestId !== requestId) return;
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        resolve(msg);
      }

      window.addEventListener('message', handler);
      window.postMessage({ type: 'FETCH_REQUEST', url, headers, method, body, requestId }, '*');
    });
  }

  // --- Server call wrapper ---
  // Adds X-API-Key, Content-Type, handles 401/403/429 with retry
  async function callServer(opts, settings, retryCount) {
    retryCount = retryCount || 0;
    const MAX_RETRIES = 1;
    const optsNorm = typeof opts === 'string' ? { url: opts } : opts;
    const method = optsNorm.method || 'GET';

    const headers = {};
    if (settings && settings.apiKey) {
      headers['X-API-Key'] = settings.apiKey;
    }
    if (method !== 'GET') headers['Content-Type'] = 'application/json';

    const body = method !== 'GET' && optsNorm.body != null
      ? (typeof optsNorm.body === 'string' ? optsNorm.body : JSON.stringify(optsNorm.body))
      : null;

    const resp = await fetchViaBridge({ url: optsNorm.url, headers, method, body });

    if (resp.error) throw new Error(resp.error);

    if (resp.status === 401) {
      throw new Error((resp.data && resp.data.error) || 'Clé API requise.');
    }
    if (resp.status === 403) {
      throw new Error((resp.data && resp.data.error) || 'Abonnement expiré ou clé invalide.');
    }
    if (resp.status === 429 && retryCount < MAX_RETRIES) {
      const retryAfter = resp.retryAfter || 2;
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      return await callServer(optsNorm, settings, retryCount + 1);
    }
    if (!resp.ok) throw new Error('Server error: ' + resp.status);

    return resp.data;
  }

  // Expose on window
  window.__carlytics = {
    bridgeGet,
    bridgeSet,
    getFirstRevealUsed,
    setFirstRevealUsed,
    computeMarginIndicator,
    fetchViaBridge,
    callServer,
  };

  console.log('[🔧 Carlytics] Shared utilities loaded');
})();
