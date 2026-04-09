(function () {
  // Settings and cache management
  let extensionSettings = {
    requestTimeout: 5000,
    cacheTimeout: 86400000, // 24 hours (ONLY for successful results with LBC price)
    serverUrl: 'https://api.carlytics.fr',
    apiKey: ''
  };
  
  // ✅ SIMPLIFIED: No cache stats needed - server handles caching
  
  // Load settings via content-bridge.js (STORAGE_REQUEST postMessage bridge)
  // intercept.js runs in PAGE context → no direct chrome.storage access
  function loadExtensionSettings() {
    return new Promise((resolve) => {
      const requestId = 'settings_' + Math.random().toString(36).substr(2, 9);
      const timer = setTimeout(() => {
        window.removeEventListener('message', handler);
        console.warn('[⚙️ Settings] Bridge timeout — using defaults');
        resolve();
      }, 2000);

      function handler(event) {
        if (event.source !== window) return;
        const msg = event.data;
        if (!msg || msg.type !== 'STORAGE_RESPONSE' || msg.requestId !== requestId) return;
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        if (msg.data && msg.data.carFinderSettings) {
          extensionSettings = { ...extensionSettings, ...msg.data.carFinderSettings };
          console.log('[⚙️ Settings] Loaded via bridge:', extensionSettings);
        }
        resolve();
      }

      window.addEventListener('message', handler);
      window.postMessage({
        type: 'STORAGE_REQUEST',
        action: 'get',
        keys: ['carFinderSettings'],
        requestId
      }, '*');
    });
  }

  // --- First reveal Auto1 (pricing v2) ---
  // Flag SEPARE de BCA : 1 reveal par site (firstRevealUsedAuto1 / firstRevealUsedBca).
  // Lit/ecrit via le bridge storage. Si l'user n'est pas payant et n'a pas encore
  // consomme son reveal Auto1, on affiche les chiffres UNE fois et on set le flag.
  function getFirstRevealUsed() {
    return new Promise((resolve) => {
      const requestId = 'fru_get_' + Math.random().toString(36).substr(2, 9);
      const timer = setTimeout(() => {
        window.removeEventListener('message', handler);
        console.warn('[🎁 Auto1] getFirstRevealUsed bridge timeout — fail-open (reveal autorisé)');
        resolve(false); // fail-open : si le bridge ne repond pas, on considere non-consomme
      }, 2000);

      function handler(event) {
        if (event.source !== window) return;
        const msg = event.data;
        if (!msg || msg.type !== 'STORAGE_RESPONSE' || msg.requestId !== requestId) return;
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        const used = !!(msg.data && msg.data.firstRevealUsedAuto1 === true);
        console.log('[🎁 Auto1] getFirstRevealUsed →', { raw: msg.data, used });
        resolve(used);
      }

      window.addEventListener('message', handler);
      window.postMessage({
        type: 'STORAGE_REQUEST',
        action: 'get',
        keys: ['firstRevealUsedAuto1'],
        requestId
      }, '*');
    });
  }

  function setFirstRevealUsed() {
    const requestId = 'fru_set_' + Math.random().toString(36).substr(2, 9);
    window.postMessage({
      type: 'STORAGE_REQUEST',
      action: 'set',
      data: { firstRevealUsedAuto1: true },
      requestId
    }, '*');
    console.log('[🎁 Auto1] setFirstRevealUsed → flag pose');
    // Fire-and-forget : le flag sera set avant le prochain render (requestTimeout delay).
  }

  // Helper commun : calcule l'indicateur couleur + label a partir d'une marge %
  function computeMarginIndicator(profitPercent, isProfit) {
    if (isProfit && profitPercent >= 15) return { emoji: '🟢', label: 'Bonne affaire', color: '#2ecc71' };
    if (isProfit && profitPercent >= 5)  return { emoji: '🟡', label: 'Affaire correcte', color: '#f39c12' };
    return { emoji: '🔴', label: 'À éviter', color: '#e74c3c' };
  }

  // Memoire des dernieres hits recues (pour re-injecter apres login dashboard)
  let lastHits = null;

  // Listen for messages pushed by content-bridge.js (relayed from popup/dashboard sync)
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;

    if (msg && msg.type === 'SETTINGS_PUSH') {
      const prevApiKey = extensionSettings.apiKey;
      const prevIsPaid = extensionSettings.isPaid === true;
      extensionSettings = { ...extensionSettings, ...msg.settings };
      console.log('[⚙️ Settings] Updated via bridge push:', extensionSettings);

      // 🔄 Bug 4 fix : si l'apiKey ou le statut isPaid a change (login/logout
      // depuis le dashboard), on re-injecte les cards en utilisant les dernieres
      // hits recues. Sans ca, l'user doit refresh plusieurs fois pour voir les
      // chiffres apparaitre apres login.
      const newApiKey = extensionSettings.apiKey;
      const newIsPaid = extensionSettings.isPaid === true;
      const authChanged = prevApiKey !== newApiKey || prevIsPaid !== newIsPaid;
      if (authChanged && lastHits && lastHits.length > 0) {
        console.log('[🔄 Auth change] apiKey/isPaid changed — re-injection des cards', {
          prevApiKey: prevApiKey ? '***' : '(none)',
          newApiKey: newApiKey ? '***' : '(none)',
          prevIsPaid,
          newIsPaid,
          hitsCount: lastHits.length
        });
        // Supprimer les cards existantes (.plugin-price et .plugin-loading)
        document.querySelectorAll('.plugin-price, .plugin-loading').forEach(el => el.remove());
        // Re-injecter avec les nouveaux settings (source de verite = data.isPaid serveur)
        injectPluginPrices(lastHits);
      }
    }

    if (msg && msg.type === 'VEHICLE_REMOVED' && msg.stockNumber) {
      // Mettre à jour la liste en mémoire
      vehicleListManager.removeVehicle(msg.stockNumber);
      // Remettre le bouton "Ajouter" sur la page si le véhicule est visible
      const btn = document.querySelector(`[data-add-stock="${msg.stockNumber}"]`);
      if (btn) {
        btn.innerHTML = '<span style="color: #27ae60; font-size: 14px;">➕</span> <strong>Ajouter</strong>';
        btn.disabled = false;
        btn.style.cssText = 'padding: 6px 12px; background: #d5f4e6; color: #27ae60; border: 1px solid #27ae60; cursor: pointer; border-radius: 3px; font-size: 12px; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.1); transition: all 0.2s ease; white-space: nowrap;';
        console.log(`[📋 Liste] Bouton réinitialisé pour ${msg.stockNumber}`);
      }
    }
  });

  // ✅ SIMPLIFIED: No client cache - server handles all caching
  // Simple fetch with retry logic
  const pendingRequests = new Map(); // Track requests in progress to avoid duplicates

  async function fetchAnalysis(fetchUrl) {
    // Check if request already in progress for this URL
    if (pendingRequests.has(fetchUrl)) {
      console.log('[🔄] Request already in progress, waiting...');
      return await pendingRequests.get(fetchUrl);
    }

    // Create new request promise
    const requestPromise = performFetch(fetchUrl);
    pendingRequests.set(fetchUrl, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Cleanup pending request after completion
      pendingRequests.delete(fetchUrl);
    }
  }

  // Relay fetch through content-bridge.js (extension context) to bypass mixed content blocks
  function fetchViaBridge(url, headers = {}) {
    return new Promise((resolve, reject) => {
      const requestId = Math.random().toString(36).substr(2, 9);
      const timeout = extensionSettings.requestTimeout || 10000;

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
      window.postMessage({ type: 'FETCH_REQUEST', url, headers, requestId }, '*');
    });
  }

  async function performFetch(fetchUrl, retryCount = 0) {
    const MAX_RETRIES = 1;

    try {
      const headers = {};
      if (extensionSettings.apiKey) {
        headers['X-API-Key'] = extensionSettings.apiKey;
      }

      // Route through content-bridge.js to bypass mixed content (HTTPS page → HTTP localhost)
      const resp = await fetchViaBridge(fetchUrl, headers);

      if (resp.error) {
        throw new Error(resp.error);
      }

      // Handle 401/403 auth errors with specific messages
      if (resp.status === 401) {
        throw new Error((resp.data && resp.data.error) || 'Clé API requise. Configurez-la dans les paramètres de l\'extension.');
      }
      if (resp.status === 403) {
        throw new Error((resp.data && resp.data.error) || 'Abonnement expiré ou clé invalide.');
      }

      // Handle 429 rate limit with retry (max 1 retry)
      if (resp.status === 429 && retryCount < MAX_RETRIES) {
        const retryAfter = resp.retryAfter || 2;
        console.warn(`[⏳ Rate Limit] Waiting ${retryAfter}s before retry (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
        await sleep(retryAfter * 1000);
        return await performFetch(fetchUrl, retryCount + 1);
      }

      if (!resp.ok) {
        throw new Error(`Server error: ${resp.status}`);
      }

      return resp.data; // Server returns fromCache: true if cached

    } catch (error) {
      console.error('[❌ Fetch] Error:', error.message);
      throw error;
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Initialize settings — store promise so injectPluginPrices can await it
  const settingsReady = loadExtensionSettings();

  // Interception XHR
  const originalXHR = window.XMLHttpRequest;

  function CustomXHR() {
    const xhr = new originalXHR();

    const open = xhr.open;
    xhr.open = function (method, url, ...rest) {
      this._url = url;
      return open.call(this, method, url, ...rest);
    };

    const send = xhr.send;
    xhr.send = function (...args) {
      this.addEventListener("load", function () {
        if (this._url && this._url.includes("/v1/car-search/cars/search")) {
          try {
            const json = JSON.parse(this.responseText);
            console.log("[✅ Intercepted via XHR]", json);
            injectPluginPrices(json.hits);
          } catch (e) {
            console.warn("[❌ XHR parse error]", e);
          }
        }
      });

      return send.apply(this, args);
    };

    return xhr;
  }

  window.XMLHttpRequest = CustomXHR;

  console.log("[🚀 Auto1 interceptor with AI & Cache injected]");

  // ✅ VEHICLE LIST MANAGEMENT SYSTEM
  // Storage helper using message bridge
  const storageHelper = {
    requestId: 0,
    pendingRequests: new Map(),

    async get(keys) {
      return new Promise((resolve, reject) => {
        const requestId = ++this.requestId;

        // Store the promise callbacks
        this.pendingRequests.set(requestId, { resolve, reject });

        // Send message to content bridge
        window.postMessage({
          type: 'STORAGE_REQUEST',
          action: 'get',
          keys: keys,
          requestId: requestId
        }, '*');

        // Timeout after 5 seconds
        setTimeout(() => {
          if (this.pendingRequests.has(requestId)) {
            this.pendingRequests.delete(requestId);
            reject(new Error('Storage request timeout'));
          }
        }, 5000);
      });
    },

    async set(data) {
      return new Promise((resolve, reject) => {
        const requestId = ++this.requestId;

        this.pendingRequests.set(requestId, { resolve, reject });

        window.postMessage({
          type: 'STORAGE_REQUEST',
          action: 'set',
          data: data,
          requestId: requestId
        }, '*');

        setTimeout(() => {
          if (this.pendingRequests.has(requestId)) {
            this.pendingRequests.delete(requestId);
            reject(new Error('Storage request timeout'));
          }
        }, 5000);
      });
    },

    async remove(keys) {
      return new Promise((resolve, reject) => {
        const requestId = ++this.requestId;

        this.pendingRequests.set(requestId, { resolve, reject });

        window.postMessage({
          type: 'STORAGE_REQUEST',
          action: 'remove',
          keys: keys,
          requestId: requestId
        }, '*');

        setTimeout(() => {
          if (this.pendingRequests.has(requestId)) {
            this.pendingRequests.delete(requestId);
            reject(new Error('Storage request timeout'));
          }
        }, 5000);
      });
    }
  };

  // Listen for storage responses
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    const message = event.data;
    if (!message || message.type !== 'STORAGE_RESPONSE') return;

    const pending = storageHelper.pendingRequests.get(message.requestId);
    if (!pending) return;

    storageHelper.pendingRequests.delete(message.requestId);

    if (message.error) {
      pending.reject(new Error(message.error));
    } else {
      pending.resolve(message.data || message.success);
    }
  });

  class VehicleListManager {
    constructor() {
      this.list = [];
      this.loadList();
    }

    async loadList() {
      try {
        const result = await storageHelper.get(['carFinderSelectedList']);
        this.list = result.carFinderSelectedList || [];
        console.log(`[📋 Liste] ${this.list.length} véhicules chargés`);
      } catch (error) {
        console.warn('[📋 Liste] Erreur chargement:', error.message);
        this.list = [];
      }
    }

    async addVehicle(carData, analysisData, photos, imgurAlbumUrl = null) {
      // Check if already in list
      if (this.isInList(carData.stockNumber)) {
        console.log(`[📋 Liste] Véhicule ${carData.stockNumber} déjà dans la liste`);
        return false;
      }

      const vehicleEntry = {
        stockNumber: carData.stockNumber,
        brand: carData.manufacturerName,
        model: carData.mainType,
        year: new Date(carData.firstRegistrationDate).getFullYear(),
        km: carData.km,
        fuel: carData.fuelType,
        gearbox: carData.gearType,
        power: carData.power || carData.horsepower,
        doors: carData.doors,
        color: carData.exteriorColor,
        auto1Price: (carData.price / 100).toFixed(0),
        estimatedPrice: analysisData.adjustedPrice || analysisData.estimatedPrice,
        margin: analysisData.adjustedPrice ?
          (parseInt(analysisData.adjustedPrice) - (carData.price / 100)).toFixed(0) :
          (parseInt(analysisData.estimatedPrice) - (carData.price / 100)).toFixed(0),
        detectedOptions: analysisData.aiAnalysis?.detectedOptions || [],
        equipment: carData.equipment || [],
        description: carData.description || '',
        photos: photos || [],
        imgurAlbumUrl: imgurAlbumUrl,
        addedAt: Date.now()
      };

      this.list.push(vehicleEntry);
      await this.saveList();
      console.log(`[📋 Liste] Véhicule ${carData.stockNumber} ajouté (${this.list.length} total)`);

      // Sync to backend (non-blocking)
      this.syncToBackend(vehicleEntry).catch(() => {});

      return true;
    }

    async removeVehicle(stockNumber) {
      const initialLength = this.list.length;
      this.list = this.list.filter(v => v.stockNumber !== stockNumber);

      if (this.list.length < initialLength) {
        await this.saveList();
        console.log(`[📋 Liste] Véhicule ${stockNumber} retiré`);

        // Delete from backend (non-blocking)
        this.deleteFromBackend(stockNumber).catch(() => {});

        return true;
      }
      return false;
    }

    isInList(stockNumber) {
      return this.list.some(v => v.stockNumber === stockNumber);
    }

    async saveList() {
      try {
        await storageHelper.set({ carFinderSelectedList: this.list });
      } catch (error) {
        console.error('[📋 Liste] Erreur sauvegarde:', error.message);
      }
    }

    // ✅ BACKEND SYNC METHODS
    // Uses module-level extensionSettings (loaded at startup, updated via SETTINGS_UPDATED listener)

    async syncToBackend(vehicle) {
      try {
        const apiKey = extensionSettings.apiKey;
        if (!apiKey) return; // No API key configured, skip sync

        const serverUrl = extensionSettings.serverUrl || 'https://api.carlytics.fr';

        await fetch(`${serverUrl}/api/vehicles`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
          },
          body: JSON.stringify({
            stockNumber: vehicle.stockNumber,
            brand: vehicle.brand,
            model: vehicle.model,
            year: vehicle.year,
            km: vehicle.km,
            fuel: vehicle.fuel,
            gearbox: vehicle.gearbox,
            power: vehicle.power,
            doors: vehicle.doors,
            color: vehicle.color,
            auto1Price: vehicle.auto1Price,
            estimatedPrice: vehicle.estimatedPrice,
            margin: vehicle.margin,
            detectedOptions: vehicle.detectedOptions || [],
            equipment: vehicle.equipment || [],
            photos: vehicle.photos || [],
            catboxUrls: vehicle.imgurAlbumUrl ? [vehicle.imgurAlbumUrl] : [],
            notes: ''
          })
        });

        console.log('[🔄 Sync] Vehicle synced to backend:', vehicle.stockNumber);
      } catch (err) {
        console.log('[🔄 Sync] Backend sync failed (non-critical):', err.message);
      }
    }

    async deleteFromBackend(stockNumber) {
      try {
        const apiKey = extensionSettings.apiKey;
        if (!apiKey) return; // No API key configured, skip sync

        const serverUrl = extensionSettings.serverUrl || 'https://api.carlytics.fr';

        await fetch(`${serverUrl}/api/vehicles/${encodeURIComponent(stockNumber)}`, {
          method: 'DELETE',
          headers: { 'X-API-Key': apiKey }
        });

        console.log('[🔄 Sync] Vehicle deleted from backend:', stockNumber);
      } catch (err) {
        console.log('[🔄 Sync] Backend delete failed (non-critical):', err.message);
      }
    }

    async syncAllToBackend() {
      try {
        const apiKey = extensionSettings.apiKey;
        if (!apiKey) return; // No API key configured, skip sync

        const vehicles = this.list;
        if (!vehicles || vehicles.length === 0) return;

        const serverUrl = extensionSettings.serverUrl || 'https://api.carlytics.fr';

        // Sync each vehicle (sequential to avoid rate limits)
        let synced = 0;
        for (const vehicle of vehicles) {
          try {
            await fetch(`${serverUrl}/api/vehicles`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
              },
              body: JSON.stringify({
                stockNumber: vehicle.stockNumber,
                brand: vehicle.brand,
                model: vehicle.model,
                year: vehicle.year,
                km: vehicle.km,
                fuel: vehicle.fuel,
                gearbox: vehicle.gearbox,
                power: vehicle.power,
                doors: vehicle.doors,
                color: vehicle.color,
                auto1Price: vehicle.auto1Price,
                estimatedPrice: vehicle.estimatedPrice,
                margin: vehicle.margin,
                detectedOptions: vehicle.detectedOptions || [],
                equipment: vehicle.equipment || [],
                photos: vehicle.photos || [],
                catboxUrls: vehicle.imgurAlbumUrl ? [vehicle.imgurAlbumUrl] : [],
                notes: ''
              })
            });
            synced++;
          } catch (e) {
            // Skip individual failures, continue with next vehicle
          }
        }

        console.log(`[🔄 Sync] Synced ${synced}/${vehicles.length} vehicles to backend`);
      } catch (err) {
        console.log('[🔄 Sync] Full sync failed:', err.message);
      }
    }

    async clearList() {
      this.list = [];
      await storageHelper.remove(['carFinderSelectedList']);
      console.log('[📋 Liste] Liste vidée');
    }
  }

  const vehicleListManager = new VehicleListManager();

  // Function to extract photos from Auto1 API data
  function extractVehiclePhotos(carData, card) {
    const photos = [];
    try {
      // Priority 1: Get photos from API data (best quality)
      if (carData.images && Array.isArray(carData.images)) {
        carData.images.forEach(img => {
          // Try different possible URL properties in Auto1 API
          const imageUrl = img.fullUrl || img.url || img.href || img.src || img.path;
          if (imageUrl && !photos.includes(imageUrl)) {
            photos.push(imageUrl);
          }
        });
      }

      // Fallback: Extract from DOM if API data not available
      if (photos.length === 0 && card) {
        const mainImg = card.querySelector('.big-car-card__image img');
        if (mainImg && mainImg.src) {
          photos.push(mainImg.src);
        }

        const galleryImgs = card.querySelectorAll('.gallery img, .image-gallery img');
        galleryImgs.forEach(img => {
          if (img.src && !photos.includes(img.src)) {
            photos.push(img.src);
          }
        });
      }

      console.log(`[📸 Photos] ${photos.length} photo(s) extraite(s) depuis ${carData.images ? 'API' : 'DOM'}`);
      if (photos.length > 0) {
        console.log(`[📸 Photos] URLs:`, photos.slice(0, 3).join(', ') + (photos.length > 3 ? ` ... (+${photos.length - 3} more)` : ''));
      }
    } catch (error) {
      console.warn('[📸 Photos] Erreur extraction:', error.message);
    }
    return photos;
  }

  // Utility functions
  function mapBodyType(body) {
    const map = {
      "van": "utilitaire",
      "sedan": "berline",
      "hatchback": "berline",
      "suv": "4x4_suv_crossovers",
      "convertible": "cabriolet",
    };
    return map[body.toLowerCase()] || "";
  }

  function mapFuelType(fuelType) {
    switch (fuelType.toLowerCase()) {
      case "petrol": return "1";
      case "diesel": return "2";
      case "electric": return "3";
      case "hybrid": return "4";
      default: return "";
    }
  }

  function mapGearbox(gearType) {
    switch (gearType.toLowerCase()) {
      case "manual": return "1";
      case "automatic": return "2";
      case "duplex": return "2";
      default: return "";
    }
  }

  // Enhanced injection with caching and dynamic timeout
  async function injectPluginPrices(hits) {
    // Attendre que les settings soient chargés via le bridge (max 2s)
    await settingsReady;

    // Memoriser les hits pour permettre la re-injection apres login (Bug 4)
    lastHits = hits;

    // 🔐 Vérification abonnement (isPaid stocké lors du login)
    const isPaid = extensionSettings.isPaid === true;
    console.log(`[🔐 Auth] ${isPaid ? 'Abonné — chiffres complets' : 'Gratuit — indicateur couleur uniquement'}`);

    console.log(`[🔍 injectPluginPrices] ${hits.length} véhicules à traiter (timeout: ${extensionSettings.requestTimeout}ms)`);

    // ✅ PHASE 1: Afficher TOUS les indicateurs de loading IMMÉDIATEMENT
    console.log('[⚡ PHASE 1] Affichage de tous les indicateurs de loading...');
    hits.forEach((car, i) => {
      const stockId = car.stockNumber;
      const card = document.querySelector(`.big-car-card[data-qa-id="${stockId}"]`);

      if (!card) {
        console.log(`[❌ VEHICULE ${i}] Carte non trouvée pour stockNumber=${stockId}`);
        return;
      }

      if (card.querySelector(".plugin-price") || card.querySelector(".plugin-loading")) {
        console.log(`[🔁 VEHICULE ${i}] Bloc déjà présent pour ${stockId}`);
        return;
      }

      // Show loading immediately
      const loadingDiv = createLoadingIndicator(extensionSettings.requestTimeout);
      const insertLocation = card.querySelector(".big-car-card__title");
      if (insertLocation && insertLocation.parentNode) {
        insertLocation.parentNode.insertBefore(loadingDiv, insertLocation.nextSibling);
      }
    });

    // ✅ PHASE 2: Faire les requêtes avec délai entre elles
    console.log('[⚡ PHASE 2] Lancement des requêtes avec délai...');
    hits.forEach((car, i) => {
      setTimeout(() => {
        const stockId = car.stockNumber;
        const price = car.searchPrice || car.minimumBid || car.mpPrice;

        if (!price) {
          console.log(`[⚠️ VEHICULE ${i}] Pas de prix trouvé pour ${stockId}`);
          return;
        }

        const euros = (price / 100).toFixed(0) + " €";
        const card = document.querySelector(`.big-car-card[data-qa-id="${stockId}"]`);

        if (!card) {
          console.log(`[❌ VEHICULE ${i}] Carte non trouvée pour stockNumber=${stockId}`);
          return;
        }

        // Prepare car data for analysis
        const carDataForAI = {
          manufacturerName: car.manufacturerName,
          mainType: car.mainType,
          description: car.description || car.title || '',
          equipment: car.equipment || car.features || [],
          trim: car.trim || car.variant || '',
          bodyType: car.bodyType,
          fuelType: car.fuelType,
          gearType: car.gearType,
          doors: car.doors,
          seats: car.seats,
          power: car.power || car.horsepower,
          engine: car.engine || car.engineSize,
          exteriorColor: car.exteriorColor,
          interiorColor: car.interiorColor,
          firstRegistrationDate: car.firstRegistrationDate,
          km: car.km,
          price: price,
          stockNumber: stockId,
          images: car.images || []  // ✅ FIX: Include images array for photo extraction
        };

        // Prepare API request
        const searchModel = `${car.manufacturerName} ${car.mainType}`.trim();
        const year = new Date(car.firstRegistrationDate).getFullYear();
        const km = car.km;
        const brand = car.manufacturerName.toUpperCase();
        const fuel = (car.fuelType || "").toLowerCase();
        const gearbox = (car.gearType || "").toLowerCase();
        const carModel = (car.mainType || "").trim();
        const doors = car.doors || "";
        // ✅ FIX: Ne plus envoyer vehicle_type - incohérent entre Auto1 et LBC
        // const vehicleType = mapBodyType(car.bodyType || "");

        let estUrl = `${extensionSettings.serverUrl}/api/estimation?model=${encodeURIComponent(searchModel)}&year=${year}&km=${km}&brand=${brand}&fuel=${fuel}&gearbox=${gearbox}&carModel=${encodeURIComponent(carModel)}&doors=${encodeURIComponent(doors)}&carData=${encodeURIComponent(JSON.stringify(carDataForAI))}`;
        // if (vehicleType) estUrl += `&vehicle_type=${encodeURIComponent(vehicleType)}`;

        // ✅ SIMPLIFIED: Direct server call - cache handled by server
        fetchAnalysis(estUrl)
          .then(async data => {
            // Remove loading indicator
            const loadingElement = card.querySelector(".plugin-loading");
            if (loadingElement) {
              loadingElement.remove();
            }

            // 🔐 Source de vérité = serveur (data.isPaid). Évite de fake isPaid côté client.
            // Si le serveur dit isPaid=false, on respecte même si extensionSettings.isPaid=true (apiKey rotated).
            let effectiveIsPaid = data.isPaid === true;
            if (effectiveIsPaid !== isPaid) {
              console.log(`[🔐 Auth] Server isPaid=${effectiveIsPaid} (local cache=${isPaid}) — using server as source of truth`);
            }

            // 🎁 First reveal (pricing v2) : si l'user n'est pas payant et n'a pas encore
            // consomme son reveal gratuit, on affiche les chiffres UNE fois et on pose le flag.
            let isFirstReveal = false;
            if (!effectiveIsPaid) {
              const alreadyUsed = await getFirstRevealUsed();
              if (!alreadyUsed) {
                effectiveIsPaid = true;
                isFirstReveal = true;
                setFirstRevealUsed();
                console.log('[🎁 First reveal] Voiture offerte — flag firstRevealUsed pose');
              }
            }

            // Render result
            renderCarAnalysis(card, carDataForAI, data, euros, effectiveIsPaid, isFirstReveal);

            console.log(`[✅ VEHICULE ${i}] Analysis complete for ${stockId} (${data.aiAnalysis?.detectedOptions?.length || 0} options detected)`);
          })
          .catch(err => {
            // Remove loading indicator
            const loadingElement = card.querySelector(".plugin-loading");
            if (loadingElement) {
              loadingElement.remove();
            }

            console.warn(`[⚠️ VEHICULE ${i}] Analysis failed for ${stockId}:`, err.message);
            renderErrorMessage(card, err.message);
          });
      }, i * extensionSettings.requestTimeout);
    });
  }

  function createLoadingIndicator(timeout) {
    const loadingDiv = document.createElement("div");
    loadingDiv.className = "plugin-loading";
    loadingDiv.style = `
      margin: 12px 0;
      padding: 16px;
      border-radius: 4px;
      background: #2c3e50;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      border: none;
    `;

    const timeoutSec = Math.round(timeout / 1000);

    loadingDiv.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="
          width: 20px;
          height: 20px;
          border: 3px solid rgba(255,255,255,0.3);
          border-top: 3px solid #FFD700;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        "></div>
        <div style="flex: 1;">
          <div style="color: white; font-weight: 600; font-size: 14px; margin-bottom: 4px;">
            🤖 Analyse IA en cours...
          </div>
          <div style="font-size: 11px; color: rgba(255,255,255,0.7); font-weight: 500;">
            ⏱️ Timeout: ${timeoutSec}s
          </div>
        </div>
      </div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;

    return loadingDiv;
  }

  // ✅ FIX #4: Sanitize HTML to prevent XSS injection
  function sanitizeText(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function renderCarAnalysis(card, carData, analysisData, euros, isPaid, isFirstReveal = false) {
    const pluginPriceDiv = document.createElement("div");
    pluginPriceDiv.className = "plugin-price";

    // Calculs
    const auto1Price = carData.price / 100;
    const baseEstimate = analysisData.estimatedPrice || "N/A";
    const adjustedEstimate = analysisData.adjustedPrice || baseEstimate;
    const marketPrice = adjustedEstimate !== "N/A" ? parseInt(adjustedEstimate) : null;

    let profit = 0;
    let profitPercent = 0;
    let isProfit = false;

    if (marketPrice && marketPrice !== auto1Price) {
      profit = marketPrice - auto1Price;
      profitPercent = ((profit / auto1Price) * 100).toFixed(0);
      isProfit = profit > 0;
    }

    // Indicateur couleur + label calcule une seule fois, utilise dans les 2 branches
    const marginIndicator = computeMarginIndicator(profitPercent, isProfit);

    if (!isPaid) {
      // 🆓 GRATUIT: indicateur couleur + chiffres masqués + CTA upgrade
      const profitColor = marginIndicator.color;
      const indicator   = `${marginIndicator.emoji} ${marginIndicator.label}`;

      pluginPriceDiv.style = `
        margin: 8px 0;
        padding: 10px 14px;
        border-radius: 4px;
        background: #2c3e50;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        border-left: 4px solid ${profitColor};
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 13px;
      `;

      // Ligne 1 : indicateur + chiffres floutés
      const topRow = document.createElement('div');
      topRow.style = 'display: flex; align-items: center; gap: 10px;';

      const indicatorSpan = document.createElement('span');
      indicatorSpan.style = `font-weight: 700; font-size: 14px; color: ${profitColor}; white-space: nowrap;`;
      indicatorSpan.textContent = indicator;

      const maskedSpan = document.createElement('span');
      maskedSpan.style = 'color: rgba(255,255,255,0.5); font-size: 12px; flex: 1;';
      const blurredNums = document.createElement('span');
      blurredNums.style = 'filter: blur(5px); color: #ccc; user-select: none; display: inline-block; letter-spacing: 1px;';
      blurredNums.textContent = '12 345€ → 16 500€  (+4 155€)';
      maskedSpan.appendChild(document.createTextNode('Marge estimée : '));
      maskedSpan.appendChild(blurredNums);

      topRow.appendChild(indicatorSpan);
      topRow.appendChild(maskedSpan);

      // Ligne 2 : bouton centré
      const isLoggedIn = extensionSettings.apiKey && extensionSettings.apiKey.trim() !== '';
      const upgradeUrl = isLoggedIn
        ? 'https://app.carlytics.fr/upgrade'
        : 'https://app.carlytics.fr/signup';
      const upgradeLink = document.createElement('a');
      upgradeLink.href = upgradeUrl;
      upgradeLink.target = '_blank';
      upgradeLink.rel = 'noopener noreferrer';
      upgradeLink.style = `
        display: block;
        text-align: center;
        padding: 5px 0;
        background: linear-gradient(135deg, #3b82f6, #8b5cf6);
        color: white;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        text-decoration: none;
        cursor: pointer;
        width: 100%;
      `;
      upgradeLink.textContent = isLoggedIn ? '⭐ Débloquer les chiffres — Passer Premium' : '🔓 Voir les chiffres — Créer un compte gratuit';
      upgradeLink.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('[🎯 Carlytics] Upgrade click →', upgradeUrl);
        window.open(upgradeUrl, '_blank', 'noopener,noreferrer');
      });

      pluginPriceDiv.appendChild(topRow);
      pluginPriceDiv.appendChild(upgradeLink);

    } else {
      // 💎 ABONNÉ (ou first reveal): indicateur couleur + chiffres exacts
      pluginPriceDiv.style = `
        margin: 8px 0;
        padding: 10px 14px;
        border-radius: 4px;
        background: #2c3e50;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        border-left: 4px solid ${marginIndicator.color};
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        font-size: 13px;
      `;

      // Section gauche: Indicateur 🟢🟡🔴 + label + Prix face à face
      const pricesSection = document.createElement('div');
      pricesSection.style = `
        display: flex;
        align-items: center;
        gap: 16px;
        flex: 1;
        font-weight: 600;
        color: #ecf0f1;
      `;

      pricesSection.innerHTML = `
        <span style="font-weight: 700; font-size: 14px; color: ${marginIndicator.color}; white-space: nowrap;">${marginIndicator.emoji} ${marginIndicator.label}</span>
        <span style="color: #95a5a6;">|</span>
        <span style="color: #3498db;">AUTO1: <strong style="color: #ffffff;">${auto1Price.toFixed(0)}€</strong></span>
        <span style="color: #95a5a6;">|</span>
        <span style="color: #e67e22;">LBC: <strong style="color: #ffffff;">${marketPrice ? marketPrice + '€' : 'N/A'}</strong></span>
        ${isProfit ? `
          <span style="color: #95a5a6;">|</span>
          <span style="color: ${isProfit ? '#2ecc71' : '#e74c3c'};">
            MARGE: <strong style="color: #ffffff;">${profit > 0 ? '+' : ''}${profit}€</strong> <span style="color: ${isProfit ? '#2ecc71' : '#e74c3c'};">(${profit > 0 ? '+' : ''}${profitPercent}%)</span>
          </span>
        ` : ''}
      `;

      // Boutons
      const lbcButton = createLbcButton(carData, analysisData);
      const addToListButton = createAddToListButton(card, carData, analysisData);

      const buttonsContainer = document.createElement('div');
      buttonsContainer.style = 'display: flex; gap: 8px;';
      buttonsContainer.appendChild(lbcButton);
      buttonsContainer.appendChild(addToListButton);

      pluginPriceDiv.appendChild(pricesSection);
      pluginPriceDiv.appendChild(buttonsContainer);

      // 🎁 Badge first reveal : informe l'user que c'est un one-shot gratuit
      if (isFirstReveal) {
        const giftBadge = document.createElement('div');
        giftBadge.style = `
          margin-top: 8px;
          padding: 6px 10px;
          background: linear-gradient(135deg, #f59e0b, #f97316);
          color: white;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          text-align: center;
          width: 100%;
        `;
        giftBadge.innerHTML = '🎁 <strong>Aperçu offert</strong> — passe Pro (89€/mois) pour voir les chiffres sur toutes les voitures';
        // On remplace le flex par un bloc pour que le badge passe en dessous
        pluginPriceDiv.style.flexDirection = 'column';
        pluginPriceDiv.style.alignItems = 'stretch';
        pluginPriceDiv.appendChild(giftBadge);
      }
    }

    // Insertion dans la page
    const finalInsertLocation = card.querySelector(".big-car-card__title");
    if (finalInsertLocation && finalInsertLocation.parentNode) {
      finalInsertLocation.parentNode.insertBefore(pluginPriceDiv, finalInsertLocation.nextSibling);
    }
  }

  // Function to convert Auto1 model names to French LeBonCoin format
  function mapModelToFrench(brand, model) {
    const brandMappings = {
      'BMW': {
        '1er': 'Série 1',
        '2er': 'Série 2', 
        '3er': 'Série 3',
        '4er': 'Série 4',
        '5er': 'Série 5',
        '6er': 'Série 6',
        '7er': 'Série 7',
        '8er': 'Série 8',
        'X1': 'X1',
        'X2': 'X2',
        'X3': 'X3',
        'X4': 'X4',
        'X5': 'X5',
        'X6': 'X6',
        'X7': 'X7',
        'Z4': 'Z4',
        'i3': 'i3',
        'i4': 'i4',
        'i8': 'i8'
      },
      'MERCEDES-BENZ': {
        'A-Klasse': 'Classe A',
        'B-Klasse': 'Classe B', 
        'C-Klasse': 'Classe C',
        'E-Klasse': 'Classe E',
        'S-Klasse': 'Classe S',
        'CLA-Klasse': 'CLA',
        'CLS-Klasse': 'CLS',
        'GLA-Klasse': 'GLA',
        'GLB-Klasse': 'GLB',
        'GLC-Klasse': 'GLC',
        'GLE-Klasse': 'GLE',
        'GLS-Klasse': 'GLS'
      },
      'AUDI': {
        'A1': 'A1',
        'A3': 'A3',
        'A4': 'A4',
        'A5': 'A5',
        'A6': 'A6',
        'A7': 'A7',
        'A8': 'A8',
        'Q2': 'Q2',
        'Q3': 'Q3',
        'Q5': 'Q5',
        'Q7': 'Q7',
        'Q8': 'Q8',
        'TT': 'TT'
      }
    };

    const brandUpper = brand.toUpperCase();
    if (brandMappings[brandUpper] && brandMappings[brandUpper][model]) {
      return brandMappings[brandUpper][model];
    }
    
    return model; // Return original if no mapping found
  }

  function createAddToListButton(card, carData, analysisData) {
    const addButton = document.createElement("button");
    addButton.dataset.addStock = carData.stockNumber; // pour pouvoir retrouver le bouton depuis VEHICLE_REMOVED
    const isInList = vehicleListManager.isInList(carData.stockNumber);

    // Style based on whether vehicle is already in list
    if (isInList) {
      addButton.innerHTML = '✅ <strong>Dans ma liste</strong>';
      addButton.style = `
        padding: 6px 12px;
        background: #27ae60;
        color: white;
        border: none;
        cursor: not-allowed;
        border-radius: 3px;
        font-size: 12px;
        font-weight: 600;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        white-space: nowrap;
        opacity: 0.7;
      `;
      addButton.disabled = true;
    } else {
      addButton.innerHTML = '<span style="color: #27ae60; font-size: 14px;">➕</span> <strong>Ajouter</strong>';
      addButton.style = `
        padding: 6px 12px;
        background: #d5f4e6;
        color: #27ae60;
        border: 1px solid #27ae60;
        cursor: pointer;
        border-radius: 3px;
        font-size: 12px;
        font-weight: 600;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        transition: all 0.2s ease;
        white-space: nowrap;
      `;

      addButton.onmouseover = () => {
        addButton.style.transform = 'translateY(-1px)';
        addButton.style.boxShadow = '0 3px 6px rgba(39, 174, 96, 0.3)';
        addButton.style.background = '#27ae60';
        addButton.style.color = 'white';
      };

      addButton.onmouseout = () => {
        addButton.style.transform = 'translateY(0)';
        addButton.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
        addButton.style.background = '#d5f4e6';
        addButton.style.color = '#27ae60';
      };

      addButton.onclick = async () => {
        try {
          // Extract photos from API data and card
          const photos = extractVehiclePhotos(carData, card);

          // Update button to show upload in progress
          addButton.innerHTML = '⏳ <strong>Upload photos...</strong>';
          addButton.disabled = true;

          let imgurAlbumUrl = null;

          // Upload photos to Imgur if available
          if (photos && photos.length > 0) {
            try {
              const uploadHeaders = { 'Content-Type': 'application/json' };
              if (extensionSettings.apiKey) {
                uploadHeaders['X-API-Key'] = extensionSettings.apiKey;
              }
              const uploadResponse = await fetch(`${extensionSettings.serverUrl}/api/upload-images`, {
                method: 'POST',
                headers: uploadHeaders,
                body: JSON.stringify({
                  imageUrls: photos,
                  title: `${carData.manufacturerName} ${carData.mainType} - ${carData.firstRegistrationYear}`
                })
              });

              if (uploadResponse.ok) {
                const uploadData = await uploadResponse.json();
                if (uploadData.ok && uploadData.albumUrl) {
                  imgurAlbumUrl = uploadData.albumUrl;
                  console.log(`[📸 Imgur] Album créé: ${imgurAlbumUrl}`);
                }
              }
            } catch (uploadError) {
              console.error('[📸 Imgur] Erreur upload:', uploadError);
              // Continue without Imgur link - not critical
            }
          }

          // Add to list with Imgur link
          const added = await vehicleListManager.addVehicle(carData, analysisData, photos, imgurAlbumUrl);

          if (added) {
            // Update button state
            addButton.innerHTML = '✅ <strong>Ajouté!</strong>';
            addButton.style.background = '#27ae60';
            addButton.style.cursor = 'not-allowed';
            addButton.disabled = true;

            // Show notification
            const notifMessage = imgurAlbumUrl
              ? '✅ Véhicule ajouté avec photos Imgur !'
              : '✅ Véhicule ajouté à votre liste !';
            showNotification(notifMessage, 'success');

            console.log(`[➕ Liste] ${carData.manufacturerName} ${carData.mainType} ajouté${imgurAlbumUrl ? ' avec Imgur' : ''}`);
          } else {
            addButton.innerHTML = '➕ <strong>Ajouter à la liste</strong>';
            addButton.disabled = false;
            showNotification('⚠️ Ce véhicule est déjà dans votre liste', 'warning');
          }
        } catch (error) {
          console.error('[❌ Liste] Erreur ajout:', error);
          addButton.innerHTML = '➕ <strong>Ajouter à la liste</strong>';
          addButton.disabled = false;
          showNotification('❌ Erreur lors de l\'ajout', 'error');
        }
      };
    }

    return addButton;
  }

  // Notification system
  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 16px 24px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      animation: slideIn 0.3s ease-out;
      ${type === 'success' ? 'background: #27ae60; color: white;' :
        type === 'warning' ? 'background: #f39c12; color: white;' :
        type === 'error' ? 'background: #e74c3c; color: white;' :
        'background: #2c3e50; color: white;'}
    `;

    notification.textContent = message;
    document.body.appendChild(notification);

    // Add animation style
    if (!document.getElementById('notification-styles')) {
      const style = document.createElement('style');
      style.id = 'notification-styles';
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(400px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(400px); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    // Auto-remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  function createLbcButton(carData, analysisData) {
    const originalModel = carData.mainType;
    const frenchModel = mapModelToFrench(carData.manufacturerName, originalModel);
    const searchModel = `${carData.manufacturerName} ${frenchModel}`.trim();
    const year = new Date(carData.firstRegistrationDate).getFullYear();
    const km = carData.km;
    const brand = carData.manufacturerName.toUpperCase();
    const fuel = carData.fuelType || '';
    const gearbox = carData.gearType || '';
    const doors = carData.doors || '';

    // Build enhanced search text
    let text = searchModel;
    if (analysisData.aiAnalysis && analysisData.aiAnalysis.detectedOptions.length > 0) {
      const premiumOptions = analysisData.aiAnalysis.detectedOptions.map(opt => opt.name).join(' ');
      text = `${searchModel} ${premiumOptions}`.trim();
    }

    // ✅ FIX: Pour Mercedes avec -Klasse, générer les DEUX formats séparés par virgule
    let modelParam;
    if (brand === 'MERCEDES-BENZ' && originalModel.includes('-Klasse')) {
      const base = originalModel.replace(/-Klasse$/, ''); // Ex: CLA-Klasse → CLA
      modelParam = encodeURIComponent(`${brand}_${base},${brand}_Classe ${base}`);
    } else {
      modelParam = encodeURIComponent(`${brand}_${frenchModel}`);
    }

    let lbcUrl = `https://www.leboncoin.fr/recherche?category=2&text=${encodeURIComponent(text)}&regdate=${year-2}-${year+2}&mileage=${Math.max(1, km - 30000)}-${km + 30000}&gearbox=${mapGearbox(gearbox)}&fuel=${mapFuelType(fuel)}&u_car_brand=${brand}&u_car_model=${modelParam}&doors=${doors}&sort=price&order=asc`;
    
    // Add minimum price filter if available
    if (analysisData.priceFilter && analysisData.priceFilter.minPriceUsed) {
      lbcUrl += `&price=${analysisData.priceFilter.minPriceUsed}-max`;
    }

    const lbcButton = document.createElement("button");
    const hasAI = analysisData.aiAnalysis && analysisData.aiAnalysis.detectedOptions.length > 0;

    lbcButton.innerHTML = hasAI ?
      '🤖 <strong>Recherche IA LBC</strong>' :
      '🔍 <strong>Voir sur LBC</strong>';

    lbcButton.style = `
      padding: 6px 12px;
      background: #FF6B00;
      color: white;
      border: none;
      cursor: pointer;
      border-radius: 3px;
      font-size: 12px;
      font-weight: 600;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      transition: all 0.2s ease;
      white-space: nowrap;
    `;

    lbcButton.onmouseover = () => {
      lbcButton.style.transform = 'translateY(-2px)';
      lbcButton.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)';
      lbcButton.style.background = '#FF8C42';
    };

    lbcButton.onmouseout = () => {
      lbcButton.style.transform = 'translateY(0)';
      lbcButton.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
      lbcButton.style.background = '#FF6B00';
    };

    lbcButton.onclick = () => {
      console.log(`[🖱️ Opening LBC] Enhanced search: "${text}"`);
      window.open(lbcUrl, '_blank');
    };

    return lbcButton;
  }

  function renderErrorMessage(card, errorMessage) {
    const errorDiv = document.createElement("div");
    errorDiv.style = "font-size:12px;color:#dc3545;margin:10px 0;padding:8px;border:1px solid #dc3545;border-radius:3px;background:#f8d7da;";

    // ✅ FIX #4: Safe DOM construction for error messages
    const errorTitle = document.createElement('strong');
    errorTitle.textContent = '❌ Erreur analyse IA';
    errorDiv.appendChild(errorTitle);
    errorDiv.appendChild(document.createElement('br'));

    const errorText = document.createElement('span');
    errorText.style = "font-size:11px;";
    errorText.textContent = sanitizeText(errorMessage); // ✅ Sanitized
    errorDiv.appendChild(errorText);
    errorDiv.appendChild(document.createElement('br'));

    const closeButton = document.createElement('button');
    closeButton.textContent = 'Fermer';
    closeButton.style = "margin-top:5px;padding:2px 6px;background:#dc3545;color:white;border:none;border-radius:2px;font-size:10px;cursor:pointer;";
    closeButton.addEventListener('click', () => errorDiv.remove()); // ✅ Safe event listener instead of onclick
    errorDiv.appendChild(closeButton);

    const errorInsertLocation = card.querySelector(".big-car-card__title");
    if (errorInsertLocation && errorInsertLocation.parentNode) {
      errorInsertLocation.parentNode.insertBefore(errorDiv, errorInsertLocation.nextSibling);
    }
  }

})();
