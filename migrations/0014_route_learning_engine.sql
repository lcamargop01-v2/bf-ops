-- =====================================================
-- Migration 0014: Route Learning Engine
-- Captures patterns from every route decision to power
-- intelligent route recommendations over time.
-- =====================================================

-- 1. ROUTE SNAPSHOTS: Full snapshot of every confirmed route for pattern mining
--    Captured when a route is created (planned) and again when completed.
CREATE TABLE IF NOT EXISTS route_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL,
  snapshot_type TEXT NOT NULL DEFAULT 'created', -- 'created', 'completed', 'modified'
  date TEXT NOT NULL,
  day_of_week TEXT NOT NULL,  -- 'mon','tue','wed','thu','fri','sat','sun'
  truck_id INTEGER,
  truck_name TEXT,
  truck_type TEXT,
  driver_id INTEGER,
  driver_name TEXT,
  zone_id INTEGER,
  zone_name TEXT,
  stop_count INTEGER DEFAULT 0,
  total_pallets INTEGER DEFAULT 0,
  total_items INTEGER DEFAULT 0,
  total_miles REAL DEFAULT 0,
  -- JSON array of stop details: [{customer_id, address_id, order_id, sequence, lat, lng, city, zip, zone_id, pallet_count, item_count}]
  stops_json TEXT,
  -- JSON array of customer IDs in route order
  customer_ids_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (route_id) REFERENCES routes(id)
);

CREATE INDEX IF NOT EXISTS idx_route_snapshots_route ON route_snapshots(route_id);
CREATE INDEX IF NOT EXISTS idx_route_snapshots_date ON route_snapshots(date);
CREATE INDEX IF NOT EXISTS idx_route_snapshots_dow ON route_snapshots(day_of_week);
CREATE INDEX IF NOT EXISTS idx_route_snapshots_truck ON route_snapshots(truck_id);
CREATE INDEX IF NOT EXISTS idx_route_snapshots_driver ON route_snapshots(driver_id);

-- 2. CUSTOMER PAIRINGS: How often two customers appear on the same route
--    Updated incrementally every time a route is created/confirmed.
CREATE TABLE IF NOT EXISTS customer_pairings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_a_id INTEGER NOT NULL,
  customer_b_id INTEGER NOT NULL,
  times_paired INTEGER DEFAULT 1,
  -- Running stats
  avg_sequence_gap REAL DEFAULT 1,   -- how far apart they typically are in stop order
  same_truck_count INTEGER DEFAULT 0, -- how many times on same truck type
  last_paired_date TEXT,
  first_paired_date TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_a_id) REFERENCES customers(id),
  FOREIGN KEY (customer_b_id) REFERENCES customers(id),
  UNIQUE(customer_a_id, customer_b_id)
);

CREATE INDEX IF NOT EXISTS idx_pairings_a ON customer_pairings(customer_a_id);
CREATE INDEX IF NOT EXISTS idx_pairings_b ON customer_pairings(customer_b_id);
CREATE INDEX IF NOT EXISTS idx_pairings_count ON customer_pairings(times_paired DESC);

-- 3. CUSTOMER TRUCK HISTORY: Which truck/truck_type each customer typically goes on
CREATE TABLE IF NOT EXISTS customer_truck_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  truck_id INTEGER NOT NULL,
  truck_type TEXT,
  times_assigned INTEGER DEFAULT 1,
  last_assigned_date TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (truck_id) REFERENCES trucks(id),
  UNIQUE(customer_id, truck_id)
);

CREATE INDEX IF NOT EXISTS idx_cth_customer ON customer_truck_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_cth_truck ON customer_truck_history(truck_id);

-- 4. CUSTOMER DRIVER HISTORY: Which driver usually delivers to each customer
CREATE TABLE IF NOT EXISTS customer_driver_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  driver_id INTEGER NOT NULL,
  times_assigned INTEGER DEFAULT 1,
  last_assigned_date TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (driver_id) REFERENCES users(id),
  UNIQUE(customer_id, driver_id)
);

CREATE INDEX IF NOT EXISTS idx_cdh_customer ON customer_driver_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_cdh_driver ON customer_driver_history(driver_id);

-- 5. CUSTOMER DAY-OF-WEEK PATTERNS: Which days each customer typically gets deliveries
CREATE TABLE IF NOT EXISTS customer_day_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  day_of_week TEXT NOT NULL, -- 'mon','tue', etc.
  delivery_count INTEGER DEFAULT 1,
  last_delivery_date TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  UNIQUE(customer_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_cdp_customer ON customer_day_patterns(customer_id);

-- 6. PALLET CORRECTIONS: When user overrides calculated pallet count, store the correction
--    This teaches the system the REAL pallet count for specific product combinations.
CREATE TABLE IF NOT EXISTS pallet_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Context: what was corrected
  context_type TEXT NOT NULL, -- 'order', 'route_stop', 'route_total'
  context_id INTEGER NOT NULL, -- order_id, route_stop_id, or route_id
  route_id INTEGER,
  order_id INTEGER,
  -- The correction
  calculated_pallets INTEGER NOT NULL, -- what the system calculated
  actual_pallets INTEGER NOT NULL,     -- what the user said it really is
  -- Snapshot of items at correction time (for learning product→pallet mappings)
  items_json TEXT, -- [{product_id, product_name, quantity, pallet_qty, unit_type}]
  notes TEXT,
  corrected_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (route_id) REFERENCES routes(id),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (corrected_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_pc_order ON pallet_corrections(order_id);
CREATE INDEX IF NOT EXISTS idx_pc_route ON pallet_corrections(route_id);
CREATE INDEX IF NOT EXISTS idx_pc_context ON pallet_corrections(context_type, context_id);

-- 7. PRODUCT PALLET OVERRIDES: Learned corrections per product or product combination
--    Built from pallet_corrections data — maps specific products to actual pallets needed
CREATE TABLE IF NOT EXISTS product_pallet_learned (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  quantity_min INTEGER NOT NULL DEFAULT 1,
  quantity_max INTEGER NOT NULL DEFAULT 999,
  learned_pallets REAL NOT NULL,  -- avg pallets observed for this qty range
  sample_count INTEGER DEFAULT 1, -- how many corrections contributed
  confidence REAL DEFAULT 0.5,    -- 0-1, increases with more samples
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_ppl_product ON product_pallet_learned(product_id);

-- 8. ROUTE STOP ACTUAL PALLETS: Store the actual pallet count per stop (user-corrected)
--    Extends route_stops without altering the original table structure
ALTER TABLE route_stops ADD COLUMN actual_pallets INTEGER;
ALTER TABLE route_stops ADD COLUMN pallets_corrected INTEGER DEFAULT 0;
