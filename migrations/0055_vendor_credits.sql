-- Vendor credits and refunds tracking
-- Credits: money owed TO US by vendor (overcharge, damaged goods, returns)
-- Refunds: actual money returned to us by vendor

CREATE TABLE IF NOT EXISTS vendor_credits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  bill_id INTEGER REFERENCES po_bills(id),
  po_id INTEGER REFERENCES purchase_orders(id),
  credit_number TEXT,
  credit_type TEXT NOT NULL DEFAULT 'credit' CHECK(credit_type IN ('credit','refund')),
  amount REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','applied','voided')),
  applied_to_bill_id INTEGER REFERENCES po_bills(id),
  refund_method TEXT CHECK(refund_method IN ('check','ach','credit_memo','offset_next_bill',NULL)),
  refund_date DATE,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_by_name TEXT,
  approved_by INTEGER REFERENCES users(id),
  approved_by_name TEXT,
  approved_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_vendor_credits_supplier ON vendor_credits(supplier_id);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_bill ON vendor_credits(bill_id);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_status ON vendor_credits(status);
CREATE INDEX IF NOT EXISTS idx_vendor_credits_type ON vendor_credits(credit_type);
