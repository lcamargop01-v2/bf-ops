-- Returns table for customer product returns
CREATE TABLE IF NOT EXISTS returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER,
  route_id INTEGER,
  customer_id INTEGER NOT NULL,
  created_by INTEGER,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (route_id) REFERENCES routes(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Return items with expected vs actual quantities
CREATE TABLE IF NOT EXISTS return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  expected_qty INTEGER DEFAULT 0,
  actual_qty INTEGER DEFAULT 0,
  reason TEXT,
  FOREIGN KEY (return_id) REFERENCES returns(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_returns_customer ON returns(customer_id);
CREATE INDEX IF NOT EXISTS idx_returns_order ON returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_route ON returns(route_id);
