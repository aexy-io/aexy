-- Governance for the door agents actually use.
--
-- `AgentPolicyEngine` already models block / require-approval / field
-- restriction / rate limit / token budget, evaluates them, notifies on
-- approval, and writes an immutable decision log. All of it was reachable
-- from exactly one caller — `agent_service.py`, for CRM agents — and bolted
-- to `crm_agents` by foreign key.
--
-- Meanwhile `McpToolExecutor` re-enters the app over ASGI with a scoped
-- token, so every endpoint runs its own auth, workspace membership and
-- app-access checks. That part is right. But it never consulted the policy
-- engine, so the surface an external coding agent writes through had
-- permissions and no governance: no approval requirement, no field
-- restrictions, no token budget, and no record that a decision was ever
-- taken.
--
-- Two changes:
--
-- 1. `agent_policy_decisions.execution_id` becomes nullable, with the actor
--    described alongside it. A decision taken on an MCP call has no
--    `crm_agent_executions` row to point at, so a NOT NULL column meant it
--    could not be written down — the audit log covered one caller out of two
--    and looked complete.
--
-- 2. `agent_pending_actions` holds a tool call waiting on a human. Policy is
--    evaluated *before* the call runs, so there is no result to review yet;
--    running it to find out what it would do is what the gate exists to
--    prevent. What is stored is the request, replayed verbatim on approval.
--
-- Idempotent: safe to re-run.

ALTER TABLE agent_policy_decisions
    ALTER COLUMN execution_id DROP NOT NULL;

ALTER TABLE agent_policy_decisions
    ADD COLUMN IF NOT EXISTS actor_kind VARCHAR(20) NOT NULL DEFAULT 'crm_agent';

ALTER TABLE agent_policy_decisions
    ADD COLUMN IF NOT EXISTS actor_developer_id UUID
        REFERENCES developers(id) ON DELETE SET NULL;

ALTER TABLE agent_policy_decisions
    ADD COLUMN IF NOT EXISTS workspace_id UUID
        REFERENCES workspaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ix_agent_policy_decisions_actor_developer_id
    ON agent_policy_decisions (actor_developer_id);

CREATE INDEX IF NOT EXISTS ix_agent_policy_decisions_workspace_id
    ON agent_policy_decisions (workspace_id);

CREATE TABLE IF NOT EXISTS agent_pending_actions (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    requested_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,

    tool_name VARCHAR(255) NOT NULL,
    action VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    path VARCHAR(1000) NOT NULL,
    arguments JSONB NOT NULL DEFAULT '{}'::jsonb,

    policy_id UUID REFERENCES agent_policies(id) ON DELETE SET NULL,
    reason TEXT,

    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    reviewed_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_note TEXT,
    result JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_agent_pending_actions_workspace_id
    ON agent_pending_actions (workspace_id);

CREATE INDEX IF NOT EXISTS ix_agent_pending_actions_requested_by_id
    ON agent_pending_actions (requested_by_id);

-- The queue is read by "what is waiting", which is a small slice of a table
-- that mostly holds resolved rows. Mirrored in the model's __table_args__.
CREATE INDEX IF NOT EXISTS ix_agent_pending_actions_workspace_pending
    ON agent_pending_actions (workspace_id)
    WHERE status = 'pending';
