-- A board can say which Service Desk bucket its work is pending with.
--
-- `teams.department_id` has existed since the org layer landed, with a comment
-- saying it is the rollup that "already exists" — but nothing except the bulk
-- org mirror ever wrote it, and no API exposed it. So in practice every board
-- rolled up to no department, and a ticket converted to a task on the
-- engineering board stayed pending with whoever had it before.
--
-- Resolution is board -> department -> `departments.function_key` ->
-- `service_desk_stakeholders.function_key`. That chain needs no new column; it
-- needs `department_id` to be settable, which is an API change, not a schema
-- one.
--
-- This adds only the override: the board whose owner the org chart cannot
-- express (a shared triage board two departments feed). It is a slug rather
-- than a foreign key for the same reason `tickets.pending_with` is one — a
-- retired bucket must neither be erased from history nor be impossible to
-- retire. Writes are validated against the workspace's own active buckets in
-- the service layer.

ALTER TABLE teams ADD COLUMN IF NOT EXISTS desk_stakeholder_slug VARCHAR(64);

-- Nothing to backfill: an unset override means "resolve through the
-- department", which is the behaviour every existing board should keep.

-- Partial, because the override is the rare case — a full index would be almost
-- entirely NULLs. Supports "which boards override their department", which is
-- the question the settings page asks.
CREATE INDEX IF NOT EXISTS ix_teams_desk_stakeholder_slug
    ON teams (workspace_id, desk_stakeholder_slug)
    WHERE desk_stakeholder_slug IS NOT NULL;

-- `department_id` is already indexed and already has its FK
-- (ON DELETE SET NULL, so deleting a department un-routes its boards rather
-- than deleting them). Asserted rather than created, so a database missing the
-- org migration fails here loudly instead of at the first conversion.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'teams' AND column_name = 'department_id'
    ) THEN
        RAISE EXCEPTION
            'teams.department_id is missing — run the organization migration first';
    END IF;
END $$;
