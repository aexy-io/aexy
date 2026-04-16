-- Agent Canvas Framework: workspaces + blocks tables
-- Phase 0: Foundation data models

-- Agent Workspaces table
CREATE TABLE IF NOT EXISTS agent_workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    source_module VARCHAR(100),
    source_record_id UUID,
    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    temporal_workflow_id VARCHAR(255),
    config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_workspaces_workspace_id ON agent_workspaces(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_workspaces_status ON agent_workspaces(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_workspaces_created_by ON agent_workspaces(created_by_id);

-- Agent Workspace Blocks table
CREATE TABLE IF NOT EXISTS agent_workspace_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES agent_workspaces(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES agent_workspace_blocks(id) ON DELETE SET NULL,
    block_type VARCHAR(50) NOT NULL,
    title VARCHAR(500),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    agent_id UUID REFERENCES crm_agents(id) ON DELETE SET NULL,
    execution_id UUID,
    content JSONB NOT NULL DEFAULT '{}',
    file_key VARCHAR(1000),
    file_url VARCHAR(2000),
    file_mime_type VARCHAR(255),
    dependencies JSONB NOT NULL DEFAULT '[]',
    handoff_data JSONB,
    sort_order INTEGER NOT NULL DEFAULT 0,
    token_usage JSONB NOT NULL DEFAULT '{}',
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_workspace_blocks_workspace ON agent_workspace_blocks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_workspace_blocks_parent ON agent_workspace_blocks(workspace_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_agent_workspace_blocks_status ON agent_workspace_blocks(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_workspace_blocks_agent ON agent_workspace_blocks(agent_id);
