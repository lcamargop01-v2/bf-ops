-- =====================================================
-- Migration 0044: Bill Line Items & Cost Tracking
-- Adds line-level detail to bills so each product's
-- actual cost from the supplier invoice is captured.
-- When a bill is approved, product costs are updated
-- to the latest supplier cost (variable COGS).
-- =====================================================

-- Bill line items — one row per product on the supplier's invoice
CREATE TABLE IF NOT EXISTS po_bill_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES po_bills(id) ON DELETE CASCADE,
  po_item_id INTEGER REFERENCES po_items(id),
  product_id INTEGER REFERENCES products(id),
  description TEXT,
  qty REAL NOT NULL DEFAULT 0,
  unit TEXT DEFAULT 'each',
  unit_cost REAL NOT NULL DEFAULT 0,
  line_total REAL GENERATED ALWAYS AS (qty * unit_cost) VIRTUAL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_po_bill_items_bill ON po_bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_po_bill_items_product ON po_bill_items(product_id);

-- Add QBO sync tracking to bills for future QuickBooks Online reconciliation
ALTER TABLE po_bills ADD COLUMN qbo_sync_status TEXT DEFAULT 'not_synced' CHECK(qbo_sync_status IN ('not_synced','pending','synced','error'));
ALTER TABLE po_bills ADD COLUMN qbo_bill_id TEXT;
ALTER TABLE po_bills ADD COLUMN qbo_synced_at DATETIME;

-- Track which receiving triggered the bill (optional link)
ALTER TABLE po_bills ADD COLUMN receiving_id INTEGER REFERENCES po_receiving(id);

-- Product cost history — tracks every cost change from bills
-- This gives you an audit trail of cost changes over time
CREATE TABLE IF NOT EXISTS product_cost_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  old_cost REAL NOT NULL DEFAULT 0,
  new_cost REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'bill',
  reference_type TEXT,
  reference_id INTEGER,
  bill_id INTEGER REFERENCES po_bills(id),
  po_id INTEGER REFERENCES purchase_orders(id),
  supplier_id INTEGER REFERENCES suppliers(id),
  changed_by INTEGER REFERENCES users(id),
  changed_by_name TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cost_history_product ON product_cost_history(product_id);
CREATE INDEX IF NOT EXISTS idx_cost_history_bill ON product_cost_history(bill_id);
CREATE INDEX IF NOT EXISTS idx_cost_history_created ON product_cost_history(created_at);
