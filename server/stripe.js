const express = require('express');
const router = express.Router();
const {
  getSubscriberByApiKey,
  getSubscriberByStripeCustomer,
  createSubscriber,
  updateSubscriptionStatus,
  updateSubscription,
  isEventProcessed,
  markEventProcessed,
} = require('./db');
const { sendSetPasswordEmail } = require('./email');
const { createPasswordToken } = require('./db');

// Lazy-load stripe to avoid crash if key not set
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// Mapping plan → variable d'environnement
const PLAN_PRICE_MAP = {
  starter: process.env.STRIPE_PRICE_ID_STARTER,
  pro:     process.env.STRIPE_PRICE_ID_PRO,
  agency:  process.env.STRIPE_PRICE_ID_AGENCY,
};

// POST /api/create-checkout-session
router.post('/api/create-checkout-session', express.json(), async (req, res) => {
  try {
    const stripe = getStripe();
    const plan = (req.body.plan || 'pro').toLowerCase();
    const priceId = PLAN_PRICE_MAP[plan];

    if (!priceId || priceId.startsWith('price_...')) {
      return res.status(500).json({ error: `STRIPE_PRICE_ID_${plan.toUpperCase()} non configuré dans .env` });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://carlytics.fr';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${frontendUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${frontendUrl}/cancel.html`,
      metadata: { plan },
    });

    console.log(`[💳 Stripe] Checkout session créée : ${session.id} (plan: ${plan})`);
    res.json({ url: session.url });
  } catch (error) {
    console.error('[💳 Stripe] Checkout error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/webhook - Stripe webhook (raw body required)
router.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = getStripe();
  const sig = req.headers['stripe-signature'];

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[💳 Webhook] STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[💳 Webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook signature verification failed` });
  }

  // Idempotency check
  if (await isEventProcessed(event.id)) {
    console.log(`[💳 Webhook] Event ${event.id} already processed, skipping`);
    return res.json({ received: true });
  }

  console.log(`[💳 Webhook] Processing event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = session.customer;
        const subscriptionId = session.subscription;
        const email = session.customer_details?.email || session.customer_email;

        if (!email) {
          console.error('[💳 Webhook] No email found in checkout session');
          break;
        }

        // Check if subscriber already exists for this customer
        const existing = await getSubscriberByStripeCustomer(customerId);
        if (existing) {
          await updateSubscription(customerId, subscriptionId, 'active');
          console.log(`[💳 Webhook] Existing subscriber updated: ${email}`);
        } else {
          const subscriber = await createSubscriber({
            email,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            status: 'active',
          });
          console.log(`[💳 Webhook] New subscriber created: ${email}, API key: ${subscriber.apiKey}`);

          // Send set-password email so user can create their password (non-blocking)
          createPasswordToken(email, 'setup').then(token => {
            const frontendUrl = process.env.FRONTEND_URL || 'https://carlytics.fr';
            console.log(`[📧 Email] Set-password URL: ${frontendUrl}/set-password?token=${token}`);
            return sendSetPasswordEmail(email, token).catch(err =>
              console.error('[📧 Email] Set-password email failed:', err.message)
            );
          }).catch(err =>
            console.error('[📧 Email] Token creation failed:', err.message)
          );
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        await updateSubscriptionStatus(customerId, 'active');
        console.log(`[💳 Webhook] Subscription renewed for customer: ${customerId}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        await updateSubscriptionStatus(customerId, 'past_due');
        console.log(`[💳 Webhook] Payment failed for customer: ${customerId}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        await updateSubscriptionStatus(customerId, 'canceled');
        console.log(`[💳 Webhook] Subscription canceled for customer: ${customerId}`);
        break;
      }

      default:
        console.log(`[💳 Webhook] Unhandled event type: ${event.type}`);
    }

    await markEventProcessed(event.id, event.type);
  } catch (error) {
    console.error(`[💳 Webhook] Error processing ${event.type}:`, error.message);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }

  res.json({ received: true });
});

// POST /api/cancel-subscription
router.post('/api/cancel-subscription', express.json(), async (req, res) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  const subscriber = await getSubscriberByApiKey(apiKey);

  if (!subscriber) {
    return res.status(404).json({ error: 'Subscriber not found' });
  }

  if (!subscriber.stripe_subscription_id) {
    return res.status(400).json({ error: 'No active Stripe subscription found' });
  }

  try {
    const stripe = getStripe();
    // Annulation en fin de période (accès conservé jusqu\'à la date de renouvellement)
    await stripe.subscriptions.update(subscriber.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
    console.log(`[💳 Stripe] Subscription scheduled for cancellation: ${subscriber.stripe_subscription_id} (${subscriber.email})`);
    res.json({ ok: true, message: 'Abonnement annulé. Accès maintenu jusqu\'à la fin de la période.' });
  } catch (error) {
    console.error('[💳 Stripe] Cancel subscription error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/check-subscription
router.get('/api/check-subscription', async (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;

  if (!apiKey) {
    return res.status(401).json({ active: false, error: 'API key required' });
  }

  const subscriber = await getSubscriberByApiKey(apiKey);

  if (!subscriber) {
    return res.status(404).json({ active: false, error: 'API key not found' });
  }

  res.json({
    active: ['active', 'free'].includes(subscriber.subscription_status),
    isPaid: subscriber.subscription_status === 'active',
    status: subscriber.subscription_status,
    email: subscriber.email,
  });
});

module.exports = router;
