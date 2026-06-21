-- Add 'categories' permission to inventory module for roles that have inventory access
-- This was missing from MODULE_FEATURES, causing the tab to be invisible for non-admin users

-- Warehouse gets edit access (they manage inventory)
INSERT OR IGNORE INTO role_permissions (role_name, module, feature, access_level) 
VALUES ('warehouse', 'inventory', 'categories', 'edit');

-- Dispatcher gets view access
INSERT OR IGNORE INTO role_permissions (role_name, module, feature, access_level) 
VALUES ('dispatcher', 'inventory', 'categories', 'view');

-- Sales rep gets view access
INSERT OR IGNORE INTO role_permissions (role_name, module, feature, access_level) 
VALUES ('sales rep', 'inventory', 'categories', 'view');
