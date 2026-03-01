require('dotenv').config();
const express = require("express");
const cors = require("cors");
const cron = require('node-cron');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const {
  initDb, getSubscriberByApiKey, closePool,
  getCachedEstimation, setCachedEstimation, cleanExpiredCache,
  logPriceObservation,
  getSavedVehicles, saveVehicle, deleteSavedVehicle,
  getAlerts, createAlert, updateAlert, deleteAlert,
  createAuthCode, verifyAuthCode,
  getObservationStats, getActiveAlertCount, getObservations,
  getRecentDeals, getUnseenAlertMatches, markAlertMatchesSeen,
  createBetaTester, getBetaTesters,
  pool,
} = require('./db');
const { matchAlerts } = require('./alertMatcher');
const stripeRouter = require('./stripe');
const { sendAuthCode } = require('./email');
const app = express();
const PORT = process.env.PORT || 9001;

// Startup check: LBC API key is required
if (!process.env.LBC_API_KEY) {
    console.warn('[⚠️ Config] LBC_API_KEY is not set. LeBonCoin API calls will fail without a valid API key.');
}

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

// CORS configuration
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://www.auto1.com').split(',').map(o => o.trim());
// Always allow dashboard dev server and local API in development
if (!allowedOrigins.includes('http://localhost:5173')) allowedOrigins.push('http://localhost:5173');
if (!allowedOrigins.includes('http://localhost:9001')) allowedOrigins.push('http://localhost:9001');

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (curl, server-to-server)
        if (!origin) return callback(null, true);
        // Allow Chrome extensions (popup, background, content scripts)
        if (origin.startsWith('chrome-extension://')) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-API-Key'],
    credentials: true
}));

// Mount Stripe router BEFORE JSON parsing (webhook needs raw body)
app.use(stripeRouter);

// JSON body parsing for all other routes (webhook is already handled above)
app.use((req, res, next) => {
    if (req.path === '/api/webhook') return next();
    express.json({ limit: '1mb' })(req, res, next);
});

// Security headers
app.use((req, res, next) => {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    next();
});

// Request logging
app.use((req, res, next) => {
    const start = Date.now();
    const originalEnd = res.end;

    res.end = function(...args) {
        const duration = Date.now() - start;
        const status = res.statusCode;

        // Only log non-health requests to reduce noise
        if (req.path !== '/api/health') {
            console.log(`[${status}] ${req.method} ${req.path} ${duration}ms${req.headers['x-api-key'] ? ' [auth]' : ''}`);
        }

        originalEnd.apply(res, args);
    };

    next();
});

// Simple rate limiter per API key
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per minute

function rateLimiter(req, res, next) {
    const key = req.headers['x-api-key'] || req.ip;
    const now = Date.now();

    if (!rateLimits.has(key)) {
        rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
        return next();
    }

    const limit = rateLimits.get(key);

    if (now > limit.resetAt) {
        limit.count = 1;
        limit.resetAt = now + RATE_LIMIT_WINDOW;
        return next();
    }

    limit.count++;

    if (limit.count > RATE_LIMIT_MAX) {
        res.set('Retry-After', Math.ceil((limit.resetAt - now) / 1000));
        return res.status(429).json({
            ok: false,
            error: 'Trop de requetes. Reessayez dans quelques secondes.',
            retryAfter: Math.ceil((limit.resetAt - now) / 1000)
        });
    }

    next();
}

// Cleanup old rate limit entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, limit] of rateLimits) {
        if (now > limit.resetAt + RATE_LIMIT_WINDOW) {
            rateLimits.delete(key);
        }
    }
}, 5 * 60 * 1000);

// Apply rate limiting to API routes (except webhook and health)
app.use('/api/estimation', rateLimiter);
app.use('/api/vehicles', rateLimiter);
app.use('/api/alerts', rateLimiter);
app.use('/api/deals', rateLimiter);
app.use('/api/observations', rateLimiter);
app.use('/api/dashboard', rateLimiter);
app.use('/api/auth', rateLimiter);
app.use('/api/alert-matches', rateLimiter);

