-- Migration: Add AI Agent tables for LangGraph-based automation agents
-- Run this migration to enable the AI agent system

-- Create the agents table
CREATE TABLE IF NOT EXISTS crm_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Agent identity
    name VARCHAR(255) NOT NULL,
    description TEXT,
    agent_type VARCHAR(50) NOT NULL,  -- 'sales_outreach', 'lead_scoring', 'email_drafter', 'data_enrichment', 'custom'

    -- System agents are pre-built and cannot be deleted
    is_system BOOLEAN NOT NULL DEFAULT FALSE,

    -- Agent configuration
    goal TEXT,
    system_prompt TEXT,
    tools JSONB NOT NULL DEFAULT '[]',

    -- LangGraph configuration
    max_iterations INTEGER NOT NULL DEFAULT 10,
    timeout_seconds INTEGER NOT NULL DEFAULT 300,
    model VARCHAR(100) NOT NULL DEFAULT 'claude-3-sonnet-20240229',

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Creator
    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,

    -- Stats
    total_executions INTEGER NOT NULL DEFAULT 0,
    successful_executions INTEGER NOT NULL DEFAULT 0,
    failed_executions INTEGER NOT NULL DEFAULT 0,
    avg_duration_ms INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_crm_agents_workspace_id ON crm_agents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crm_agents_agent_type ON crm_agents(agent_type);
CREATE INDEX IF NOT EXISTS idx_crm_agents_is_active ON crm_agents(is_active) WHERE is_active = TRUE;

-- Create the agent executions table
CREATE TABLE IF NOT EXISTS crm_agent_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES crm_agents(id) ON DELETE CASCADE,

    -- Context
    record_id UUID,
    triggered_by VARCHAR(50),  -- 'automation', 'workflow', 'manual'
    trigger_id UUID,

    -- Input/Output
    input_context JSONB NOT NULL DEFAULT '{}',
    output_result JSONB,

    -- Execution trace
    steps JSONB NOT NULL DEFAULT '[]',

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- 'pending', 'running', 'completed', 'failed', 'cancelled'
    error_message TEXT,

    -- Timing
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,

    -- Token usage
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for executions
CREATE INDEX IF NOT EXISTS idx_crm_agent_executions_agent_id ON crm_agent_executions(agent_id);
CREATE INDEX IF NOT EXISTS idx_crm_agent_executions_record_id ON crm_agent_executions(record_id);
CREATE INDEX IF NOT EXISTS idx_crm_agent_executions_status ON crm_agent_executions(status);
CREATE INDEX IF NOT EXISTS idx_crm_agent_executions_created_at ON crm_agent_executions(created_at DESC);

-- Create the user writing styles table
CREATE TABLE IF NOT EXISTS user_writing_styles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Style profile extracted from user's emails
    style_profile JSONB NOT NULL DEFAULT '{}',

    -- Training status
    samples_analyzed INTEGER NOT NULL DEFAULT 0,
    is_trained BOOLEAN NOT NULL DEFAULT FALSE,
    last_trained_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique constraint per user per workspace
    UNIQUE(developer_id, workspace_id)
);

-- Create indexes for writing styles
CREATE INDEX IF NOT EXISTS idx_user_writing_styles_developer_id ON user_writing_styles(developer_id);
CREATE INDEX IF NOT EXISTS idx_user_writing_styles_workspace_id ON user_writing_styles(workspace_id);

-- Add triggers for updated_at
CREATE OR REPLACE FUNCTION update_agent_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_agent_updated_at ON crm_agents;
CREATE TRIGGER trigger_update_agent_updated_at
    BEFORE UPDATE ON crm_agents
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_updated_at();

DROP TRIGGER IF EXISTS trigger_update_writing_style_updated_at ON user_writing_styles;
CREATE TRIGGER trigger_update_writing_style_updated_at
    BEFORE UPDATE ON user_writing_styles
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_updated_at();

-- Comments
COMMENT ON TABLE crm_agents IS 'AI agents for CRM automation using LangGraph';
COMMENT ON TABLE crm_agent_executions IS 'Log of AI agent executions with full trace';
COMMENT ON TABLE user_writing_styles IS 'User writing style profiles for email personalization';
