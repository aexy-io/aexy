-- The ledger of what agents actually did.
--
-- agent_policy_decisions records what governance refused. Nothing recorded
-- what it let through, so an allowed agent write left no trace at the tool
-- boundary. One row per mutating call that reached the application, succeed
-- or fail. Reads are never written.
--
-- Also the substrate for rate limiting over MCP: the engine's in-memory
-- counter lived for one request, so a per-hour or per-day limit could never
-- fire. A window over these rows can.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS agent_action_logs (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    actor_kind VARCHAR(20) NOT NULL DEFAULT 'mcp',
    actor_developer_id UUID REFERENCES developers(id) ON DELETE SET NULL,

    tool_name VARCHAR(255) NOT NULL,
    action VARCHAR(255) NOT NULL,
    capability VARCHAR(100),
    method VARCHAR(10) NOT NULL,
    path VARCHAR(500) NOT NULL,
    resolved_path VARCHAR(1000),
    arguments JSONB NOT NULL DEFAULT '{}'::jsonb,

    status_code INTEGER,
    is_error BOOLEAN NOT NULL DEFAULT FALSE,
    duration_ms INTEGER,

    pending_action_id UUID REFERENCES proposed_changes(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_agent_action_logs_workspace_id
    ON agent_action_logs (workspace_id);
CREATE INDEX IF NOT EXISTS ix_agent_action_logs_actor_developer_id
    ON agent_action_logs (actor_developer_id);
CREATE INDEX IF NOT EXISTS ix_agent_action_logs_pending_action_id
    ON agent_action_logs (pending_action_id);
CREATE INDEX IF NOT EXISTS ix_agent_action_logs_workspace_created
    ON agent_action_logs (workspace_id, created_at);
CREATE INDEX IF NOT EXISTS ix_agent_action_logs_rate_window
    ON agent_action_logs (workspace_id, actor_developer_id, action, created_at);

-- Added after the first cut of the table: safe on databases that already have it.
ALTER TABLE agent_action_logs ADD COLUMN IF NOT EXISTS capability VARCHAR(100);
