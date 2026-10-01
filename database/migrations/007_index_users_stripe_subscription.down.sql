-- Only the index is reverted. The Stripe columns predate this migration on
-- databases built from database/init.sql, where they hold the billing link
-- between users and Stripe customers/subscriptions; dropping them here would
-- destroy that data. On a migrations-only database the columns stay after
-- rolling back to 006 (nullable, unused by 006-era code) and go away with the
-- users table in 001 down.
DROP INDEX IF EXISTS idx_users_stripe_subscription_id;
