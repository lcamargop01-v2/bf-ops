-- ============================================================
-- Migration 0048: Warehouse Packing Checklists & Feature Requests
-- 1. Packing checklists for warehouse mobile loading
-- 2. Developer feature requests from any page
-- ============================================================

-- Packing checklist: tracks per-item check-off during warehouse loading
-- Linked to a route, stop, and order — each item can be checked individually
CREATE TABLE IF NOT EXISTS packing_checklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL,
  stop_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  sku TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_type TEXT DEFAULT 'bags',
  checked INTEGER DEFAULT 0,
  checked_by INTEGER,
  checked_by_name TEXT,
  checked_at DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_packing_checklist_route ON packing_checklist(route_id);
CREATE INDEX IF NOT EXISTS idx_packing_checklist_stop ON packing_checklist(stop_id);
CREATE INDEX IF NOT EXISTS idx_packing_checklist_order ON packing_checklist(order_id);

-- Feature requests: quick developer feature request from any page
CREATE TABLE IF NOT EXISTS feature_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'critical')),
  status TEXT DEFAULT 'new' CHECK(status IN ('new', 'reviewed', 'planned', 'in_progress', 'completed', 'declined')),
  submitted_by INTEGER,
  submitted_by_name TEXT,
  current_page TEXT,
  current_module TEXT,
  user_agent TEXT,
  admin_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_feature_requests_status ON feature_requests(status);
CREATE INDEX IF NOT EXISTS idx_feature_requests_user ON feature_requests(submitted_by);
CREATE INDEX IF NOT EXISTS idx_feature_requests_created ON feature_requests(created_at);
