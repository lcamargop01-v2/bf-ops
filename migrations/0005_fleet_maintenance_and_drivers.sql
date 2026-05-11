-- Fleet Maintenance: service records, scheduled services, issue reports
CREATE TABLE IF NOT EXISTS fleet_maintenance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  truck_id INTEGER NOT NULL,
  service_type TEXT NOT NULL DEFAULT 'routine', -- routine, repair, inspection, tire, oil, brake, other
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled, in_progress, completed, overdue
  scheduled_date TEXT,
  completed_date TEXT,
  mileage_at_service INTEGER,
  cost REAL DEFAULT 0,
  vendor TEXT,
  notes TEXT,
  next_service_date TEXT,
  next_service_mileage INTEGER,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (truck_id) REFERENCES trucks(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Driver issue reports (with image support)
CREATE TABLE IF NOT EXISTS driver_issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  truck_id INTEGER NOT NULL,
  reported_by INTEGER NOT NULL,
  severity TEXT NOT NULL DEFAULT 'low', -- low, medium, high, critical
  category TEXT NOT NULL DEFAULT 'other', -- engine, tire, brake, electrical, body, fluid, other
  description TEXT NOT NULL,
  photo_data TEXT, -- base64 encoded image or URL
  status TEXT NOT NULL DEFAULT 'open', -- open, acknowledged, in_progress, resolved, dismissed
  resolution_notes TEXT,
  resolved_by INTEGER,
  resolved_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (truck_id) REFERENCES trucks(id),
  FOREIGN KEY (reported_by) REFERENCES users(id),
  FOREIGN KEY (resolved_by) REFERENCES users(id)
);

-- Fleet maintenance documents/records
CREATE TABLE IF NOT EXISTS maintenance_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  maintenance_id INTEGER,
  truck_id INTEGER NOT NULL,
  record_type TEXT NOT NULL DEFAULT 'document', -- document, invoice, photo, inspection_report
  file_name TEXT,
  file_data TEXT, -- base64 encoded or URL
  notes TEXT,
  uploaded_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (maintenance_id) REFERENCES fleet_maintenance(id),
  FOREIGN KEY (truck_id) REFERENCES trucks(id),
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- Add preferred language to users
ALTER TABLE users ADD COLUMN preferred_language TEXT DEFAULT 'en';

-- Add individual bag dimensions to products for auto-calculating pallet dimensions
ALTER TABLE products ADD COLUMN bag_length_in REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN bag_width_in REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN bag_height_in REAL DEFAULT 0;

-- Add current mileage to trucks
ALTER TABLE trucks ADD COLUMN current_mileage INTEGER DEFAULT 0;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fleet_maintenance_truck ON fleet_maintenance(truck_id);
CREATE INDEX IF NOT EXISTS idx_fleet_maintenance_status ON fleet_maintenance(status);
CREATE INDEX IF NOT EXISTS idx_fleet_maintenance_date ON fleet_maintenance(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_driver_issues_truck ON driver_issues(truck_id);
CREATE INDEX IF NOT EXISTS idx_driver_issues_status ON driver_issues(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_records_truck ON maintenance_records(truck_id);
