-- ============================================================
-- Migration 0039: Customer Tags & Salesperson Support
-- Adds tags (comma-separated), salesperson tracking,
-- and updated_at for change tracking
-- ============================================================

ALTER TABLE customers ADD COLUMN tags TEXT DEFAULT '';
ALTER TABLE customers ADD COLUMN salesperson_id INTEGER REFERENCES users(id);
ALTER TABLE customers ADD COLUMN salesperson_name TEXT DEFAULT '';
ALTER TABLE customers ADD COLUMN updated_at DATETIME;

-- Index for salesperson lookups and tag searches
CREATE INDEX IF NOT EXISTS idx_customers_salesperson ON customers(salesperson_id);
CREATE INDEX IF NOT EXISTS idx_customers_tags ON customers(tags);
CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(customer_type);
