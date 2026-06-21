-- POS Inventory Requests: staff can request stock from warehouse/purchasing
CREATE TABLE IF NOT EXISTS pos_inventory_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number TEXT UNIQUE NOT NULL,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','ordered','fulfilled','cancelled')),
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK(urgency IN ('low','normal','high','critical')),
  requested_by INTEGER REFERENCES users(id),
  requested_by_name TEXT,
  reason TEXT,
  notes TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_by_name TEXT,
  reviewed_at TEXT,
  review_notes TEXT,
  converted_po_id INTEGER REFERENCES purchase_orders(id),
  converted_transfer_id INTEGER REFERENCES inventory_transfers(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pos_inventory_request_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES pos_inventory_requests(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT,
  qty_requested INTEGER NOT NULL DEFAULT 1,
  qty_fulfilled INTEGER DEFAULT 0,
  current_stock INTEGER DEFAULT 0,
  reorder_point INTEGER DEFAULT 0,
  unit TEXT DEFAULT 'each',
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_pos_inv_req_location ON pos_inventory_requests(location_id);
CREATE INDEX IF NOT EXISTS idx_pos_inv_req_status ON pos_inventory_requests(status);
CREATE INDEX IF NOT EXISTS idx_pos_inv_req_items_request ON pos_inventory_request_items(request_id);

-- Customer Statements: monthly statement tracking
CREATE TABLE IF NOT EXISTS customer_statements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  statement_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  opening_balance REAL DEFAULT 0,
  total_charges REAL DEFAULT 0,
  total_payments REAL DEFAULT 0,
  total_credits REAL DEFAULT 0,
  closing_balance REAL DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','sent','paid','overdue','void')),
  sent_at TEXT,
  sent_method TEXT,
  due_date TEXT,
  notes TEXT,
  generated_by INTEGER REFERENCES users(id),
  generated_by_name TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_statement_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  statement_id INTEGER NOT NULL REFERENCES customer_statements(id) ON DELETE CASCADE,
  line_date TEXT NOT NULL,
  line_type TEXT NOT NULL CHECK(line_type IN ('charge','payment','credit','adjustment','refund','opening_balance')),
  description TEXT,
  reference_type TEXT,
  reference_id INTEGER,
  reference_number TEXT,
  amount REAL NOT NULL DEFAULT 0,
  running_balance REAL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cust_statements_customer ON customer_statements(customer_id);
CREATE INDEX IF NOT EXISTS idx_cust_statements_period ON customer_statements(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_cust_statement_lines_stmt ON customer_statement_lines(statement_id);
