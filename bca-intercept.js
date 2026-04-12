(function () {
  // ─── Configuration ────────────────────────────────────────────────────────
  let extensionSettings = {
    requestTimeout: 10000,
    serverUrl: 'https://api.carlytics.fr',
    apiKey: ''
  };

  // Load settings via shared bridge (carlytics-shared.js)
  function loadExtensionSettings() {
    return window.__carlytics.bridgeGet(['carFinderSettings'], 'bca_settings').then((data) => {
      if (data && data.carFinderSettings) {
        extensionSettings = { ...extensionSettings, ...data.carFinderSettings };
      }
      window.__carlyticsSettings = extensionSettings;
    });
  }

  // First reveal — uses shared helpers with BCA-specific flag name
  function getFirstRevealUsed() {
    return window.__carlytics.getFirstRevealUsed('firstRevealUsedBca');
  }
  function setFirstRevealUsed() {
    window.__carlytics.setFirstRevealUsed('firstRevealUsedBca');
    console.log('[🎁 BCA] setFirstRevealUsed → flag pose');
  }

  // Margin indicator — delegates to shared (BCA uses euro thresholds)
  function computeMarginIndicatorBca(margin) {
    return window.__carlytics.computeMarginIndicator(margin, false, 'euros');
  }

  // Listen for messages pushed by content-bridge.js (relayed from dashboard sync)
  // Bug 4 fix : si l'apiKey ou isPaid change (login/logout dashboard), on relance
  // l'analyse pour refresh la carte sans que l'user ait a refresh la page BCA.
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.type !== 'SETTINGS_PUSH') return;

    const prevApiKey = extensionSettings.apiKey;
    const prevIsPaid = extensionSettings.isPaid === true;
    extensionSettings = { ...extensionSettings, ...msg.settings };
    console.log('[⚙️ BCA Settings] Updated via bridge push:', extensionSettings);

    const newApiKey = extensionSettings.apiKey;
    const newIsPaid = extensionSettings.isPaid === true;
    const authChanged = prevApiKey !== newApiKey || prevIsPaid !== newIsPaid;
    if (authChanged && currentBidPrice && vehicleData) {
      console.log('[🔄 BCA Auth change] apiKey/isPaid changed — relance analyse');
      // Reset le flag pour permettre la relance, et supprimer la carte existante
      analysisTriggered = false;
      const existing = document.getElementById(CARD_ID);
      if (existing) existing.remove();
      triggerAnalysis();
    }
  });

  // ─── Brands connus (multi-mots en premier) ────────────────────────────────
  const KNOWN_BRANDS = [
    'Alfa Romeo', 'Aston Martin', 'Land Rover', 'Mercedes-Benz',
    'Rolls Royce', 'DS Automobiles',
    'Audi', 'BMW', 'Citroën', 'Dacia', 'Ferrari', 'Fiat', 'Ford',
    'Honda', 'Hyundai', 'Jaguar', 'Jeep', 'Kia', 'Lamborghini', 'Lexus',
    'Maserati', 'Mazda', 'Mercedes', 'Mini', 'Mitsubishi', 'Nissan', 'Opel',
    'Peugeot', 'Porsche', 'Renault', 'Seat', 'Skoda', 'Smart', 'Subaru',
    'Suzuki', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo'
  ];

  function extractBrand(title) {
    const t = title.trim();
    // Essayer les marques multi-mots en premier
    for (const brand of KNOWN_BRANDS) {
      if (t.toLowerCase().startsWith(brand.toLowerCase())) return brand;
    }
    // Fallback : premier mot
    return t.split(' ')[0];
  }

  function extractModel(title, brand) {
    const after = title.trim().slice(brand.length).trim();
    return after.split(' ')[0] || '';
  }

  // ─── Parsing de la subheadline ─────────────────────────────────────────────
  // Format : "(60PS), Electric, , 44998 km, 12/12/2018 ,2018"
  function parseSubheadline(text) {
    const km = (text.match(/(\d[\d\s]*)\s*km/i) || [])[1]?.replace(/\s/g, '') || '0';
    const year = (text.match(/,\s*(\d{4})\s*$/) || [])[1] || '';
    const parts = text.split(',');
    const rawFuel = parts[1]?.trim() || '';
    const fuel = mapFuel(rawFuel);
    return { km: parseInt(km, 10), year: parseInt(year, 10), fuel };
  }

  function mapFuel(raw) {
    const r = raw.toLowerCase();
    if (r.includes('electric') || r.includes('électr')) return 'electric';
    if (r.includes('diesel'))  return 'diesel';
    if (r.includes('hybrid'))  return 'hybrid';
    if (r.includes('essence') || r.includes('petrol') || r.includes('gasoline') || r.includes('essence')) return 'petrol';
    return raw;
  }

  // ─── Extraction des données véhicule depuis le DOM ─────────────────────────
  function extractVehicleData() {
    const titleEl = document.querySelector('.viewlot__headline--large, [class*="viewlot__headline--large"]');
    const subEl   = document.querySelector('.viewlot__subheadline');

    if (!titleEl || !subEl) return null;

    const title = titleEl.innerText.trim();
    const brand = extractBrand(title);
    const model = extractModel(title, brand);
    const { km, year, fuel } = parseSubheadline(subEl.innerText);

    return { brand: brand.toUpperCase(), model, year, km, fuel, title };
  }

  // ─── Extraction du prix depuis le DOM ─────────────────────────────────────
  function extractPriceFromDom() {
    // Chercher "Enchère actuelle" et prendre le montant associé
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      if (el.children.length > 0) continue;
      const text = el.innerText?.trim();
      if (!text) continue;
      // Label "Enchère actuelle" ou "Prix actuel"
      if (/ench[eè]re actuelle|prix actuel|current.*bid|winning.*bid/i.test(text)) {
        // Chercher le montant dans le prochain frère ou parent
        const parent = el.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children);
          const idx = siblings.indexOf(el);
          for (let i = idx + 1; i < siblings.length; i++) {
            const priceMatch = siblings[i].innerText?.match(/(\d[\d\s]*)\s*€/);
            if (priceMatch) {
              const price = parseInt(priceMatch[1].replace(/\s/g, ''), 10);
              if (price > 100) return price;
            }
          }
          // Chercher dans le parent lui-même (texte complet)
          const parentText = parent.innerText;
          const priceMatch = parentText?.match(/(\d[\d\s]{1,8})\s*€/);
          if (priceMatch) {
            const price = parseInt(priceMatch[1].replace(/\s/g, ''), 10);
            if (price > 100) return price;
          }
        }
      }
    }

    // Fallback : premier montant €  visible qui ressemble à un prix de véhicule (100-999999)
    const pricePattern = /^(\d[\d\s]{1,6})\s*€\s*$/;
    for (const el of allElements) {
      if (el.children.length > 0) continue;
      const text = el.innerText?.trim();
      if (!text) continue;
      const m = text.match(pricePattern);
      if (m) {
        const price = parseInt(m[1].replace(/\s/g, ''), 10);
        if (price >= 100 && price <= 999999) return price;
      }
    }
    return null;
  }

  // Fetch bridge and server call wrapper — delegate to shared (carlytics-shared.js)
  function fetchViaBridge(opts, headersLegacy) {
    return window.__carlytics.fetchViaBridge(opts, headersLegacy);
  }

  async function callServer(opts, retryCount) {
    return window.__carlytics.callServer(opts, extensionSettings, retryCount);
  }

  // Direct LBC fetch via service worker (residential IP + host_permissions bypass CORS).
  async function lbcSearchFromClient(lbcUrl, payloadBody) {
    const resp = await fetchViaBridge({
      url: lbcUrl,
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'LBC;iOS;16.4.1;iPhone;phone;UUID;wifi;6.102.0;24.32.1930',
        'api_key': 'ba0c2dad52b3ec',
        'Accept-Language': 'fr-FR,fr;q=0.9'
      },
      body: JSON.stringify(payloadBody)
    });
    if (resp.error) {
      console.warn('[🛰️ BCA LBC] Fetch error:', resp.error);
      return [];
    }
    if (!resp.ok) {
      console.warn('[🛰️ BCA LBC] Non-ok status:', resp.status);
      return [];
    }
    return (resp.data && Array.isArray(resp.data.ads)) ? resp.data.ads : [];
  }

  // Track 2 : 3-phase analysis (cache → client-side LBC fetches → server compute).
  async function callEstimation(vehicle, currentBid) {
    const { brand, model, year, km, fuel } = vehicle;

    // Phase 1 : GET /api/lbc-payloads
    const qs = new URLSearchParams({
      brand: String(brand || ''),
      model: String(model || ''),
      year: String(year || ''),
      km: String(km || ''),
      fuel: String(fuel || '')
    }).toString();
    const phase1 = await callServer({ url: `${extensionSettings.serverUrl}/api/lbc-payloads?${qs}` });
    if (phase1 && phase1.cached && phase1.data) {
      console.log('[💾 BCA Cache] Hit — skip LBC for', `${brand} ${model}`);
      return phase1.data;
    }

    // Phase 2 : loop payloads until ≥ 3 ads
    const lbcUrl = (phase1 && phase1.lbcUrl) || 'https://api.leboncoin.fr/finder/search';
    const payloads = (phase1 && phase1.payloads) || [];
    let ads = [];
    for (const { label, body } of payloads) {
      try {
        ads = await lbcSearchFromClient(lbcUrl, body);
        console.log(`[🛰️ BCA LBC ${label}] ${ads.length} ads (${brand} ${model})`);
      } catch (err) {
        console.warn(`[🛰️ BCA LBC ${label}] Failed: ${err.message}`);
        ads = [];
      }
      if (ads.length >= 3) break;
    }

    // Phase 3 : POST ads to /api/estimation-from-ads
    return await callServer({
      url: `${extensionSettings.serverUrl}/api/estimation-from-ads`,
      method: 'POST',
      body: { brand, model, year, km, fuel, ads }
    });
  }

  // ─── Injection de la carte prix ────────────────────────────────────────────
  const CARD_ID = 'carlytics-bca-card';

  function injectCard(vehicle, currentBid, analysis, isFirstReveal = false) {
    // Éviter les doublons
    const existing = document.getElementById(CARD_ID);
    if (existing) existing.remove();

    // ⚠️ L'API serveur renvoie estimatedPrice (pas adjustedPrice ni baseLbcPrice).
    // 🔐 isPaid = source de vérité serveur (analysis.isPaid). Si le serveur dit false,
    // on respecte même si extensionSettings.isPaid=true (cas apiKey rotated).
    const marketPrice = analysis.estimatedPrice || null;
    const margin = marketPrice !== null
      ? Math.round(marketPrice - currentBid)
      : null;
    const hasLbcData = margin !== null;

    // Indicateur couleur + label : seulement quand on a une marge calculable.
    // Sinon on affiche un etat "pas de donnees LBC" propre dans la card.
    const marginIndicator = hasLbcData
      ? computeMarginIndicatorBca(margin)
      : { emoji: 'ℹ️', label: 'Aucune donnée LBC pour ce modèle', color: '#95a5a6' };
    const isPaid = analysis.isPaid === true;
    const isLoggedIn = extensionSettings.apiKey && extensionSettings.apiKey.trim() !== '';

    const formatPrice = (p) => p ? `${Math.round(p).toLocaleString('fr-FR')} €` : '—';
    const blurClass = isPaid ? '' : 'style="filter:blur(5px);user-select:none"';

    const card = document.createElement('div');
    card.id = CARD_ID;
    card.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      background: #fff;
      border: 2px solid #2c3e50;
      border-radius: 12px;
      padding: 16px 20px;
      min-width: 280px;
      max-width: 340px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.18);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      color: #2c3e50;
    `;

    // Background du bloc marge : vert/jaune/rouge si data, gris neutre sinon
    const marginBgColor = hasLbcData
      ? (margin > 500 ? '#d5f4e6' : margin > 0 ? '#fef9e7' : '#fdecea')
      : '#f1f3f5';

    // Bloc "Prix marché LBC" : si pas de data, "—" en clair (pas de blur sur rien)
    const marketPriceCell = hasLbcData
      ? `<div style="font-weight:700;font-size:15px" ${blurClass}>${isPaid ? formatPrice(marketPrice) : '•• ••• €'}</div>`
      : `<div style="font-weight:700;font-size:15px;color:#95a5a6">—</div>`;

    // Bloc "Marge estimée" : 3 etats exclusifs pour eviter le cascading bug
    //   1. pas de data LBC → "— / Aucune donnée LBC" (une seule ligne claire)
    //   2. data + paid → "🟢 +3 500 € / Bonne affaire"
    //   3. data + !paid → "🟢 •• ••• € / Bonne affaire" (blur sur le nombre)
    let marginCellContent;
    if (!hasLbcData) {
      marginCellContent = `
        <div style="font-size:18px;font-weight:700;color:#95a5a6">—</div>
        <div style="font-size:11px;font-weight:600;color:#95a5a6;margin-top:4px">${marginIndicator.label}</div>
      `;
    } else if (isPaid) {
      marginCellContent = `
        <div style="font-size:22px;font-weight:800">${marginIndicator.emoji} ${formatPrice(margin)}</div>
        <div style="font-size:12px;font-weight:700;color:${marginIndicator.color};margin-top:4px">${marginIndicator.label}</div>
      `;
    } else {
      marginCellContent = `
        <div style="font-size:22px;font-weight:800">${marginIndicator.emoji} <span style="filter:blur(5px);user-select:none">•• ••• €</span></div>
        <div style="font-size:12px;font-weight:700;color:${marginIndicator.color};margin-top:4px">${marginIndicator.label}</div>
      `;
    }

    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <strong style="font-size:14px">🔍 Carlytics – Analyse BCA</strong>
        <span style="cursor:pointer;font-size:18px;line-height:1" onclick="document.getElementById('${CARD_ID}').remove()">×</span>
      </div>
      <div style="font-size:12px;color:#666;margin-bottom:10px">${vehicle.brand} ${vehicle.model} · ${vehicle.year} · ${vehicle.km.toLocaleString('fr-FR')} km</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        <div style="background:#f8f9fa;border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:11px;color:#666;margin-bottom:2px">Enchère actuelle</div>
          <div style="font-weight:700;font-size:15px">${formatPrice(currentBid)}</div>
        </div>
        <div style="background:#f8f9fa;border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:11px;color:#666;margin-bottom:2px">Prix marché LBC</div>
          ${marketPriceCell}
        </div>
      </div>
      <div style="background:${marginBgColor};border-radius:8px;padding:10px;text-align:center">
        <div style="font-size:12px;color:#666;margin-bottom:2px">Marge estimée</div>
        ${marginCellContent}
      </div>
    `;

    // 🎁 Badge first reveal : si on est en mode "reveal offert" on affiche
    // le badge et on n'affiche PAS le CTA upgrade (il ne servirait a rien —
    // les chiffres sont deja visibles en one-shot sur cette carte).
    if (isFirstReveal) {
      const giftBadge = document.createElement('div');
      giftBadge.style.cssText = `
        margin-top: 10px;
        padding: 8px 10px;
        background: linear-gradient(135deg, #f59e0b, #f97316);
        color: white;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        text-align: center;
      `;
      giftBadge.innerHTML = '🎁 <strong>Aperçu offert</strong><br>Passe Pro (89€/mois) pour voir les chiffres sur toutes les voitures';
      card.appendChild(giftBadge);
    }

    // CTA upgrade (seulement si pas Premium ET pas en first reveal)
    if (!isPaid) {
      const upgradeWrapper = document.createElement('div');
      upgradeWrapper.style.cssText = 'margin-top:10px;text-align:center';

      const upgradeUrl = isLoggedIn
        ? 'https://app.carlytics.fr/upgrade'
        : 'https://app.carlytics.fr/signup';

      const upgradeLink = document.createElement('a');
      upgradeLink.href = upgradeUrl;
      upgradeLink.target = '_blank';
      upgradeLink.rel = 'noopener noreferrer';
      upgradeLink.style.cssText = `
        display: block;
        padding: 8px 12px;
        background: linear-gradient(135deg, #3b82f6, #8b5cf6);
        color: white;
        border-radius: 6px;
        text-decoration: none;
        font-size: 12px;
        font-weight: 600;
      `;
      upgradeLink.textContent = isLoggedIn
        ? '⭐ Débloquer les chiffres — Passer Premium'
        : '🔓 Voir les chiffres — Créer un compte gratuit';
      upgradeLink.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('[🎯 Carlytics BCA] Upgrade click →', upgradeUrl);
        window.open(upgradeUrl, '_blank', 'noopener,noreferrer');
      });

      upgradeWrapper.appendChild(upgradeLink);
      card.appendChild(upgradeWrapper);
    }

    document.body.appendChild(card);
    console.log('[🎯 Carlytics BCA] Carte injectée', { vehicle, currentBid, marketPrice, margin, isPaid });
  }

  function showLoadingCard(vehicle, currentBid) {
    const existing = document.getElementById(CARD_ID);
    if (existing) existing.remove();

    const card = document.createElement('div');
    card.id = CARD_ID;
    card.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      background: #fff;
      border: 2px solid #2c3e50;
      border-radius: 12px;
      padding: 16px 20px;
      min-width: 280px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.18);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      color: #2c3e50;
    `;
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong>🔍 Carlytics – Analyse BCA</strong>
        <span style="cursor:pointer;font-size:18px" onclick="document.getElementById('${CARD_ID}').remove()">×</span>
      </div>
      <div style="font-size:12px;color:#666;margin-bottom:8px">${vehicle.brand} ${vehicle.model} · ${vehicle.year} · ${vehicle.km.toLocaleString('fr-FR')} km</div>
      <div style="font-size:12px;color:#666;margin-bottom:4px">Enchère actuelle : <strong>${currentBid.toLocaleString('fr-FR')} €</strong></div>
      <div style="color:#3498db;font-size:12px">⏳ Analyse du marché en cours...</div>
    `;
    document.body.appendChild(card);
  }

  function showErrorCard(message) {
    const existing = document.getElementById(CARD_ID);
    if (existing) {
      existing.querySelector('[style*="color:#3498db"]')?.remove();
      const errDiv = document.createElement('div');
      errDiv.style.cssText = 'color:#e74c3c;font-size:12px;margin-top:8px';
      errDiv.textContent = `❌ ${message}`;
      existing.appendChild(errDiv);
    }
  }

  // ─── Interception XHR bidpanel ─────────────────────────────────────────────
  // On écoute la réponse bidpanel pour avoir le prix live
  let currentBidPrice = null;
  let vehicleData = null;
  let analysisTriggered = false;

  const OriginalXHR = window.XMLHttpRequest;

  function BcaXHR() {
    const xhr = new OriginalXHR();
    const open = xhr.open.bind(xhr);
    const send = xhr.send.bind(xhr);

    xhr.open = function (method, url, ...rest) {
      this._bcaUrl = url;
      return open(method, url, ...rest);
    };

    xhr.send = function (...args) {
      this.addEventListener('load', async function () {
        if (this._bcaUrl && this._bcaUrl.includes('bidpanel')) {
          try {
            const json = JSON.parse(this.responseText);
            const price = json.currentBidAmount || json.winningBid || json.startingBidAmount;
            if (price && price > 0) {
              currentBidPrice = price;
              console.log('[🎯 BCA] Prix enchère intercepté:', price);
              await triggerAnalysis();
            }
          } catch (e) {
            console.warn('[❌ BCA] Erreur parsing bidpanel:', e);
          }
        }
      });
      return send.apply(this, args);
    };

    // Proxy toutes les propriétés/méthodes restantes
    return new Proxy(xhr, {
      get(target, prop) {
        if (prop === 'open') return xhr.open.bind(xhr);
        if (prop === 'send') return xhr.send.bind(xhr);
        const val = target[prop];
        return typeof val === 'function' ? val.bind(target) : val;
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      }
    });
  }

  window.XMLHttpRequest = BcaXHR;

  // ─── Déclenchement de l'analyse ────────────────────────────────────────────
  async function triggerAnalysis() {
    if (analysisTriggered) return;
    if (!currentBidPrice || !vehicleData) return;

    analysisTriggered = true;
    console.log('[🎯 BCA] Démarrage analyse', vehicleData, 'prix:', currentBidPrice);

    showLoadingCard(vehicleData, currentBidPrice);

    try {
      const analysis = await callEstimation(vehicleData, currentBidPrice);

      // 🎁 First reveal (pricing v2) : si le serveur dit isPaid=false et que
      // l'utilisateur n'a pas encore consomme son reveal, on flip analysis.isPaid
      // pour cette carte et on pose le flag.
      // NB : on ne consomme le reveal QUE si on a une vraie donnee LBC a montrer
      // (estimatedPrice non null). Sinon l'user perdrait son aperçu offert sans
      // rien voir, ce qui est injuste.
      let isFirstReveal = false;
      const hasRealLbcData = analysis.estimatedPrice != null;
      if (analysis.isPaid !== true && hasRealLbcData) {
        const alreadyUsed = await getFirstRevealUsed();
        if (!alreadyUsed) {
          analysis.isPaid = true;
          isFirstReveal = true;
          setFirstRevealUsed();
          console.log('[🎁 BCA First reveal] Carte offerte — flag firstRevealUsed pose');
        }
      }

      injectCard(vehicleData, currentBidPrice, analysis, isFirstReveal);
    } catch (err) {
      console.error('[❌ BCA] Erreur analyse:', err.message);
      showErrorCard(err.message);
    }
  }

  // ─── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    await loadExtensionSettings();

    // Attendre que le DOM soit prêt
    const waitForDom = () => new Promise((resolve) => {
      const check = () => {
        const titleEl = document.querySelector('.viewlot__headline--large, [class*="viewlot__headline--large"]');
        const subEl   = document.querySelector('.viewlot__subheadline');
        if (titleEl && subEl) {
          resolve();
        } else {
          setTimeout(check, 300);
        }
      };
      check();
    });

    await waitForDom();
    vehicleData = extractVehicleData();

    if (!vehicleData) {
      console.warn('[⚠️ BCA] Impossible d\'extraire les données véhicule');
      return;
    }

    console.log('[🎯 BCA] Données véhicule extraites:', vehicleData);

    // Attendre que le prix apparaisse dans le DOM (max 15s)
    const waitForPrice = () => new Promise((resolve) => {
      const MAX_ATTEMPTS = 50; // 50 × 300ms = 15s
      let attempts = 0;

      const check = () => {
        const price = extractPriceFromDom();
        if (price) {
          resolve(price);
          return;
        }
        if (++attempts >= MAX_ATTEMPTS) {
          resolve(null);
          return;
        }
        setTimeout(check, 300);
      };
      check();
    });

    const domPrice = await waitForPrice();
    if (domPrice) {
      currentBidPrice = domPrice;
      await triggerAnalysis();
    }
    // L'interception XHR bidpanel prendra aussi le relais si le prix arrive plus tard
  }

  // Lancer après chargement du DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('[🚀 Carlytics BCA interceptor injecté]');
})();
