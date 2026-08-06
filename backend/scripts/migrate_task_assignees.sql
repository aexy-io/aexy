-- Multiple people on one task.
--
-- A task had exactly one `assignee_id`, so work with more than one name on it
-- (a pair, a dev plus the reviewer who owns the follow-up, an ops handover) had
-- to either reassign — losing who else was involved — or write the second name
-- into the description, where no filter or report can see it.
--
-- `task_assignees` holds everyone. `is_primary` marks the one accountable
-- owner and is mirrored back to `sprint_tasks.assignee_id`, which stays the
-- single source of truth for everything that must resolve to one developer
-- (board grouping, workload and velocity attribution, notifications,
-- auto-assignment, and ~250 call sites). Nothing that reads `assignee_id`
-- needed to change.

CREATE TABLE IF NOT EXISTS task_assignees (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL
        REFERENCES sprint_tasks(id) ON DELETE CASCADE,
    -- CASCADE, not SET NULL: a row here *is* the assignment. A removed
    -- developer should drop off the task, not linger as a nameless slot.
    developer_id UUID NOT NULL
        REFERENCES developers(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    added_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_task_assignee UNIQUE (task_id, developer_id)
);

CREATE INDEX IF NOT EXISTS ix_task_assignees_task
    ON task_assignees (task_id);

-- Backs "tasks I'm on", including as a collaborator.
CREATE INDEX IF NOT EXISTS ix_task_assignees_developer
    ON task_assignees (developer_id);

-- At most one primary per task. Without this the mirror to
-- `sprint_tasks.assignee_id` would depend on row order, so which of two
-- primaries won would vary between reads.
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_assignees_one_primary
    ON task_assignees (task_id)
    WHERE is_primary;

-- Backfill. Every already-assigned task gets its current assignee as primary.
--
-- This is the load-bearing part: the new UI reads `assignees`, so without it
-- every existing task in every workspace would render with nobody on it while
-- `assignee_id` still held a name. Reassigning them by hand is not a migration
-- path anyone would accept.
--
-- ON CONFLICT makes the whole file idempotent — safe to re-run after a partial
-- apply, and safe on a database where the table already exists with rows.
INSERT INTO task_assignees (id, task_id, developer_id, is_primary, added_by_id, created_at)
SELECT
    gen_random_uuid(),
    t.id,
    t.assignee_id,
    TRUE,
    NULL,          -- nobody recorded who did the original assignment
    COALESCE(t.created_at, NOW())
FROM sprint_tasks t
WHERE t.assignee_id IS NOT NULL
ON CONFLICT (task_id, developer_id) DO NOTHING;
