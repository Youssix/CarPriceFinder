const { pool } = require('./db');

async function matchAlerts() {
  try {
    // Find new observations that match active alerts
    const { rows: matches } = await pool.query(`
      SELECT DISTINCT ON (a.id, po.id)
        a.id AS alert_id,
        a.subscriber_id,
        a.name AS alert_name,
        po.id AS observation_id,
        po.brand,
        po.model,
        po.year,
        po.km,
        po.fuel,
        po.auto1_price_cents,
        po.lbc_median_price,
        (po.lbc_median_price - COALESCE(po.auto1_price_cents/100, 0)) AS margin,
        s.email
      FROM alerts a
      JOIN price_observations po ON (
        (a.brand IS NULL OR UPPER(po.brand) = UPPER(a.brand)) AND
        (a.model IS NULL OR UPPER(po.model) LIKE '%' || UPPER(a.model) || '%') AND
        (a.year_min IS NULL OR po.year >= a.year_min) AND
        (a.year_max IS NULL OR po.year <= a.year_max) AND
        (a.km_max IS NULL OR po.km <= a.km_max) AND
        (a.fuel IS NULL OR LOWER(po.fuel) = LOWER(a.fuel)) AND
        (a.min_margin IS NULL OR (po.lbc_median_price - COALESCE(po.auto1_price_cents/100, 0)) >= a.min_margin) AND
        (a.max_price IS NULL OR COALESCE(po.auto1_price_cents/100, 0) <= a.max_price)
      )
      JOIN subscribers s ON s.id = a.subscriber_id AND s.subscription_status = 'active'
      WHERE a.is_active = TRUE
        AND po.created_at > COALESCE(a.last_triggered_at, NOW() - INTERVAL '24 hours')
        AND po.lbc_median_price > 0
        AND NOT EXISTS (
          SELECT 1 FROM alert_matches am
          WHERE am.alert_id = a.id AND am.observation_id = po.id
        )
      ORDER BY a.id, po.id, po.created_at DESC
      LIMIT 200
    `);

    if (matches.length === 0) {
      return { matched: 0, notified: 0 };
    }

    console.log(`[🔔 Alerts] Found ${matches.length} new matches`);

    // Group matches by subscriber for batch notification
    const bySubscriber = {};
    for (const match of matches) {
      if (!bySubscriber[match.email]) {
        bySubscriber[match.email] = [];
      }
      bySubscriber[match.email].push(match);

      // Record the match
      await pool.query(
        `INSERT INTO alert_matches (alert_id, observation_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [match.alert_id, match.observation_id]
      );

      // Update last_triggered_at
      await pool.query(
        `UPDATE alerts SET last_triggered_at = NOW() WHERE id = $1`,
        [match.alert_id]
      );
    }

    // Send notifications (import email module dynamically to avoid circular deps)
    let notified = 0;
    try {
      const { sendAlertNotification } = require('./email');
      for (const [email, subscriberMatches] of Object.entries(bySubscriber)) {
        const result = await sendAlertNotification(email, subscriberMatches);
        if (result.success) notified++;
      }
    } catch (emailErr) {
      console.error('[🔔 Alerts] Email notification failed:', emailErr.message);
    }

    console.log(`[🔔 Alerts] Processed ${matches.length} matches, notified ${notified} subscribers`);
    return { matched: matches.length, notified };
  } catch (err) {
    console.error('[🔔 Alerts] Match error:', err.message);
    return { matched: 0, notified: 0, error: err.message };
  }
}

module.exports = { matchAlerts };
