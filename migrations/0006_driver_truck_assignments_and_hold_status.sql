-- =====================================================
-- Migration 0006: Driver-Truck Assignments
-- =====================================================

-- Driver-to-truck assignment table (which trucks each driver can drive)
CREATE TABLE IF NOT EXISTS driver_truck_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_id INTEGER NOT NULL,
  truck_id INTEGER NOT NULL,
  is_primary INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (truck_id) REFERENCES trucks(id) ON DELETE CASCADE,
  UNIQUE(driver_id, truck_id)
);

CREATE INDEX IF NOT EXISTS idx_dta_driver ON driver_truck_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_dta_truck ON driver_truck_assignments(truck_id);
