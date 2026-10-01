-- Intentionally a no-op. stripe_event_at is part of database/init.sql, so on
-- databases built from init.sql it predates 008 and holds the newest applied
-- Stripe webhook event per user; dropping it here would destroy that data
-- (and let a stale webhook re-activate a canceled subscription). On a
-- migrations-only database the nullable column stays after rolling back to
-- 007 (unused by 007-era code) and goes away with the users table in 001 down.
SELECT 1;
