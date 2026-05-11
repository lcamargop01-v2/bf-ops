-- Product images: photos tagged to products/batches for quick visual reference
-- Images stored as base64 data URLs (compressed JPEG thumbnails)
CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  location_id INTEGER,
  batch_id INTEGER,
  image_data TEXT NOT NULL,
  caption TEXT,
  taken_by INTEGER,
  taken_by_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id),
  FOREIGN KEY (taken_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_batch ON product_images(batch_id);
CREATE INDEX IF NOT EXISTS idx_product_images_location ON product_images(location_id);
