const { Pool } = require('pg');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://cpf:cpf_secret@localhost:5432/carpricefinder',
  max: 10,
});

// Initialize database schema from init.sql
async function initDb() {
  const initSql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
  await pool.query(initSql);
  console.log('[🗄️ DB] PostgreSQL schema initialized');
}

// Generate a unique API key with prefix
function generateApiKey() {
  const randomBytes = crypto.randomBytes(24).toString('hex');
  return `cpf_live_${randomBytes}`;
}

async function getSubscriberByApiKey(apiKey) {
  const { rows } = await pool.query('SELECT * FROM subscribers WHERE api_key = $1', [apiKey]);
  return rows[0] || null;
}

async function getSubscriberByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM subscribers WHERE email = $1', [email]);
  return rows[0] || null;
}

async function getSubscriberByStripeCustomer(stripeCustomerId) {
  const { rows } = await pool.query('SELECT * FROM subscribers WHERE stripe_customer_id = $1', [stripeCustomerId]);
  return rows[0] || null;
}

async function createSubscriber({ email, stripeCustomerId = null, stripeSubscriptionId = null, status = 'active' }) {
  const apiKey = generateApiKey();
  await pool.query(
    'INSERT INTO subscribers (email, stripe_customer_id, stripe_subscription_id, subscription_status, api_key) VALUES ($1, $2, $3, $4, $5)',
    [email, stripeCustomerId, stripeSubscriptionId, status, apiKey]
  );
  return { email, apiKey, status };
}

async function createFreeSubscriber(email) {
  const apiKey = generateApiKey();
  const { rows } = await pool.query(
    `INSERT INTO subscribers (email, subscription_status, api_key)
     VALUES ($1, 'free', $2)
     ON CONFLICT (email) DO NOTHING
     RETURNING email, api_key, subscription_status`,
    [email, apiKey]
  );
  if (rows.length === 0) {
    return await getSubscriberByEmail(email);
  }
  return rows[0];
}

async function updateSubscriptionStatus(stripeCustomerId, status) {
  await pool.query(
    "UPDATE subscribers SET subscription_status = $1, updated_at = CURRENT_TIMESTAMP WHERE stripe_customer_id = $2",
    [status, stripeCustomerId]
  );
}

// Rotate apiKey: regenerates a new key and invalidates the old one.
// Used on each login (single-session anti-sharing: any previous device gets 401).
async function rotateApiKey(subscriberId) {
  const newApiKey = generateApiKey();
  await pool.query(
    'UPDATE subscribers SET api_key = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [newApiKey, subscriberId]
  );
  return newApiKey;
}

async function updateSubscription(stripeCustomerId, subscriptionId, status) {
  await pool.query(
    "UPDATE subscribers SET stripe_subscription_id = $1, subscription_status = $2, updated_at = CURRENT_TIMESTAMP WHERE stripe_customer_id = $3",
    [subscriptionId, status, stripeCustomerId]
  );
}

async function isEventProcessed(stripeEventId) {
  const { rows } = await pool.query('SELECT 1 FROM webhook_events WHERE stripe_event_id = $1', [stripeEventId]);
  return rows.length > 0;
}

async function markEventProcessed(stripeEventId, eventType) {
  await pool.query(
    'INSERT INTO webhook_events (stripe_event_id, event_type) VALUES ($1, $2)',
    [stripeEventId, eventType]
  );
}

function closePool() {
  return pool.end();
}

// === Cache Functions ===

async function getCachedEstimation(cacheKey) {
  const { rows } = await pool.query(
    `SELECT response_data FROM estimation_cache
     WHERE cache_key = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
    [cacheKey]
  );
  return rows[0]?.response_data || null;
}

async function setCachedEstimation(cacheKey, responseData) {
  await pool.query(
    `INSERT INTO estimation_cache (cache_key, response_data)
     VALUES ($1, $2)
     ON CONFLICT (cache_key) DO UPDATE SET response_data = $2, created_at = CURRENT_TIMESTAMP`,
    [cacheKey, JSON.stringify(responseData)]
  );
}

async function cleanExpiredCache() {
  const { rowCount } = await pool.query(
    `DELETE FROM estimation_cache WHERE created_at < NOW() - INTERVAL '24 hours'`
  );
  return rowCount;
}

// === Price Observation Functions ===

async function logPriceObservation(subscriberId, data) {
  await pool.query(
    `INSERT INTO price_observations
     (subscriber_id, stock_number, brand, model, year, km, fuel, gearbox, doors,
      auto1_price_cents, lbc_median_price, lbc_low_price, lbc_high_price, lbc_count, options, raw_params)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [subscriberId, data.stockNumber, data.brand, data.model, data.year, data.km,
     data.fuel, data.gearbox, data.doors, data.auto1Price, data.estimatedPrice,
     data.lowPrice, data.highPrice, data.count, JSON.stringify(data.options || []),
     JSON.stringify(data.rawParams || {})]
  );
}

