-- Workspace AI governance — the org-wide kill switch + bring-your-own provider.
-- Model: models/workspace_ai_settings.py
--
-- No backfill and no NOT NULL default row: an absent row means "platform
-- behaviour, AI on", which is exactly the state every workspace is in today.
-- Writing a row for every workspace would only create something to keep in sync.
--
-- `encrypted_api_key` holds the Fernet envelope ({"_encrypted": ..., "_version": 1})
-- produced by aexy.core.encryption, never the key itself. There is deliberately
-- no read path in the API — `key_hint` (last four characters) is what the UI shows.

CREATE TABLE IF NOT EXISTS workspace_ai_settings (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,

    -- The kill switch. TRUE = unchanged platform behaviour.
    ai_enabled BOOLEAN NOT NULL DEFAULT TRUE,

    -- Bring-your-own provider. NULL provider = use the deployment default.
    provider VARCHAR(32),
    model VARCHAR(120),
    base_url VARCHAR(512),

    encrypted_api_key JSONB,
    key_hint VARCHAR(8),
    key_set_at TIMESTAMP WITH TIME ZONE,

    -- FALSE on purpose: an org that supplied its own key does not want prompts
    -- quietly routed through the platform account when that key misbehaves.
    allow_platform_fallback BOOLEAN NOT NULL DEFAULT FALSE,

    disabled_reason TEXT,
    disabled_at TIMESTAMP WITH TIME ZONE,
    updated_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- The UNIQUE constraint above already indexes workspace_id; this is the lookup
-- the gateway performs on every LLM call, so keep it named and obvious.
CREATE INDEX IF NOT EXISTS ix_workspace_ai_settings_workspace
    ON workspace_ai_settings(workspace_id);
