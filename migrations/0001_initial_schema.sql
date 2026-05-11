-- BF Deliver: British Feed Delivery Management System
-- Initial Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','dispatcher','warehouse','driver','customer')),
  phone TEXT,
  password_hash TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  customer_type TEXT DEFAULT 'farm' CHECK(customer_type IN ('farm','ranch','retail','equestrian','other')),
  notes TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Addresses table
CREATE TABLE IF NOT EXISTS addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  label TEXT DEFAULT 'Primary',
  street TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT DEFAULT 'FL',
  zip TEXT,
  lat REAL,
  lng REAL,
  gate_code TEXT,
  driver_notes TEXT,
  is_primary INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  category TEXT DEFAULT 'horse' CHECK(category IN ('horse','cattle','poultry','swine','goat','supplement','other')),
  weight_per_unit REAL NOT NULL DEFAULT 50,
  unit_type TEXT DEFAULT 'bag',
  price REAL DEFAULT 0,
  stock_quantity INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL,
  address_id INTEGER,
  status TEXT DEFAULT 'new' CHECK(status IN ('new','confirmed','scheduled','loaded','in_transit','delivered','completed','cancelled')),
  priority TEXT DEFAULT 'normal' CHECK(priority IN ('urgent','high','normal','low')),
  scheduled_date TEXT,
  total_weight REAL DEFAULT 0,
  special_instructions TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (address_id) REFERENCES addresses(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Order Items table
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  weight_subtotal REAL DEFAULT 0,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Trucks table
CREATE TABLE IF NOT EXISTS trucks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  plate_number TEXT,
  max_weight_capacity REAL DEFAULT 10000,
  status TEXT DEFAULT 'available' CHECK(status IN ('available','in_use','maintenance','retired')),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Routes table
CREATE TABLE IF NOT EXISTS routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_number TEXT,
  date TEXT NOT NULL,
  truck_id INTEGER,
  driver_id INTEGER,
  status TEXT DEFAULT 'planned' CHECK(status IN ('planned','optimized','dispatched','in_progress','completed','cancelled')),
  total_miles REAL DEFAULT 0,
  total_weight REAL DEFAULT 0,
  estimated_time TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (truck_id) REFERENCES trucks(id),
  FOREIGN KEY (driver_id) REFERENCES users(id)
);

-- Route Stops table
CREATE TABLE IF NOT EXISTS route_stops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 0,
  eta TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','arrived','delivering','completed','failed','skipped')),
  arrived_at TEXT,
  completed_at TEXT,
  notes TEXT,
  FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- Delivery Proofs table
CREATE TABLE IF NOT EXISTS delivery_proofs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  photo_url TEXT,
  signature_url TEXT,
  gps_lat REAL,
  gps_lng REAL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_orders_priority ON orders(priority);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_addresses_customer ON addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_route_stops_route ON route_stops(route_id);
CREATE INDEX IF NOT EXISTS idx_routes_date ON routes(date);
CREATE INDEX IF NOT EXISTS idx_routes_driver ON routes(driver_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(customer_type);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