// API Key authentication middleware (strict - blocks without key)
async function apiKeyAuth(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;

    if (!apiKey) {
        return res.status(401).json({
            ok: false,
            error: 'Clé API requise. Configurez-la dans les paramètres de l\'extension.'
        });
    }

    try {
        const subscriber = await getSubscriberByApiKey(apiKey);

        if (!subscriber || subscriber.subscription_status !== 'active') {
            return res.status(403).json({
                ok: false,
                error: 'Abonnement expiré ou clé invalide.'
            });
        }

        req.subscriber = subscriber;
        next();
    } catch (error) {
        console.error('[🔑 Auth] Database error:', error.message);
        return res.status(500).json({ ok: false, error: 'Erreur interne d\'authentification.' });
    }
}

// Optional API Key middleware (works without key, enriches if present)
async function optionalApiKeyAuth(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;

    if (apiKey) {
        try {
            const subscriber = await getSubscriberByApiKey(apiKey);
            if (subscriber && subscriber.subscription_status === 'active') {
                req.subscriber = subscriber;
            }
        } catch (error) {
            // Silent fail - continue without auth
        }
    }

    next();
}

// ✅ CACHE SERVEUR - PostgreSQL-backed, partagé entre tous les utilisateurs
// Expired entries filtered by SQL WHERE clause (created_at > NOW() - 24h)
// In-memory stats for monitoring (reset on restart, non-critical)
let cacheStats = {
    hits: 0,
    misses: 0,
    stores: 0,
    startTime: Date.now()
};

// Periodic cleanup of expired cache entries (every 30 minutes)
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
  // Ajoute d'autres
};

// Blacklist pour filtrer pièces/scams
const blacklistKeywords = [
    "moteur", "boite", "turbo", "injecteur", "piece", "pieces", "épave", "pour pieces", "démonté", "casse", "moteurs"
];

// Anti-spam: 2s entre appels (30 req/min max)
let lastRequestTimestamp = 0;

// === Auth Routes (Magic Link) ===

// POST /api/auth/request-code - Request a login code
app.post('/api/auth/request-code', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !email.includes('@')) {
            return res.status(400).json({ ok: false, error: 'Email invalide' });
        }

        // Check if subscriber exists
        const { rows } = await pool.query(
            `SELECT * FROM subscribers WHERE email = $1`,
            [email]
        );

        if (rows.length === 0) {
            return res.status(404).json({ ok: false, error: 'Aucun compte trouve avec cet email. Souscrivez d\'abord.' });
        }

        if (rows[0].subscription_status !== 'active') {
            return res.status(403).json({ ok: false, error: 'Abonnement inactif' });
        }

        const code = await createAuthCode(email);

        // Send auth code via email (falls back to console log if no RESEND_API_KEY)
        const emailResult = await sendAuthCode(email, code);
        if (!emailResult.success && !emailResult.fallback) {
            console.error('[🔐 Auth] Failed to send code email');
            // Still return ok - the code is in the DB, user can try again
        }

        res.json({ ok: true, message: 'Code envoye par email' });
    } catch (err) {
        console.error('[🔐 Auth] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Erreur serveur' });
    }
});

// POST /api/auth/verify-code - Verify login code
app.post('/api/auth/verify-code', async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) {
            return res.status(400).json({ ok: false, error: 'Email et code requis' });
        }

        const subscriber = await verifyAuthCode(email, code);

        if (!subscriber) {
            return res.status(401).json({ ok: false, error: 'Code invalide ou expire' });
        }

        if (subscriber.subscription_status !== 'active') {
            return res.status(403).json({ ok: false, error: 'Abonnement inactif' });
        }

        res.json({
            ok: true,
            apiKey: subscriber.api_key,
            email: subscriber.email,
            status: subscriber.subscription_status
        });
    } catch (err) {
        console.error('[🔐 Auth] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Erreur serveur' });
    }
});

