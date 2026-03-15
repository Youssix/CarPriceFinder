require('dotenv').config();
const express = require("express");
const cors = require("cors");
const cron = require('node-cron');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const {
  initDb, getSubscriberByApiKey, getSubscriberByEmail, closePool,
  getCachedEstimation, setCachedEstimation, cleanExpiredCache,
  logPriceObservation,
  getSavedVehicles, saveVehicle, deleteSavedVehicle,
  getAlerts, createAlert, updateAlert, deleteAlert,
  createFreeSubscriber,
  createAuthCode, verifyAuthCode,
  getObservationStats, getActiveAlertCount, getObservations,
  getRecentDeals, getUnseenAlertMatches, markAlertMatchesSeen,
  createBetaTester, getBetaTesters,
  createPasswordToken, verifyAndConsumePasswordToken,
  setSubscriberPassword, verifySubscriberPassword,
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

        if (!subscriber || !['active', 'free'].includes(subscriber.subscription_status)) {
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

// LBC request queue - spaces calls by 2s without blocking concurrent users with 429
// No delay needed when using ScraperAPI (it handles rate limiting itself)
let lbcQueuePromise = Promise.resolve();

function enqueueLbcCall(fn) {
    const result = lbcQueuePromise.then(() => fn());
    lbcQueuePromise = result.then(() => {}, () => {});
    return result;
}

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

        if (!['active', 'free'].includes(rows[0].subscription_status)) {
            return res.status(403).json({ ok: false, error: 'Compte inactif' });
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

        if (!['active', 'free'].includes(subscriber.subscription_status)) {
            return res.status(403).json({ ok: false, error: 'Compte inactif' });
        }

        res.json({
            ok: true,
            apiKey: subscriber.api_key,
            email: subscriber.email,
            status: subscriber.subscription_status,
            isPaid: subscriber.subscription_status === 'active'
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

// POST /api/auth/login - Email + password login
app.post('/api/auth/login', express.json(), async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ ok: false, error: 'Email et mot de passe requis' });
        }

        const sub = await verifySubscriberPassword(email, password);
        if (!sub) {
            return res.status(401).json({ ok: false, error: 'Email ou mot de passe incorrect' });
        }

        if (!['active', 'free'].includes(sub.subscription_status)) {
            return res.status(403).json({ ok: false, error: 'Compte inactif' });
        }

        console.log(`[🔐 Auth] Password login: ${email}`);
        res.json({ ok: true, apiKey: sub.api_key, email: sub.email, isPaid: sub.subscription_status === 'active' });

    } catch (err) {
        console.error('[🔐 Auth] Login error:', err.message);
        res.status(500).json({ ok: false, error: 'Erreur serveur' });
    }
});

// POST /api/auth/set-password - Set or reset password via token
app.post('/api/auth/set-password', express.json(), async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) {
            return res.status(400).json({ ok: false, error: 'Token et mot de passe requis' });
        }
        if (password.length < 8) {
            return res.status(400).json({ ok: false, error: 'Mot de passe trop court (8 caractères minimum)' });
        }

        const tokenData = await verifyAndConsumePasswordToken(token);
        if (!tokenData) {
            return res.status(400).json({ ok: false, error: 'Lien invalide ou expiré. Demandez un nouveau lien.' });
        }

        const ok = await setSubscriberPassword(tokenData.email, password);
        if (!ok) {
            return res.status(404).json({ ok: false, error: 'Compte introuvable' });
        }

        console.log(`[🔐 Auth] Password set for: ${tokenData.email} (${tokenData.type})`);
        res.json({ ok: true, message: 'Mot de passe défini avec succès' });

    } catch (err) {
        console.error('[🔐 Auth] Set-password error:', err.message);
        res.status(500).json({ ok: false, error: 'Erreur serveur' });
    }
});

// POST /api/auth/update-password - Set password for authenticated user (après OTP)
app.post('/api/auth/update-password', express.json(), async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        const { password } = req.body;
        if (!apiKey) return res.status(401).json({ ok: false, error: 'Non authentifié' });
        if (!password || password.length < 8) return res.status(400).json({ ok: false, error: 'Mot de passe trop court (8 caractères minimum)' });

        const subscriber = await getSubscriberByApiKey(apiKey);
        if (!subscriber) return res.status(404).json({ ok: false, error: 'Compte introuvable' });

        await setSubscriberPassword(subscriber.email, password);
        res.json({ ok: true });
    } catch (err) {
        console.error('[🔐 Auth] update-password error:', err.message);
        res.status(500).json({ ok: false, error: 'Erreur serveur' });
    }
});

// POST /api/auth/forgot-password - Send password reset email
app.post('/api/auth/forgot-password', express.json(), async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ ok: false, error: 'Email requis' });
        }

        const sub = await getSubscriberByEmail(email);
        // Toujours retourner 200 pour éviter l'énumération d'emails
        if (!sub) {
            return res.json({ ok: true });
        }

        const token = await createPasswordToken(email, 'reset');
        const { sendPasswordResetEmail } = require('./email');
        sendPasswordResetEmail(email, token).catch(err =>
            console.error('[📧 Email] Password reset email failed:', err.message)
        );

        console.log(`[🔐 Auth] Password reset requested for: ${email}`);
        res.json({ ok: true });

    } catch (err) {
        console.error('[🔐 Auth] Forgot-password error:', err.message);
        res.status(500).json({ ok: false, error: 'Erreur serveur' });
    }
});

