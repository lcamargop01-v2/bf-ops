-- ============================================
-- Migration 0034: Low stock thresholds & PO-warehouse linking
-- Adds: per-product low_stock_threshold and reorder_point for warehouse alerts
-- Adds: po_id reference on warehouse_activity for PO receiving linkage
-- ============================================

-- Per-product low stock threshold (warehouse global, not per-location)
-- When stock_quantity <= low_stock_threshold, product shows as "low stock" alert
ALTER TABLE products ADD COLUMN low_stock_threshold INTEGER DEFAULT 0;

-- Reorder point — when stock drops below this, suggest reorder
ALTER TABLE products ADD COLUMN reorder_point INTEGER DEFAULT 0;

-- Track which PO a warehouse receive came from
ALTER TABLE warehouse_activity ADD COLUMN po_id INTEGER DEFAULT NULL;

-- Index for quick low-stock queries
CREATE INDEX IF NOT EXISTS idx_products_low_stock ON products(stock_quantity, low_stock_threshold);
