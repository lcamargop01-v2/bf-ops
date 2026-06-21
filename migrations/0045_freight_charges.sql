-- Migration 0045: Freight charges with landed cost support
-- Freight can come from the product supplier OR a third-party freight vendor
-- Allocation method: split by quantity across PO items (default)

-- Freight charges table
CREATE TABLE IF NOT EXISTS po_freight_charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  vendor_id INTEGER REFERENCES suppliers(id),
  vendor_name TEXT,
  invoice_number TEXT,
  amount REAL NOT NULL DEFAULT 0,
  tax REAL DEFAULT 0,
  total REAL GENERATED ALWAYS AS (amount + tax) VIRTUAL,
  allocation_method TEXT DEFAULT 'by_qty' CHECK(allocation_method IN ('by_qty','by_value','even')),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','paid','disputed')),
  due_date DATE,
  paid_date DATE,
  notes TEXT,
  is_third_party INTEGER DEFAULT 0,
  carrier_name TEXT,
  tracking_number TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Freight allocation breakdown per PO item (calculated on approval)
CREATE TABLE IF NOT EXISTS po_freight_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  freight_id INTEGER NOT NULL REFERENCES po_freight_charges(id) ON DELETE CASCADE,
  po_item_id INTEGER REFERENCES po_items(id),
  product_id INTEGER REFERENCES products(id),
  qty REAL NOT NULL DEFAULT 0,
  allocated_amount REAL NOT NULL DEFAULT 0,
  per_unit_freight REAL NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add supplier_type to suppliers so freight carriers can be tagged
ALTER TABLE suppliers ADD COLUMN supplier_type TEXT DEFAULT 'product';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_freight_po ON po_freight_charges(po_id);
CREATE INDEX IF NOT EXISTS idx_freight_status ON po_freight_charges(status);
CREATE INDEX IF NOT EXISTS idx_freight_alloc_freight ON po_freight_allocations(freight_id);
CREATE INDEX IF NOT EXISTS idx_freight_alloc_product ON po_freight_allocations(product_id);