// POST /api/auth/google - Google SSO authentication
app.post('/api/auth/google', express.json(), async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ ok: false, error: 'Token Google manquant' });
        }

        // Vérifier le token avec l'API Google
        const googleRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!googleRes.ok) {
            return res.status(401).json({ ok: false, error: 'Token Google invalide ou expiré' });
        }

        const googleData = await googleRes.json();
        const email = googleData.email;

        if (!email) {
            return res.status(401).json({ ok: false, error: 'Email non récupérable depuis Google' });
        }

        // Chercher le subscriber par email
        const subscriber = await getSubscriberByEmail(email);

        if (!subscriber) {
            return res.status(404).json({
                ok: false,
                error: 'Aucun compte trouvé pour cet email. Créez votre compte sur carlytics.fr',
                signupUrl: 'https://carlytics.fr'
            });
        }

        if (subscriber.subscription_status !== 'active') {
            return res.status(403).json({ ok: false, error: 'Abonnement inactif ou expiré' });
        }

        console.log(`[🔐 Auth] Google SSO login: ${email}`);
        res.json({ ok: true, apiKey: subscriber.api_key, email: subscriber.email });

    } catch (err) {
        console.error('[🔐 Auth] Google SSO error:', err.message);
        res.status(500).json({ ok: false, error: 'Erreur serveur' });
    }
});

// === Dashboard Routes ===

// GET /api/dashboard/stats - Get dashboard overview stats
app.get('/api/dashboard/stats', apiKeyAuth, async (req, res) => {
    try {
        const stats = await getObservationStats(req.subscriber.id);
        const activeAlerts = await getActiveAlertCount(req.subscriber.id);

        res.json({
            ok: true,
            totalSearches: parseInt(stats.today_searches),
            avgMargin: Math.round(parseFloat(stats.avg_margin)),
            totalAllTime: parseInt(stats.total_searches),
            activeAlerts
        });
    } catch (err) {
        console.error('[📊 Dashboard] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to fetch stats' });
    }
});

// GET /api/observations - Get search history
app.get('/api/observations', apiKeyAuth, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const offset = parseInt(req.query.offset) || 0;
        const observations = await getObservations(req.subscriber.id, limit, offset);

        res.json({ ok: true, observations });
    } catch (err) {
        console.error('[📊 History] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to fetch observations' });
    }
});

