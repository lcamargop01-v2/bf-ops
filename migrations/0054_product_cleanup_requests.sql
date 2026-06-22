-- Product cleanup requests — used during initial inventory organization
-- Allows counters to flag products for deletion, renaming, or recategorization
CREATE TABLE IF NOT EXISTS product_cleanup_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  requested_by INTEGER NOT NULL REFERENCES users(id),
  requested_by_name TEXT,
  request_type TEXT NOT NULL DEFAULT 'delete', -- delete, rename, recategorize, merge_duplicate
  reason TEXT, -- duplicate, wrong_product, obsolete, test_data, other
  details TEXT, -- free-text explanation or JSON with change details
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_by_name TEXT,
  reviewed_at TEXT,
  review_notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cleanup_requests_product ON product_cleanup_requests(product_id);
CREATE INDEX IF NOT EXISTS idx_cleanup_requests_status ON product_cleanup_requests(status);
