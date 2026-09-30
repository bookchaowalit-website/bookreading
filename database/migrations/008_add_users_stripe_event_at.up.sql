-- Newest Stripe webhook event (event.created) applied to each user. The
-- webhook handler ignores events older than this so a stale or late
-- checkout.session.completed cannot re-activate a canceled subscription.
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_event_at TIMESTAMPTZ;
