-- Add is_taxable flag to products (1 = taxable, 0 = non-taxable)
-- Default to 1 (taxable) — products with existing tax_rate > 0 stay taxable
-- Products with tax_rate = 0 get marked non-taxable
ALTER TABLE products ADD COLUMN is_taxable INTEGER DEFAULT 1;

-- Mark products that currently have 0 tax as non-taxable
UPDATE products SET is_taxable = 0 WHERE tax_rate = 0 OR tax_rate IS NULL;
UPDATE products SET is_taxable = 1 WHERE tax_rate > 0;
