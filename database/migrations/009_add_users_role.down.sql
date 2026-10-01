-- Intentionally a no-op. role and its users_role_check constraint are part of
-- database/init.sql, so on databases built from init.sql they predate 009 and
-- hold who is an admin; dropping them here would silently demote every admin
-- (and drop the CHECK that keeps role in ('user', 'admin')). On a
-- migrations-only database the column (NOT NULL DEFAULT 'user') stays after
-- rolling back to 008, unused by 008-era code, and goes away with the users
-- table in 001 down.
SELECT 1;
