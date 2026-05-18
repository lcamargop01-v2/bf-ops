-- Add invite token columns to users table for portal invite system
-- invite_token: unique random token for invite links
-- invite_expires_at: ISO8601 timestamp when invite expires (7 days from creation)
-- password_set: whether the user has set their own password (vs default)

ALTER TABLE users ADD COLUMN invite_token TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN invite_expires_at TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN password_set INTEGER DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_invite_token ON users(invite_token);
