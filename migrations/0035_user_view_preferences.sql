-- ============================================
-- Migration 0035: Per-user view customization
-- Adds: default landing page, pinned/favorite pages
-- Enables: personalized streamlined views per user
-- ============================================

-- Default module to launch on login (null = show module picker)
ALTER TABLE users ADD COLUMN default_module TEXT DEFAULT NULL;

-- Default page within that module (null = module dashboard)
ALTER TABLE users ADD COLUMN default_page TEXT DEFAULT NULL;

-- JSON array of pinned/favorite page ids per module
-- Format: {"logistics":["warehouse","orders","returns"],"ordering":["dashboard"]}
ALTER TABLE users ADD COLUMN pinned_pages TEXT DEFAULT NULL;

-- Whether to show the full sidebar or only pinned pages
ALTER TABLE users ADD COLUMN sidebar_mode TEXT DEFAULT 'full';
-- 'full' = show all pages user has access to (current behavior)
-- 'pinned' = show only pinned pages (simplified view)
-- 'minimal' = show pinned + current section only
