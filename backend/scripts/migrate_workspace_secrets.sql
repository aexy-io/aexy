-- Named secrets a workflow can reference without storing the value itself.
--
-- Webhook headers were the problem. A header template is stored verbatim in
-- the workflow definition, and reading a workflow only requires `member`, so a
-- pasted `Authorization: Bearer sk-live-…` sat in the graph in plain text for
-- everyone in the workspace. There was nowhere else to put it, so the builder
-- could only warn.
--
-- A step now references `{{secrets.NAME}}`. The reference is not sensitive and
-- can stay in the graph; the value lives here, encrypted with the same Fernet
-- envelope used for integration credentials, and is resolved at execution time
-- and never returned by the API.

CREATE TABLE IF NOT EXISTS workspace_secrets (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL
        REFERENCES workspaces(id) ON DELETE CASCADE,
    -- Referenced as {{secrets.NAME}}; unique per workspace so a reference
    -- resolves to exactly one value.
    name VARCHAR(120) NOT NULL,
    -- {"_encrypted": "...", "_version": 1} — aexy.core.encryption
    encrypted_value JSONB NOT NULL,
    description TEXT,
    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_workspace_secret_name UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS ix_workspace_secrets_workspace
    ON workspace_secrets (workspace_id);
