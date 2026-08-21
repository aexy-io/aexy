-- Which model a workspace wants, per AI feature or per category.
--
-- Model: src/aexy/models/ai_model_override.py (WorkspaceAIModelOverride)
-- Registry: src/aexy/llm/features.py (the ids stored in `key`)
--
-- Why a table and not another key in `workspace.settings`. That column is one
-- JSONB blob already shared by `ai_analysis`, `app_settings`, `service_desk` and
-- `rate_limit_overrides`, so writing to it is read-modify-write of the whole
-- thing. The screen this backs has fifty rows on it; two admins saving at once
-- would silently lose one of the two saves, and neither would be able to tell.
-- These rows also move money, and `updated_by_id` / `updated_at` are the first
-- thing anybody asks for when a bill jumps — a blob cannot answer that.
--
-- Why `provider` is stored beside `model` rather than derived. A model id belongs
-- to exactly one provider: `claude-sonnet-5` means nothing to Gemini. Without the
-- provider recorded, a stored choice becomes silently wrong the moment an admin
-- switches provider at /settings/ai, and the failure surfaces hours later as
-- somebody else's 404 inside a background job. Recorded, the resolver can ignore
-- a mismatched override and the settings page can say it is being ignored.
--
-- Why `key` has no foreign key. The feature registry is code, not data. A feature
-- removed from it should leave its row behind harmlessly — the resolver ignores a
-- key it does not recognise and the settings page does not render one — rather
-- than making a code change require a data migration.

CREATE TABLE IF NOT EXISTS workspace_ai_model_overrides (
    id UUID PRIMARY KEY,

    workspace_id UUID NOT NULL
        REFERENCES workspaces(id) ON DELETE CASCADE,

    -- 'category' | 'feature'. Both live here because the resolver reads them
    -- together — feature, then category, then the workspace default — and two
    -- tables would mean two queries and two copies of the same uniqueness rule.
    scope VARCHAR(16) NOT NULL,

    -- A category id or a feature id from llm/features.py.
    key VARCHAR(64) NOT NULL,

    model VARCHAR(128) NOT NULL,
    provider VARCHAR(32) NOT NULL,

    updated_by_id UUID
        REFERENCES developers(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_ai_model_override_scope
        CHECK (scope IN ('category', 'feature')),

    -- One answer per target. The upsert on this constraint is what makes saving
    -- idempotent when two tabs are open on the same row.
    CONSTRAINT uq_ai_model_override_target
        UNIQUE (workspace_id, scope, key)
);

-- The resolver's only read: every override for one workspace, in one query, on
-- a path that runs before every LLM call.
CREATE INDEX IF NOT EXISTS ix_ai_model_overrides_workspace
    ON workspace_ai_model_overrides (workspace_id);

-- There is deliberately no backfill and no seeding. An absent row means "inherit"
-- at every level, and a workspace that has never opened the page must resolve
-- identically to one that opened it and changed nothing.
