-- ============================================================
-- Migration 0040: POS Enhancements
-- Promotions engine, tax config, stock reservations,
-- customer merge, line discounts, CardPointe payment prep
-- ============================================================

-- Promotions engine
CREATE TABLE IF NOT EXISTS pos_promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT,
  promo_type TEXT NOT NULL CHECK(promo_type IN ('percent_off','dollar_off','bogo','buy_x_get_y','flat_price')),
  scope TEXT NOT NULL DEFAULT 'cart' CHECK(scope IN ('cart','category','product','customer_type')),
  discount_pct REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  flat_price REAL,
  buy_qty REAL DEFAULT 0,
  get_qty REAL DEFAULT 0,
  product_id INTEGER REFERENCES products(id),
  category TEXT,
  customer_type TEXT,
  min_purchase REAL DEFAULT 0,
  max_discount REAL,
  start_date DATE,
  end_date DATE,
  days_of_week TEXT,
  usage_limit INTEGER DEFAULT 0,
  times_used INTEGER DEFAULT 0,
  per_customer_limit INTEGER DEFAULT 0,
  stackable INTEGER DEFAULT 0,
  location_id INTEGER REFERENCES locations(id),
  active INTEGER DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pos_promotions_code ON pos_promotions(code);
CREATE INDEX IF NOT EXISTS idx_pos_promotions_active ON pos_promotions(active);
CREATE INDEX IF NOT EXISTS idx_pos_promotions_dates ON pos_promotions(start_date, end_date);

-- Tax configuration (per-location, per-category, per-product tax rules with priority)
CREATE TABLE IF NOT EXISTS pos_tax_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  tax_type TEXT NOT NULL DEFAULT 'sales_tax' CHECK(tax_type IN ('sales_tax','county_tax','state_tax','special')),
  rate REAL NOT NULL DEFAULT 0,
  location_id INTEGER REFERENCES locations(id),
  category TEXT,
  product_id INTEGER REFERENCES products(id),
  priority INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pos_tax_config_loc ON pos_tax_config(location_id);
CREATE INDEX IF NOT EXISTS idx_pos_tax_config_cat ON pos_tax_config(category);
CREATE INDEX IF NOT EXISTS idx_pos_tax_config_prod ON pos_tax_config(product_id);

-- Customer merge log
CREATE TABLE IF NOT EXISTS pos_customer_merge_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  primary_customer_id INTEGER NOT NULL REFERENCES customers(id),
  merged_customer_id INTEGER NOT NULL,
  merged_data TEXT,
  merged_by INTEGER REFERENCES users(id),
  merged_by_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Customer discount column
ALTER TABLE customers ADD COLUMN discount_fixed REAL DEFAULT 0;

-- Stock reservations for cross-location holds
CREATE TABLE IF NOT EXISTS pos_stock_reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  from_location_id INTEGER NOT NULL REFERENCES locations(id),
  to_location_id INTEGER NOT NULL REFERENCES locations(id),
  quantity REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','transferred','cancelled')),
  transfer_id INTEGER REFERENCES inventory_transfers(id),
  sale_id INTEGER REFERENCES pos_sales(id),
  requested_by INTEGER REFERENCES users(id),
  requested_by_name TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_pos_reservations_product ON pos_stock_reservations(product_id);
CREATE INDEX IF NOT EXISTS idx_pos_reservations_status ON pos_stock_reservations(status);
CREATE INDEX IF NOT EXISTS idx_pos_reservations_from ON pos_stock_reservations(from_location_id);

-- CardPointe payment token storage (for future tokenized payments)
ALTER TABLE pos_payments ADD COLUMN card_token TEXT;
ALTER TABLE pos_payments ADD COLUMN card_brand TEXT;
ALTER TABLE pos_payments ADD COLUMN card_exp TEXT;
ALTER TABLE pos_payments ADD COLUMN auth_code TEXT;
ALTER TABLE pos_payments ADD COLUMN gateway_ref TEXT;
ALTER TABLE pos_payments ADD COLUMN gateway TEXT DEFAULT 'manual';

-- Line-level discount tracking
ALTER TABLE pos_sale_items ADD COLUMN discount_reason TEXT;
ALTER TABLE pos_sale_items ADD COLUMN promo_id INTEGER REFERENCES pos_promotions(id);

-- Promotion usage tracking on sales
ALTER TABLE pos_sales ADD COLUMN promo_id INTEGER REFERENCES pos_promotions(id);
ALTER TABLE pos_sales ADD COLUMN promo_code TEXT;
ALTER TABLE pos_sales ADD COLUMN promo_discount REAL DEFAULT 0;
