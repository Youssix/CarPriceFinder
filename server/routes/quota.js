// Quota routes: daily usage limits for freemium model
const express = require('express');
const router = express.Router();
const { apiKeyAuth } = require('../lib/middleware');
const { getDailyQuota, incrementDailyQuota } = require('../db');

// GET /api/quota?site=auto1 — check remaining quota for today
router.get('/api/quota', apiKeyAuth, async (req, res) => {
  try {
    const site = req.query.site || 'auto1';

    // Paid users get unlimited
    if (req.subscriber.subscription_status === 'active') {
      return res.json({ ok: true, remaining: -1, total: -1, used: 0, site, unlimited: true });
    }

    const quota = await getDailyQuota(req.subscriber.id, site);
    res.json({ ok: true, remaining: quota.remaining, total: quota.total, used: quota.used, site });
  } catch (error) {
    console.error('[📊 Quota] Error checking quota:', error.message);
    res.status(500).json({ ok: false, error: 'Erreur interne quota.' });
  }
});

// POST /api/quota/use — consume one analysis credit
router.post('/api/quota/use', apiKeyAuth, async (req, res) => {
  try {
    const site = (req.body && req.body.site) || 'auto1';

    // Paid users get unlimited
    if (req.subscriber.subscription_status === 'active') {
      return res.json({ ok: true, unlimited: true });
    }

    const result = await incrementDailyQuota(req.subscriber.id, site);
    res.json({ ok: result.ok, remaining: result.remaining, total: result.total, used: result.used });
  } catch (error) {
    console.error('[📊 Quota] Error incrementing quota:', error.message);
    res.status(500).json({ ok: false, error: 'Erreur interne quota.' });
  }
});

module.exports = router;
