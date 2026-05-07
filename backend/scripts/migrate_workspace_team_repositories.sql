-- Workspace + team repository adoption.
--
-- Replaces the per-developer `developer_repositories.is_enabled` model
-- with a workspace-owned adoption catalog and a per-team subset.
-- Backfills both tables from existing `developer_repositories` rows so
-- nothing in scope today disappears after the cutover.
--
-- Idempotent: safe to re-run (CREATE TABLE IF NOT EXISTS, ON CONFLICT
-- DO NOTHING on the backfill).

-- ─── workspace_repositories ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_repositories (
    id VARCHAR(36) PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    repository_id VARCHAR(36) NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    adopted_by_developer_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sync_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    last_sync_at TIMESTAMPTZ,
    sync_error TEXT,
    commits_synced INTEGER NOT NULL DEFAULT 0,
    prs_synced INTEGER NOT NULL DEFAULT 0,
    reviews_synced INTEGER NOT NULL DEFAULT 0,
    last_commit_sha VARCHAR(40),
    last_commit_date TIMESTAMPTZ,
    last_pr_number INTEGER,
    last_pr_date TIMESTAMPTZ,
    incremental_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    webhook_id INTEGER,
    webhook_status VARCHAR(50) NOT NULL DEFAULT 'none',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_workspace_repository UNIQUE (workspace_id, repository_id)
);

CREATE INDEX IF NOT EXISTS ix_workspace_repositories_workspace_id
    ON workspace_repositories(workspace_id);
CREATE INDEX IF NOT EXISTS ix_workspace_repositories_repository_id
    ON workspace_repositories(repository_id);
CREATE INDEX IF NOT EXISTS ix_workspace_repositories_adopted_by_developer_id
    ON workspace_repositories(adopted_by_developer_id);

-- ─── team_repositories ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_repositories (
    id VARCHAR(36) PRIMARY KEY,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    workspace_repository_id VARCHAR(36) NOT NULL
        REFERENCES workspace_repositories(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_team_repository UNIQUE (team_id, workspace_repository_id)
);

CREATE INDEX IF NOT EXISTS ix_team_repositories_team_id
    ON team_repositories(team_id);
CREATE INDEX IF NOT EXISTS ix_team_repositories_workspace_repository_id
    ON team_repositories(workspace_repository_id);

-- ─── Backfill: adopt every (workspace, repo) where any active member ──
--   has the repo enabled. Carry the most-recent sync state forward so
--   the workspace doesn't re-sync everything from scratch on cutover.
INSERT INTO workspace_repositories (
    id,
    workspace_id,
    repository_id,
    adopted_by_developer_id,
    is_active,
    sync_status,
    last_sync_at,
    sync_error,
    commits_synced,
    prs_synced,
    reviews_synced,
    last_commit_sha,
    last_commit_date,
    last_pr_number,
    last_pr_date,
    incremental_sync_enabled,
    webhook_id,
    webhook_status
)
SELECT
    gen_random_uuid()::text,
    seed.workspace_id,
    seed.repository_id,
    seed.adopted_by_developer_id,
    TRUE,
    seed.sync_status,
    seed.last_sync_at,
    seed.sync_error,
    seed.commits_synced,
    seed.prs_synced,
    seed.reviews_synced,
    seed.last_commit_sha,
    seed.last_commit_date,
    seed.last_pr_number,
    seed.last_pr_date,
    seed.incremental_sync_enabled,
    seed.webhook_id,
    seed.webhook_status
FROM (
    SELECT DISTINCT ON (wm.workspace_id, dr.repository_id)
        wm.workspace_id            AS workspace_id,
        dr.repository_id           AS repository_id,
        dr.developer_id            AS adopted_by_developer_id,
        dr.sync_status             AS sync_status,
        dr.last_sync_at            AS last_sync_at,
        dr.sync_error              AS sync_error,
        dr.commits_synced          AS commits_synced,
        dr.prs_synced              AS prs_synced,
        dr.reviews_synced          AS reviews_synced,
        dr.last_commit_sha         AS last_commit_sha,
        dr.last_commit_date        AS last_commit_date,
        dr.last_pr_number          AS last_pr_number,
        dr.last_pr_date            AS last_pr_date,
        dr.incremental_sync_enabled AS incremental_sync_enabled,
        dr.webhook_id              AS webhook_id,
        dr.webhook_status          AS webhook_status
    FROM developer_repositories dr
    JOIN workspace_members wm
        ON wm.developer_id = dr.developer_id
    WHERE dr.is_enabled = TRUE
      AND wm.status = 'active'
    ORDER BY wm.workspace_id, dr.repository_id, dr.last_sync_at DESC NULLS LAST
) seed
ON CONFLICT (workspace_id, repository_id) DO NOTHING;

-- Backfill team_repositories: every team gets every workspace_repository
-- in its workspace (preserves visibility — teams can deselect later).
INSERT INTO team_repositories (id, team_id, workspace_repository_id)
SELECT
    gen_random_uuid()::text,
    t.id,
    wr.id
FROM teams t
JOIN workspace_repositories wr
    ON wr.workspace_id = t.workspace_id
ON CONFLICT (team_id, workspace_repository_id) DO NOTHING;