// Health check endpoint
app.get("/api/health", async (req, res) => {
    const uptime = Math.round((Date.now() - cacheStats.startTime) / 1000 / 60); // minutes
    const hitRate = cacheStats.hits + cacheStats.misses > 0
        ? ((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100).toFixed(1)
        : 0;

    // Query DB for active cache size (non-expired entries)
    let cacheSize = 0;
    try {
        const { rows } = await pool.query(
            `SELECT COUNT(*) AS cnt FROM estimation_cache WHERE created_at > NOW() - INTERVAL '24 hours'`
        );
        cacheSize = parseInt(rows[0].cnt);
    } catch (err) {
        console.error('[💾 Cache DB] Health check count error:', err.message);
    }

    res.json({
        ok: true,
        status: 'running',
        aiEnabled: false,
        timestamp: new Date().toISOString(),
        cache: {
            size: cacheSize,
            hits: cacheStats.hits,
            misses: cacheStats.misses,
            stores: cacheStats.stores,
            hitRate: hitRate + '%',
            uptime: uptime + ' minutes',
            backend: 'postgresql'
        }
    });
});

app.get("/api/estimation", optionalApiKeyAuth, async (req, res) => {
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

    // ✅ CACHE SERVEUR (PostgreSQL): Check cache avant appel LBC
    if (stockNumber) {
        try {
            const cachedResult = await getCachedEstimation(stockNumber);
            if (cachedResult) {
                cacheStats.hits++;
                const hitRate = ((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100).toFixed(1);
                console.log(`[💾 Cache DB] HIT for stockNumber: ${stockNumber} (hit rate: ${hitRate}%)`);
                return res.json(cachedResult);
            }
            cacheStats.misses++;
        } catch (err) {
            console.error('[💾 Cache DB] Read error:', err.message);
            cacheStats.misses++;
        }
    }

    const now = Date.now();
    if (now - lastRequestTimestamp < 2000) {
        return res.status(429).json({ ok: false, error: "Trop de requêtes. Réessaie dans quelques secondes." });
    }

    const { model, brand, year, km, fuel, gearbox, doors, vehicle_type, colour, critair, min_price = 500 } = req.query;
    if (!model || !brand || !year || !km) {
        return res.status(400).json({ ok: false, error: "Paramètres manquants (model, brand, year, km)" });
    }

    const rawBrand = brand || "";
    const brandMapped = brandMap[rawBrand.toUpperCase()] || rawBrand;
    const yearInt = parseInt(year);
    const kmInt = parseInt(km);
    const minPriceInt = parseInt(min_price);

    lastRequestTimestamp = now;

    const enums = {
        ad_type: ["offer"],
    };

    if (brand) {
        enums.u_car_brand = [brandMapped.toUpperCase()];
    }

    const mappedFuel = mapFuelType(fuel);
    if (mappedFuel) enums.fuel = [mappedFuel];

    const mappedGearbox = mapGearbox(gearbox);
    if (mappedGearbox) enums.gearbox = [mappedGearbox];

    if (doors) {
        if (doors === "4") {
            enums.doors = ["4", "5"]; // Recherche 4 et 5 pour CLA/GLE etc. (Shooting Brake/Break souvent 5p)
        } else {
            enums.doors = [doors]; // Ex: 3p seulement 3
        }
    }

    // ✅ FIX: Ne pas utiliser vehicle_type - trop restrictif et incohérent entre Auto1 et LBC
    // Auto1 catégorise différemment de LBC (ex: 5008 = "van" sur Auto1 mais "suv" sur LBC)
    // if (vehicle_type) enums.vehicle_type = [vehicle_type];

    if (colour) enums.vehicule_color = [colour];
    if (critair) enums.critair = [critair];

    const carModel = req.query.carModel || model; // Fallback sur model
    let uCarModel;
    let keywordsText = model; // Default keywords
    if (brand && carModel) {
        let modelClean = carModel.trim(); // ✅ FIX: Ne pas remplacer les espaces par défaut

        // ✅ FIX: Garder les espaces pour certaines marques (ex: ALFA ROMEO)
        // Ne pas convertir en tirets si la marque doit garder les espaces
        const brandUpper = brandMapped.toUpperCase();
        const needsSpacePreserved = brandUpper.includes("ALFA ROMEO"); // Marques qui doivent garder l'espace
        const brandForModel = needsSpacePreserved ? brandUpper : brandUpper.replace(/ /g, '-');

        // Map spécial Mercedes pour Klasse -> Classe (CLA, CLE, GLA, GLE etc.)
        if (brandMapped.toUpperCase() === "MERCEDES-BENZ" && modelClean.includes('-Klasse')) {
            const base = modelClean.replace(/-Klasse$/, '');
            keywordsText = `${brandMapped} ${base}`; // Keywords sans -Klasse, ex: "Mercedes-Benz CLA"

            // ✅ FIX: Envoyer les DEUX formats pour Mercedes (CLA + Classe CLA)
            enums.u_car_model = [
                `${brandForModel}_${base}`,           // Ex: MERCEDES-BENZ_CLA
                `${brandForModel}_Classe ${base}`     // Ex: MERCEDES-BENZ_Classe CLA
            ];
        } else if (brandMapped.toUpperCase() === "VOLKSWAGEN" && modelClean.startsWith('Golf')) {
            modelClean = 'Golf'; // Use base Golf for Volkswagen, specify generation in keywords
            uCarModel = `${brandForModel}_${modelClean}`;
            enums.u_car_model = [uCarModel];
        } else {
            uCarModel = `${brandForModel}_${modelClean}`; // Ex: ALFA ROMEO_MiTo (avec espace pour Alfa Romeo)
            enums.u_car_model = [uCarModel];
        }
    }

    // Keywords avec exclusions pour virer pièces
    keywordsText = `${keywordsText}`;

    const payload = {
        extend: true,
        filters: {
            category: { id: "2" }, // Voitures
            enums,
            keywords: { text: keywordsText },
            ranges: {
                regdate: {
                    min: yearInt - 3
                    // ✅ Pas de max - permet de trouver des véhicules plus récents vendus moins cher
                },
                mileage: {
                    max: kmInt + 30000
                    // ✅ Pas de min - permet de trouver des véhicules avec moins de km vendus moins cher
                },
                price: { // Ajout: filtre prix min pour éviter scams
                    min: minPriceInt,
                }
            }
        },
        listing_source: "direct-search",
        offset: 0,
        limit: 35, // Limite à 35
        limit_alu: 3,
        sort_by: "price", // Tri par prix
        sort_order: "asc" // Ascendant pour les moins chers d'abord
    };

    console.log("📦 Payload envoyé à LBC:\n", JSON.stringify(payload, null, 2)); // Log payload
    console.log("🔍 u_car_model:", payload.filters.enums.u_car_model); // Log u_car_model specifically
    console.log("🔍 keywords:", payload.filters.keywords.text); // Log keywords

    try {
        const response = await fetch("https://api.leboncoin.fr/finder/search", {
            method: "POST",
            headers: HEADERS,
            body: JSON.stringify(payload)
        });

        const text = await response.text();
        if (!text || text.length < 10) {
            throw new Error("Réponse vide ou invalide – possible blocage API");
        }

        const data = JSON.parse(text);
        console.log("📥 Réponse brute de LBC (data.ads length):", data.ads ? data.ads.length : 0); // Log nombre d'annonces brutes

        let results = data.ads || [];

        // Post-filtrage: virer si blacklist dans title/body, ou pas d'attributs voiture entière
        results = results.filter(ad => {
            const titleLower = ad.subject.toLowerCase();
            const bodyLower = ad.body.toLowerCase();
            const hasBlacklist = blacklistKeywords.some(word => titleLower.includes(word) || bodyLower.includes(word));
            const hasCarAttrs = ad.attributes.some(attr => attr.key === "doors" && attr.value) && 
                                ad.attributes.some(attr => attr.key === "seats" && attr.value) &&
                                ad.attributes.some(attr => attr.key === "vehicle_type" && attr.value !== "");
            const priceValid = ad.price_cents >= minPriceInt * 100;
            console.log(`🔍 Filtrage annonce ${ad.list_id}: hasBlacklist=${hasBlacklist}, hasCarAttrs=${hasCarAttrs}, priceValid=${priceValid}`); // Log par annonce pourquoi filtrée ou non
            return !hasBlacklist && hasCarAttrs && priceValid;
        });

        console.log("🧹 Annonces après filtrage (count):", results.length); // Log count après clean

        // Extraire prix (en €), trier
        const prices = results
            .map(ad => {
                const priceEuro = ad.price_cents / 100; // Division ici : price_cents est en centimes (ex: 35000 -> 350€)
                console.log(`💰 Prix extrait pour annonce ${ad.list_id}: ${ad.price_cents} cents -> ${priceEuro} €`); // Log conversion par annonce
                return priceEuro;
            })
            .filter(price => typeof price === 'number' && isFinite(price))
            .sort((a, b) => a - b);

        console.log("📊 Liste des prix triés (en €):", prices); // Log tous les prix cleans

        // Calcul médiane (plus robuste)
        let estimatedPrice = null;
        if (prices.length > 0) {
            const mid = Math.floor(prices.length / 2);
            estimatedPrice = prices.length % 2 === 0 
                ? (prices[mid - 1] + prices[mid]) / 2 
                : prices[mid];
            console.log(`🧮 Calcul médiane: ${estimatedPrice} € (basée sur ${prices.length} prix)`); // Log médiane
        }

        // Bonus: prix bas/moyen/haut pour plus-value
        const lowPrice = prices.length ? prices[0] : null;
        const highPrice = prices.length ? prices[prices.length - 1] : null;
        const potentialPlusValue = highPrice && lowPrice ? Math.round((highPrice - lowPrice) * 0.2) : null; // Estimation 20% marge revente
        console.log(`📈 Stats prix: low=${lowPrice}, high=${highPrice}, plus-value potentielle=${potentialPlusValue}`); // Log stats

        const responseData = {
            ok: true,
            estimatedPrice: estimatedPrice ? Math.round(estimatedPrice) : null,
            lowPrice,
            highPrice,
            potentialPlusValue, // Idée pour ton business: marge potentielle
            count: results.length,
            results: results.slice(0, 10), // Renvoie top 10 cleans
            warning: results.length < 3 ? "Pas assez d'annonces fiables – élargis les ranges ?" : null
        };

        // ✅ CACHE SERVEUR (PostgreSQL): Store result if valid price
        if (stockNumber) {
            const hasValidPrice = responseData?.estimatedPrice &&
                                 typeof responseData.estimatedPrice === 'number' &&
                                 responseData.estimatedPrice > 0;

            if (hasValidPrice) {
                setCachedEstimation(stockNumber, responseData)
                    .then(() => {
                        cacheStats.stores++;
                        console.log(`[💾 Cache DB] STORED result for stockNumber: ${stockNumber} (Price: ${responseData.estimatedPrice}€)`);
                    })
                    .catch(err => console.error('[💾 Cache DB] Store error:', err.message));
            } else {
                console.log(`[💾 Cache DB] NOT CACHED - No valid LBC price for stockNumber: ${stockNumber}`);
            }
        }

        res.json(responseData);

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
        console.error("❌ Scraping failed:", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Nouveau endpoint pour générer URL Leboncoin
app.get("/api/lbc-url", optionalApiKeyAuth, (req, res) => {
    const { model, brand, year, km, fuel, gearbox, doors } = req.query; // Prend params clés, ajoute plus si besoin
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
            // ✅ FIX: Pour l'URL, envoyer les DEUX formats séparés par virgule
            uCarModel = `${brandUpper}_${base},${brandUpper}_Classe ${base}`;
        } else if (brandMapped.toUpperCase() === "VOLKSWAGEN" && modelClean.startsWith('Golf')) {
            modelClean = 'Golf';
            uCarModel = `${brandUpper}_${modelClean}`;
        } else {
            uCarModel = `${brandUpper}_${modelClean}`; // Ex: HYUNDAI_Santa Fe, PEUGEOT_5008 (avec espace dans le modèle)
        }
    }

    let doorsParam = '';
    if (doors) {
        doorsParam = doors === "4" ? '5,4' : doors; // Inverse pour URL (5,4 comme exemple)
    }

    const lbcUrl = `https://www.leboncoin.fr/recherche?category=2&text=${encodeURIComponent(text)}&regdate=${yearInt-2}-${yearInt+2}&mileage=${Math.max(1, kmInt - 30000)}-${kmInt + 30000}&gearbox=${mapGearbox(gearbox) || ''}&fuel=${mapFuelType(fuel) || ''}&u_car_brand=${brandMapped.toUpperCase()}&u_car_model=${uCarModel}&doors=${doorsParam}&sort=price&order=asc`;

    res.json({ ok: true, url: lbcUrl });
});

// Upload photos using node-catbox package (no API key, no rate limits)
const { Catbox } = require('node-catbox');

app.post("/api/upload-images", apiKeyAuth, express.json(), async (req, res) => {
    const { imageUrls, title } = req.body;

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
        return res.status(400).json({ ok: false, error: "imageUrls array required" });
    }

    try {
        console.log(`📤 Uploading ${imageUrls.length} images using node-catbox...`);

        const uploadedImages = [];
        const catbox = new Catbox(); // Create Catbox instance

        // Upload each image using node-catbox
        for (let i = 0; i < imageUrls.length; i++) {
            const imageUrl = imageUrls[i];
            console.log(`📸 Uploading image ${i + 1}/${imageUrls.length}...`);

            try {
                // Upload directly from URL (node-catbox supports this!)
                const catboxUrl = await catbox.uploadURL({ url: imageUrl });

                if (catboxUrl && catboxUrl.startsWith('https://files.catbox.moe/')) {
                    uploadedImages.push({
                        link: catboxUrl,
                        thumb: catboxUrl,
                        index: i + 1
                    });
                    console.log(`✅ Image ${i + 1} uploaded: ${catboxUrl}`);
                } else {
                    console.error(`❌ Image ${i + 1} upload failed: Invalid response`);
                    console.error(`📍 Failed URL:`, imageUrl);
                }
            } catch (error) {
                console.error(`❌ Image ${i + 1} upload error:`, error.message);
            }

            // Small delay between uploads (200ms)
            if (i < imageUrls.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        if (uploadedImages.length === 0) {
            return res.status(500).json({ ok: false, error: "No images uploaded successfully" });
        }

        // Create album text with all image URLs (one per line)
        const albumText = uploadedImages.map(img => img.link).join('\n');

        console.log(`✅ Upload complete: ${uploadedImages.length}/${imageUrls.length} images`);

        return res.json({
            ok: true,
            albumUrl: albumText, // All URLs separated by newlines
            images: uploadedImages,
            totalImages: uploadedImages.length,
            note: uploadedImages.length < imageUrls.length ? `Only ${uploadedImages.length}/${imageUrls.length} uploaded` : undefined
        });

    } catch (error) {
        console.error('❌ Catbox upload error:', error);
        return res.status(500).json({ ok: false, error: error.message });
    }
});

// === Saved Vehicles Routes ===

// GET /api/vehicles - Get user's saved vehicles
app.get('/api/vehicles', apiKeyAuth, async (req, res) => {
    try {
        const vehicles = await getSavedVehicles(req.subscriber.id);
        res.json({ ok: true, vehicles });
    } catch (err) {
        console.error('[🚗 Vehicles] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to fetch vehicles' });
    }
});

// POST /api/vehicles - Save a vehicle
app.post('/api/vehicles', apiKeyAuth, async (req, res) => {
    try {
        const vehicle = await saveVehicle(req.subscriber.id, req.body);
        res.json({ ok: true, vehicle });
    } catch (err) {
        console.error('[🚗 Vehicles] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to save vehicle' });
    }
});

// DELETE /api/vehicles/:stockNumber - Delete a saved vehicle
app.delete('/api/vehicles/:stockNumber', apiKeyAuth, async (req, res) => {
    try {
        const deleted = await deleteSavedVehicle(req.subscriber.id, req.params.stockNumber);
        res.json({ ok: true, deleted });
    } catch (err) {
        console.error('[🚗 Vehicles] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to delete vehicle' });
    }
});

// === Alert Routes ===

// GET /api/alerts - Get user's alerts
app.get('/api/alerts', apiKeyAuth, async (req, res) => {
    try {
        const alerts = await getAlerts(req.subscriber.id);
        res.json({ ok: true, alerts });
    } catch (err) {
        console.error('[🔔 Alerts] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to fetch alerts' });
    }
});

// POST /api/alerts - Create an alert
app.post('/api/alerts', apiKeyAuth, async (req, res) => {
    try {
        const alert = await createAlert(req.subscriber.id, req.body);
        res.json({ ok: true, alert });
    } catch (err) {
        console.error('[🔔 Alerts] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to create alert' });
    }
});

