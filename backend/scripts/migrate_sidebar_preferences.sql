-- Migration: Add sidebar preferences columns to dashboard_preferences
-- Adds page visit tracking and pinned items for personalized sidebar

ALTER TABLE dashboard_preferences
    ADD COLUMN IF NOT EXISTS sidebar_page_visits JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE dashboard_preferences
    ADD COLUMN IF NOT EXISTS sidebar_pinned_items JSONB NOT NULL DEFAULT '[]'::jsonb;
