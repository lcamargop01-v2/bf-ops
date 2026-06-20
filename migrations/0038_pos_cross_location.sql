-- ============================================================
-- Migration 0038: POS Cross-Location Fulfillment Support
-- Adds source_location_id, fulfillment_type, transfer linkage
-- Supports Retail→DC and DC→Retail workflows
-- ============================================================

-- Add cross-location columns to pos_sales
-- D1 doesn't support ALTER TABLE ADD COLUMN with CHECK in same stmt
-- so we add columns without constraints and handle validation in app

ALTER TABLE pos_sales ADD COLUMN source_location_id INTEGER REFERENCES locations(id);
ALTER TABLE pos_sales ADD COLUMN fulfillment_type TEXT DEFAULT 'local';
ALTER TABLE pos_sales ADD COLUMN transfer_id INTEGER REFERENCES inventory_transfers(id);

-- Recreate pos_sales with updated sale_type CHECK
-- D1/SQLite doesn't support ALTER CHECK, so we handle in app layer
-- The app will accept: walk_in, delivery, pickup, wholesale, phone_order, transfer_reserve, dc_pickup
-- We don't need to recreate the table - just validate in the backend

-- Index for cross-location queries
CREATE INDEX IF NOT EXISTS idx_pos_sales_source_loc ON pos_sales(source_location_id);
CREATE INDEX IF NOT EXISTS idx_pos_sales_fulfillment ON pos_sales(fulfillment_type);
CREATE INDEX IF NOT EXISTS idx_pos_sales_transfer ON pos_sales(transfer_id);
