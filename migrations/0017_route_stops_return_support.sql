-- Add return_id column to route_stops for return stop support
ALTER TABLE route_stops ADD COLUMN return_id INTEGER REFERENCES returns(id);

-- Add snapshot columns for change detection
ALTER TABLE route_stops ADD COLUMN added_at TEXT;
ALTER TABLE route_stops ADD COLUMN items_snapshot TEXT;
ALTER TABLE route_stops ADD COLUMN instructions_snapshot TEXT;

-- Index for return lookups
CREATE INDEX IF NOT EXISTS idx_route_stops_return_id ON route_stops(return_id);
