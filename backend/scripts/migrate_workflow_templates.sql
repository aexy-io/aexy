-- Migration: Create workflow_templates table
-- Run this migration to add workflow template support

-- Create workflow templates table
CREATE TABLE IF NOT EXISTS crm_workflow_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,  -- NULL = system template

    -- Template info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    icon VARCHAR(50),

    -- React Flow state
    nodes JSONB NOT NULL DEFAULT '[]',
    edges JSONB NOT NULL DEFAULT '[]',
    viewport JSONB,

    -- Metadata
    is_system BOOLEAN DEFAULT false,
    is_published BOOLEAN DEFAULT true,
    use_count INTEGER DEFAULT 0,

    -- Created by
    created_by UUID REFERENCES developers(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_workflow_templates_workspace ON crm_workflow_templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_category ON crm_workflow_templates(category);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_is_system ON crm_workflow_templates(is_system);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_is_published ON crm_workflow_templates(is_published);

-- Add comment
COMMENT ON TABLE crm_workflow_templates IS 'Pre-built workflow templates for common automation patterns';