// PUT /api/alerts/:id - Update an alert
app.put('/api/alerts/:id', apiKeyAuth, async (req, res) => {
    try {
        const alert = await updateAlert(req.subscriber.id, req.params.id, req.body);
        if (!alert) return res.status(404).json({ ok: false, error: 'Alert not found' });
        res.json({ ok: true, alert });
    } catch (err) {
        console.error('[🔔 Alerts] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to update alert' });
    }
});

// DELETE /api/alerts/:id - Delete an alert
app.delete('/api/alerts/:id', apiKeyAuth, async (req, res) => {
    try {
        const deleted = await deleteAlert(req.subscriber.id, req.params.id);
        res.json({ ok: true, deleted });
    } catch (err) {
        console.error('[🔔 Alerts] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to delete alert' });
    }
});

// === Deal & Alert Match Routes ===

// GET /api/deals/top - Get top recent deals by margin
app.get('/api/deals/top', apiKeyAuth, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const deals = await getRecentDeals(req.subscriber.id, limit);
        res.json({ ok: true, deals });
    } catch (err) {
        console.error('[💰 Deals] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to fetch deals' });
    }
});

// GET /api/alert-matches - Get unseen alert matches
app.get('/api/alert-matches', apiKeyAuth, async (req, res) => {
    try {
        const matches = await getUnseenAlertMatches(req.subscriber.id);
        res.json({ ok: true, matches });
    } catch (err) {
        console.error('[🔔 Matches] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to fetch matches' });
    }
});

