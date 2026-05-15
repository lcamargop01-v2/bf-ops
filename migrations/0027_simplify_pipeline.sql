-- Migration 0027: Simplify CRM pipeline for feed store workflow
-- Remove project-based stages (Qualified, Proposal Sent, Negotiation)
-- Keep: New Lead, Contacted, Won, Lost

-- Delete the 3 unused stages (ids 3, 4, 5)
DELETE FROM crm_pipeline_stages WHERE id IN (3, 4, 5);

-- Update remaining stages with better names/sort order for feed store
UPDATE crm_pipeline_stages SET name = 'New Lead', sort_order = 1, win_probability = 10 WHERE id = 1;
UPDATE crm_pipeline_stages SET name = 'Contacted', sort_order = 2, win_probability = 50 WHERE id = 2;
UPDATE crm_pipeline_stages SET name = 'Won', sort_order = 3, win_probability = 100 WHERE id = 6;
UPDATE crm_pipeline_stages SET name = 'Lost', sort_order = 4, win_probability = 0 WHERE id = 7;

-- Move any opportunities that were on deleted stages to "New Lead" (stage 1)
UPDATE crm_opportunities SET stage_id = 1 WHERE stage_id IN (3, 4, 5);
