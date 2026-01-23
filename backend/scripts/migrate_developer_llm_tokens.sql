-- Developer LLM Token Tracking Migration
-- Adds columns for tracking LLM token usage per developer

-- Add LLM token tracking columns to developers table
ALTER TABLE developers
ADD COLUMN IF NOT EXISTS llm_tokens_used_this_month BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS llm_input_tokens_this_month BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS llm_output_tokens_this_month BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS llm_tokens_reset_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS llm_overage_cost_cents INTEGER NOT NULL DEFAULT 0;

-- Create index for token usage queries
CREATE INDEX IF NOT EXISTS ix_developers_llm_tokens ON developers(llm_tokens_used_this_month);

COMMENT ON COLUMN developers.llm_tokens_used_this_month IS 'Total LLM tokens (input + output) used this billing month';
COMMENT ON COLUMN developers.llm_input_tokens_this_month IS 'LLM input tokens used this billing month';
COMMENT ON COLUMN developers.llm_output_tokens_this_month IS 'LLM output tokens used this billing month';
COMMENT ON COLUMN developers.llm_tokens_reset_at IS 'When the monthly token counters were last reset';
COMMENT ON COLUMN developers.llm_overage_cost_cents IS 'Accumulated overage charges in cents for the current month';
