-- Migration: Phase 2B Outreach Excellence
-- Adds A/B variant tracking, reply threading, and recipient timezone support.

-- 1. Add variant_index and thread_id to outreach_step_executions
ALTER TABLE outreach_step_executions
    ADD COLUMN IF NOT EXISTS variant_index INTEGER,
    ADD COLUMN IF NOT EXISTS thread_id VARCHAR(255);

-- 2. Add recipient_timezone to outreach_enrollments
ALTER TABLE outreach_enrollments
    ADD COLUMN IF NOT EXISTS recipient_timezone VARCHAR(50);