// POST /api/alert-matches/seen - Mark matches as seen
app.post('/api/alert-matches/seen', apiKeyAuth, async (req, res) => {
    try {
        const { matchIds } = req.body;
        if (!Array.isArray(matchIds)) {
            return res.status(400).json({ ok: false, error: 'matchIds must be an array' });
        }
        await markAlertMatchesSeen(req.subscriber.id, matchIds);
        res.json({ ok: true });
    } catch (err) {
        console.error('[🔔 Matches] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to mark matches seen' });
    }
});

// === Beta Signup ===

// Serve beta signup page
const betaPagePath = require('path').join(__dirname, '..', 'landing', 'beta.html');
app.get('/beta', (req, res) => {
    res.sendFile(betaPagePath);
});

// Beta signup API (public — no auth required)
app.post('/api/beta-signup', async (req, res) => {
    try {
        const { name, email, phone, vehiclesPerMonth, timeComparing } = req.body;

        if (!name || !email) {
            return res.status(400).json({ ok: false, error: 'Nom et email requis.' });
        }

        // Basic email validation
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ ok: false, error: 'Email invalide.' });
        }

        const tester = await createBetaTester({ name, email, phone, vehiclesPerMonth, timeComparing });
        console.log(`[🧪 Beta] New signup: ${name} <${email}>`);

        res.json({ ok: true, message: 'Inscription enregistree ! On vous contacte tres vite.' });
    } catch (err) {
        console.error('[🧪 Beta] Signup error:', err.message);
        res.status(500).json({ ok: false, error: 'Erreur lors de l\'inscription.' });
    }
});

