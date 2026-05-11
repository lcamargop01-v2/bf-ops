-- =====================================================
-- Migration 0023: Purchasing Module
-- Suppliers, Purchase Orders, Receiving, Bills
-- =====================================================

-- Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  notes TEXT,
  payment_terms TEXT DEFAULT 'Net 30',
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_number TEXT UNIQUE NOT NULL,
  supplier_id INTEGER REFERENCES suppliers(id),
  order_type TEXT NOT NULL DEFAULT 'hay_shavings' CHECK(order_type IN ('hay_shavings','feed','shelf_goods')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ordered','in_transit','delayed','partial','received','cancelled','claim')),
  location_id INTEGER NOT NULL REFERENCES locations(id),
  order_date DATE,
  expected_date DATE,
  received_date DATE,
  notes TEXT,
  internal_notes TEXT,
  total_amount REAL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_by_name TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Purchase Order Line Items
CREATE TABLE IF NOT EXISTS po_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  description TEXT NOT NULL,
  qty_ordered REAL NOT NULL DEFAULT 0,
  qty_received REAL NOT NULL DEFAULT 0,
  unit TEXT DEFAULT 'each',
  unit_cost REAL DEFAULT 0,
  line_total REAL GENERATED ALWAYS AS (qty_ordered * unit_cost) VIRTUAL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Receiving records (warehouse submits per-delivery)
CREATE TABLE IF NOT EXISTS po_receiving (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  received_by INTEGER REFERENCES users(id),
  received_by_name TEXT,
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  location_id INTEGER REFERENCES locations(id)
);

-- Receiving line items (what was actually received per delivery)
CREATE TABLE IF NOT EXISTS po_receiving_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receiving_id INTEGER NOT NULL REFERENCES po_receiving(id) ON DELETE CASCADE,
  po_item_id INTEGER NOT NULL REFERENCES po_items(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  qty_received REAL NOT NULL DEFAULT 0,
  condition TEXT DEFAULT 'good' CHECK(condition IN ('good','fair','damaged','rejected')),
  notes TEXT
);

-- Images for receiving (warehouse photos)
CREATE TABLE IF NOT EXISTS po_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  receiving_id INTEGER REFERENCES po_receiving(id) ON DELETE CASCADE,
  image_data TEXT NOT NULL,
  caption TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_by_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bills / Invoices from suppliers
CREATE TABLE IF NOT EXISTS po_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  bill_number TEXT,
  supplier_invoice_number TEXT,
  amount REAL NOT NULL DEFAULT 0,
  tax REAL DEFAULT 0,
  total REAL GENERATED ALWAYS AS (amount + tax) VIRTUAL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','paid','disputed')),
  due_date DATE,
  paid_date DATE,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_type ON purchase_orders(order_type);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_expected ON purchase_orders(expected_date);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON po_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_receiving_po ON po_receiving(po_id);
CREATE INDEX IF NOT EXISTS idx_po_receiving_items_recv ON po_receiving_items(receiving_id);
CREATE INDEX IF NOT EXISTS idx_po_images_po ON po_images(po_id);
CREATE INDEX IF NOT EXISTS idx_po_bills_po ON po_bills(po_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(active);
