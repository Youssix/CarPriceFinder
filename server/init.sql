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

-- Password auth: add column to existing subscribers table
ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Password setup/reset tokens
CREATE TABLE IF NOT EXISTS password_tokens (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  token VARCHAR(128) NOT NULL UNIQUE,
  type VARCHAR(20) NOT NULL DEFAULT 'setup',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_password_tokens_token ON password_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_tokens_email ON password_tokens(email);

-- Auth codes for magic link login (kept for possible future use)
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

-- API activity logs for monitoring (who calls what, vehicle searches, paid vs free)
CREATE TABLE IF NOT EXISTS api_logs (
  id BIGSERIAL PRIMARY KEY,
  -- Who
  subscriber_id BIGINT REFERENCES subscribers(id),
  email TEXT,
  user_tier TEXT NOT NULL DEFAULT 'anonymous',
  ip TEXT,
  user_agent TEXT,
  -- What
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  -- Vehicle context (estimation endpoints only)
  brand TEXT,
  model TEXT,
  year INT,
  km INT,
  fuel TEXT,
  stock_number TEXT,
  -- Result
  status_code INT,
  cache_hit BOOLEAN,
  lbc_count INT,
  estimated_price INT,
  duration_ms INT,
  error TEXT,
  -- Metadata
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_logs_subscriber ON api_logs(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_api_logs_created ON api_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_api_logs_path ON api_logs(path);
CREATE INDEX IF NOT EXISTS idx_api_logs_tier ON api_logs(user_tier);
CREATE INDEX IF NOT EXISTS idx_api_logs_brand_model ON api_logs(brand, model);
