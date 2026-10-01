-- Stripe billing columns read and written by the backend (domain.User) plus
-- the index the subscription webhooks use to find a user.
--
-- The columns were first added only to init.sql, so on a database built from
-- these migrations alone this index failed with "column does not exist".
-- ADD COLUMN IF NOT EXISTS keeps this a no-op for the column part on
-- databases that already have them (init.sql or a manual fix).
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_users_stripe_subscription_id ON users(stripe_subscription_id);
