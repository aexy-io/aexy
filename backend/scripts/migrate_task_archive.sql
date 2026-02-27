-- Add soft-delete (archive) support for sprint tasks
ALTER TABLE sprint_tasks ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index: fast lookups for non-archived tasks (the common query path)
CREATE INDEX IF NOT EXISTS idx_sprint_tasks_is_archived ON sprint_tasks (is_archived) WHERE is_archived = FALSE;
