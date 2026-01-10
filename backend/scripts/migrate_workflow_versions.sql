-- Migration: Create workflow_versions table for version history
-- Run this migration to enable workflow version history feature

-- Create the workflow versions table
CREATE TABLE IF NOT EXISTS crm_workflow_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES crm_workflow_definitions(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    nodes JSONB NOT NULL DEFAULT '[]',
    edges JSONB NOT NULL DEFAULT '[]',
    viewport JSONB,
    change_summary VARCHAR(500),
    node_count INTEGER DEFAULT 0,
    edge_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(workflow_id, version)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow ON crm_workflow_versions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_created_at ON crm_workflow_versions(created_at DESC);

-- Add comment for documentation
COMMENT ON TABLE crm_workflow_versions IS 'Stores historical snapshots of workflow definitions for version history and rollback';
COMMENT ON COLUMN crm_workflow_versions.version IS 'Version number, incrementing with each save';
COMMENT ON COLUMN crm_workflow_versions.change_summary IS 'Auto-generated or user-provided summary of changes';
COMMENT ON COLUMN crm_workflow_versions.node_count IS 'Number of nodes at this version for quick stats';
COMMENT ON COLUMN crm_workflow_versions.edge_count IS 'Number of edges at this version for quick stats';
