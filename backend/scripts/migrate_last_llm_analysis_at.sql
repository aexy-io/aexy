-- Migration: Add last_llm_analysis_at to developers table
-- This column tracks when a developer's profile was last analyzed by LLM

ALTER TABLE developers
ADD COLUMN IF NOT EXISTS last_llm_analysis_at TIMESTAMP WITH TIME ZONE;
