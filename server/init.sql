-- CarPriceFinder PostgreSQL Schema

CREATE TABLE IF NOT EXISTS subscribers (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'active',
  api_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGSERIAL PRIMARY KEY,
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscribers_api_key ON subscribers(api_key);
CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_stripe_customer ON subscribers(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_stripe_id ON webhook_events(stripe_event_id);

-- Price observations for ML training data
CREATE TABLE IF NOT EXISTS price_observations (
  id BIGSERIAL PRIMARY KEY,
  subscriber_id BIGINT REFERENCES subscribers(id),
  stock_number TEXT,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INT NOT NULL,
  km INT NOT NULL,
  fuel TEXT,
  gearbox TEXT,
  doors TEXT,
  auto1_price_cents BIGINT,
  lbc_median_price INT,
  lbc_low_price INT,
  lbc_high_price INT,
  lbc_count INT,
  options JSONB DEFAULT '[]',
  raw_params JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Server-side vehicle lists (replaces chrome.storage.local)
CREATE TABLE IF NOT EXISTS saved_vehicles (
  id BIGSERIAL PRIMARY KEY,
  subscriber_id BIGINT NOT NULL REFERENCES subscribers(id),
  stock_number TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INT,
  km INT,
  fuel TEXT,
  gearbox TEXT,
  power TEXT,
  doors TEXT,
  color TEXT,
  auto1_price INT,
  estimated_price INT,
  margin INT,
  detected_options JSONB DEFAULT '[]',
  equipment JSONB DEFAULT '[]',
  photos JSONB DEFAULT '[]',
  catbox_urls JSONB DEFAULT '[]',
  notes TEXT DEFAULT '',
  added_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(subscriber_id, stock_number)
);

-- Deal alerts configuration
CREATE TABLE IF NOT EXISTS alerts (
  id BIGSERIAL PRIMARY KEY,
  subscriber_id BIGINT NOT NULL REFERENCES subscribers(id),
  name TEXT,
  brand TEXT,
  model TEXT,
  year_min INT,
  year_max INT,
  km_max INT,
  fuel TEXT,
  min_margin INT DEFAULT 0,
  max_price INT,
  is_active BOOLEAN DEFAULT TRUE,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Alert match history
CREATE TABLE IF NOT EXISTS alert_matches (
  id BIGSERIAL PRIMARY KEY,
  alert_id BIGINT NOT NULL REFERENCES alerts(id),
  observation_id BIGINT NOT NULL REFERENCES price_observations(id),
  notified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  seen BOOLEAN DEFAULT FALSE
);

-- Persistent estimation cache (replaces in-memory Map)
CREATE TABLE IF NOT EXISTS estimation_cache (
  cache_key TEXT PRIMARY KEY,
  response_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_price_obs_subscriber ON price_observations(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_price_obs_brand_model ON price_observations(brand, model);
CREATE INDEX IF NOT EXISTS idx_price_obs_created ON price_observations(created_at);
CREATE INDEX IF NOT EXISTS idx_saved_vehicles_subscriber ON saved_vehicles(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_alerts_subscriber ON alerts(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_estimation_cache_created ON estimation_cache(created_at);
CREATE INDEX IF NOT EXISTS idx_alert_matches_alert ON alert_matches(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_matches_unseen ON alert_matches(seen) WHERE seen = FALSE;

-- Prevent duplicate matches
CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_matches_unique ON alert_matches(alert_id, observation_id);

-- Auth codes for magic link login
CREATE TABLE IF NOT EXISTS auth_codes (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_codes_email ON auth_codes(email);
CREATE INDEX IF NOT EXISTS idx_auth_codes_cleanup ON auth_codes(expires_at) WHERE used = FALSE;

-- Beta testers signup
CREATE TABLE IF NOT EXISTS beta_testers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  vehicles_per_month TEXT,
  time_comparing TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_beta_testers_email ON beta_testers(email);
CREATE INDEX IF NOT EXISTS idx_beta_testers_status ON beta_testers(status);
