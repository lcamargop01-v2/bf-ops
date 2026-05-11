-- Add ticket_image column to orders for storing scanned ticket photos
ALTER TABLE orders ADD COLUMN ticket_image TEXT;
