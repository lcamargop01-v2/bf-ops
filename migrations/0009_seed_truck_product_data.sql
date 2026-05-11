-- Seed data for truck capacities and product pallet quantities
-- Run this AFTER migration 0009

-- Update existing production trucks with correct capacity data
-- Double Door (id 5): 13 pallets, pallet truck
UPDATE trucks SET max_pallet_spots = 13, truck_type = 'pallet', bale_capacity = 0 WHERE id = 5;
-- Sliding Door (id 6): 12 pallets, pallet truck  
UPDATE trucks SET max_pallet_spots = 12, truck_type = 'pallet', bale_capacity = 0 WHERE id = 6;
-- Penske (1) (id 7): 12 pallets, pallet truck
UPDATE trucks SET max_pallet_spots = 12, truck_type = 'pallet', bale_capacity = 0 WHERE id = 7;
-- Penske (2) (id 8): 12 pallets, pallet truck
UPDATE trucks SET max_pallet_spots = 12, truck_type = 'pallet', bale_capacity = 0 WHERE id = 8;

-- Note: Buckeye, Flip, and Good Small Truck need to be added as new trucks
-- They are 'bale' type trucks. ~3 pallets shavings + 25 bales 3-string + 50 bales 2-string = ~210 total capacity

-- Update products with correct pallet_qty (units per pallet)
-- Hay products
-- 2-string hay: 18 bales per pallet
-- 3-string hay: 12 bales per pallet  
-- Bundle of hay: 21 bales per pallet
-- Shavings products
-- World Cup: 45 bags/pallet
-- Obec: 45 bags/pallet
-- King: 50 bags/pallet
-- Showtime: 50 bags/pallet
-- Beaver: 45 bags/pallet
-- Fast Track Blend: 45 bags/pallet
-- Fast Track Fine: 45 bags/pallet
-- Red Grandis: 45 bags/pallet
-- WD Fine: 45 bags/pallet
-- WD Flake: 54 bags/pallet
-- WD Pelleted: 50 bags/pallet
-- Airlite: 48 bags/pallet
-- All grain: ~40 bags/pallet

-- Update remote products by name match (production data)
UPDATE products SET pallet_qty = 45 WHERE name LIKE '%BEAVER%SHAVINGS%';
UPDATE products SET pallet_qty = 45 WHERE name LIKE '%FAST TRACK FINE%';
UPDATE products SET pallet_qty = 45 WHERE name LIKE '%FAST TRACK BLEND%';

-- These products may be added later:
-- World Cup shavings: 45/pallet
-- Obec: 45/pallet
-- King: 50/pallet
-- Showtime: 50/pallet
-- Red Grandis: 45/pallet
-- WD Fine: 45/pallet
-- WD Flake: 54/pallet
-- WD Pelleted: 50/pallet
-- Airlite: 48/pallet
-- All grain: 40/pallet