// List beta testers (admin — protected by API key)
app.get('/api/beta-testers', apiKeyAuth, async (req, res) => {
    try {
        const testers = await getBetaTesters();
        res.json({ ok: true, testers });
    } catch (err) {
        console.error('[🧪 Beta] List error:', err.message);
        res.status(500).json({ ok: false, error: 'Erreur lors de la récupération.' });
    }
});

// === Cron Jobs ===

// Match alerts every 15 minutes
cron.schedule('*/15 * * * *', async () => {
    console.log('[⏰ Cron] Running alert matcher...');
    const result = await matchAlerts();
    console.log(`[⏰ Cron] Alert matcher done: ${result.matched} matches, ${result.notified} notified`);
});

// Clean expired cache every hour
cron.schedule('0 * * * *', async () => {
    try {
        const cleaned = await cleanExpiredCache();
        if (cleaned > 0) console.log(`[⏰ Cron] Cleaned ${cleaned} expired cache entries`);
    } catch (err) {
        console.error('[⏰ Cron] Cache cleanup error:', err.message);
    }
});

// Clean expired auth codes every 6 hours
cron.schedule('0 */6 * * *', async () => {
    try {
        const { rowCount } = await pool.query(
            `DELETE FROM auth_codes WHERE expires_at < NOW() - INTERVAL '1 hour'`
        );
        if (rowCount > 0) console.log(`[⏰ Cron] Cleaned ${rowCount} expired auth codes`);
    } catch (err) {
        console.error('[⏰ Cron] Auth code cleanup error:', err.message);
    }
});

// Initialize DB then start server
initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 LBC Estimator listening on http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('❌ Failed to initialize database:', err.message);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('[🛑] SIGTERM received, closing pool...');
    await closePool();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('[🛑] SIGINT received, closing pool...');
    await closePool();
    process.exit(0);
});