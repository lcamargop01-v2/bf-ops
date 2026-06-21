-- ============================================================
-- Migration 0050: Standing Order Confirmations & SMS Workflow
-- Delivery confirmation system with SMS integration via Make webhooks
-- ============================================================

-- Confirmation runs: each daily batch of texts for a delivery day
CREATE TABLE IF NOT EXISTS confirmation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_date TEXT NOT NULL,             -- date the texts are for (delivery date)
  delivery_day TEXT NOT NULL,         -- mon/tue/wed/thu/fri/sat
  zone_ids TEXT,                      -- comma-separated zone IDs targeted
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','sending','sent','completed','cancelled')),
  total_entries INTEGER DEFAULT 0,
  confirmed_count INTEGER DEFAULT 0,
  declined_count INTEGER DEFAULT 0,
  pending_count INTEGER DEFAULT 0,
  modified_count INTEGER DEFAULT 0,
  broadcast_count INTEGER DEFAULT 0,  -- non-standing customers texted
  cutoff_time TEXT,                   -- deadline for confirmations (ISO datetime)
  notes TEXT,
  created_by INTEGER,
  created_by_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_conf_runs_date ON confirmation_runs(run_date);
CREATE INDEX IF NOT EXISTS idx_conf_runs_status ON confirmation_runs(status);

-- Per-customer entry within a confirmation run
CREATE TABLE IF NOT EXISTS confirmation_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  address_id INTEGER,
  zone_id INTEGER,
  entry_type TEXT DEFAULT 'standing' CHECK(entry_type IN ('standing','broadcast')),
  schedule_id INTEGER,                -- links to recurring_schedules (null for broadcasts)
  -- Confirmation state
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','sent','confirmed','modified','declined','expired','no_response')),
  -- The proposed order (JSON array of {product_id, product_name, quantity, unit_type})
  proposed_items TEXT,
  -- If customer modifies, store their version
  modified_items TEXT,
  -- The final order_id created on confirm
  order_id INTEGER,
  -- Inventory hold tracking
  hold_created INTEGER DEFAULT 0,     -- 1 if we placed qty_on_hold
  hold_released INTEGER DEFAULT 0,    -- 1 if we released the hold
  -- SMS tracking
  outbound_sms_id INTEGER,            -- id in sms_messages for the outbound text
  last_inbound_sms_id INTEGER,        -- last customer reply
  sms_sent_at DATETIME,
  confirmed_at DATETIME,
  -- AI-drafted message (editable by staff before sending)
  draft_message TEXT,
  -- Staff handling
  reviewed_by INTEGER,
  reviewed_by_name TEXT,
  review_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_conf_entries_run ON confirmation_entries(run_id);
CREATE INDEX IF NOT EXISTS idx_conf_entries_customer ON confirmation_entries(customer_id);
CREATE INDEX IF NOT EXISTS idx_conf_entries_status ON confirmation_entries(status);
CREATE INDEX IF NOT EXISTS idx_conf_entries_schedule ON confirmation_entries(schedule_id);

-- SMS message log: every text sent or received
CREATE TABLE IF NOT EXISTS sms_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  confirmation_entry_id INTEGER,      -- links to confirmation_entries (can be null for ad-hoc)
  customer_id INTEGER,
  customer_phone TEXT,
  direction TEXT NOT NULL CHECK(direction IN ('outbound','inbound')),
  message_body TEXT NOT NULL,
  -- Make webhook tracking
  make_webhook_id TEXT,               -- ID returned by Make when sending
  make_scenario_id TEXT,
  -- Status
  status TEXT DEFAULT 'queued' CHECK(status IN ('queued','sent','delivered','failed','received')),
  error_message TEXT,
  sent_at DATETIME,
  received_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sms_entry ON sms_messages(confirmation_entry_id);
CREATE INDEX IF NOT EXISTS idx_sms_customer ON sms_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_sms_direction ON sms_messages(direction);
CREATE INDEX IF NOT EXISTS idx_sms_phone ON sms_messages(customer_phone);

-- Add confirmation mode to recurring_schedules
ALTER TABLE recurring_schedules ADD COLUMN confirm_mode TEXT DEFAULT 'text_confirm';
-- auto = auto-place order, no text needed
-- text_confirm = send text, wait for C reply
-- skip = don't generate for this schedule

-- Add SMS opt-in flag and preferred contact to customers
ALTER TABLE customers ADD COLUMN sms_opt_in INTEGER DEFAULT 1;
ALTER TABLE customers ADD COLUMN sms_phone TEXT;  -- override phone for SMS (if different from main phone)
ALTER TABLE customers ADD COLUMN delivery_notes_default TEXT;  -- default special instructions

-- Make webhook configuration (stored in app, not secrets for flexibility)
-- The outbound Make webhook URL is stored as a Cloudflare secret: MAKE_WEBHOOK_URL
-- The inbound webhook endpoint is: POST /api/sms/inbound
