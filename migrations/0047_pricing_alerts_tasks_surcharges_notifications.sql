-- Migration 0047: Pricing Alerts, Tasks Module, Surcharges, Notifications, POS→Purchasing bridge
-- Created: 2026-06-21

-- ==================== PRICING ALERTS ====================
CREATE TABLE IF NOT EXISTS pricing_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_type TEXT NOT NULL DEFAULT 'cost_increase',  -- cost_increase, margin_low, price_change
  product_id INTEGER,
  product_name TEXT,
  sku TEXT,
  old_cost REAL,
  new_cost REAL,
  cost_change_pct REAL,
  current_price REAL,
  suggested_price REAL,
  margin_pct REAL,
  customer_id INTEGER,
  customer_name TEXT,
  discount_pct REAL,
  location_id INTEGER,
  status TEXT DEFAULT 'pending', -- pending, acknowledged, resolved, dismissed
  assigned_to INTEGER,
  assigned_to_name TEXT,
  resolved_by INTEGER,
  resolved_by_name TEXT,
  resolved_at TEXT,
  resolution_notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pricing_alerts_status ON pricing_alerts(status);
CREATE INDEX IF NOT EXISTS idx_pricing_alerts_product ON pricing_alerts(product_id);
CREATE INDEX IF NOT EXISTS idx_pricing_alerts_type ON pricing_alerts(alert_type);

-- Pricing alert settings (who gets notified for what)
CREATE TABLE IF NOT EXISTS pricing_alert_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_type TEXT NOT NULL,  -- cost_increase, margin_low, price_change
  threshold_pct REAL DEFAULT 0, -- threshold to trigger (e.g. 5% cost increase)
  min_margin_pct REAL DEFAULT 15, -- min margin before alert
  notify_user_ids TEXT, -- comma-separated user IDs
  notify_roles TEXT, -- comma-separated role names
  location_id INTEGER, -- null = all locations
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ==================== TASKS MODULE ====================
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_number TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT DEFAULT 'general', -- general, inventory, purchasing, delivery, customer, follow_up, price_update, label_update
  priority TEXT DEFAULT 'normal', -- low, normal, high, critical
  status TEXT DEFAULT 'pending', -- pending, in_progress, completed, cancelled, blocked
  assigned_to INTEGER,
  assigned_to_name TEXT,
  created_by INTEGER,
  created_by_name TEXT,
  due_date TEXT,
  completed_at TEXT,
  completed_by INTEGER,
  completed_by_name TEXT,
  location_id INTEGER,
  -- Reference linking (polymorphic)
  ref_type TEXT, -- pos_request, purchase_order, customer, product, pricing_alert, order
  ref_id INTEGER,
  ref_number TEXT,
  -- Customer tagging
  customer_id INTEGER,
  customer_name TEXT,
  -- Notes and metadata
  notes TEXT,
  tags TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_ref ON tasks(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_tasks_customer ON tasks(customer_id);

-- Task comments / activity log
CREATE TABLE IF NOT EXISTS task_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  user_id INTEGER,
  user_name TEXT,
  comment TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

-- ==================== SURCHARGES & FEES ====================
CREATE TABLE IF NOT EXISTS fee_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fee_type TEXT NOT NULL, -- fuel_surcharge, cc_convenience, delivery_fee
  name TEXT NOT NULL,
  rate REAL DEFAULT 0, -- percentage or flat amount
  rate_type TEXT DEFAULT 'percentage', -- percentage, flat
  apply_to TEXT DEFAULT 'delivery', -- delivery, all, cc_payment
  min_order_amount REAL DEFAULT 0, -- minimum order to apply
  max_fee REAL DEFAULT 0, -- cap (0 = no cap)
  location_id INTEGER, -- null = all
  active INTEGER DEFAULT 1,
  legal_notice TEXT, -- required disclosure text for CC convenience fees
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ==================== POS REQUEST → PURCHASING BRIDGE ====================
-- Add columns to pos_inventory_requests for client tagging and purchasing link
ALTER TABLE pos_inventory_requests ADD COLUMN customer_id INTEGER;
ALTER TABLE pos_inventory_requests ADD COLUMN customer_name TEXT;
ALTER TABLE pos_inventory_requests ADD COLUMN notify_customer INTEGER DEFAULT 0;
ALTER TABLE pos_inventory_requests ADD COLUMN fulfillment_type TEXT DEFAULT 'purchase'; -- purchase, transfer, both
ALTER TABLE pos_inventory_requests ADD COLUMN purchasing_request_id INTEGER; -- link to order_requests table
ALTER TABLE pos_inventory_requests ADD COLUMN transfer_id INTEGER; -- link to inventory_transfers if transfer

-- ==================== NOTIFICATIONS ====================
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT NOT NULL,
  message TEXT,
  notification_type TEXT DEFAULT 'info', -- info, warning, alert, success, task, price_alert
  ref_type TEXT, -- task, pricing_alert, purchase_order, pos_request, order, etc.
  ref_id INTEGER,
  is_read INTEGER DEFAULT 0,
  is_email_sent INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(notification_type);

-- Push subscription for web push notifications
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT,
  auth TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, endpoint)
);

-- Email notification preferences per user
CREATE TABLE IF NOT EXISTS notification_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  email_enabled INTEGER DEFAULT 1,
  push_enabled INTEGER DEFAULT 1,
  -- Granular: which types to receive
  notify_tasks INTEGER DEFAULT 1,
  notify_pricing INTEGER DEFAULT 1,
  notify_inventory INTEGER DEFAULT 1,
  notify_purchasing INTEGER DEFAULT 1,
  notify_orders INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ==================== SALES TAX TRACKING FOR REPORTS ====================
-- Add tax tracking columns to pos_sales if not exists (safe)
-- These should already exist from pos_module migration, but ensure
-- the tax_config entries are initialized

-- Default fee config entries
INSERT OR IGNORE INTO fee_config (fee_type, name, rate, rate_type, apply_to, active, legal_notice)
VALUES 
  ('fuel_surcharge', 'Fuel Surcharge', 5.0, 'percentage', 'delivery', 1, 'A fuel surcharge is applied to delivery orders to offset fuel costs.'),
  ('cc_convenience', 'Credit Card Convenience Fee', 3.0, 'percentage', 'cc_payment', 0, 'A convenience fee is charged for credit card payments. This fee is not greater than the merchant''s cost of acceptance. You may avoid this fee by paying with cash, check, or debit card.');

-- Default pricing alert settings  
INSERT OR IGNORE INTO pricing_alert_settings (alert_type, threshold_pct, min_margin_pct, notify_roles, active)
VALUES
  ('cost_increase', 5.0, 0, 'admin,manager', 1),
  ('margin_low', 0, 15.0, 'admin,manager', 1),
  ('price_change', 0, 0, 'admin,manager,retail_staff', 1);
