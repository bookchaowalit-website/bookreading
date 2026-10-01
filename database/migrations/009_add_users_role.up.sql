-- User role for admin-only actions (translation review moderation).
-- Every existing and new account is a regular user; grant admin with the
-- backend's ADMIN_EMAILS bootstrap or an explicit UPDATE.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
        ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));
    END IF;
END $$;
