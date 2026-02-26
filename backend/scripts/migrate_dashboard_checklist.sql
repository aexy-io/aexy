-- Add checklist progress fields to dashboard_preferences table
-- Tracks getting-started checklist completion server-side

ALTER TABLE dashboard_preferences
    ADD COLUMN IF NOT EXISTS checklist_progress JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE dashboard_preferences
    ADD COLUMN IF NOT EXISTS checklist_dismissed BOOLEAN NOT NULL DEFAULT false;
