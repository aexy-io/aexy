-- AI analysis pipeline foundation (Phase 1).
--
-- Adds:
--   * Layer-0 deterministic enrichment columns (author_class, change_class,
--     is_merge/is_revert on commits; size_bucket on pull_requests).
--   * Per-artifact AI analysis cursors (commits.ai_analyzed_at,
--     pull_requests.ai_analyzed_at, code_reviews.ai_analyzed_at,
--     repositories.ai_analysis_cursor).
--   * pull_requests.ai_analysis JSONB (Commit.semantic_analysis and
--     CodeReview.quality_metrics already exist for the other two).
--   * commits.patch_sample TEXT for truncated diff caching.
--   * llm_analysis_cache for cross-artifact dedup keyed on prompt hash.
--   * insights_snapshots for periodic developer/repo digests.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS.

-- ─── commits: deterministic enrichment + AI cursor ──────────────────────
ALTER TABLE commits
    ADD COLUMN IF NOT EXISTS author_class VARCHAR(20),
    ADD COLUMN IF NOT EXISTS change_class VARCHAR(30),
    ADD COLUMN IF NOT EXISTS is_merge BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_revert BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS patch_sample TEXT;

CREATE INDEX IF NOT EXISTS ix_commits_ai_analyzed_at
    ON commits (ai_analyzed_at);
CREATE INDEX IF NOT EXISTS ix_commits_author_class
    ON commits (author_class);

-- ─── pull_requests: deterministic enrichment + AI columns ───────────────
ALTER TABLE pull_requests
    ADD COLUMN IF NOT EXISTS size_bucket VARCHAR(4),
    ADD COLUMN IF NOT EXISTS ai_analysis JSONB,
    ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_pull_requests_ai_analyzed_at
    ON pull_requests (ai_analyzed_at);

-- ─── code_reviews: AI cursor ────────────────────────────────────────────
ALTER TABLE code_reviews
    ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_code_reviews_ai_analyzed_at
    ON code_reviews (ai_analyzed_at);

-- ─── repositories: per-repo AI analysis high-water mark ─────────────────
ALTER TABLE repositories
    ADD COLUMN IF NOT EXISTS ai_analysis_cursor TIMESTAMPTZ;

-- ─── llm_analysis_cache: cross-artifact prompt-hash dedup ───────────────
CREATE TABLE IF NOT EXISTS llm_analysis_cache (
    prompt_hash VARCHAR(64) PRIMARY KEY,
    analysis JSONB NOT NULL,
    model VARCHAR(100) NOT NULL,
    prompt_version VARCHAR(50) NOT NULL,
    token_usage JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_llm_analysis_cache_expires_at
    ON llm_analysis_cache (expires_at);

-- ─── insights_snapshots: scheduled digest output ────────────────────────
CREATE TABLE IF NOT EXISTS insights_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_type VARCHAR(50) NOT NULL,    -- developer | repository | workspace
    scope_id VARCHAR(36) NOT NULL,      -- string-id to fit either UUID or VARCHAR FKs
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    kind VARCHAR(50) NOT NULL,          -- weekly_digest | repo_health | …
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL,
    model VARCHAR(100),
    token_usage JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_insights_snapshots_scope
    ON insights_snapshots (scope_type, scope_id, kind, period_start DESC);
CREATE INDEX IF NOT EXISTS ix_insights_snapshots_workspace
    ON insights_snapshots (workspace_id, kind, period_start DESC);
