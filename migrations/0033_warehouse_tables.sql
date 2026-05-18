-- ============================================
-- Migration 0033: Warehouse operations tables
-- Adds: warehouse_counts, warehouse_activity_log, stock_adjustments
-- Supports: real-time inventory counts by zone, receiving, loading, returns processing
-- ============================================

-- Warehouse inventory counts — live count snapshots by product + zone
-- Zones: shelf_goods, hay, shavings (maps to product categories)
CREATE TABLE IF NOT EXISTS warehouse_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  zone TEXT NOT NULL DEFAULT 'shelf_goods',
  count_qty INTEGER NOT NULL DEFAULT 0,
  counted_by INTEGER,
  counted_at TEXT DEFAULT (datetime('now')),
  notes TEXT,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (counted_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_wh_counts_product ON warehouse_counts(product_id);
CREATE INDEX IF NOT EXISTS idx_wh_counts_zone ON warehouse_counts(zone);
CREATE INDEX IF NOT EXISTS idx_wh_counts_date ON warehouse_counts(counted_at);

-- Warehouse activity log — tracks every in/out event
CREATE TABLE IF NOT EXISTS warehouse_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_type TEXT NOT NULL,
  -- Types: 'count_update', 'order_loaded', 'order_received', 'return_received',
  --        'return_restocked', 'stock_adjustment', 'transfer_in', 'transfer_out'
  product_id INTEGER,
  quantity INTEGER DEFAULT 0,
  direction TEXT DEFAULT 'in',  -- 'in' or 'out'
  reference_type TEXT,          -- 'order', 'return', 'route', 'adjustment', 'transfer'
  reference_id INTEGER,
  zone TEXT,
  notes TEXT,
  performed_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (performed_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_wh_activity_type ON warehouse_activity(activity_type);
CREATE INDEX IF NOT EXISTS idx_wh_activity_date ON warehouse_activity(created_at);
CREATE INDEX IF NOT EXISTS idx_wh_activity_product ON warehouse_activity(product_id);
CREATE INDEX IF NOT EXISTS idx_wh_activity_ref ON warehouse_activity(reference_type, reference_id);

-- Add warehouse_zone to products for quick filtering
ALTER TABLE products ADD COLUMN warehouse_zone TEXT DEFAULT 'shelf_goods';
-- Values: 'shelf_goods', 'hay', 'shavings'

-- Add loaded_at timestamp to route_stops for tracking loading
ALTER TABLE route_stops ADD COLUMN loaded_at TEXT DEFAULT NULL;
ALTER TABLE route_stops ADD COLUMN loaded_by INTEGER DEFAULT NULL;

-- Add received_at columns to orders for inbound receiving
ALTER TABLE orders ADD COLUMN warehouse_received INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN warehouse_received_at TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN warehouse_received_by INTEGER DEFAULT NULL;

-- Add scheduled_date to returns if not present (may already exist from prior migration)
-- Using a safe CREATE INDEX that won't fail
CREATE INDEX IF NOT EXISTS idx_wh_returns_status ON returns(status);