// === Saved Vehicles Functions ===

async function getSavedVehicles(subscriberId) {
  const { rows } = await pool.query(
    `SELECT * FROM saved_vehicles WHERE subscriber_id = $1 ORDER BY added_at DESC`,
    [subscriberId]
  );
  return rows;
}

async function saveVehicle(subscriberId, vehicle) {
  const { rows } = await pool.query(
    `INSERT INTO saved_vehicles
     (subscriber_id, stock_number, brand, model, year, km, fuel, gearbox, power, doors, color,
      auto1_price, estimated_price, margin, detected_options, equipment, photos, catbox_urls, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     ON CONFLICT (subscriber_id, stock_number) DO UPDATE SET
      auto1_price = EXCLUDED.auto1_price,
      estimated_price = EXCLUDED.estimated_price,
      margin = EXCLUDED.margin,
      detected_options = EXCLUDED.detected_options,
      photos = EXCLUDED.photos,
      catbox_urls = EXCLUDED.catbox_urls,
      notes = EXCLUDED.notes
     RETURNING *`,
    [subscriberId, vehicle.stockNumber, vehicle.brand, vehicle.model, vehicle.year,
     vehicle.km, vehicle.fuel, vehicle.gearbox, vehicle.power, vehicle.doors, vehicle.color,
     vehicle.auto1Price, vehicle.estimatedPrice, vehicle.margin,
     JSON.stringify(vehicle.detectedOptions || []), JSON.stringify(vehicle.equipment || []),
     JSON.stringify(vehicle.photos || []), JSON.stringify(vehicle.catboxUrls || []),
     vehicle.notes || '']
  );
  return rows[0];
}

async function deleteSavedVehicle(subscriberId, stockNumber) {
  const { rowCount } = await pool.query(
    `DELETE FROM saved_vehicles WHERE subscriber_id = $1 AND stock_number = $2`,
    [subscriberId, stockNumber]
  );
  return rowCount > 0;
}

// === Alert Functions ===

async function getAlerts(subscriberId) {
  const { rows } = await pool.query(
    `SELECT * FROM alerts WHERE subscriber_id = $1 ORDER BY created_at DESC`,
    [subscriberId]
  );
  return rows;
}

