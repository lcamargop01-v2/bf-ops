-- Add access levels (view/edit) to feature permissions
-- and financial visibility control per role

-- Add access_level column: 'view' = read-only, 'edit' = full access (default)
ALTER TABLE role_permissions ADD COLUMN access_level TEXT DEFAULT 'edit';

-- Add financial visibility flag to roles (1 = can see costs/prices/values, 0 = hidden)
ALTER TABLE roles ADD COLUMN can_view_financials INTEGER DEFAULT 1;

-- System roles: admin and dispatcher can see financials, others cannot by default
UPDATE roles SET can_view_financials = 1 WHERE name IN ('admin', 'dispatcher');
UPDATE roles SET can_view_financials = 0 WHERE name IN ('warehouse', 'driver', 'customer');
