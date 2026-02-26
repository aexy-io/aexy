-- Phase 4.3: Allow entity-based saved views (object_id nullable for non-table views)
-- Also ensure entity_type and entity_scope_id columns exist

-- Make object_id nullable for entity-based views
ALTER TABLE crm_lists ALTER COLUMN object_id DROP NOT NULL;

-- Add index for entity-type based lookups
CREATE INDEX IF NOT EXISTS idx_crm_lists_entity_type ON crm_lists(workspace_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_crm_lists_entity_scope ON crm_lists(workspace_id, entity_type, entity_scope_id);
