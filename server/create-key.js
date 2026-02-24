#!/usr/bin/env node

/**
 * Manual API key generator for beta testers / first clients.
 * Usage: node create-key.js email@client.com
 */

require('dotenv').config();
const { initDb, createSubscriber, getSubscriberByEmail, closePool } = require('./db');

const email = process.argv[2];

if (!email || !email.includes('@')) {
  console.error('Usage: node create-key.js email@client.com');
  process.exit(1);
}

(async () => {
  try {
    await initDb();

    // Check if subscriber already exists
    const existing = await getSubscriberByEmail(email);
    if (existing) {
      console.log(`\nSubscriber already exists for ${email}`);
      console.log(`  API Key: ${existing.api_key}`);
      console.log(`  Status:  ${existing.subscription_status}`);
      console.log(`  Created: ${existing.created_at}`);
    } else {
      // Create new subscriber with active status (manual/beta)
      const subscriber = await createSubscriber({
        email,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        status: 'active',
      });

      console.log(`\nAPI key created for ${email}`);
      console.log(`  API Key: ${subscriber.apiKey}`);
      console.log(`  Status:  ${subscriber.status}`);
      console.log(`\nShare this key with the client. They enter it in the extension popup settings.`);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await closePool();
  }
})();
