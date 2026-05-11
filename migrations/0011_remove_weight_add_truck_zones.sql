-- Migration 0011: Remove weight from truck/route capacity, add truck-zone assignment, auto-geocode support
-- Weight is kept on products (weight_per_unit) for reference only, but not used for truck capacity

-- Add zone_id to trucks so a truck can be assigned to a delivery zone
ALTER TABLE trucks ADD COLUMN zone_id INTEGER REFERENCES delivery_zones(id);
CREATE INDEX IF NOT EXISTS idx_trucks_zone ON trucks(zone_id);
