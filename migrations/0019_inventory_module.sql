-- ============================================================
-- Migration 0019: Inventory Module
-- Multi-location stock tracking, batches, transfers, holds,
-- reservations, losses, and full audit trail
-- ============================================================

-- Stock levels per product per location
CREATE TABLE IF NOT EXISTS inventory_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  qty_on_hand INTEGER NOT NULL DEFAULT 0,
  qty_on_hold INTEGER NOT NULL DEFAULT 0,
  qty_reserved INTEGER NOT NULL DEFAULT 0,
  qty_available INTEGER GENERATED ALWAYS AS (qty_on_hand - qty_on_hold - qty_reserved) VIRTUAL,
  reorder_point INTEGER DEFAULT 0,
  reorder_qty INTEGER DEFAULT 0,
  last_counted_at DATETIME,
  last_counted_by INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  UNIQUE(product_id, location_id)
);

-- Batches: break up product into condition-based lots (e.g. damaged hay)
CREATE TABLE IF NOT EXISTS inventory_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  batch_number TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0,
  condition TEXT NOT NULL DEFAULT 'good' CHECK(condition IN ('good','fair','poor','damaged','rejected')),
  notes TEXT,
  received_date DATE,
  expiry_date DATE,
  source TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Transfers between locations
CREATE TABLE IF NOT EXISTS inventory_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_number TEXT UNIQUE NOT NULL,
  from_location_id INTEGER NOT NULL,
  to_location_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_transit','received','cancelled')),
  notes TEXT,
  created_by INTEGER,
  shipped_by INTEGER,
  received_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  shipped_at DATETIME,
  received_at DATETIME,
  FOREIGN KEY (from_location_id) REFERENCES locations(id),
  FOREIGN KEY (to_location_id) REFERENCES locations(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (shipped_by) REFERENCES users(id),
  FOREIGN KEY (received_by) REFERENCES users(id)
);

-- Transfer line items
CREATE TABLE IF NOT EXISTS inventory_transfer_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  qty_requested INTEGER NOT NULL DEFAULT 0,
  qty_shipped INTEGER DEFAULT 0,
  qty_received INTEGER DEFAULT 0,
  batch_id INTEGER,
  FOREIGN KEY (transfer_id) REFERENCES inventory_transfers(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id)
);

-- Holds: inventory locked due to logistics (route loading) or other reasons
CREATE TABLE IF NOT EXISTS inventory_holds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('route','order','transfer','manual')),
  reference_type TEXT,
  reference_id INTEGER,
  notes TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  released_at DATETIME,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Reservations: inventory earmarked for a specific customer/order
CREATE TABLE IF NOT EXISTS inventory_reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  customer_id INTEGER,
  order_id INTEGER,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','fulfilled','cancelled')),
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  fulfilled_at DATETIME,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Losses: damaged, expired, stolen, shrinkage tracking
CREATE TABLE IF NOT EXISTS inventory_losses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('damaged','expired','stolen','shrinkage','spoiled','pest','other')),
  notes TEXT,
  batch_id INTEGER,
  reported_by INTEGER,
  approved_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id),
  FOREIGN KEY (reported_by) REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- Full audit trail for every inventory change
CREATE TABLE IF NOT EXISTS inventory_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  qty_change INTEGER NOT NULL DEFAULT 0,
  qty_before INTEGER,
  qty_after INTEGER,
  reason TEXT,
  reference_type TEXT,
  reference_id INTEGER,
  batch_id INTEGER,
  notes TEXT,
  user_id INTEGER,
  user_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (location_id) REFERENCES locations(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inv_stock_product ON inventory_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_stock_location ON inventory_stock(location_id);
CREATE INDEX IF NOT EXISTS idx_inv_batches_product ON inventory_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_batches_location ON inventory_batches(location_id);
CREATE INDEX IF NOT EXISTS idx_inv_transfers_status ON inventory_transfers(status);
CREATE INDEX IF NOT EXISTS idx_inv_transfers_from ON inventory_transfers(from_location_id);
CREATE INDEX IF NOT EXISTS idx_inv_transfers_to ON inventory_transfers(to_location_id);
CREATE INDEX IF NOT EXISTS idx_inv_holds_product ON inventory_holds(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_holds_ref ON inventory_holds(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_inv_reservations_product ON inventory_reservations(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_reservations_customer ON inventory_reservations(customer_id);
CREATE INDEX IF NOT EXISTS idx_inv_reservations_order ON inventory_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_inv_losses_product ON inventory_losses(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_losses_location ON inventory_losses(location_id);
CREATE INDEX IF NOT EXISTS idx_inv_audit_product ON inventory_audit(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_audit_location ON inventory_audit(location_id);
CREATE INDEX IF NOT EXISTS idx_inv_audit_action ON inventory_audit(action);
CREATE INDEX IF NOT EXISTS idx_inv_audit_created ON inventory_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_inv_audit_reference ON inventory_audit(reference_type, reference_id);
