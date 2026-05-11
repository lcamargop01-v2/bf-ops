-- Migration 0009: Pallet-based truck capacity, customer truck preferences, zone truck assignments
-- Capacity is based on pallets (large trucks) or bales (small trucks), not weight/dimensions

-- Trucks: add truck_type (pallet or bale), bale_capacity for small trucks
ALTER TABLE trucks ADD COLUMN truck_type TEXT DEFAULT 'pallet';  -- 'pallet' or 'bale'
ALTER TABLE trucks ADD COLUMN bale_capacity INTEGER DEFAULT 0;   -- for small/bale trucks (e.g. 175, 210)

-- Customers: add preferred_truck_id - some customers MUST go on a specific truck
ALTER TABLE customers ADD COLUMN preferred_truck_id INTEGER REFERENCES trucks(id);

-- Delivery zones: add default_truck_id - specific routes/zones have specific trucks
ALTER TABLE delivery_zones ADD COLUMN default_truck_id INTEGER REFERENCES trucks(id);

-- Products: add units_per_pallet to replace old pallet_qty with accurate data
-- (pallet_qty already exists but we'll update it with correct values)
-- No new column needed - we'll use existing pallet_qty

-- Indexes
CREATE INDEX IF NOT EXISTS idx_customers_preferred_truck ON customers(preferred_truck_id);
CREATE INDEX IF NOT EXISTS idx_zones_default_truck ON delivery_zones(default_truck_id);
