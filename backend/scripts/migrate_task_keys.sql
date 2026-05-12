-- Per-workspace human-readable task identifiers.
--
-- Adds:
--   - sprint_tasks.task_key (int, nullable). Combined with
--     workspaces.slug this forms the shareable identifier rendered
--     as `[{slug}:{task_key}]` (e.g. `[aexy:42]`) used for copy
--     links from the kanban board and for auto-linking GitHub
--     PRs/issues whose titles contain that pattern.
--   - workspaces.next_task_key (int, default 1). Monotonic counter.
--     New tasks consume it via
--       UPDATE workspaces SET next_task_key = next_task_key + 1
--       WHERE id = $1 RETURNING next_task_key;
--     in the same transaction as the SprintTask insert.
--
-- Backfill assigns task_keys to every existing task per workspace,
-- in created_at order, starting from 1. Tasks with no workspace_id
-- (legacy data) are skipped — they get no identifier.
--
-- Idempotent: re-running is safe. Columns are created only if
-- missing; backfill only fills rows where task_key IS NULL; the
-- workspace counter is set to MAX(task_key)+1 (or 1 if empty).

BEGIN;

-- 1. Columns ----------------------------------------------------------------

ALTER TABLE sprint_tasks
    ADD COLUMN IF NOT EXISTS task_key INTEGER;

CREATE INDEX IF NOT EXISTS ix_sprint_tasks_task_key
    ON sprint_tasks (task_key);

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS next_task_key INTEGER NOT NULL DEFAULT 1;

-- 2. Backfill existing tasks ------------------------------------------------

WITH numbered AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY workspace_id
            ORDER BY created_at, id
        ) AS rn
    FROM sprint_tasks
    WHERE workspace_id IS NOT NULL
      AND task_key IS NULL
)
UPDATE sprint_tasks t
SET task_key = numbered.rn
FROM numbered
WHERE t.id = numbered.id;

-- 3. Initialize per-workspace counters --------------------------------------

UPDATE workspaces w
SET next_task_key = COALESCE(sub.max_key, 0) + 1
FROM (
    SELECT workspace_id, MAX(task_key) AS max_key
    FROM sprint_tasks
    WHERE workspace_id IS NOT NULL
      AND task_key IS NOT NULL
    GROUP BY workspace_id
) sub
WHERE w.id = sub.workspace_id;

-- 4. Uniqueness constraint --------------------------------------------------
-- One task_key per workspace. Nullable task_keys do not violate
-- this in PostgreSQL because NULLs are treated as distinct.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_sprint_task_workspace_key'
    ) THEN
        ALTER TABLE sprint_tasks
            ADD CONSTRAINT uq_sprint_task_workspace_key
            UNIQUE (workspace_id, task_key);
    END IF;
END $$;

COMMIT;
