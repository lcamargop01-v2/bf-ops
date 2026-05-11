-- Migration 0010: Update product pallet compositions per actual business data
-- Pallet composition (units per pallet):
-- 2-string hay: 18 bales/pallet
-- 3-string hay: 12 bales/pallet
-- Bundle of hay: 21 bales/pallet
-- World Cup shavings: 45 bags/pallet
-- Obec, King, Showtime, Beaver, Fast Track Blend, Fast Track Fine, Red Grandis, WD Fine: 45 bags/pallet
-- WD Flake: 54 bags/pallet
-- WD Pelleted: 50 bags/pallet
-- All grain: ~40 bags/pallet

-- Fix hay products unit_type to 'bale' and set correct pallet_qty
-- Note: Hay products that were mislabeled as 'bag' need unit_type fixed
UPDATE products SET unit_type = 'bale', pallet_qty = 12 WHERE name LIKE '%3 STRING%' OR name LIKE '%3-string%';
UPDATE products SET unit_type = 'bale', pallet_qty = 18 WHERE name LIKE '%2 STRING%' OR name LIKE '%2-string%';
UPDATE products SET unit_type = 'bale', pallet_qty = 21 WHERE name LIKE '%BUNDLE%' AND name LIKE '%HAY%';

-- Shavings products: 45 bags/pallet (default for most)
UPDATE products SET pallet_qty = 45 WHERE name LIKE '%SHAVINGS%' AND name NOT LIKE '%WD FLAKE%';
UPDATE products SET pallet_qty = 45 WHERE name LIKE '%WORLD CUP%';
UPDATE products SET pallet_qty = 45 WHERE name LIKE '%OBEC%';
UPDATE products SET pallet_qty = 45 WHERE name LIKE '%KING%' AND (name LIKE '%SHAVING%' OR name LIKE '%BEDDING%');
UPDATE products SET pallet_qty = 45 WHERE name LIKE '%SHOWTIME%';
UPDATE products SET pallet_qty = 45 WHERE name LIKE '%BEAVER%';
UPDATE products SET pallet_qty = 45 WHERE name LIKE '%FAST TRACK%';
UPDATE products SET pallet_qty = 45 WHERE name LIKE '%RED GRANDIS%';
UPDATE products SET pallet_qty = 45 WHERE name LIKE '%WD FINE%';

-- WD Flake: 54 bags/pallet
UPDATE products SET pallet_qty = 54 WHERE name LIKE '%WD FLAKE%';

-- WD Pelleted: 50 bags/pallet
UPDATE products SET pallet_qty = 50 WHERE name LIKE '%WD PELLETED%' OR name LIKE '%WD PELLET%';

-- All grain: ~40 bags/pallet
UPDATE products SET pallet_qty = 40 WHERE pallet_qty = 0 AND unit_type = 'bag' AND category IN ('horse','cattle','poultry','goat','swine');

-- Also fix existing hay bales to correct pallet_qty
-- Bermuda, Timothy, Alfalfa (these are 2-string type by default)
UPDATE products SET pallet_qty = 18 WHERE name LIKE '%Bermuda%' AND unit_type = 'bale';
UPDATE products SET pallet_qty = 18 WHERE name LIKE '%Timothy%' AND unit_type = 'bale' AND name NOT LIKE '%3 STRING%';
UPDATE products SET pallet_qty = 18 WHERE name LIKE '%Alfalfa%' AND unit_type = 'bale' AND name NOT LIKE '%3 STRING%';
