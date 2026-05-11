-- Drop the product-centric image table (no data in it yet)
DROP TABLE IF EXISTS product_images;

-- Batch images: photos tagged to specific inventory batches
-- Warehouse staff snap photos of each batch for quick visual ID
CREATE TABLE IF NOT EXISTS batch_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  image_data TEXT NOT NULL,
  caption TEXT,
  taken_by INTEGER,
  taken_by_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id),
  FOREIGN KEY (taken_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_batch_images_batch ON batch_images(batch_id);
