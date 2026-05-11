-- ============================================
-- Migration 0022: Expand product categories
-- Adds granular categories from the 2026 catalog:
--   shavings, hay, fly_spray, fly_control, electrolyte,
--   gut_health, psyllium, oil, grooming, shampoo, liniment,
--   clippers, leather, barn, treats
-- ============================================

-- Disable foreign key checks for table recreation
PRAGMA foreign_keys = OFF;

-- SQLite does not support ALTER COLUMN, so we must recreate the table.
CREATE TABLE products_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  category TEXT DEFAULT 'horse' CHECK(category IN (
    'horse','cattle','poultry','swine','goat','supplement','other',
    'shavings','hay','fly_spray','fly_control','electrolyte',
    'gut_health','psyllium','oil','grooming','shampoo','liniment',
    'clippers','leather','barn','treats'
  )),
  weight_per_unit REAL NOT NULL DEFAULT 50,
  unit_type TEXT DEFAULT 'bag',
  price REAL DEFAULT 0,
  stock_quantity INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  pallet_qty INTEGER DEFAULT 0,
  pallet_weight REAL DEFAULT 0,
  length_in REAL DEFAULT 0,
  width_in REAL DEFAULT 0,
  height_in REAL DEFAULT 0,
  stackable INTEGER DEFAULT 1,
  max_stack INTEGER DEFAULT 3,
  bag_length_in REAL DEFAULT 0,
  bag_width_in REAL DEFAULT 0,
  bag_height_in REAL DEFAULT 0,
  tax_rate REAL DEFAULT 0,
  location_id INTEGER REFERENCES locations(id)
);

-- Copy all existing data
INSERT INTO products_new (
  id, name, sku, category, weight_per_unit, unit_type, price,
  stock_quantity, active, created_at, pallet_qty, pallet_weight,
  length_in, width_in, height_in, stackable, max_stack,
  bag_length_in, bag_width_in, bag_height_in, tax_rate, location_id
)
SELECT
  id, name, sku, category, weight_per_unit, unit_type, price,
  stock_quantity, active, created_at, pallet_qty, pallet_weight,
  length_in, width_in, height_in, stackable, max_stack,
  bag_length_in, bag_width_in, bag_height_in, tax_rate, location_id
FROM products;

-- Drop old table and rename new
DROP TABLE products;
ALTER TABLE products_new RENAME TO products;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_products_location ON products(location_id);

-- Re-enable foreign key checks
PRAGMA foreign_keys = ON;
