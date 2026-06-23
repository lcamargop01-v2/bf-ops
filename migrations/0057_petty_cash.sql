-- Petty Cash transactions for register cash-outs
-- Tracks cash taken from register for misc purchases, warehouse worker expenses, etc.
CREATE TABLE IF NOT EXISTS pos_petty_cash (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER REFERENCES pos_register_sessions(id),
  location_id INTEGER NOT NULL REFERENCES locations(id),
  amount REAL NOT NULL,
  category TEXT NOT NULL DEFAULT 'misc' CHECK(category IN ('misc_purchase','warehouse_supplies','employee_expense','vendor_payment','other')),
  recipient TEXT,
  description TEXT NOT NULL,
  approved_by INTEGER REFERENCES users(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_by_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','completed','voided')),
  receipt_note TEXT,
  returned_amount REAL DEFAULT 0,
  returned_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_petty_cash_session ON pos_petty_cash(session_id);
CREATE INDEX IF NOT EXISTS idx_petty_cash_location ON pos_petty_cash(location_id);
CREATE INDEX IF NOT EXISTS idx_petty_cash_status ON pos_petty_cash(status);
CREATE INDEX IF NOT EXISTS idx_petty_cash_created ON pos_petty_cash(created_at);
