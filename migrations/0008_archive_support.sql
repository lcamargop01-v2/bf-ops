-- =====================================================
-- Migration 0008: Archive Support
-- =====================================================
-- Add archived column to entities that lack it.
-- Customers, Products, and Users already have 'active' (1=active, 0=archived).
-- Dispatch rules and delivery_zones already have 'active'.
-- Trucks have 'status' but no archive flag.
-- Orders and Routes have status workflows but no archive flag.

-- Trucks: add archived column
ALTER TABLE trucks ADD COLUMN archived INTEGER DEFAULT 0;

-- Orders: add archived column
ALTER TABLE orders ADD COLUMN archived INTEGER DEFAULT 0;

-- Routes: add archived column  
ALTER TABLE routes ADD COLUMN archived INTEGER DEFAULT 0;

-- Recurring schedules: add archived column
ALTER TABLE recurring_schedules ADD COLUMN archived INTEGER DEFAULT 0;

-- Indexes for archive filtering
CREATE INDEX IF NOT EXISTS idx_trucks_archived ON trucks(archived);
CREATE INDEX IF NOT EXISTS idx_orders_archived ON orders(archived);
CREATE INDEX IF NOT EXISTS idx_routes_archived ON routes(archived);
CREATE INDEX IF NOT EXISTS idx_recurring_archived ON recurring_schedules(archived);
