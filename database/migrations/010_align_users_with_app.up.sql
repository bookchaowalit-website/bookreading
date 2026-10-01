-- Bring a migration-built users table in line with domain.User and init.sql.
-- 001 created users without the profile/plan columns the backend inserts and
-- selects (SELECT * into domain.User), so registration failed on a database
-- built from migrations alone. Every step is a no-op where init.sql (or a
-- manual fix) already applied it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'active';
-- Registration allows an empty display name.
ALTER TABLE users ALTER COLUMN name DROP NOT NULL;
-- Existing values are read in the server time zone.
ALTER TABLE users ALTER COLUMN created_at TYPE TIMESTAMPTZ;
ALTER TABLE users ALTER COLUMN updated_at TYPE TIMESTAMPTZ;
