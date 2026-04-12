// Scheduled jobs (cron)
const cron = require('node-cron');
const { matchAlerts } = require('../alertMatcher');
const { cleanExpiredCache, pool } = require('../db');

function setupCronJobs() {
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

    // Clean old API logs every day at 3am (keep 90 days)
    cron.schedule('0 3 * * *', async () => {
        try {
            const { rowCount } = await pool.query(
                `DELETE FROM api_logs WHERE created_at < NOW() - INTERVAL '90 days'`
            );
            if (rowCount > 0) console.log(`[⏰ Cron] Cleaned ${rowCount} old API log entries`);
        } catch (err) {
            console.error('[⏰ Cron] API logs cleanup error:', err.message);
        }
    });

    console.log('[⏰ Cron] All scheduled jobs registered');
}

module.exports = { setupCronJobs };
