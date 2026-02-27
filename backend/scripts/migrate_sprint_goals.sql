-- Migration: Add contributes_to_goal column to sprint_tasks
-- This enables sprint goal tracking by linking individual tasks to the sprint goal

ALTER TABLE sprint_tasks ADD COLUMN IF NOT EXISTS contributes_to_goal BOOLEAN NOT NULL DEFAULT FALSE;