// POST /api/signup-free - Créer un compte gratuit (sans CB) ou renvoyer un OTP
app.post('/api/signup-free', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !email.includes('@')) {
            return res.status(400).json({ ok: false, error: 'Email invalide' });
        }

        const emailLower = email.toLowerCase().trim();
        let subscriber = await getSubscriberByEmail(emailLower);

        if (subscriber) {
            if (subscriber.subscription_status === 'active') {
                return res.status(409).json({
                    ok: false,
                    error: 'Vous avez déjà un compte payant. Connectez-vous avec votre email et mot de passe.',
                    alreadyPaid: true
                });
            }
            // Compte free existant → renvoyer un OTP
        } else {
            // Nouveau compte gratuit
            subscriber = await createFreeSubscriber(emailLower);
        }

        const code = await createAuthCode(emailLower);
        await sendAuthCode(emailLower, code);

        console.log(`[🆓 Signup] Compte gratuit créé/OTP envoyé: ${emailLower}`);
        res.json({ ok: true, message: 'Code envoyé par email' });
    } catch (err) {
        console.error('[🆓 Signup] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Erreur serveur' });
    }
});

// GET /api/check-subscription - Vérifier le statut d'un abonnement
app.get('/api/check-subscription', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey) return res.json({ active: false, isPaid: false });

        const subscriber = await getSubscriberByApiKey(apiKey);
        if (!subscriber) return res.json({ active: false, isPaid: false });

        const isPaid = subscriber.subscription_status === 'active';
        const active = ['active', 'free'].includes(subscriber.subscription_status);
        res.json({
            active,
            isPaid,
            status: subscriber.subscription_status,
            email: subscriber.email
        });
    } catch (err) {
        console.error('[🔑 CheckSub] Error:', err.message);
        res.json({ active: false, isPaid: false });
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

    const { model, brand, year, km, fuel, gearbox, doors, vehicle_type, colour, critair, min_price = 500 } = req.query;
    if (!model || !brand || !year || !km) {
        return res.status(400).json({ ok: false, error: "Paramètres manquants (model, brand, year, km)" });
    }

    const rawBrand = brand || "";
    const brandMapped = brandMap[rawBrand.toUpperCase()] || rawBrand;
    const yearInt = parseInt(year);
    const kmInt = parseInt(km);
    const minPriceInt = parseInt(min_price);

    // Model-level cache key: shared across all vehicles of same brand/model/year (works for BCA too)
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
            return res.json(cachedResult);
        }
        cacheStats.misses++;
    } catch (err) {
        console.error('[💾 Cache DB] Read error:', err.message);
        cacheStats.misses++;
    }

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

    console.log("📦 Payload envoyé à LBC:\n", JSON.stringify(payload, null, 2));
    console.log("🔍 u_car_model:", payload.filters.enums.u_car_model);
    console.log("🔍 keywords:", payload.filters.keywords.text);

    // Helper: execute one LBC search and return filtered ads
    async function lbcSearch(searchPayload) {
        const scraperApiKey = process.env.SCRAPERAPI_KEY;
        const lbcUrl = "https://api.leboncoin.fr/api/adSearch/v4/ads";
        // When using ScraperAPI, use minimal headers (full mobile headers break DataDome via proxy)
        const headersToUse = scraperApiKey
            ? { 'api_key': process.env.LBC_API_KEY, 'Content-Type': 'application/json' }
            : HEADERS;
        const fetchUrl = scraperApiKey
            ? `http://api.scraperapi.com?api_key=${scraperApiKey}&url=${encodeURIComponent(lbcUrl)}&keep_headers=true&premium=true&country_code=fr`
            : lbcUrl;
        const response = await fetch(fetchUrl, {
            method: "POST",
            headers: headersToUse,
            body: JSON.stringify(searchPayload)
        });
        const text = await response.text();
        if (!text || text.length < 10) throw new Error("Réponse vide ou invalide – possible blocage API");
        const data = JSON.parse(text);
        // Detect DataDome captcha block — skip all fallbacks immediately
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

    let lbcBlocked = false;
    try {
        // Main search + progressive fallback if 0 results
        let results = await enqueueLbcCall(() => lbcSearch(payload));
        console.log("🧹 Annonces après filtrage:", results.length);

        // Fallback 1: drop fuel filter
        if (results.length < 3 && payload.filters.enums.fuel) {
            console.log("[🔄 Fallback 1] 0 résultats — retry sans filtre carburant");
            const payload2 = JSON.parse(JSON.stringify(payload));
            delete payload2.filters.enums.fuel;
            results = await enqueueLbcCall(() => lbcSearch(payload2));
            console.log("🧹 Fallback 1 résultats:", results.length);
        }

        // Fallback 2: drop u_car_model + fuel, use keywords only
        if (results.length < 3 && payload.filters.enums.u_car_model) {
            console.log("[🔄 Fallback 2] Encore 0 — retry sans u_car_model ni carburant");
            const payload3 = JSON.parse(JSON.stringify(payload));
            delete payload3.filters.enums.fuel;
            delete payload3.filters.enums.u_car_model;
            results = await enqueueLbcCall(() => lbcSearch(payload3));
            console.log("🧹 Fallback 2 résultats:", results.length);
        }

        // Extraire prix (en €), trier
        const prices = results
            .map(ad => ad.price_cents / 100)
            .filter(price => typeof price === 'number' && isFinite(price))
            .sort((a, b) => a - b);

        console.log("📊 Prix triés (en €):", prices);

        // Calcul médiane (plus robuste)
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
        if (error.message === 'DATADOME_BLOCKED') {
            // IP banned by DataDome — return graceful empty response (don't show error to user)
            return res.json({ ok: true, estimatedPrice: null, lowPrice: null, highPrice: null, count: 0, results: [], warning: 'LBC temporairement indisponible' });
        }
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