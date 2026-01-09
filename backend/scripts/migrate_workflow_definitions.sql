-- Migration: Add workflow_definitions table for visual automation builder
-- Run this migration to enable the visual workflow builder feature

-- Create the workflow_definitions table
CREATE TABLE IF NOT EXISTS crm_workflow_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id UUID NOT NULL UNIQUE REFERENCES crm_automations(id) ON DELETE CASCADE,

    -- React Flow state
    nodes JSONB NOT NULL DEFAULT '[]',
    edges JSONB NOT NULL DEFAULT '[]',
    viewport JSONB,  -- {x, y, zoom}

    -- Version tracking
    version INTEGER NOT NULL DEFAULT 1,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on automation_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_crm_workflow_definitions_automation_id
    ON crm_workflow_definitions(automation_id);

-- Create index for finding published workflows
CREATE INDEX IF NOT EXISTS idx_crm_workflow_definitions_is_published
    ON crm_workflow_definitions(is_published) WHERE is_published = TRUE;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_workflow_definition_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_workflow_definition_updated_at
    ON crm_workflow_definitions;

CREATE TRIGGER trigger_update_workflow_definition_updated_at
    BEFORE UPDATE ON crm_workflow_definitions
    FOR EACH ROW
    EXECUTE FUNCTION update_workflow_definition_updated_at();

-- Comment on table and columns
COMMENT ON TABLE crm_workflow_definitions IS 'Stores React Flow workflow definitions for visual automation builder';
COMMENT ON COLUMN crm_workflow_definitions.nodes IS 'Array of React Flow nodes: [{id, type, position: {x, y}, data: {...}}]';
COMMENT ON COLUMN crm_workflow_definitions.edges IS 'Array of React Flow edges: [{id, source, target, sourceHandle, targetHandle, label}]';
COMMENT ON COLUMN crm_workflow_definitions.viewport IS 'Canvas viewport state: {x, y, zoom}';
COMMENT ON COLUMN crm_workflow_definitions.version IS 'Incremented on each save for optimistic locking';
COMMENT ON COLUMN crm_workflow_definitions.is_published IS 'Whether the workflow is live and will execute on triggers';
