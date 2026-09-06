-- Agent principals: an agent that acts as itself.
--
-- Every MCP call ran as a person — an OAuth grant or a personal API token —
-- so nothing could run for a workspace unattended without being "somebody did
-- this" in the audit trail. A principal is a workspace-owned identity with a
-- capability scope, its own tokens, and its own rows in the ledger. It acts
-- through one synthetic developer row (account_type = 'agent') so that every
-- created_by_id / requested_by_id column can name it without change.
--
-- Also: api_tokens learn which principal (if any) they belong to, and an
-- optional scope; agent_action_logs learn which principal acted.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS agent_principals (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    developer_id UUID NOT NULL UNIQUE REFERENCES developers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_agent_principals_workspace_id
    ON agent_principals (workspace_id);

ALTER TABLE api_tokens
    ADD COLUMN IF NOT EXISTS principal_id UUID REFERENCES agent_principals(id) ON DELETE CASCADE;
ALTER TABLE api_tokens
    ADD COLUMN IF NOT EXISTS scopes JSONB;
CREATE INDEX IF NOT EXISTS ix_api_tokens_principal_id
    ON api_tokens (principal_id);

ALTER TABLE agent_action_logs
    ADD COLUMN IF NOT EXISTS principal_id UUID REFERENCES agent_principals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_agent_action_logs_principal_id
    ON agent_action_logs (principal_id);
