// Estimation routes: LBC price estimation endpoints
const express = require('express');
const router = express.Router();
const { getCachedEstimation, setCachedEstimation, logPriceObservation, pool } = require('../db');
const { optionalApiKeyAuth, rateLimiter } = require('../lib/middleware');
const { logEstimation } = require('../lib/logger');
const {
    mapFuelType, mapGearbox, brandMap,
    buildLbcPayloads, filterLbcAds, computeEstimationFromFilteredAds,
    enqueueLbcCall, lbcSearch,
} = require('../lib/lbc');

// ✅ CACHE SERVEUR - PostgreSQL-backed, partagé entre tous les utilisateurs
let cacheStats = {
    hits: 0,
    misses: 0,
    stores: 0,
    startTime: Date.now()
};

// Expose cacheStats for health endpoint
router.getCacheStats = () => cacheStats;

// Periodic cleanup of expired cache entries (every 30 minutes)
const { cleanExpiredCache } = require('../db');
setInterval(async () => {
    try {
        const removed = await cleanExpiredCache();
        if (removed > 0) {
            console.log(`[💾 Cache DB] Cleanup: removed ${removed} expired entries`);
        }
    } catch (err) {
        console.error('[💾 Cache DB] Cleanup error:', err.message);
    }
}, 30 * 60 * 1000);

