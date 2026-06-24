-- Migration 0058: Add barcode/UPC field to products table
-- Supports barcode scanning for POS checkout and inventory quick count

ALTER TABLE products ADD COLUMN barcode TEXT;

-- Index for fast barcode lookups (exact match)
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
