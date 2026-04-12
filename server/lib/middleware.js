// Express middleware: rate limiter, auth, security headers, request logging
const { getSubscriberByApiKey } = require('../db');

// --- Rate Limiter ---
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

// --- API Key Authentication (strict) ---
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

// --- Optional API Key (enriches req if present, continues without) ---
async function optionalApiKeyAuth(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;

    if (apiKey) {
        try {
            const subscriber = await getSubscriberByApiKey(apiKey);
            if (subscriber && ['active', 'free'].includes(subscriber.subscription_status)) {
                req.subscriber = subscriber;
            }
        } catch (error) {
            // Silent fail - continue without auth
        }
    }

    next();
}

// --- Security Headers ---
function securityHeaders(req, res, next) {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    next();
}

// --- Console Request Logging ---
function requestLogger(req, res, next) {
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
}

module.exports = {
    rateLimiter,
    apiKeyAuth,
    optionalApiKeyAuth,
    securityHeaders,
    requestLogger,
};
