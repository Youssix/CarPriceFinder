// API logging middleware — writes every request to api_logs table for monitoring
const { pool } = require('../db');

// Determine source from Referer/Origin headers
function inferSource(req) {
    const referer = req.headers.referer || req.headers.origin || '';
    if (referer.includes('auto1.com')) return 'auto1';
    if (referer.includes('bcautoencheres')) return 'bca';
    if (referer.includes('app.carlytics.fr') || referer.includes('localhost:5173')) return 'dashboard';
    return 'api';
}

// Determine user tier from subscriber object
function inferTier(subscriber) {
    if (!subscriber) return 'anonymous';
    if (subscriber.subscription_status === 'active') return 'paid';
    return 'free';
}

// Express middleware: logs every request (except /api/health) to api_logs.
// Wraps res.end() to capture status code and duration.
// Sets req._logId so estimation routes can enrich with vehicle data via logEstimation().
function logMiddleware(req, res, next) {
    // Skip health checks to avoid noise
    if (req.path === '/api/health') return next();

    const start = Date.now();
    const originalEnd = res.end;

    res.end = function(...args) {
        originalEnd.apply(res, args);

        const duration = Date.now() - start;
        const tier = inferTier(req.subscriber);

        // Fire-and-forget INSERT — never block the response
        pool.query(
            `INSERT INTO api_logs
             (subscriber_id, email, user_tier, ip, user_agent, method, path,
              brand, model, year, km, fuel, stock_number,
              status_code, cache_hit, lbc_count, estimated_price, duration_ms, error, source)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
             RETURNING id`,
            [
                req.subscriber?.id || null,
                req.subscriber?.email || null,
                tier,
                req.ip || req.connection?.remoteAddress || null,
                (req.headers['user-agent'] || '').substring(0, 256),
                req.method,
                req.path,
                // Vehicle fields — filled by logEstimation() or left null
                req._logVehicle?.brand || null,
                req._logVehicle?.model || null,
                req._logVehicle?.year || null,
                req._logVehicle?.km || null,
                req._logVehicle?.fuel || null,
                req._logVehicle?.stockNumber || null,
                // Result fields
                res.statusCode,
                req._logResult?.cacheHit ?? null,
                req._logResult?.lbcCount ?? null,
                req._logResult?.estimatedPrice ?? null,
                duration,
                req._logResult?.error || null,
                inferSource(req),
            ]
        ).catch(err => {
            // Never crash the server over logging
            console.error('[📊 Logger] Insert error:', err.message);
        });
    };

    next();
}

// Called by estimation routes to attach vehicle + result data to the request.
// This data is picked up by the logMiddleware's res.end wrapper above.
function logEstimation(req, { brand, model, year, km, fuel, stockNumber, cacheHit, lbcCount, estimatedPrice, error }) {
    req._logVehicle = { brand, model, year, km, fuel, stockNumber };
    req._logResult = { cacheHit, lbcCount, estimatedPrice, error };
}

module.exports = {
    logMiddleware,
    logEstimation,
};
