-- ============================================================
-- Migration 0036: Inventory Snapshots for Point-in-Time Reporting
-- Daily snapshot of all product stock levels to enable 
-- "inventory as of any given day" queries
-- ============================================================

-- Daily inventory snapshot — one row per product per location per day
CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date DATE NOT NULL,
  product_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  product_name TEXT,
  category TEXT,
  qty_on_hand INTEGER NOT NULL DEFAULT 0,
  qty_on_hold INTEGER NOT NULL DEFAULT 0,
  qty_reserved INTEGER NOT NULL DEFAULT 0,
  qty_available INTEGER NOT NULL DEFAULT 0,
  unit_cost REAL DEFAULT 0,
  total_value REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  UNIQUE(snapshot_date, product_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_snap_date ON inventory_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_inv_snap_product ON inventory_snapshots(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_snap_location ON inventory_snapshots(location_id);
CREATE INDEX IF NOT EXISTS idx_inv_snap_category ON inventory_snapshots(category);
