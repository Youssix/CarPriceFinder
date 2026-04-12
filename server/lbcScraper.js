require('dotenv').config();
const express = require("express");
const cors = require("cors");
const { initDb, closePool } = require('./db');
const stripeRouter = require('./stripe');

// Lib
const { securityHeaders, requestLogger, rateLimiter } = require('./lib/middleware');
const { logMiddleware } = require('./lib/logger');
const { setupCronJobs } = require('./lib/cron');

// Routes
const authRouter = require('./routes/auth');
const estimationRouter = require('./routes/estimation');
const vehiclesRouter = require('./routes/vehicles');
const alertsRouter = require('./routes/alerts');
const adminRouter = require('./routes/admin');
const quotaRouter = require('./routes/quota');

const app = express();
const PORT = process.env.PORT || 9001;

// Startup check
if (!process.env.LBC_API_KEY) {
    console.warn('[⚠️ Config] LBC_API_KEY is not set. LeBonCoin API calls will fail without a valid API key.');
}

// CORS configuration
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://www.auto1.com').split(',').map(o => o.trim());
if (!allowedOrigins.includes('http://localhost:5173')) allowedOrigins.push('http://localhost:5173');
if (!allowedOrigins.includes('http://localhost:9001')) allowedOrigins.push('http://localhost:9001');

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
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

// Global middleware
app.use(securityHeaders);
app.use(requestLogger);
app.use(logMiddleware);

// Rate limiting on API routes (except webhook and health)
app.use('/api/estimation', rateLimiter);
app.use('/api/auth', rateLimiter);

// Wire cacheStats from estimation router to admin health endpoint
adminRouter.setCacheStatsProvider(estimationRouter.getCacheStats);

// Mount route files
app.use(authRouter);
app.use(estimationRouter);
app.use(vehiclesRouter);
app.use(alertsRouter);
app.use(adminRouter);
app.use(quotaRouter);

// Initialize DB then start server
initDb().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 LBC Estimator listening on http://localhost:${PORT}`);
    });

    // Start cron jobs
    setupCronJobs();
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
