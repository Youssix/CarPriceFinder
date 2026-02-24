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
const { sendWelcomeEmail } = require('./email');

// Lazy-load stripe to avoid crash if key not set
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// POST /api/create-checkout-session
router.post('/api/create-checkout-session', express.json(), async (req, res) => {
  try {
    const stripe = getStripe();

    if (!process.env.STRIPE_PRICE_ID) {
      return res.status(500).json({ error: 'STRIPE_PRICE_ID not configured' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://carlytics.fr';

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1,
      }],
      success_url: `${frontendUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/cancel`,
    });

    console.log(`[💳 Stripe] Checkout session created: ${session.id}`);
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

          // Send welcome email with API key (non-blocking)
          sendWelcomeEmail(email, subscriber.apiKey).catch(err =>
            console.error('[📧 Email] Welcome email failed:', err.message)
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
    active: subscriber.subscription_status === 'active',
    status: subscriber.subscription_status,
    email: subscriber.email,
  });
});

module.exports = router;
