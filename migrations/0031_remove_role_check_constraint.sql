-- Remove the hardcoded CHECK constraint on users.role
-- so that custom roles from the 'roles' table can be assigned.
-- SQLite does not support ALTER TABLE DROP CONSTRAINT, so we
-- recreate the table without the CHECK clause.

-- Disable FK checks during table recreation
PRAGMA foreign_keys = OFF;

-- 1. Create the new table without the CHECK constraint on role
CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  preferred_language TEXT DEFAULT 'en',
  verizon_driver_id INTEGER DEFAULT NULL,
  verizon_driver_number TEXT DEFAULT NULL,
  verizon_synced_at TEXT DEFAULT NULL
);

-- 2. Copy all existing data
INSERT INTO users_new (id, email, name, role, phone, password_hash, active, created_at, preferred_language, verizon_driver_id, verizon_driver_number, verizon_synced_at)
SELECT id, email, name, role, phone, password_hash, active, created_at, preferred_language, verizon_driver_id, verizon_driver_number, verizon_synced_at
FROM users;

-- 3. Drop the old table
DROP TABLE users;

-- 4. Rename new table to users
ALTER TABLE users_new RENAME TO users;

-- 5. Recreate indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Re-enable FK checks
PRAGMA foreign_keys = ON;
