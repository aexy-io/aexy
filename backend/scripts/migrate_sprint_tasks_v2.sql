-- Migration: Add project-level task support to sprint_tasks table
-- This allows tasks to exist without being tied to a specific sprint

-- Add new columns for project-level tasks
ALTER TABLE sprint_tasks
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS description_json JSONB,
ADD COLUMN IF NOT EXISTS mentioned_user_ids JSONB DEFAULT '[]'::jsonb NOT NULL,
ADD COLUMN IF NOT EXISTS mentioned_file_paths JSONB DEFAULT '[]'::jsonb NOT NULL;

-- Make sprint_id nullable (if not already)
ALTER TABLE sprint_tasks ALTER COLUMN sprint_id DROP NOT NULL;

-- Create indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_sprint_tasks_team_id ON sprint_tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_sprint_tasks_workspace_id ON sprint_tasks(workspace_id);

-- Backfill team_id and workspace_id for existing tasks
UPDATE sprint_tasks st
SET
    team_id = s.team_id,
    workspace_id = t.workspace_id
FROM sprints s
JOIN teams t ON s.team_id = t.id
WHERE st.sprint_id = s.id
  AND st.team_id IS NULL;

-- Add notification event type if not exists
-- Note: This assumes notification_preferences uses JSONB for default preferences
-- If TASK_MENTIONED is not in your notification_event_type enum, you may need to add it

SELECT 'Migration complete. Run this in your PostgreSQL database.' AS status;
