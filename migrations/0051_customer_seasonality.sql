-- ============================================================
-- Migration 0051: Customer Seasonality
-- Track seasonal customers with arrival/departure dates,
-- auto-manage text campaigns, and forecasting
-- ============================================================

-- Seasonality fields on customers
ALTER TABLE customers ADD COLUMN is_seasonal INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN season_start_month INTEGER;  -- 1-12 (e.g. 10 = October)
ALTER TABLE customers ADD COLUMN season_start_day INTEGER;    -- 1-31
ALTER TABLE customers ADD COLUMN season_end_month INTEGER;    -- 1-12 (e.g. 5 = May)
ALTER TABLE customers ADD COLUMN season_end_day INTEGER;      -- 1-31
ALTER TABLE customers ADD COLUMN season_status TEXT DEFAULT 'unknown'; -- in_season, out_of_season, arriving_soon, departing_soon, unknown
ALTER TABLE customers ADD COLUMN season_notes TEXT;
ALTER TABLE customers ADD COLUMN last_season_update DATETIME;

-- Seasonal events log: tracks when customers arrive/depart each year
CREATE TABLE IF NOT EXISTS customer_season_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('arrival','departure','welcome_text','farewell_text','final_order_text','season_update')),
  season_year INTEGER,           -- e.g. 2026
  notes TEXT,
  created_by INTEGER,
  created_by_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_season_log_customer ON customer_season_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_season_log_type ON customer_season_log(event_type);
CREATE INDEX IF NOT EXISTS idx_season_log_year ON customer_season_log(season_year);

-- SMS campaign templates for seasonal messages
CREATE TABLE IF NOT EXISTS sms_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_type TEXT NOT NULL CHECK(template_type IN ('welcome_back','farewell','final_order','seasonal_promo','custom')),
  name TEXT NOT NULL,
  message_template TEXT NOT NULL,  -- Use {customer_name}, {last_order_items}, {season_year}, etc.
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed default templates
INSERT INTO sms_templates (template_type, name, message_template) VALUES
  ('welcome_back', 'Welcome Back Default', 'Hi {customer_name}! Welcome back to the area. We are ready to start deliveries whenever you are. Would you like to set up your regular order? Just text us what you need!'),
  ('farewell', 'Farewell Default', 'Hi {customer_name}! As the season wraps up, we wanted to check in. When is your last delivery day? We want to make sure you are all set before you head out.'),
  ('final_order', 'Final Order Default', 'Hi {customer_name}! Last chance for the season. Want us to bring anything before you head out? Text your order and we will get it on the truck!');
