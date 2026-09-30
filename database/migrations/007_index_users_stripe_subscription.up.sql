-- Stripe subscription webhooks look users up by subscription ID.
CREATE INDEX IF NOT EXISTS idx_users_stripe_subscription_id ON users(stripe_subscription_id);
