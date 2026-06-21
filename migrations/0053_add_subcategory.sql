-- Add subcategory column for detailed product classification
-- Main category is one of: hay, shavings, shelf_goods
-- Subcategory provides detail: feed, supplement, first_aid, grooming, tack, etc.
ALTER TABLE products ADD COLUMN subcategory TEXT;
