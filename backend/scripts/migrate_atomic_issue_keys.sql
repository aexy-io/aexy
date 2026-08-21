-- Per-workspace issue keys, allocated atomically instead of counted.
--
-- Model: src/aexy/models/workspace.py (the three `next_*` counters)
--        src/aexy/models/bug.py, src/aexy/models/story.py (the listeners)
--        src/aexy/services/ticket_service.py (_get_next_ticket_number)
--
-- The bug: three key generators read a number in one statement and wrote it in
-- another —
--
--   bugs      SELECT count(*) + 1   →  BUG-004
--   stories   SELECT count(*) + 1   →  STORY-004
--   tickets   SELECT max(*) + 1     →  #4
--
-- so two concurrent creates read the same number and both used it. `tickets` has
-- a unique constraint on (workspace_id, ticket_number), so it surfaced there as
-- an IntegrityError — a 500 on a public form. Bugs and stories had no such
-- constraint, so the duplicate was silent: two rows both called BUG-004, and
-- every link to "BUG-004" thereafter ambiguous.
--
-- The fix is the mechanism this codebase already uses for `SprintTask.task_key`:
-- an UPDATE...RETURNING against a counter on the workspace row, which locks that
-- row so concurrent inserts serialize and get distinct values. Bugs and stories
-- do it in a `before_insert` listener so every creation path is covered without
-- each one having to remember.
--
-- Counting rows was also wrong independently of the race: a workspace that
-- deleted BUG-003 would hand the next bug BUG-003 again. The counter never
-- reuses.

-- ── the counters ─────────────────────────────────────────────────────────────

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS next_bug_key       INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS next_story_key     INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS next_ticket_number INTEGER NOT NULL DEFAULT 1;

-- Backfilled from the highest key already issued, NOT from a row count: a
-- workspace that has deleted an issue must not reissue its key. Parsed out of
-- the key string, because that is where the number actually lives.
--
-- `regexp_replace` rather than a cast of the whole key: a key an operator typed
-- by hand ("BUG-legacy") would otherwise abort the migration, and one odd row is
-- not a reason to refuse to deploy. Such a key contributes 0 and is skipped.
UPDATE workspaces w
   SET next_bug_key = GREATEST(
       w.next_bug_key,
       COALESCE((
           SELECT MAX(NULLIF(regexp_replace(b.key, '\D', '', 'g'), '')::INTEGER)
             FROM bugs b
            WHERE b.workspace_id = w.id
       ), 0) + 1
   );

UPDATE workspaces w
   SET next_story_key = GREATEST(
       w.next_story_key,
       COALESCE((
           SELECT MAX(NULLIF(regexp_replace(s.key, '\D', '', 'g'), '')::INTEGER)
             FROM user_stories s
            WHERE s.workspace_id = w.id
       ), 0) + 1
   );

UPDATE workspaces w
   SET next_ticket_number = GREATEST(
       w.next_ticket_number,
       COALESCE((
           SELECT MAX(t.ticket_number) FROM tickets t WHERE t.workspace_id = w.id
       ), 0) + 1
   );

-- ── the safety net ───────────────────────────────────────────────────────────
--
-- `tickets` already had this on (workspace_id, ticket_number), which is why its
-- version of the bug was loud. Bugs and stories had nothing, so the allocator
-- was the only thing standing between a duplicate key and a database that
-- believed it.
--
-- Added last, and guarded: a workspace that already carries duplicates from the
-- old code cannot have a unique index created over them. Rather than fail the
-- deploy or silently rename somebody's issue key — which would break every
-- link and mention of it — this reports exactly what collides and leaves the
-- index off. Fix the data, then re-run.
DO $$
DECLARE
    dupes TEXT;
BEGIN
    SELECT string_agg(format('%s/%s (x%s)', workspace_id, key, n), ', ')
      INTO dupes
      FROM (
          SELECT workspace_id, key, COUNT(*) AS n
            FROM bugs
           GROUP BY workspace_id, key
          HAVING COUNT(*) > 1
      ) d;

    IF dupes IS NULL THEN
        CREATE UNIQUE INDEX IF NOT EXISTS uq_bugs_workspace_key
            ON bugs (workspace_id, key);
    ELSE
        RAISE WARNING
            'bugs: duplicate keys exist, so uq_bugs_workspace_key was NOT created. Resolve then re-run. Duplicates: %',
            dupes;
    END IF;
END $$;

DO $$
DECLARE
    dupes TEXT;
BEGIN
    SELECT string_agg(format('%s/%s (x%s)', workspace_id, key, n), ', ')
      INTO dupes
      FROM (
          SELECT workspace_id, key, COUNT(*) AS n
            FROM user_stories
           GROUP BY workspace_id, key
          HAVING COUNT(*) > 1
      ) d;

    IF dupes IS NULL THEN
        CREATE UNIQUE INDEX IF NOT EXISTS uq_user_stories_workspace_key
            ON user_stories (workspace_id, key);
    ELSE
        RAISE WARNING
            'user_stories: duplicate keys exist, so uq_user_stories_workspace_key was NOT created. Resolve then re-run. Duplicates: %',
            dupes;
    END IF;
END $$;