async function createAlert(subscriberId, alert) {
  const { rows } = await pool.query(
    `INSERT INTO alerts (subscriber_id, name, brand, model, year_min, year_max, km_max, fuel, min_margin, max_price)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [subscriberId, alert.name, alert.brand, alert.model, alert.yearMin, alert.yearMax,
     alert.kmMax, alert.fuel, alert.minMargin, alert.maxPrice]
  );
  return rows[0];
}

async function updateAlert(subscriberId, alertId, updates) {
  const { rows } = await pool.query(
    `UPDATE alerts SET
      name = COALESCE($3, name), brand = COALESCE($4, brand), model = COALESCE($5, model),
      year_min = COALESCE($6, year_min), year_max = COALESCE($7, year_max),
      km_max = COALESCE($8, km_max), fuel = COALESCE($9, fuel),
      min_margin = COALESCE($10, min_margin), max_price = COALESCE($11, max_price),
      is_active = COALESCE($12, is_active)
     WHERE id = $1 AND subscriber_id = $2
     RETURNING *`,
    [alertId, subscriberId, updates.name, updates.brand, updates.model,
     updates.yearMin, updates.yearMax, updates.kmMax, updates.fuel,
     updates.minMargin, updates.maxPrice, updates.isActive]
  );
  return rows[0];
}

async function deleteAlert(subscriberId, alertId) {
  const { rowCount } = await pool.query(
    `DELETE FROM alerts WHERE id = $1 AND subscriber_id = $2`,
    [subscriberId, alertId]
  );
  return rowCount > 0;
}

// === Auth Functions ===

async function createAuthCode(email) {
  // Generate 6-digit code
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Invalidate previous codes for this email
  await pool.query(
    `UPDATE auth_codes SET used = TRUE WHERE email = $1 AND used = FALSE`,
    [email]
  );

  await pool.query(
    `INSERT INTO auth_codes (email, code, expires_at) VALUES ($1, $2, $3)`,
    [email, code, expiresAt]
  );

  return code;
}

async function verifyAuthCode(email, code) {
  const { rows } = await pool.query(
    `UPDATE auth_codes SET used = TRUE
     WHERE email = $1 AND code = $2 AND used = FALSE AND expires_at > NOW()
     RETURNING *`,
    [email, code]
  );

  if (rows.length === 0) return null;

  // Find the subscriber
  const subscriber = await pool.query(
    `SELECT * FROM subscribers WHERE email = $1`,
    [email]
  );

  return subscriber.rows[0] || null;
}

// === Dashboard Stats Functions ===

async function getObservationStats(subscriberId) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as today_searches,
       COALESCE(AVG(lbc_median_price - COALESCE(auto1_price_cents/100, 0)) FILTER (WHERE auto1_price_cents > 0 AND created_at > NOW() - INTERVAL '7 days'), 0) as avg_margin,
       COUNT(*) as total_searches
     FROM price_observations
     WHERE subscriber_id = $1`,
    [subscriberId]
  );
  return rows[0];
}

async function getActiveAlertCount(subscriberId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) as count FROM alerts WHERE subscriber_id = $1 AND is_active = TRUE`,
    [subscriberId]
  );
  return parseInt(rows[0].count);
}

async function getObservations(subscriberId, limit = 50, offset = 0) {
  const { rows } = await pool.query(
    `SELECT * FROM price_observations
     WHERE subscriber_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [subscriberId, limit, offset]
  );
  return rows;
}

// === Deal & Alert Match Functions ===

async function getRecentDeals(subscriberId, limit = 10) {
  const { rows } = await pool.query(
    `SELECT *, (lbc_median_price - COALESCE(auto1_price_cents/100, 0)) AS margin
     FROM price_observations
     WHERE subscriber_id = $1 AND lbc_median_price > 0
     ORDER BY (lbc_median_price - COALESCE(auto1_price_cents/100, 0)) DESC
     LIMIT $2`,
    [subscriberId, limit]
  );
  return rows;
}

async function getUnseenAlertMatches(subscriberId) {
  const { rows } = await pool.query(
    `SELECT am.*, po.brand, po.model, po.year, po.km, po.lbc_median_price,
            po.auto1_price_cents, a.name AS alert_name
     FROM alert_matches am
     JOIN alerts a ON a.id = am.alert_id
     JOIN price_observations po ON po.id = am.observation_id
     WHERE a.subscriber_id = $1 AND am.seen = FALSE
     ORDER BY am.notified_at DESC
     LIMIT 50`,
    [subscriberId]
  );
  return rows;
}

async function markAlertMatchesSeen(subscriberId, matchIds) {
  await pool.query(
    `UPDATE alert_matches am SET seen = TRUE
     FROM alerts a
     WHERE am.alert_id = a.id AND a.subscriber_id = $1 AND am.id = ANY($2)`,
    [subscriberId, matchIds]
  );
}

// === Beta Testers Functions ===

async function createBetaTester({ name, email, phone, vehiclesPerMonth, timeComparing }) {
  const { rows } = await pool.query(
    `INSERT INTO beta_testers (name, email, phone, vehicles_per_month, time_comparing)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET
       name = EXCLUDED.name, phone = EXCLUDED.phone,
       vehicles_per_month = EXCLUDED.vehicles_per_month,
       time_comparing = EXCLUDED.time_comparing
     RETURNING *`,
    [name, email, phone || null, vehiclesPerMonth || null, timeComparing || null]
  );
  return rows[0];
}

async function getBetaTesters() {
  const { rows } = await pool.query(
    `SELECT * FROM beta_testers ORDER BY created_at DESC`
  );
  return rows;
}

