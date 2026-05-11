-- Link trucks to Verizon Connect vehicles
ALTER TABLE trucks ADD COLUMN verizon_vehicle_id INTEGER DEFAULT NULL;
ALTER TABLE trucks ADD COLUMN verizon_vehicle_number TEXT DEFAULT NULL;
ALTER TABLE trucks ADD COLUMN vin TEXT DEFAULT NULL;
ALTER TABLE trucks ADD COLUMN make TEXT DEFAULT NULL;
ALTER TABLE trucks ADD COLUMN model TEXT DEFAULT NULL;
ALTER TABLE trucks ADD COLUMN year INTEGER DEFAULT NULL;
ALTER TABLE trucks ADD COLUMN license_plate TEXT DEFAULT NULL;
ALTER TABLE trucks ADD COLUMN verizon_synced_at TEXT DEFAULT NULL;

-- Link users/drivers to Verizon Connect drivers
ALTER TABLE users ADD COLUMN verizon_driver_id INTEGER DEFAULT NULL;
ALTER TABLE users ADD COLUMN verizon_driver_number TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN verizon_synced_at TEXT DEFAULT NULL;
