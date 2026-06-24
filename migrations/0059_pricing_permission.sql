-- Add 'pricing' feature permission for inventory module
-- Controls who can edit product price, cost, and tax_rate
-- Admin always has full access (bypasses permission checks)

-- Give admin-like roles (dispatcher) pricing edit access by default
INSERT OR IGNORE INTO role_permissions (role_name, module, feature, access_level)
  VALUES ('dispatcher', 'inventory', 'pricing', 'edit');

-- Warehouse gets view-only pricing by default (can see but not change)
INSERT OR IGNORE INTO role_permissions (role_name, module, feature, access_level)
  VALUES ('warehouse', 'inventory', 'pricing', 'view');

-- Sales rep gets view-only pricing
INSERT OR IGNORE INTO role_permissions (role_name, module, feature, access_level)
  VALUES ('sales rep', 'inventory', 'pricing', 'view');
