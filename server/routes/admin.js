// Admin routes: health, dashboard stats, beta, contact, API logs, user activity
const express = require('express');
const path = require('path');
const router = express.Router();
const {
    getObservationStats, getActiveAlertCount, getObservations,
    createBetaTester, getBetaTesters,
    pool,
} = require('../db');
const { sendContactEmail } = require('../email');
const { apiKeyAuth, rateLimiter } = require('../lib/middleware');

// getCacheStats is injected by lbcScraper.js after mounting estimation router
let getCacheStats = () => ({ hits: 0, misses: 0, stores: 0, startTime: Date.now() });
router.setCacheStatsProvider = (fn) => { getCacheStats = fn; };

// Health check endpoint
router.get('/api/health', async (req, res) => {
    const cacheStats = getCacheStats();
    const uptime = Math.round((Date.now() - cacheStats.startTime) / 1000 / 60);
    const hitRate = cacheStats.hits + cacheStats.misses > 0
        ? ((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100).toFixed(1)
        : 0;

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

// === Dashboard Routes ===

router.use('/api/dashboard', rateLimiter);

// GET /api/dashboard/stats - Get dashboard overview stats
router.get('/api/dashboard/stats', apiKeyAuth, async (req, res) => {
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
router.use('/api/observations', rateLimiter);
router.get('/api/observations', apiKeyAuth, async (req, res) => {
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

// === Beta Signup ===

const betaPagePath = path.join(__dirname, '..', '..', 'landing', 'beta.html');
router.get('/beta', (req, res) => {
    res.sendFile(betaPagePath);
});

router.post('/api/beta-signup', async (req, res) => {
    try {
        const { name, email, phone, vehiclesPerMonth, timeComparing } = req.body;

        if (!name || !email) {
            return res.status(400).json({ ok: false, error: 'Nom et email requis.' });
        }

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

router.get('/api/beta-testers', apiKeyAuth, async (req, res) => {
    try {
        const testers = await getBetaTesters();
        res.json({ ok: true, testers });
    } catch (err) {
        console.error('[🧪 Beta] List error:', err.message);
        res.status(500).json({ ok: false, error: 'Erreur lors de la récupération.' });
    }
});

// === Contact Form ===

router.post('/api/contact', express.json(), async (req, res) => {
    const { name, email, message } = req.body || {};

    if (!name || !email || !message) {
        return res.status(400).json({ error: 'Champs manquants' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Email invalide' });
    }
    if (message.length > 2000) {
        return res.status(400).json({ error: 'Message trop long' });
    }

    const result = await sendContactEmail(name.trim(), email.trim(), message.trim());
    if (!result.success) {
        return res.status(500).json({ error: 'Erreur envoi email' });
    }

    res.json({ success: true });
});

// === API Logs & Monitoring ===

// GET /api/admin/logs - Recent API activity with filters
router.get('/api/admin/logs', apiKeyAuth, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        const offset = parseInt(req.query.offset) || 0;

        // Build WHERE clauses
        const conditions = [];
        const params = [];
        let paramIdx = 1;

        if (req.query.tier) {
            conditions.push(`user_tier = $${paramIdx++}`);
            params.push(req.query.tier);
        }
        if (req.query.path) {
            conditions.push(`path = $${paramIdx++}`);
            params.push(req.query.path);
        }
        if (req.query.brand) {
            conditions.push(`brand ILIKE $${paramIdx++}`);
            params.push(req.query.brand);
        }
        if (req.query.email) {
            conditions.push(`email ILIKE $${paramIdx++}`);
            params.push(`%${req.query.email}%`);
        }
        if (req.query.since) {
            conditions.push(`created_at >= $${paramIdx++}`);
            params.push(req.query.since);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Fetch logs
        const logsQuery = `SELECT * FROM api_logs ${whereClause} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
        params.push(limit, offset);
        const { rows: logs } = await pool.query(logsQuery, params);

        // Summary (aggregation on same filters, without limit/offset)
        const summaryParams = params.slice(0, -2); // remove limit/offset
        const countQuery = `SELECT COUNT(*) AS total FROM api_logs ${whereClause}`;
        const tierQuery = `SELECT user_tier, COUNT(*) AS cnt FROM api_logs ${whereClause} GROUP BY user_tier ORDER BY cnt DESC`;
        const pathQuery = `SELECT path, COUNT(*) AS cnt FROM api_logs ${whereClause} GROUP BY path ORDER BY cnt DESC LIMIT 10`;
        const brandQuery = `SELECT brand, COUNT(*) AS cnt FROM api_logs ${whereClause} AND brand IS NOT NULL GROUP BY brand ORDER BY cnt DESC LIMIT 10`;
        const cacheQuery = `SELECT cache_hit, COUNT(*) AS cnt FROM api_logs ${whereClause} AND cache_hit IS NOT NULL GROUP BY cache_hit`;

        const [countRes, tierRes, pathRes, brandRes, cacheRes] = await Promise.all([
            pool.query(countQuery, summaryParams),
            pool.query(tierQuery, summaryParams),
            pool.query(pathQuery, summaryParams),
            pool.query(brandQuery.replace(`${whereClause} AND`, whereClause.length > 0 ? `${whereClause} AND` : 'WHERE'), summaryParams),
            pool.query(cacheQuery.replace(`${whereClause} AND`, whereClause.length > 0 ? `${whereClause} AND` : 'WHERE'), summaryParams),
        ]);

        const byTier = {};
        tierRes.rows.forEach(r => { byTier[r.user_tier] = parseInt(r.cnt); });

        const byPath = {};
        pathRes.rows.forEach(r => { byPath[r.path] = parseInt(r.cnt); });

        const topBrands = brandRes.rows.map(r => ({ brand: r.brand, count: parseInt(r.cnt) }));

        let cacheHits = 0, cacheMisses = 0;
        cacheRes.rows.forEach(r => {
            if (r.cache_hit === true) cacheHits = parseInt(r.cnt);
            if (r.cache_hit === false) cacheMisses = parseInt(r.cnt);
        });
        const cacheHitRate = (cacheHits + cacheMisses) > 0
            ? ((cacheHits / (cacheHits + cacheMisses)) * 100).toFixed(1) + '%'
            : 'N/A';

        res.json({
            ok: true,
            logs,
            summary: {
                total: parseInt(countRes.rows[0].total),
                byTier,
                byPath,
                topBrands,
                cacheHitRate,
            }
        });
    } catch (err) {
        console.error('[📊 Admin Logs] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to fetch logs' });
    }
});

// GET /api/admin/users - User activity summary
router.get('/api/admin/users', apiKeyAuth, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                s.email,
                s.subscription_status AS tier,
                COUNT(l.id) AS total_searches,
                MAX(l.created_at) AS last_active,
                COUNT(CASE WHEN l.created_at > NOW() - INTERVAL '24 hours' THEN 1 END) AS today_searches,
                (SELECT ARRAY_AGG(DISTINCT brand ORDER BY brand) FROM (
                    SELECT brand FROM api_logs WHERE subscriber_id = s.id AND brand IS NOT NULL
                    GROUP BY brand ORDER BY COUNT(*) DESC LIMIT 5
                ) sub) AS top_brands
            FROM subscribers s
            LEFT JOIN api_logs l ON l.subscriber_id = s.id
            GROUP BY s.id, s.email, s.subscription_status
            HAVING COUNT(l.id) > 0
            ORDER BY MAX(l.created_at) DESC NULLS LAST
            LIMIT 100
        `);

        res.json({
            ok: true,
            users: rows.map(r => ({
                email: r.email,
                tier: r.tier,
                totalSearches: parseInt(r.total_searches),
                lastActive: r.last_active,
                todaySearches: parseInt(r.today_searches),
                topBrands: r.top_brands || [],
            }))
        });
    } catch (err) {
        console.error('[📊 Admin Users] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to fetch user activity' });
    }
});

module.exports = router;
