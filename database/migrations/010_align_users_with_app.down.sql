-- Intentionally a no-op. Migration 010 only aligned a migrations-built users
-- table with database/init.sql: avatar_url, subscription_plan and
-- subscription_status, a nullable name and TIMESTAMPTZ timestamps are part of
-- the init.sql schema, so on databases built from init.sql they predate 010.
-- Dropping those columns, converting the timestamps back to TIMESTAMP or
-- forcing name NOT NULL here would destroy data or break those databases.
-- The columns go away with the users table in 001 down.
SELECT 1;
