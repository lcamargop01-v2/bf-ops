-- Order Requests: warehouse staff / sales reps can request items to be ordered
-- Requests flow into Purchasing module for review → approve (convert to PO) or reject

CREATE TABLE IF NOT EXISTS order_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','converted','cancelled')),
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK(urgency IN ('low','normal','high','critical')),
  order_type TEXT CHECK(order_type IN ('hay_shavings','feed','shelf_goods')),
  location_id INTEGER NOT NULL,
  requested_by INTEGER,
  requested_by_name TEXT,
  requested_by_role TEXT,
  reason TEXT,
  notes TEXT,
  reviewed_by INTEGER,
  reviewed_by_name TEXT,
  reviewed_at TEXT,
  review_notes TEXT,
  converted_po_id INTEGER REFERENCES purchase_orders(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (location_id) REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS order_request_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  product_id INTEGER,
  description TEXT NOT NULL,
  qty_requested INTEGER NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'each',
  current_stock INTEGER,
  notes TEXT,
  FOREIGN KEY (request_id) REFERENCES order_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_order_requests_status ON order_requests(status);
CREATE INDEX IF NOT EXISTS idx_order_requests_location ON order_requests(location_id);
CREATE INDEX IF NOT EXISTS idx_order_requests_requested_by ON order_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_order_request_items_request ON order_request_items(request_id);
