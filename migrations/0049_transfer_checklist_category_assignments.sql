-- Transfer packing checklist (mirrors delivery packing_checklist but for inventory transfers)
CREATE TABLE IF NOT EXISTS transfer_checklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  sku TEXT,
  qty_requested INTEGER NOT NULL DEFAULT 1,
  unit_type TEXT DEFAULT 'each',
  checked INTEGER DEFAULT 0,
  checked_by INTEGER,
  checked_by_name TEXT,
  checked_at DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transfer_checklist_transfer ON transfer_checklist(transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfer_checklist_product ON transfer_checklist(product_id);

-- Category ordering assignments: who is responsible for ordering each product category
CREATE TABLE IF NOT EXISTS category_order_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  user_name TEXT,
  is_primary INTEGER DEFAULT 1,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cat_order_assign_unique ON category_order_assignments(category, user_id);
CREATE INDEX IF NOT EXISTS idx_cat_order_assign_category ON category_order_assignments(category);
CREATE INDEX IF NOT EXISTS idx_cat_order_assign_user ON category_order_assignments(user_id);

-- Add source column to order_requests to track origin (manual, pos, smart_restock, etc.)
-- and assigned_to for category-based assignment
ALTER TABLE order_requests ADD COLUMN source TEXT DEFAULT 'manual';
ALTER TABLE order_requests ADD COLUMN assigned_to INTEGER;
ALTER TABLE order_requests ADD COLUMN assigned_to_name TEXT;
