-- ============================================================
-- 0052: Vendor Tracking + Category Consolidation
-- ============================================================

-- 1. Add primary vendor to products
ALTER TABLE products ADD COLUMN primary_vendor_id INTEGER REFERENCES suppliers(id);

-- 2. Junction table for additional vendors per product
CREATE TABLE IF NOT EXISTS product_vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  is_primary INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  lead_time_days INTEGER DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_product_vendors_product ON product_vendors(product_id);
CREATE INDEX IF NOT EXISTS idx_product_vendors_supplier ON product_vendors(supplier_id);

-- 3. Consolidate categories: everything not hay or shavings → shelf_goods
UPDATE products SET category = 'shelf_goods' WHERE category NOT IN ('hay', 'shavings');
