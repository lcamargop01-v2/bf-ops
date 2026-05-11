-- Add receive workflow columns to return_items
ALTER TABLE return_items ADD COLUMN condition TEXT DEFAULT NULL;
-- condition values: 'good', 'damaged', 'expired', 'opened', 'missing'

ALTER TABLE return_items ADD COLUMN received INTEGER DEFAULT 0;
-- 0 = not yet inspected, 1 = received/inspected

ALTER TABLE return_items ADD COLUMN received_qty INTEGER DEFAULT 0;
-- how many units actually received at warehouse

ALTER TABLE return_items ADD COLUMN restock INTEGER DEFAULT 0;
-- 0 = do not restock, 1 = restock to inventory

ALTER TABLE return_items ADD COLUMN receive_notes TEXT DEFAULT NULL;
-- per-item notes during receiving

-- Add receive tracking columns to returns table
ALTER TABLE returns ADD COLUMN received_by INTEGER DEFAULT NULL REFERENCES users(id);
ALTER TABLE returns ADD COLUMN received_at TEXT DEFAULT NULL;
ALTER TABLE returns ADD COLUMN receive_notes TEXT DEFAULT NULL;
