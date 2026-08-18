-- Whether Aexy writes into a workspace's pull requests.
--
-- Model: src/aexy/models/workspace_doc_impact_settings.py
--
-- One row per workspace, or none. An absent row means the documented default —
-- notifications on, GitHub writes off — which is the state every workspace is in
-- today, so there is deliberately no backfill: a row per workspace would only
-- create something to keep in sync with the default.
--
-- A pull request comment is one shared artifact, not a message to one person, so
-- it cannot live in per-developer notification preferences: there is no honest
-- way to reconcile four reviewers' opinions about whether it exists. It is a
-- workspace admin's decision, which also matches who can grant the GitHub App
-- permission it depends on.

CREATE TABLE IF NOT EXISTS workspace_doc_impact_settings (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Default on: the in-app notification is not externally visible and is the
    -- point of the feature.
    enabled BOOLEAN NOT NULL DEFAULT TRUE,

    -- Both FALSE on purpose. These write into a customer's pull requests, and
    -- deploying this must not start doing that on anybody's behalf.
    pr_comment_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    check_run_enabled  BOOLEAN NOT NULL DEFAULT FALSE,

    -- 'neutral' never blocks a merge; 'action_required' does, for teams that
    -- want stale documentation to be a gate. Advisory by default, because a
    -- check that fails over a possibly-stale screenshot gets made non-required
    -- within a week — and then it is ignored *and* red.
    check_run_conclusion VARCHAR(20) NOT NULL DEFAULT 'neutral',

    -- Denormalised so the settings banner is a single-row read rather than a scan
    -- of pull_request_doc_impacts. Set on the first refused write, cleared on the
    -- first success.
    github_write_block_reason TEXT,
    github_write_blocked_at TIMESTAMP WITH TIME ZONE,

    updated_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- No index beyond the unique constraint on workspace_id: that is the only way
-- this table is ever read.
