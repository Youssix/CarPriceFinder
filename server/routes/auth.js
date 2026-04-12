// Auth routes: login, signup, password management
const express = require('express');
const router = express.Router();
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const {
    getSubscriberByApiKey, getSubscriberByEmail,
    createFreeSubscriber, rotateApiKey,
    createAuthCode, verifyAuthCode,
    createPasswordToken, verifyAndConsumePasswordToken,
    setSubscriberPassword, verifySubscriberPassword,
    pool,
} = require('../db');
const { sendAuthCode } = require('../email');

// POST /api/auth/request-code - Request a login code
router.post('/api/auth/request-code', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !email.includes('@')) {
            return res.status(400).json({ ok: false, error: 'Email invalide' });
        }

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

        const emailResult = await sendAuthCode(email, code);
        if (!emailResult.success && !emailResult.fallback) {
            console.error('[🔐 Auth] Failed to send code email');
        }

        res.json({ ok: true, message: 'Code envoye par email' });
    } catch (err) {
        console.error('[🔐 Auth] Error:', err.message);
        res.status(500).json({ ok: false, error: 'Erreur serveur' });
    }
});

// POST /api/auth/verify-code - Verify login code
router.post('/api/auth/verify-code', async (req, res) => {
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

        // 🔐 Single-session anti-sharing : rotate l'apiKey pour invalider l'ancienne.
        const newApiKey = await rotateApiKey(subscriber.id);
        console.log(`[🔐 Auth] apiKey rotated for ${subscriber.email} (verify-code)`);

        res.json({
            ok: true,
            apiKey: newApiKey,
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
router.post('/api/auth/google', express.json(), async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ ok: false, error: 'Token Google manquant' });
        }

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

        const newApiKey = await rotateApiKey(subscriber.id);
        console.log(`[🔐 Auth] Google SSO login + apiKey rotated: ${email}`);
        res.json({ ok: true, apiKey: newApiKey, email: subscriber.email });

    } catch (err) {
        console.error('[🔐 Auth] Google SSO error:', err.message);
        res.status(500).json({ ok: false, error: 'Erreur serveur' });
    }
});

// POST /api/auth/login - Email + password login
router.post('/api/auth/login', express.json(), async (req, res) => {
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

        const newApiKey = await rotateApiKey(sub.id);
        console.log(`[🔐 Auth] Password login + apiKey rotated: ${email}`);
        res.json({ ok: true, apiKey: newApiKey, email: sub.email, isPaid: sub.subscription_status === 'active' });

    } catch (err) {
        console.error('[🔐 Auth] Login error:', err.message);
        res.status(500).json({ ok: false, error: 'Erreur serveur' });
    }
});

// POST /api/auth/set-password - Set or reset password via token
router.post('/api/auth/set-password', express.json(), async (req, res) => {
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
router.post('/api/auth/update-password', express.json(), async (req, res) => {
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
router.post('/api/auth/forgot-password', express.json(), async (req, res) => {
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
        const { sendPasswordResetEmail } = require('../email');
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
router.post('/api/signup-free', async (req, res) => {
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
        } else {
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
router.get('/api/check-subscription', async (req, res) => {
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

module.exports = router;
