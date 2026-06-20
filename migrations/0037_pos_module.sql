-- ============================================================
-- Migration 0037: Point of Sale Module
-- Sales transactions, payments, receipts, register sessions
-- Supports both retail store and distribution warehouse sales
-- Fully integrated with inventory, CRM, logistics, purchasing
-- ============================================================

-- Register sessions (shifts)
CREATE TABLE IF NOT EXISTS pos_register_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  user_name TEXT,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  register_type TEXT NOT NULL DEFAULT 'retail' CHECK(register_type IN ('retail','wholesale','distribution')),
  opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME,
  opening_cash REAL DEFAULT 0,
  closing_cash REAL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  notes TEXT
);

-- Sales transactions (the core POS record)
CREATE TABLE IF NOT EXISTS pos_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_number TEXT UNIQUE NOT NULL,
  session_id INTEGER REFERENCES pos_register_sessions(id),
  location_id INTEGER NOT NULL REFERENCES locations(id),
  customer_id INTEGER REFERENCES customers(id),
  sale_type TEXT NOT NULL DEFAULT 'walk_in' CHECK(sale_type IN ('walk_in','delivery','pickup','wholesale','phone_order')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('draft','hold','completed','voided','refunded')),
  subtotal REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  discount_reason TEXT,
  total REAL DEFAULT 0,
  amount_paid REAL DEFAULT 0,
  change_due REAL DEFAULT 0,
  notes TEXT,
  internal_notes TEXT,
  -- Delivery integration
  delivery_requested INTEGER DEFAULT 0,
  delivery_date TEXT,
  delivery_address_id INTEGER REFERENCES addresses(id),
  order_id INTEGER REFERENCES orders(id),
  -- Who processed
  cashier_id INTEGER REFERENCES users(id),
  cashier_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sale line items
CREATE TABLE IF NOT EXISTS pos_sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  sku TEXT,
  category TEXT,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  unit_cost REAL DEFAULT 0,
  discount_pct REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  tax_rate REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0,
  location_id INTEGER REFERENCES locations(id),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Payments (support split payments)
CREATE TABLE IF NOT EXISTS pos_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  method TEXT NOT NULL DEFAULT 'cash' CHECK(method IN ('cash','credit_card','debit_card','check','account','other')),
  amount REAL NOT NULL DEFAULT 0,
  reference TEXT,
  card_last4 TEXT,
  check_number TEXT,
  notes TEXT,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- POS returns/refunds (links back to original sale)
CREATE TABLE IF NOT EXISTS pos_refunds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  refund_number TEXT UNIQUE NOT NULL,
  original_sale_id INTEGER REFERENCES pos_sales(id),
  location_id INTEGER NOT NULL REFERENCES locations(id),
  customer_id INTEGER REFERENCES customers(id),
  refund_type TEXT NOT NULL DEFAULT 'return' CHECK(refund_type IN ('return','price_adjust','void','exchange')),
  subtotal REAL DEFAULT 0,
  tax_refunded REAL DEFAULT 0,
  total REAL DEFAULT 0,
  refund_method TEXT DEFAULT 'original' CHECK(refund_method IN ('cash','credit_card','store_credit','original','check')),
  reason TEXT,
  notes TEXT,
  restock INTEGER DEFAULT 1,
  processed_by INTEGER REFERENCES users(id),
  processed_by_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Refund line items
