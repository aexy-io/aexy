-- Migration: Add billing/token allocation columns to plans table
-- These columns support per-plan free token allocation and overage billing
--
-- Run with:
--   docker exec aexy-backend python scripts/run_migrations.py --file migrate_plan_billing_columns.sql

-- Add free token allocation per month
ALTER TABLE plans
ADD COLUMN IF NOT EXISTS free_llm_tokens_per_month INTEGER NOT NULL DEFAULT 100000;

-- Add pay-per-use pricing columns (in cents per 1K tokens)
ALTER TABLE plans
ADD COLUMN IF NOT EXISTS llm_input_cost_per_1k_cents INTEGER NOT NULL DEFAULT 30;

ALTER TABLE plans
ADD COLUMN IF NOT EXISTS llm_output_cost_per_1k_cents INTEGER NOT NULL DEFAULT 60;

-- Add overage billing toggle
ALTER TABLE plans
ADD COLUMN IF NOT EXISTS enable_overage_billing BOOLEAN NOT NULL DEFAULT TRUE;

-- Update existing plans with appropriate values based on tier

-- Free tier: 50K tokens/month, no overage (stops at limit)
UPDATE plans
SET free_llm_tokens_per_month = 50000,
    llm_input_cost_per_1k_cents = 0,
    llm_output_cost_per_1k_cents = 0,
    enable_overage_billing = FALSE
WHERE tier = 'free';

-- Pro tier: 500K tokens/month, pay-per-use overage
UPDATE plans
SET free_llm_tokens_per_month = 500000,
    llm_input_cost_per_1k_cents = 25,
    llm_output_cost_per_1k_cents = 50,
    enable_overage_billing = TRUE
WHERE tier = 'pro';

-- Enterprise tier: 2M tokens/month, discounted overage
UPDATE plans
SET free_llm_tokens_per_month = 2000000,
    llm_input_cost_per_1k_cents = 15,
    llm_output_cost_per_1k_cents = 30,
    enable_overage_billing = TRUE
WHERE tier = 'enterprise';

-- Add comments for documentation
COMMENT ON COLUMN plans.free_llm_tokens_per_month IS 'Free LLM tokens included per month (-1 for unlimited)';
COMMENT ON COLUMN plans.llm_input_cost_per_1k_cents IS 'Overage cost per 1K input tokens in cents';
COMMENT ON COLUMN plans.llm_output_cost_per_1k_cents IS 'Overage cost per 1K output tokens in cents';
COMMENT ON COLUMN plans.enable_overage_billing IS 'Whether to allow usage beyond free tier (if false, usage stops at limit)';

-- Verify migration
SELECT name, tier, free_llm_tokens_per_month, llm_input_cost_per_1k_cents, llm_output_cost_per_1k_cents, enable_overage_billing
FROM plans
ORDER BY
    CASE tier
        WHEN 'free' THEN 1
        WHEN 'pro' THEN 2
        WHEN 'enterprise' THEN 3
        ELSE 4
    END;
