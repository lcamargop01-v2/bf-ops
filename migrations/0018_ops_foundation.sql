-- BF Ops Foundation: Locations, Module Access, Customer/Product Tax Fields
-- This migration adds the parent platform tables on top of the existing logistics schema

-- Locations table: tracks physical business locations
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  type TEXT NOT NULL DEFAULT 'retail', -- retail, distribution, warehouse
  street TEXT,
  city TEXT,
  state TEXT DEFAULT 'FL',
  zip TEXT,
  lat REAL,
  lng REAL,
  phone TEXT,
  email TEXT,
  active INTEGER DEFAULT 1,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User module access: controls which modules each user can see
CREATE TABLE IF NOT EXISTS user_module_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  module TEXT NOT NULL, -- logistics, inventory, ordering, pos, tasks
  granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  granted_by INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, module)
);

-- Add tax_exempt and sponsor fields to customers (if not already present)
ALTER TABLE customers ADD COLUMN tax_exempt INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN sponsor_discount REAL DEFAULT 0;
ALTER TABLE customers ADD COLUMN priority_rank INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN location_id INTEGER REFERENCES locations(id);

-- Add truck_requirement and driver_restrictions to addresses (referenced by logistics queries)
ALTER TABLE addresses ADD COLUMN truck_requirement TEXT;
ALTER TABLE addresses ADD COLUMN driver_restrictions TEXT;

-- Add tax_rate field to products
ALTER TABLE products ADD COLUMN tax_rate REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN location_id INTEGER REFERENCES locations(id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_module_access_user ON user_module_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_module_access_module ON user_module_access(module);
CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(type);
CREATE INDEX IF NOT EXISTS idx_locations_active ON locations(active);
CREATE INDEX IF NOT EXISTS idx_customers_location ON customers(location_id);
CREATE INDEX IF NOT EXISTS idx_products_location ON products(location_id);
