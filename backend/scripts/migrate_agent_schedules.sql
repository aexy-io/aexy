-- Agent schedules: a routine an agent runs on a clock.
--
-- Each run is an ordinary crm_agent_executions row (triggered_by = 'schedule',
-- trigger_id = the schedule). The agent's tools act as its principal, so a run
-- with nobody at the keyboard still has an identity and an audit trail.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS agent_schedules (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES crm_agents(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    routine TEXT NOT NULL,
    interval_minutes INTEGER NOT NULL DEFAULT 1440,
    timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    last_execution_id UUID REFERENCES crm_agent_executions(id) ON DELETE SET NULL,
    run_count INTEGER NOT NULL DEFAULT 0,
    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_agent_schedules_workspace_id ON agent_schedules (workspace_id);
CREATE INDEX IF NOT EXISTS ix_agent_schedules_agent_id ON agent_schedules (agent_id);
CREATE INDEX IF NOT EXISTS ix_agent_schedules_next_run_at ON agent_schedules (next_run_at);
