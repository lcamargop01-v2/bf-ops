-- BF Ops Seed Data: Users, Locations, and Module Access

-- Users (same as logistics app)
INSERT OR IGNORE INTO users (id, name, email, role, phone, password_hash, active)
VALUES
  (1, 'Sarah Mitchell', 'admin@britishfeed.com', 'admin', '561-555-0100', 'admin123', 1),
  (2, 'Mike Rodriguez', 'dispatch@britishfeed.com', 'dispatcher', '561-555-0101', 'dispatch123', 1),
  (3, 'Tom Baker', 'warehouse@britishfeed.com', 'warehouse', '561-555-0102', 'warehouse123', 1),
  (4, 'James Cooper', 'james@britishfeed.com', 'driver', '561-555-0103', 'driver123', 1),
  (5, 'Dave Williams', 'dave@britishfeed.com', 'driver', '561-555-0104', 'driver123', 1),
  (6, 'Maria Santos', 'maria@britishfeed.com', 'driver', '561-555-0105', 'driver123', 1);

-- Two business locations
INSERT OR IGNORE INTO locations (id, name, code, type, street, city, state, zip, phone, notes)
VALUES
  (1, 'Loxahatchee Retail', 'LOX', 'retail', '16215 Southern Blvd', 'Loxahatchee', 'FL', '33470', NULL, 'Main retail location — British Feed & Supplies storefront'),
  (2, 'Aldi Warehouse', 'ALDI', 'distribution', '100 Aldi Way Ste 400', 'West Palm Beach', 'FL', '33411', NULL, 'Distribution warehouse for bulk storage and delivery staging');

-- Grant all modules to admin users
INSERT OR IGNORE INTO user_module_access (user_id, module, granted_by)
SELECT u.id, m.module_id, u.id
FROM users u
CROSS JOIN (
  SELECT 'logistics' AS module_id
  UNION ALL SELECT 'inventory'
  UNION ALL SELECT 'ordering'
  UNION ALL SELECT 'pos'
  UNION ALL SELECT 'tasks'
) m
WHERE u.role = 'admin';

-- Grant logistics to dispatchers and warehouse
INSERT OR IGNORE INTO user_module_access (user_id, module)
SELECT u.id, 'logistics' FROM users u WHERE u.role IN ('dispatcher', 'warehouse', 'driver');
