-- Migration: Add Agent Policy Engine tables for governance and audit
-- Adds: agent_policies, agent_policy_decisions, agent_config_audits

-- Agent policies: workspace-scoped governance rules for AI agents
CREATE TABLE IF NOT EXISTS agent_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Optional: restrict to a specific agent (NULL = applies to all agents)
    agent_id UUID REFERENCES crm_agents(id) ON DELETE CASCADE,

    -- Policy type determines how config is evaluated
    policy_type VARCHAR(50) NOT NULL,  -- 'tool_block', 'tool_require_approval', 'field_restriction', 'rate_limit', 'token_budget'

    -- Type-specific configuration (JSONB)
    -- tool_block:            {"tools": ["send_email", "send_sms"]}
    -- tool_require_approval: {"tools": ["update_record", "send_email"]}
    -- field_restriction:     {"tool": "update_record", "blocked_fields": ["email", "phone"]}
    -- rate_limit:            {"tool": "send_email", "max_per_execution": 5}
    -- token_budget:          {"max_tokens": 50000}
    config JSONB NOT NULL DEFAULT '{}',

    -- Lower priority number = evaluated first
    priority INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_policies_workspace_active
    ON agent_policies (workspace_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_agent_policies_agent_id
    ON agent_policies (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_policies_type
    ON agent_policies (policy_type);


-- Policy decisions: immutable audit log of every policy evaluation
CREATE TABLE IF NOT EXISTS agent_policy_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES crm_agent_executions(id) ON DELETE CASCADE,
    policy_id UUID REFERENCES agent_policies(id) ON DELETE SET NULL,

    -- What was evaluated
    tool_name VARCHAR(255) NOT NULL,
    tool_args JSONB NOT NULL DEFAULT '{}',

    -- Decision outcome
    decision VARCHAR(50) NOT NULL,  -- 'allow', 'block', 'require_approval', 'rate_limited'
    reason TEXT,

    -- Confidence context (from agent config)
    confidence_score FLOAT,
    confidence_threshold FLOAT,

    -- Approval workflow (Phase 2)
    approval_status VARCHAR(50),  -- NULL, 'pending', 'approved', 'rejected'
    approved_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_policy_decisions_execution
    ON agent_policy_decisions (execution_id);
CREATE INDEX IF NOT EXISTS idx_agent_policy_decisions_policy
    ON agent_policy_decisions (policy_id);
CREATE INDEX IF NOT EXISTS idx_agent_policy_decisions_created
    ON agent_policy_decisions (created_at DESC);


-- Config audit: tracks changes to agent configuration
CREATE TABLE IF NOT EXISTS agent_config_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES crm_agents(id) ON DELETE CASCADE,
    changed_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,

    -- What changed
    change_type VARCHAR(50) NOT NULL,  -- 'create', 'update', 'delete', 'toggle'
    field_changes JSONB NOT NULL DEFAULT '{}',
    -- Format: {"field_name": {"old": old_value, "new": new_value}}

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_config_audits_agent
    ON agent_config_audits (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_config_audits_created
    ON agent_config_audits (created_at DESC);