CREATE TABLE IF NOT EXISTS pos_refund_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  refund_id INTEGER NOT NULL REFERENCES pos_refunds(id) ON DELETE CASCADE,
  sale_item_id INTEGER REFERENCES pos_sale_items(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0,
  condition TEXT DEFAULT 'good' CHECK(condition IN ('good','damaged','expired','unsellable')),
  restock INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Customer account balances (for on-account / house accounts)
CREATE TABLE IF NOT EXISTS customer_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER UNIQUE NOT NULL REFERENCES customers(id),
  credit_limit REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  last_payment_date TEXT,
  last_payment_amount REAL,
  payment_terms TEXT DEFAULT 'Net 30',
  status TEXT DEFAULT 'active' CHECK(status IN ('active','suspended','closed')),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Account transactions (payments on account, charges, credits)
CREATE TABLE IF NOT EXISTS customer_account_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('charge','payment','credit','adjustment','refund')),
  amount REAL NOT NULL DEFAULT 0,
  balance_after REAL DEFAULT 0,
  reference_type TEXT,
  reference_id INTEGER,
  description TEXT,
  processed_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Price rules (customer-specific pricing, volume discounts)
CREATE TABLE IF NOT EXISTS pos_price_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK(rule_type IN ('customer_price','volume_discount','category_discount','promo')),
  customer_id INTEGER REFERENCES customers(id),
  product_id INTEGER REFERENCES products(id),
  category TEXT,
  min_qty REAL DEFAULT 0,
  price REAL,
  discount_pct REAL,
  start_date DATE,
  end_date DATE,
  active INTEGER DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Daily sales summary (for reporting)
CREATE TABLE IF NOT EXISTS pos_daily_summary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  summary_date DATE NOT NULL,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  total_sales REAL DEFAULT 0,
  total_transactions INTEGER DEFAULT 0,
  total_items_sold REAL DEFAULT 0,
  total_tax REAL DEFAULT 0,
  total_discounts REAL DEFAULT 0,
  total_refunds REAL DEFAULT 0,
  cash_total REAL DEFAULT 0,
  card_total REAL DEFAULT 0,
  check_total REAL DEFAULT 0,
  account_total REAL DEFAULT 0,
  avg_transaction REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(summary_date, location_id)
);

-- Held/parked transactions
CREATE TABLE IF NOT EXISTS pos_held_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES pos_sales(id),
  held_by INTEGER REFERENCES users(id),
  held_by_name TEXT,
  reason TEXT,
  customer_name TEXT,
  held_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pos_sessions_user ON pos_register_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_location ON pos_register_sessions(location_id);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_status ON pos_register_sessions(status);
CREATE INDEX IF NOT EXISTS idx_pos_sales_number ON pos_sales(sale_number);
CREATE INDEX IF NOT EXISTS idx_pos_sales_customer ON pos_sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_pos_sales_location ON pos_sales(location_id);
CREATE INDEX IF NOT EXISTS idx_pos_sales_status ON pos_sales(status);
CREATE INDEX IF NOT EXISTS idx_pos_sales_date ON pos_sales(created_at);
CREATE INDEX IF NOT EXISTS idx_pos_sales_session ON pos_sales(session_id);
CREATE INDEX IF NOT EXISTS idx_pos_sales_type ON pos_sales(sale_type);
CREATE INDEX IF NOT EXISTS idx_pos_sale_items_sale ON pos_sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_pos_sale_items_product ON pos_sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_pos_payments_sale ON pos_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_pos_payments_method ON pos_payments(method);
CREATE INDEX IF NOT EXISTS idx_pos_refunds_sale ON pos_refunds(original_sale_id);
CREATE INDEX IF NOT EXISTS idx_pos_refunds_customer ON pos_refunds(customer_id);
CREATE INDEX IF NOT EXISTS idx_pos_refund_items_refund ON pos_refund_items(refund_id);
CREATE INDEX IF NOT EXISTS idx_customer_accounts_customer ON customer_accounts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_acct_txn_customer ON customer_account_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_pos_price_rules_customer ON pos_price_rules(customer_id);
CREATE INDEX IF NOT EXISTS idx_pos_price_rules_product ON pos_price_rules(product_id);
CREATE INDEX IF NOT EXISTS idx_pos_daily_summary_date ON pos_daily_summary(summary_date);
CREATE INDEX IF NOT EXISTS idx_pos_held_sales_sale ON pos_held_sales(sale_id);
