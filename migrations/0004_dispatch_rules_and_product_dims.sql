-- AI Dispatch Rules: configurable rules for smart routing & truck loading
CREATE TABLE IF NOT EXISTS dispatch_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL DEFAULT 'routing',  -- routing, loading, scheduling, general
  rule_name TEXT NOT NULL,
  rule_description TEXT,
  rule_type TEXT NOT NULL DEFAULT 'preference', -- constraint (hard), preference (soft), optimization
  rule_json TEXT NOT NULL, -- JSON: {field, operator, value, weight, action}
  priority INTEGER DEFAULT 50, -- 1-100, higher = more important
  active INTEGER DEFAULT 1,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Add product dimensions for truck loading optimization
ALTER TABLE products ADD COLUMN length_in REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN width_in REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN height_in REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN stackable INTEGER DEFAULT 1;
ALTER TABLE products ADD COLUMN max_stack INTEGER DEFAULT 3;

-- Add truck interior dimensions for space optimization
ALTER TABLE trucks ADD COLUMN interior_length_in REAL DEFAULT 288;
ALTER TABLE trucks ADD COLUMN interior_width_in REAL DEFAULT 96;
ALTER TABLE trucks ADD COLUMN interior_height_in REAL DEFAULT 108;

-- Index
CREATE INDEX IF NOT EXISTS idx_dispatch_rules_category ON dispatch_rules(category);
CREATE INDEX IF NOT EXISTS idx_dispatch_rules_active ON dispatch_rules(active);
