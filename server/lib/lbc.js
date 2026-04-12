// LeBonCoin scraping utilities — payload building, filtering, estimation
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Headers mobiles pour éviter blocage
const HEADERS = {
    'Host': 'api.leboncoin.fr',
    'Connection': 'keep-alive',
    'Accept': 'application/json',
    'User-Agent': 'LBC;iOS;16.4.1;iPhone;phone;UUID;wifi;6.102.0;24.32.1930',
    'api_key': process.env.LBC_API_KEY,
    'Accept-Language': 'fr-FR,fr;q=0.9',
    'Content-Type': 'application/json'
};

function mapFuelType(fuelType) {
    if (!fuelType) return null;
    switch (fuelType.toLowerCase()) {
        case "petrol": return "1";
        case "diesel": return "2";
        case "electric": return "3";
        case "hybrid": return "4";
        default: return null;
    }
}

function mapGearbox(gearType) {
    if (!gearType) return null;
    switch (gearType.toLowerCase()) {
        case "manual": return "1";
        case "automatic": return "2";
        case "duplex": return "2";
        default: return null;
    }
}

const brandMap = {
    "LAND ROVER": "LAND-ROVER",
    "MERCEDES BENZ": "MERCEDES-BENZ",
    "ROLLS ROYCE": "ROLLS-ROYCE",
    "ALFA ROMEO": "ALFA ROMEO", // ✅ Garder l'espace pour Alfa Romeo (requis par LBC)
};

// Blacklist pour filtrer pièces/scams
const blacklistKeywords = [
    "moteur", "boite", "turbo", "injecteur", "piece", "pieces", "épave", "pour pieces", "démonté", "casse", "moteurs"
];

// Direct call — no queue (LBC is currently banned, rate limiting irrelevant)
function enqueueLbcCall(fn) {
    return fn();
}

// Build the LBC search payload(s) for a given vehicle. Returns an array of
// payloads tried in order by the client: main search → fallback 1 (no fuel) →
// fallback 2 (no u_car_model, no fuel).
function buildLbcPayloads(params) {
    const { brand, model, year, km, fuel, gearbox, doors, colour, critair, carModel, minPrice = 500 } = params;

    const rawBrand = brand || "";
    const brandMapped = brandMap[rawBrand.toUpperCase()] || rawBrand;
    const yearInt = parseInt(year);
    const kmInt = parseInt(km);
    const minPriceInt = parseInt(minPrice);

    const enums = { ad_type: ["offer"] };
    if (brand) enums.u_car_brand = [brandMapped.toUpperCase()];

    const mappedFuel = mapFuelType(fuel);
    if (mappedFuel) enums.fuel = [mappedFuel];

    const mappedGearbox = mapGearbox(gearbox);
    if (mappedGearbox) enums.gearbox = [mappedGearbox];

    if (doors) {
        if (doors === "4") {
            enums.doors = ["4", "5"];
        } else {
            enums.doors = [doors];
        }
    }

    if (colour) enums.vehicule_color = [colour];
    if (critair) enums.critair = [critair];

    const resolvedCarModel = carModel || model;
    let keywordsText = model;
    if (brand && resolvedCarModel) {
        let modelClean = resolvedCarModel.trim();
        const brandUpper = brandMapped.toUpperCase();
        const needsSpacePreserved = brandUpper.includes("ALFA ROMEO");
        const brandForModel = needsSpacePreserved ? brandUpper : brandUpper.replace(/ /g, '-');

        if (brandMapped.toUpperCase() === "MERCEDES-BENZ" && modelClean.includes('-Klasse')) {
            const base = modelClean.replace(/-Klasse$/, '');
            keywordsText = `${brandMapped} ${base}`;
            enums.u_car_model = [
                `${brandForModel}_${base}`,
                `${brandForModel}_Classe ${base}`
            ];
        } else if (brandMapped.toUpperCase() === "VOLKSWAGEN" && modelClean.startsWith('Golf')) {
            modelClean = 'Golf';
            enums.u_car_model = [`${brandForModel}_${modelClean}`];
        } else {
            enums.u_car_model = [`${brandForModel}_${modelClean}`];
        }
    }

    const payload = {
        extend: true,
        filters: {
            category: { id: "2" },
            enums,
            keywords: { text: keywordsText },
            ranges: {
                regdate: { min: yearInt - 2, max: yearInt + 2 },
                mileage: { min: Math.max(0, kmInt - 60000), max: kmInt + 60000 },
                price: { min: minPriceInt }
            }
        },
        listing_source: "direct-search",
        offset: 0,
        limit: 35,
        limit_alu: 3,
        sort_by: "price",
        sort_order: "asc"
    };

    // Fallback 1 : drop fuel filter
    const fb1 = JSON.parse(JSON.stringify(payload));
    delete fb1.filters.enums.fuel;

    // Fallback 2 : drop u_car_model + fuel, keywords only
    const fb2 = JSON.parse(JSON.stringify(payload));
    delete fb2.filters.enums.fuel;
    delete fb2.filters.enums.u_car_model;

    return {
        brandMapped,
        yearInt,
        kmInt,
        minPriceInt,
        payloads: [
            { label: 'main', body: payload },
            { label: 'fallback1', body: fb1 },
            { label: 'fallback2', body: fb2 }
        ]
    };
}

