// Alert routes: CRUD alerts, deals, alert matches
const express = require('express');
const router = express.Router();
const {
    getAlerts, createAlert, updateAlert, deleteAlert,
    getRecentDeals, getUnseenAlertMatches, markAlertMatchesSeen,
} = require('../db');
const { apiKeyAuth, rateLimiter } = require('../lib/middleware');

router.use('/api/alerts', rateLimiter);
router.use('/api/deals', rateLimiter);
router.use('/api/alert-matches', rateLimiter);

// GET /api/alerts - Get user's alerts
router.get('/api/alerts', apiKeyAuth, async (req, res) => {
    try {
        const alerts = await getAlerts(req.subscriber.id);
        res.json({ ok: true, alerts });
    } catch (err) {
        console.error('[🔔 Alerts] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to fetch alerts' });
    }
});

// POST /api/alerts - Create an alert
router.post('/api/alerts', apiKeyAuth, async (req, res) => {
    try {
        const alert = await createAlert(req.subscriber.id, req.body);
        res.json({ ok: true, alert });
    } catch (err) {
        console.error('[🔔 Alerts] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to create alert' });
    }
});

// PUT /api/alerts/:id - Update an alert
router.put('/api/alerts/:id', apiKeyAuth, async (req, res) => {
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
router.delete('/api/alerts/:id', apiKeyAuth, async (req, res) => {
    try {
        const deleted = await deleteAlert(req.subscriber.id, req.params.id);
        res.json({ ok: true, deleted });
    } catch (err) {
        console.error('[🔔 Alerts] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to delete alert' });
    }
});

// GET /api/deals/top - Get top recent deals by margin
router.get('/api/deals/top', apiKeyAuth, async (req, res) => {
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
router.get('/api/alert-matches', apiKeyAuth, async (req, res) => {
    try {
        const matches = await getUnseenAlertMatches(req.subscriber.id);
        res.json({ ok: true, matches });
    } catch (err) {
        console.error('[🔔 Matches] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Failed to fetch matches' });
    }
});

// POST /api/alert-matches/seen - Mark matches as seen
router.post('/api/alert-matches/seen', apiKeyAuth, async (req, res) => {
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

module.exports = router;
