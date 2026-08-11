-- Who did what to a mailbox's exclusions, and who looked.
--
-- Exclusions are visible to workspace admins by policy, which makes the list
-- itself revealing: a set of hidden domains reads as a set of things somebody
-- would rather their manager not see. The symmetry is that looking is recorded
-- too. The owner is not notified of a view — the record exists so the access
-- can be reviewed later, not so it can be watched live.
--
-- Separate from `app_access_logs` despite the shared vocabulary: that table is
-- documented as Enterprise-only, and an audit trail some workspaces silently do
-- not keep is not an audit trail.
CREATE TABLE IF NOT EXISTS google_sync_exclusion_audit (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL
        REFERENCES workspaces(id) ON DELETE CASCADE,
    -- No FK: an entry has to outlive the integration it describes, or
    -- disconnecting Google would erase the record of what was excluded.
    integration_id UUID,
    actor_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    target VARCHAR(255),
    extra_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_google_sync_exclusion_audit_workspace
    ON google_sync_exclusion_audit (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_google_sync_exclusion_audit_actor
    ON google_sync_exclusion_audit (actor_id);

CREATE INDEX IF NOT EXISTS ix_google_sync_exclusion_audit_action
    ON google_sync_exclusion_audit (action);