// Filter raw LBC ads: drop blacklist keywords (pieces/scams), require car attributes, enforce min price.
function filterLbcAds(ads, minPriceInt) {
    if (!Array.isArray(ads)) return [];
    return ads.filter(ad => {
        if (!ad || typeof ad !== 'object') return false;
        const titleLower = (ad.subject || '').toLowerCase();
        const bodyLower = (ad.body || '').toLowerCase();
        const hasBlacklist = blacklistKeywords.some(w => titleLower.includes(w) || bodyLower.includes(w));
        const attrs = Array.isArray(ad.attributes) ? ad.attributes : [];
        const hasCarAttrs = attrs.some(a => a.key === "doors" && a.value) &&
                            attrs.some(a => a.key === "seats" && a.value) &&
                            attrs.some(a => a.key === "vehicle_type" && a.value !== "");
        const priceValid = (ad.price_cents || 0) >= minPriceInt * 100;
        return !hasBlacklist && hasCarAttrs && priceValid;
    });
}

// Compute median/low/high/count from filtered ads.
function computeEstimationFromFilteredAds(filteredAds) {
    const prices = filteredAds
        .map(ad => ad.price_cents / 100)
        .filter(price => typeof price === 'number' && isFinite(price))
        .sort((a, b) => a - b);

    let estimatedPrice = null;
    if (prices.length > 0) {
        const mid = Math.floor(prices.length / 2);
        estimatedPrice = prices.length % 2 === 0
            ? (prices[mid - 1] + prices[mid]) / 2
            : prices[mid];
    }

    const lowPrice = prices.length ? prices[0] : null;
    const highPrice = prices.length ? prices[prices.length - 1] : null;
    const potentialPlusValue = highPrice && lowPrice ? Math.round((highPrice - lowPrice) * 0.2) : null;

    return {
        ok: true,
        estimatedPrice: estimatedPrice ? Math.round(estimatedPrice) : null,
        lowPrice,
        highPrice,
        potentialPlusValue,
        count: filteredAds.length,
        results: filteredAds.slice(0, 10),
        warning: filteredAds.length < 3 ? "Pas assez d'annonces fiables – élargis les ranges ?" : null
    };
}

// Server-side LBC search with ScraperAPI support
async function lbcSearch(searchPayload, minPriceInt) {
    const scraperApiKey = process.env.SCRAPERAPI_KEY;
    const lbcUrl = "https://api.leboncoin.fr/finder/search";
    const headersToUse = scraperApiKey
        ? { 'api_key': process.env.LBC_API_KEY, 'Content-Type': 'application/json' }
        : HEADERS;
    const fetchUrl = scraperApiKey
        ? `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(lbcUrl)}&keep_headers=true&premium=true&country_code=fr`
        : lbcUrl;
    const controller = new AbortController();
    const timeoutMs = scraperApiKey ? 15000 : 1200;
    const abortTimer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
        response = await fetch(fetchUrl, {
            method: "POST",
            headers: headersToUse,
            body: JSON.stringify(searchPayload),
            signal: controller.signal
        });
    } catch (e) {
        clearTimeout(abortTimer);
        if (e.name === 'AbortError') { console.warn(`[⏱️ LBC] Timeout ${timeoutMs}ms — returning []`); return []; }
        throw e;
    }
    clearTimeout(abortTimer);
    const text = await response.text();
    if (!text || text.length < 10) {
        console.warn(`[⚠️ LBC] Empty response (status=${response.status}, length=${text ? text.length : 0}, body="${text || ''}")`);
        return [];
    }
    let data;
    try { data = JSON.parse(text); } catch (e) {
        console.warn(`[⚠️ LBC] JSON parse failed (status=${response.status}, length=${text.length}, first200="${text.substring(0, 200)}")`);
        return [];
    }
    // Detect DataDome captcha block
    if (!data.ads && data.url && data.url.includes('captcha')) {
        console.warn('[🚫 DataDome] IP bloquée par captcha — skip fallbacks');
        throw new Error('DATADOME_BLOCKED');
    }
    console.log("📥 Réponse LBC (ads):", data.ads ? data.ads.length : 0);
    const ads = data.ads || [];
    return ads.filter(ad => {
        const titleLower = ad.subject.toLowerCase();
        const bodyLower = ad.body.toLowerCase();
        const hasBlacklist = blacklistKeywords.some(w => titleLower.includes(w) || bodyLower.includes(w));
        const hasCarAttrs = ad.attributes.some(a => a.key === "doors" && a.value) &&
                            ad.attributes.some(a => a.key === "seats" && a.value) &&
                            ad.attributes.some(a => a.key === "vehicle_type" && a.value !== "");
        const priceValid = ad.price_cents >= minPriceInt * 100;
        return !hasBlacklist && hasCarAttrs && priceValid;
    });
}

module.exports = {
    HEADERS,
    mapFuelType,
    mapGearbox,
    brandMap,
    blacklistKeywords,
    enqueueLbcCall,
    buildLbcPayloads,
    filterLbcAds,
    computeEstimationFromFilteredAds,
    lbcSearch,
};
