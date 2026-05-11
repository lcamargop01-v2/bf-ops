-- Expand route status values to include new workflow statuses
-- SQLite doesn't support ALTER TABLE to change CHECK constraints
-- We need to recreate the table

-- Step 1: Create new table without the restrictive CHECK constraint
CREATE TABLE IF NOT EXISTS routes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_number TEXT,
  date TEXT NOT NULL,
  truck_id INTEGER,
  driver_id INTEGER,
  status TEXT DEFAULT 'planned' CHECK(status IN ('planned','pending_loading','loaded','truck_left','optimized','dispatched','in_transit','in_progress','delivered','completed','cancelled')),
  total_miles REAL DEFAULT 0,
  total_weight REAL DEFAULT 0,
  estimated_time TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  archived INTEGER DEFAULT 0,
  FOREIGN KEY (truck_id) REFERENCES trucks(id),
  FOREIGN KEY (driver_id) REFERENCES users(id)
);

-- Step 2: Copy data
INSERT INTO routes_new (id, route_number, date, truck_id, driver_id, status, total_miles, total_weight, estimated_time, notes, created_at, archived)
SELECT id, route_number, date, truck_id, driver_id, status, total_miles, total_weight, estimated_time, notes, created_at, archived FROM routes;

-- Step 3: Drop old table and rename
DROP TABLE routes;
ALTER TABLE routes_new RENAME TO routes;

-- Recreate any indexes that may have existed
CREATE INDEX IF NOT EXISTS idx_routes_date ON routes(date);
CREATE INDEX IF NOT EXISTS idx_routes_status ON routes(status);
