-- Migration: workspace-level LLM usage counters
--
-- The AI sync pipeline (analyze_commit, analyze_pr, analyze_review,
-- digests) calls into the LLM gateway and produces tokens_used per
-- response, but until now nothing rolled those numbers up anywhere
-- billing could see them. `Developer.llm_tokens_used_this_month` was
-- only ever updated by a non-existent caller of `record_token_usage`.
--
-- We bill the work at the workspace level rather than per-developer
-- because the LLM API key + GitHub adopter token are workspace-scoped
-- — surfacing the cost to the wrong person (e.g., the commit author
-- who never opted in) is worse than aggregating it where the bill
-- actually lands.
--
-- Idempotent: re-running is a no-op via `IF NOT EXISTS`.

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS llm_tokens_used_this_month  BIGINT       NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS llm_input_tokens_this_month BIGINT       NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS llm_output_tokens_this_month BIGINT      NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS llm_requests_this_month     INTEGER      NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS llm_tokens_reset_at         TIMESTAMPTZ  NULL,
    -- Per-provider rollup so the UI can show e.g. "12k deepseek + 4k ollama"
    -- without joining the per-call analysis cache. JSON shape:
    --   { "deepseek": {"in": 1234, "out": 567, "req": 12},
    --     "ollama":   {"in": 4444, "out": 88,  "req": 4} }
    ADD COLUMN IF NOT EXISTS llm_provider_breakdown      JSONB        NOT NULL DEFAULT '{}'::jsonb,
    -- Month-to-date overage cost in CENTS, accumulated by
    -- record_workspace_token_usage when usage crosses the plan's
    -- free_llm_tokens_per_month threshold. Resets monthly alongside
    -- the rest of the counters.
    ADD COLUMN IF NOT EXISTS llm_overage_cost_cents      INTEGER      NOT NULL DEFAULT 0;
