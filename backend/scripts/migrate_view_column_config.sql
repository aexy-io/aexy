-- Migration: Add column_config JSONB column to crm_lists table
-- Phase 4: Per-view column display configuration (width, variant, conditional format)

ALTER TABLE crm_lists
ADD COLUMN IF NOT EXISTS column_config JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN crm_lists.column_config IS 'Per-column display config: [{slug, width, variant, conditional_format}]';
