-- ============================================================
-- Migration 0041: DC Register Mode + Darts Sync Status
-- 1. Darts sync tracking on pos_sales and orders
-- 2. Source tracking for orders created from POS
-- ============================================================

-- Track whether a sale has been manually entered into Darts
ALTER TABLE pos_sales ADD COLUMN darts_synced INTEGER DEFAULT 0;
ALTER TABLE pos_sales ADD COLUMN darts_synced_at TEXT;
ALTER TABLE pos_sales ADD COLUMN darts_synced_by TEXT;

-- Track whether a delivery order has been entered into Darts
ALTER TABLE orders ADD COLUMN darts_synced INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN darts_synced_at TEXT;
ALTER TABLE orders ADD COLUMN darts_synced_by TEXT;

-- Track POS origin so logistics can filter
ALTER TABLE orders ADD COLUMN source TEXT DEFAULT 'manual';
-- source values: 'manual', 'pos', 'recurring', 'api'
