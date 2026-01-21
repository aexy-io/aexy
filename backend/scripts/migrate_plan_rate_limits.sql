-- Migration: Add per-minute rate limit fields to plans table
-- These columns support plan-based rate limiting for LLM requests
--
-- Run this migration with:
--   docker compose exec postgres psql -U postgres -d aexy -f /scripts/migrate_plan_rate_limits.sql
-- Or:
--   docker compose exec backend python -c "
--     from aexy.core.database import engine
--     import asyncio
--     asyncio.run(engine.execute(open('/app/scripts/migrate_plan_rate_limits.sql').read()))
--   "

-- Add llm_requests_per_minute column
ALTER TABLE plans
ADD COLUMN IF NOT EXISTS llm_requests_per_minute INTEGER DEFAULT 10;

-- Add llm_tokens_per_minute column
ALTER TABLE plans
ADD COLUMN IF NOT EXISTS llm_tokens_per_minute INTEGER DEFAULT 50000;

-- Update existing plans with appropriate values based on tier
-- Free tier: 5 requests/min, 20,000 tokens/min
UPDATE plans
SET llm_requests_per_minute = 5, llm_tokens_per_minute = 20000
WHERE tier = 'free' AND llm_requests_per_minute = 10;

-- Pro tier: 20 requests/min, 100,000 tokens/min
UPDATE plans
SET llm_requests_per_minute = 20, llm_tokens_per_minute = 100000
WHERE tier = 'pro' AND llm_requests_per_minute = 10;

-- Enterprise tier: 60 requests/min, unlimited tokens (-1)
UPDATE plans
SET llm_requests_per_minute = 60, llm_tokens_per_minute = -1
WHERE tier = 'enterprise' AND llm_requests_per_minute = 10;

-- Add comment to columns for documentation
COMMENT ON COLUMN plans.llm_requests_per_minute IS 'Maximum LLM requests per minute (-1 for unlimited)';
COMMENT ON COLUMN plans.llm_tokens_per_minute IS 'Maximum LLM tokens per minute (-1 for unlimited)';

-- Verify migration
SELECT name, tier, llm_requests_per_day, llm_requests_per_minute, llm_tokens_per_minute
FROM plans
ORDER BY
    CASE tier
        WHEN 'free' THEN 1
        WHEN 'pro' THEN 2
        WHEN 'enterprise' THEN 3
        ELSE 4
    END;
