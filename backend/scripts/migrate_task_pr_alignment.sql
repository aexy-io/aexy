-- Phase 4C — Task ↔ PR alignment.
--
-- Adds:
--   * task_github_links.alignment JSONB — LLM-derived score + rationale for
--     how well a linked PR delivers what the SprintTask description asked.
--   * task_github_links.alignment_analyzed_at — cursor so reanalysis only
--     fires when the task or PR was updated since.
--
-- Idempotent.

ALTER TABLE task_github_links
    ADD COLUMN IF NOT EXISTS alignment JSONB,
    ADD COLUMN IF NOT EXISTS alignment_analyzed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_task_github_links_alignment_analyzed_at
    ON task_github_links (alignment_analyzed_at);
