-- Migration: track which review-cycle deadline reminders have already
-- fired so the daily `check_review_deadlines` Temporal activity is
-- idempotent across re-runs and worker restarts.
--
-- Shape: { "self_review:7": "2026-05-11T06:22:14Z", "peer_review:1": "..." }
-- Keys are <phase>:<days_before_deadline>. Presence == "already sent".
--
-- Idempotent: re-running is a no-op via IF NOT EXISTS.

ALTER TABLE review_cycles
    ADD COLUMN IF NOT EXISTS reminders_sent JSONB NOT NULL DEFAULT '{}'::jsonb;
