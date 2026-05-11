-- =====================================================
-- Migration 0007: Recurring Orders
-- =====================================================

-- Recurring order schedules table
-- A recurring schedule is a template that auto-generates orders on a frequency
CREATE TABLE IF NOT EXISTS recurring_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  address_id INTEGER,
  frequency TEXT NOT NULL CHECK(frequency IN ('weekly','biweekly','monthly','custom')),
  interval_days INTEGER DEFAULT 7,
  day_of_week INTEGER,
  day_of_month INTEGER,
  priority TEXT DEFAULT 'normal' CHECK(priority IN ('urgent','high','normal','low')),
  special_instructions TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','cancelled')),
  next_delivery_date TEXT,
  last_generated_date TEXT,
  auto_confirm INTEGER DEFAULT 0,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (address_id) REFERENCES addresses(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Recurring schedule items (template items for each generated order)
CREATE TABLE IF NOT EXISTS recurring_schedule_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (schedule_id) REFERENCES recurring_schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Track which orders were generated from which recurring schedule
-- Also track skipped dates
CREATE TABLE IF NOT EXISTS recurring_order_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL,
  order_id INTEGER,
  scheduled_date TEXT NOT NULL,
  status TEXT DEFAULT 'generated' CHECK(status IN ('generated','skipped','pending')),
  skip_reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (schedule_id) REFERENCES recurring_schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);

-- Add recurring_schedule_id to orders table to link generated orders back
ALTER TABLE orders ADD COLUMN recurring_schedule_id INTEGER REFERENCES recurring_schedules(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recurring_customer ON recurring_schedules(customer_id);
CREATE INDEX IF NOT EXISTS idx_recurring_status ON recurring_schedules(status);
CREATE INDEX IF NOT EXISTS idx_recurring_next ON recurring_schedules(next_delivery_date);
CREATE INDEX IF NOT EXISTS idx_recurring_items_schedule ON recurring_schedule_items(schedule_id);
CREATE INDEX IF NOT EXISTS idx_recurring_log_schedule ON recurring_order_log(schedule_id);
CREATE INDEX IF NOT EXISTS idx_orders_recurring ON orders(recurring_schedule_id);