// === Password Auth Functions ===

async function createPasswordToken(email, type = 'setup') {
  const token = crypto.randomBytes(32).toString('hex'); // 64 char hex
  const expiresAt = type === 'reset'
    ? new Date(Date.now() + 60 * 60 * 1000)        // reset: 1h
    : new Date(Date.now() + 24 * 60 * 60 * 1000);  // setup: 24h

  await pool.query(
    `INSERT INTO password_tokens (email, token, type, expires_at) VALUES ($1, $2, $3, $4)`,
    [email, token, type, expiresAt]
  );
  return token;
}

async function verifyAndConsumePasswordToken(token) {
  const result = await pool.query(
    `UPDATE password_tokens
     SET used_at = NOW()
     WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()
     RETURNING email, type`,
    [token]
  );
  return result.rows[0] || null; // { email, type } ou null si invalide/expiré
}

async function setSubscriberPassword(email, plainPassword) {
  const hash = await bcrypt.hash(plainPassword, 12);
  const result = await pool.query(
    `UPDATE subscribers SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2 RETURNING id`,
    [hash, email]
  );
  return result.rowCount > 0;
}

async function verifySubscriberPassword(email, plainPassword) {
  const result = await pool.query(
    `SELECT id, api_key, email, subscription_status, password_hash
     FROM subscribers WHERE email = $1`,
    [email]
  );
  const sub = result.rows[0];
  if (!sub || !sub.password_hash) return null;
  const ok = await bcrypt.compare(plainPassword, sub.password_hash);
  return ok ? sub : null;
}

// === Daily Quota Functions ===

const DAILY_QUOTA_LIMIT = 5;

async function getDailyQuota(subscriberId, site = 'auto1') {
  const { rows } = await pool.query(
    `SELECT analysis_count FROM daily_usage
     WHERE subscriber_id = $1 AND usage_date = CURRENT_DATE AND site = $2`,
    [subscriberId, site]
  );
  const used = rows.length > 0 ? rows[0].analysis_count : 0;
  return { used, remaining: Math.max(0, DAILY_QUOTA_LIMIT - used), total: DAILY_QUOTA_LIMIT };
}

async function incrementDailyQuota(subscriberId, site = 'auto1') {
  const { rows } = await pool.query(
    `INSERT INTO daily_usage (subscriber_id, usage_date, site, analysis_count)
     VALUES ($1, CURRENT_DATE, $2, 1)
     ON CONFLICT (subscriber_id, usage_date, site)
     DO UPDATE SET analysis_count = daily_usage.analysis_count + 1
     RETURNING analysis_count`,
    [subscriberId, site]
  );
  const used = rows[0].analysis_count;
  const ok = used <= DAILY_QUOTA_LIMIT;
  return { ok, used, remaining: Math.max(0, DAILY_QUOTA_LIMIT - used), total: DAILY_QUOTA_LIMIT };
}

module.exports = {
  pool,
  initDb,
  generateApiKey,
  getSubscriberByApiKey,
  getSubscriberByEmail,
  getSubscriberByStripeCustomer,
  createSubscriber,
  createFreeSubscriber,
  rotateApiKey,
  updateSubscriptionStatus,
  updateSubscription,
  isEventProcessed,
  markEventProcessed,
  closePool,
  // Cache
  getCachedEstimation,
  setCachedEstimation,
  cleanExpiredCache,
  // Price observations
  logPriceObservation,
  // Saved vehicles
  getSavedVehicles,
  saveVehicle,
  deleteSavedVehicle,
  // Alerts
  getAlerts,
  createAlert,
  updateAlert,
  deleteAlert,
  // Auth
  createAuthCode,
  verifyAuthCode,
  // Dashboard stats
  getObservationStats,
  getActiveAlertCount,
  getObservations,
  // Deals & alert matches
  getRecentDeals,
  getUnseenAlertMatches,
  markAlertMatchesSeen,
  // Beta
  createBetaTester,
  getBetaTesters,
  // Password auth
  createPasswordToken,
  verifyAndConsumePasswordToken,
  setSubscriberPassword,
  verifySubscriberPassword,
  // Daily quota
  getDailyQuota,
  incrementDailyQuota,
};
