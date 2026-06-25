-- Add is_taxable flag to products (1 = taxable, 0 = non-taxable)
-- Standard tax rate is 7% — applied only when is_taxable = 1
ALTER TABLE products ADD COLUMN is_taxable INTEGER DEFAULT 1;

-- Hay, grain, shavings are non-taxable (agricultural exemption in FL)
UPDATE products SET is_taxable = 0 WHERE category IN ('hay', 'grain', 'shavings');
-- Shelf goods are taxable by default
UPDATE products SET is_taxable = 1 WHERE category = 'shelf_goods';
-- Any product that explicitly had tax_rate > 0 is taxable regardless of category
UPDATE products SET is_taxable = 1 WHERE tax_rate > 0;