// GET /api/estimation
router.use('/api/estimation', rateLimiter);
router.get('/api/estimation', optionalApiKeyAuth, async (req, res) => {
    // ✅ CACHE SERVEUR: Extract stockNumber from carData JSON
    let stockNumber = null;
    try {
        if (req.query.carData) {
            const carData = JSON.parse(req.query.carData);
            stockNumber = carData.stockNumber;
        }
    } catch (e) {
        console.warn('[⚠️ Cache] Could not parse carData for stockNumber:', e.message);
    }

    const { model, brand, year, km, fuel, gearbox, doors, colour, critair, min_price = 500 } = req.query;
    if (!model || !brand || !year || !km) {
        return res.status(400).json({ ok: false, error: "Paramètres manquants (model, brand, year, km)" });
    }

    const rawBrand = brand || "";
    const brandMapped = brandMap[rawBrand.toUpperCase()] || rawBrand;
    const yearInt = parseInt(year);
    const kmInt = parseInt(km);
    const minPriceInt = parseInt(min_price);

    // Model-level cache key
    const modelCacheKey = `model_${brandMapped.toUpperCase()}_${model}_${yearInt}`;
    const primaryCacheKey = stockNumber || modelCacheKey;

    // ✅ CACHE SERVEUR (PostgreSQL): Check stockNumber first, then modelCacheKey
    try {
        const keysToCheck = stockNumber ? [primaryCacheKey, modelCacheKey] : [modelCacheKey];
        let cachedResult = null;
        let hitKey = null;
        for (const key of keysToCheck) {
            cachedResult = await getCachedEstimation(key);
            if (cachedResult) { hitKey = key; break; }
        }
        if (cachedResult) {
            cacheStats.hits++;
            const hitRate = ((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100).toFixed(1);
            console.log(`[💾 Cache DB] HIT for key: ${hitKey} (hit rate: ${hitRate}%)`);
            logEstimation(req, { brand, model, year: yearInt, km: kmInt, fuel, stockNumber, cacheHit: true, estimatedPrice: cachedResult.estimatedPrice });
            return res.json({ ...cachedResult, isPaid: !!req.subscriber });
        }
        cacheStats.misses++;
    } catch (err) {
        console.error('[💾 Cache DB] Read error:', err.message);
        cacheStats.misses++;
    }

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

    const carModel = req.query.carModel || model;
    let keywordsText = model;
    if (brand && carModel) {
        let modelClean = carModel.trim();
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

    keywordsText = `${keywordsText}`;

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

    console.log("📦 Payload envoyé à LBC:\n", JSON.stringify(payload, null, 2));
    console.log("🔍 u_car_model:", payload.filters.enums.u_car_model);
    console.log("🔍 keywords:", payload.filters.keywords.text);

    let lbcBlocked = false;
    try {
        let results = await enqueueLbcCall(() => lbcSearch(payload, minPriceInt));
        console.log("🧹 Annonces après filtrage:", results.length);

        // Fallback 1: drop fuel filter
        if (results.length < 3 && payload.filters.enums.fuel) {
            console.log("[🔄 Fallback 1] 0 résultats — retry sans filtre carburant");
            const payload2 = JSON.parse(JSON.stringify(payload));
            delete payload2.filters.enums.fuel;
            results = await enqueueLbcCall(() => lbcSearch(payload2, minPriceInt));
            console.log("🧹 Fallback 1 résultats:", results.length);
        }

        // Fallback 2: drop u_car_model + fuel, use keywords only
        if (results.length < 3 && payload.filters.enums.u_car_model) {
            console.log("[🔄 Fallback 2] Encore 0 — retry sans u_car_model ni carburant");
            const payload3 = JSON.parse(JSON.stringify(payload));
            delete payload3.filters.enums.fuel;
            delete payload3.filters.enums.u_car_model;
            results = await enqueueLbcCall(() => lbcSearch(payload3, minPriceInt));
            console.log("🧹 Fallback 2 résultats:", results.length);
        }

        const prices = results
            .map(ad => ad.price_cents / 100)
            .filter(price => typeof price === 'number' && isFinite(price))
            .sort((a, b) => a - b);

        console.log("📊 Prix triés (en €):", prices);

        let estimatedPrice = null;
        if (prices.length > 0) {
            const mid = Math.floor(prices.length / 2);
            estimatedPrice = prices.length % 2 === 0
                ? (prices[mid - 1] + prices[mid]) / 2
                : prices[mid];
            console.log(`🧮 Médiane: ${estimatedPrice} € (${prices.length} annonces)`);
        }

        const lowPrice = prices.length ? prices[0] : null;
        const highPrice = prices.length ? prices[prices.length - 1] : null;
        const potentialPlusValue = highPrice && lowPrice ? Math.round((highPrice - lowPrice) * 0.2) : null;

        const responseData = {
            ok: true,
            estimatedPrice: estimatedPrice ? Math.round(estimatedPrice) : null,
            lowPrice,
            highPrice,
            potentialPlusValue,
            count: results.length,
            results: results.slice(0, 10),
            warning: results.length < 3 ? "Pas assez d'annonces fiables – élargis les ranges ?" : null
        };

        // ✅ CACHE SERVEUR (PostgreSQL): Store with both stockNumber and modelCacheKey
        const hasValidPrice = responseData.estimatedPrice &&
                             typeof responseData.estimatedPrice === 'number' &&
                             responseData.estimatedPrice > 0;

        if (hasValidPrice) {
            const keysToStore = [primaryCacheKey];
            if (stockNumber && stockNumber !== modelCacheKey) keysToStore.push(modelCacheKey);
            for (const key of keysToStore) {
                setCachedEstimation(key, responseData)
                    .then(() => {
                        cacheStats.stores++;
                        console.log(`[💾 Cache DB] STORED for key: ${key} (${responseData.estimatedPrice}€)`);
                    })
                    .catch(err => console.error('[💾 Cache DB] Store error:', err.message));
            }
        } else {
            console.log(`[💾 Cache DB] NOT CACHED - No valid LBC price for key: ${primaryCacheKey}`);
        }

        logEstimation(req, { brand, model, year: yearInt, km: kmInt, fuel, stockNumber, cacheHit: false, lbcCount: results.length, estimatedPrice: responseData.estimatedPrice });
        res.json({ ...responseData, isPaid: !!req.subscriber });

        // Log observation for ML training (non-blocking)
        if (req.subscriber) {
            logPriceObservation(req.subscriber.id, {
                stockNumber, brand, model, year: yearInt, km: kmInt,
                fuel, gearbox, doors, auto1Price: null,
                estimatedPrice: responseData.estimatedPrice,
                lowPrice: responseData.lowPrice,
                highPrice: responseData.highPrice,
                count: responseData.count,
                options: responseData.aiAnalysis?.detectedOptions || [],
                rawParams: req.query
            }).catch(err => console.error('[📊 ML] Failed to log observation:', err.message));
        }

    } catch (error) {
        if (error.message === 'DATADOME_BLOCKED') {
            logEstimation(req, { brand, model, year: yearInt, km: kmInt, fuel, stockNumber, cacheHit: false, error: 'DATADOME_BLOCKED' });
            return res.json({ ok: true, estimatedPrice: null, lowPrice: null, highPrice: null, count: 0, results: [], warning: 'LBC temporairement indisponible', isPaid: !!req.subscriber });
        }
        console.error("❌ Scraping failed:", error);
        logEstimation(req, { brand, model, year: yearInt, km: kmInt, fuel, stockNumber, cacheHit: false, error: error.message });
        res.status(500).json({ ok: false, error: error.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// TRACK 2 — Client-side LBC scraping endpoints
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/lbc-payloads
router.use('/api/lbc-payloads', rateLimiter);
router.get('/api/lbc-payloads', optionalApiKeyAuth, async (req, res) => {
    let stockNumber = null;
    try {
        if (req.query.carData) {
            const carData = JSON.parse(req.query.carData);
            stockNumber = carData.stockNumber;
        }
    } catch (_) {}

    const { model, brand, year, km, fuel, gearbox, doors, colour, critair, min_price = 500 } = req.query;
    if (!model || !brand || !year || !km) {
        return res.status(400).json({ ok: false, error: "Paramètres manquants (model, brand, year, km)" });
    }

    const built = buildLbcPayloads({
        brand, model, year, km, fuel, gearbox, doors, colour, critair,
        carModel: req.query.carModel,
        minPrice: min_price
    });

    const modelCacheKey = `model_${built.brandMapped.toUpperCase()}_${model}_${built.yearInt}`;
    const primaryCacheKey = stockNumber || modelCacheKey;

    // Cache check
    try {
        const keysToCheck = stockNumber ? [primaryCacheKey, modelCacheKey] : [modelCacheKey];
        for (const key of keysToCheck) {
            const cachedResult = await getCachedEstimation(key);
            if (cachedResult) {
                cacheStats.hits++;
                const hitRate = ((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100).toFixed(1);
                console.log(`[💾 Cache DB] HIT for key: ${key} (hit rate: ${hitRate}%) [lbc-payloads]`);
                logEstimation(req, { brand, model, year: built.yearInt, km: built.kmInt, fuel, stockNumber, cacheHit: true, estimatedPrice: cachedResult.estimatedPrice });
                return res.json({
                    ok: true,
                    cached: true,
                    data: { ...cachedResult, isPaid: !!req.subscriber }
                });
            }
        }
        cacheStats.misses++;
    } catch (err) {
        console.error('[💾 Cache DB] Read error (lbc-payloads):', err.message);
        cacheStats.misses++;
    }

    logEstimation(req, { brand, model, year: built.yearInt, km: built.kmInt, fuel, stockNumber, cacheHit: false });

    // Cache miss → return payloads for client to execute
    res.json({
        ok: true,
        cached: false,
        lbcUrl: 'https://api.leboncoin.fr/finder/search',
        payloads: built.payloads,
        cacheKeys: { primary: primaryCacheKey, model: modelCacheKey },
        isPaid: !!req.subscriber
    });
});

// POST /api/estimation-from-ads
router.use('/api/estimation-from-ads', rateLimiter);
router.post('/api/estimation-from-ads', optionalApiKeyAuth, express.json({ limit: '2mb' }), async (req, res) => {
    const { model, brand, year, km, fuel, gearbox, doors, colour, critair, min_price = 500, carModel, carData, ads } = req.body || {};
    if (!model || !brand || !year || !km) {
        return res.status(400).json({ ok: false, error: "Paramètres manquants (model, brand, year, km)" });
    }
    if (!Array.isArray(ads)) {
        return res.status(400).json({ ok: false, error: "Param 'ads' manquant ou invalide (doit être un tableau)" });
    }

    let stockNumber = null;
    try {
        if (carData) {
            const parsed = typeof carData === 'string' ? JSON.parse(carData) : carData;
            stockNumber = parsed?.stockNumber || null;
        }
    } catch (_) {}

    const built = buildLbcPayloads({ brand, model, year, km, fuel, gearbox, doors, colour, critair, carModel, minPrice: min_price });
    const modelCacheKey = `model_${built.brandMapped.toUpperCase()}_${model}_${built.yearInt}`;
    const primaryCacheKey = stockNumber || modelCacheKey;

    // Re-check cache
    try {
        const keysToCheck = stockNumber ? [primaryCacheKey, modelCacheKey] : [modelCacheKey];
        for (const key of keysToCheck) {
            const cachedResult = await getCachedEstimation(key);
            if (cachedResult) {
                cacheStats.hits++;
                console.log(`[💾 Cache DB] HIT for key: ${key} [estimation-from-ads]`);
                logEstimation(req, { brand, model, year: built.yearInt, km: built.kmInt, fuel, stockNumber, cacheHit: true, estimatedPrice: cachedResult.estimatedPrice });
                return res.json({ ...cachedResult, isPaid: !!req.subscriber });
            }
        }
    } catch (err) {
        console.error('[💾 Cache DB] Read error (estimation-from-ads):', err.message);
    }

    const filtered = filterLbcAds(ads, built.minPriceInt);
    console.log(`[📥 Client ads] brand=${brand} model=${model} raw=${ads.length} filtered=${filtered.length}`);
    const responseData = computeEstimationFromFilteredAds(filtered);

    // Cache only if we got a real price
    const hasValidPrice = responseData.estimatedPrice &&
                         typeof responseData.estimatedPrice === 'number' &&
                         responseData.estimatedPrice > 0;

    if (hasValidPrice) {
        const keysToStore = [primaryCacheKey];
        if (stockNumber && stockNumber !== modelCacheKey) keysToStore.push(modelCacheKey);
        for (const key of keysToStore) {
            setCachedEstimation(key, responseData)
                .then(() => {
                    cacheStats.stores++;
                    console.log(`[💾 Cache DB] STORED for key: ${key} (${responseData.estimatedPrice}€) [estimation-from-ads]`);
                })
                .catch(err => console.error('[💾 Cache DB] Store error:', err.message));
        }
    } else {
        console.log(`[💾 Cache DB] NOT CACHED - No valid LBC price for key: ${primaryCacheKey} [estimation-from-ads]`);
    }

    logEstimation(req, { brand, model, year: built.yearInt, km: built.kmInt, fuel, stockNumber, cacheHit: false, lbcCount: filtered.length, estimatedPrice: responseData.estimatedPrice });
    res.json({ ...responseData, isPaid: !!req.subscriber });

    // Log observation for ML training (non-blocking)
    if (req.subscriber) {
        logPriceObservation(req.subscriber.id, {
            stockNumber, brand, model,
            year: built.yearInt, km: built.kmInt,
            fuel, gearbox, doors,
            auto1Price: null,
            estimatedPrice: responseData.estimatedPrice,
            lowPrice: responseData.lowPrice,
            highPrice: responseData.highPrice,
            count: responseData.count,
            options: [],
            rawParams: req.body
        }).catch(err => console.error('[📊 ML] Failed to log observation:', err.message));
    }
});

// GET /api/lbc-url - Generate LeBonCoin search URL
router.get('/api/lbc-url', optionalApiKeyAuth, (req, res) => {
    const { model, brand, year, km, fuel, gearbox, doors } = req.query;
    if (!model || !brand || !year || !km) {
        return res.status(400).json({ ok: false, error: "Paramètres manquants" });
    }

    const rawBrand = brand || "";
    const brandMapped = brandMap[rawBrand.toUpperCase()] || rawBrand;
    const yearInt = parseInt(year);
    const kmInt = parseInt(km);

    const carModel = req.query.carModel || model;
    let uCarModel = '';
    let text = model;
    if (brand && carModel) {
        let modelClean = carModel.trim();
        const brandUpper = brandMapped.toUpperCase().replace(/ /g, '-');

        if (brandMapped.toUpperCase() === "MERCEDES-BENZ" && modelClean.includes('-Klasse')) {
            const base = modelClean.replace(/-Klasse$/, '');
            text = `${brandMapped} ${base}`;
            uCarModel = `${brandUpper}_${base},${brandUpper}_Classe ${base}`;
        } else if (brandMapped.toUpperCase() === "VOLKSWAGEN" && modelClean.startsWith('Golf')) {
            modelClean = 'Golf';
            uCarModel = `${brandUpper}_${modelClean}`;
        } else {
            uCarModel = `${brandUpper}_${modelClean}`;
        }
    }

    let doorsParam = '';
    if (doors) {
        doorsParam = doors === "4" ? '5,4' : doors;
    }

    const lbcUrl = `https://www.leboncoin.fr/recherche?category=2&text=${encodeURIComponent(text)}&regdate=${yearInt-2}-${yearInt+2}&mileage=${Math.max(1, kmInt - 30000)}-${kmInt + 30000}&gearbox=${mapGearbox(gearbox) || ''}&fuel=${mapFuelType(fuel) || ''}&u_car_brand=${brandMapped.toUpperCase()}&u_car_model=${uCarModel}&doors=${doorsParam}&sort=price&order=asc`;

    res.json({ ok: true, url: lbcUrl });
});

module.exports = router;
