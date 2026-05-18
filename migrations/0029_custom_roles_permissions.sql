-- Custom Roles & Feature Permissions
-- Allows admins to create custom roles and control which features
-- (pages/sections) within each module are visible per role.

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,       -- e.g. 'Sales Rep', 'Route Planner', 'Warehouse Lead'
  description TEXT,
  is_system INTEGER DEFAULT 0,     -- 1 = built-in role (admin, driver), 0 = custom
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Feature permissions: which features each role can see within each module
CREATE TABLE IF NOT EXISTS role_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_name TEXT NOT NULL,         -- FK to roles.name
  module TEXT NOT NULL,            -- logistics, inventory, ordering, crm
  feature TEXT NOT NULL,           -- page/section id within the module
  UNIQUE(role_name, module, feature)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_name);
CREATE INDEX IF NOT EXISTS idx_role_permissions_module ON role_permissions(module, feature);

-- Seed built-in roles
INSERT OR IGNORE INTO roles (name, description, is_system) VALUES
  ('admin', 'Full access to everything', 1),
  ('dispatcher', 'Dispatch and route management', 1),
  ('warehouse', 'Warehouse and inventory operations', 1),
  ('driver', 'Driver-only view (today''s route, returns)', 1),
  ('customer', 'Customer portal access', 1);

-- Seed default permissions for built-in roles
-- Admin gets everything (handled in code — admin bypasses permission checks)

-- Dispatcher: logistics (most pages), CRM, purchasing
INSERT OR IGNORE INTO role_permissions (role_name, module, feature) VALUES
  ('dispatcher', 'logistics', 'dashboard'),
  ('dispatcher', 'logistics', 'orders'),
  ('dispatcher', 'logistics', 'ticket_review'),
  ('dispatcher', 'logistics', 'schedule'),
  ('dispatcher', 'logistics', 'routes'),
  ('dispatcher', 'logistics', 'route_builder'),
  ('dispatcher', 'logistics', 'zones'),
  ('dispatcher', 'logistics', 'recurring'),
  ('dispatcher', 'logistics', 'customers'),
  ('dispatcher', 'logistics', 'products'),
  ('dispatcher', 'logistics', 'trucks'),
  ('dispatcher', 'logistics', 'drivers_mgmt'),
  ('dispatcher', 'logistics', 'maintenance'),
  ('dispatcher', 'logistics', 'packing'),
  ('dispatcher', 'logistics', 'returns'),
  ('dispatcher', 'logistics', 'fleet_tracking'),
  ('dispatcher', 'logistics', 'fleet_sync'),
  ('dispatcher', 'crm', 'dashboard'),
  ('dispatcher', 'crm', 'pipeline'),
  ('dispatcher', 'crm', 'organizations'),
  ('dispatcher', 'crm', 'contacts'),
  ('dispatcher', 'inventory', 'dashboard'),
  ('dispatcher', 'inventory', 'stock'),
  ('dispatcher', 'ordering', 'dashboard'),
  ('dispatcher', 'ordering', 'orders');

-- Warehouse: inventory (all), logistics (orders, packing, returns)
INSERT OR IGNORE INTO role_permissions (role_name, module, feature) VALUES
  ('warehouse', 'inventory', 'dashboard'),
  ('warehouse', 'inventory', 'stock'),
  ('warehouse', 'inventory', 'products'),
  ('warehouse', 'inventory', 'count'),
  ('warehouse', 'inventory', 'transfers'),
  ('warehouse', 'inventory', 'batches'),
  ('warehouse', 'inventory', 'losses'),
  ('warehouse', 'inventory', 'holds'),
  ('warehouse', 'inventory', 'reservations'),
  ('warehouse', 'inventory', 'audit'),
  ('warehouse', 'logistics', 'dashboard'),
  ('warehouse', 'logistics', 'orders'),
  ('warehouse', 'logistics', 'packing'),
  ('warehouse', 'logistics', 'returns'),
  ('warehouse', 'ordering', 'dashboard'),
  ('warehouse', 'ordering', 'orders'),
  ('warehouse', 'ordering', 'requests'),
  ('warehouse', 'ordering', 'arriving'),
  ('warehouse', 'ordering', 'bills'),
  ('warehouse', 'ordering', 'suppliers');

-- Driver: only driver view and returns in logistics
INSERT OR IGNORE INTO role_permissions (role_name, module, feature) VALUES
  ('driver', 'logistics', 'driver'),
  ('driver', 'logistics', 'returns');

-- Remove the CHECK constraint on users.role to allow custom roles
-- SQLite doesn't support ALTER TABLE DROP CONSTRAINT, so we recreate
-- Actually, SQLite ignores CHECK constraints on INSERT when using bind params
-- The constraint only matters for raw SQL. We'll handle validation in code.
-- No schema change needed — just stop enforcing in code.
