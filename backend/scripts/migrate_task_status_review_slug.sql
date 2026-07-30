-- Rescue tasks that vanished from the board.
--
-- The seeded status row for the review state is `in_review`
-- (task_config_service.DEFAULT_STATUSES), but the shared UI status map, the
-- keyboard shortcut and several hardcoded lists all say `review`. The kanban
-- builds its columns from the seeded slugs and buckets tasks by
-- `sprint_tasks.status`, so a task stored as `review` landed in a bucket no
-- column reads — it disappeared from the board entirely rather than showing up
-- in the wrong place.
--
-- `canonical_status_slug` now normalises on write. This fixes the rows written
-- before that existed.
--
-- Deliberately per-workspace: a workspace whose status set genuinely uses
-- `review` is already correct and must not be touched. Only rows whose own
-- workspace has an active `in_review` status (and no `review` one) are moved.

UPDATE sprint_tasks t
SET status = 'in_review'
WHERE t.status = 'review'
  AND EXISTS (
      SELECT 1 FROM workspace_task_statuses s
      WHERE s.workspace_id = t.workspace_id
        AND s.slug = 'in_review'
        AND s.is_active
  )
  AND NOT EXISTS (
      SELECT 1 FROM workspace_task_statuses s
      WHERE s.workspace_id = t.workspace_id
        AND s.slug = 'review'
        AND s.is_active
  );

-- Same correction for the history rows, so the timeline doesn't show a move to
-- a status the board has never heard of.
--
-- BOTH sides of each transition, not just new_value: rewriting only the
-- destination leaves a later row reading "review -> done" right after an
-- earlier one reading "todo -> in_review", i.e. a jump through a status that
-- no longer exists.
UPDATE task_activities a
SET new_value = CASE WHEN a.new_value = 'review' THEN 'in_review' ELSE a.new_value END,
    old_value = CASE WHEN a.old_value = 'review' THEN 'in_review' ELSE a.old_value END
WHERE a.field_name = 'status'
  AND (a.new_value = 'review' OR a.old_value = 'review')
  AND EXISTS (
      SELECT 1
      FROM sprint_tasks t
      JOIN workspace_task_statuses s ON s.workspace_id = t.workspace_id
      WHERE t.id = a.task_id
        AND s.slug = 'in_review'
        AND s.is_active
  );

-- WIP limits are stored in sprints.settings->'wip_limits', keyed by status slug,
-- and read back by slug in api/sprint_tasks.py::get_wip_limits. A limit set on
-- `review` silently stops applying once the board's column is `in_review` —
-- no error, the cap just never triggers again. Re-key it.
UPDATE sprints sp
SET settings = jsonb_set(
        sp.settings #- '{wip_limits,review}',
        '{wip_limits,in_review}',
        sp.settings #> '{wip_limits,review}'
    )
WHERE sp.settings #> '{wip_limits,review}' IS NOT NULL
  -- Don't clobber a limit already set on the canonical key.
  AND sp.settings #> '{wip_limits,in_review}' IS NULL
  AND EXISTS (
      SELECT 1 FROM workspace_task_statuses s
      WHERE s.workspace_id = sp.workspace_id
        AND s.slug = 'in_review'
        AND s.is_active
  );
