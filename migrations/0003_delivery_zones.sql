-- Delivery Zones: geographic regions with assigned delivery days
CREATE TABLE IF NOT EXISTS delivery_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#2563EB',
  delivery_days TEXT NOT NULL DEFAULT 'mon,wed,fri',
  -- Zone boundary: stored as JSON array of [lat,lng] polygon points
  -- Example: [[26.69,-80.23],[26.70,-80.24],[26.71,-80.23]]
  boundary_json TEXT,
  -- Simpler alternative: center point + radius
  center_lat REAL,
  center_lng REAL,
  radius_miles REAL DEFAULT 5,
  -- Matching: addresses can also be assigned by city/zip pattern
  city_pattern TEXT,
  zip_codes TEXT,
  notes TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Link addresses to zones
ALTER TABLE addresses ADD COLUMN zone_id INTEGER REFERENCES delivery_zones(id);

-- Add pallet dimensions to trucks
ALTER TABLE trucks ADD COLUMN max_pallet_spots INTEGER DEFAULT 26;
ALTER TABLE trucks ADD COLUMN pallet_length_in REAL DEFAULT 48;
ALTER TABLE trucks ADD COLUMN pallet_width_in REAL DEFAULT 40;

-- Add pallet info to products
ALTER TABLE products ADD COLUMN pallet_qty INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN pallet_weight REAL DEFAULT 0;

-- Index for zone lookups
CREATE INDEX IF NOT EXISTS idx_addresses_zone ON addresses(zone_id);
CREATE INDEX IF NOT EXISTS idx_zones_active ON delivery_zones(active);
