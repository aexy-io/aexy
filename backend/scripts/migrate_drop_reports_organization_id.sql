-- Drop `custom_reports.organization_id`.
--
-- It was never a tenant. `Organization` in this product is a **GitHub**
-- organization — `organizations.github_id`, `login`, synced from GitHub — so
-- two workspaces could share one and a workspace with no GitHub connection had
-- none at all. Scoping report visibility by it could not work, and did not: the
-- branch that tried was unreachable, which is why a report marked public never
-- appeared in a colleague's listing while fetching it by id returned it.
--
-- `workspace_id` is the tenant now (migrate_reports_workspace_scope.sql), every
-- query filters on it, and no code has read or written this column since the
-- report paths were cleaned up. Production was checked before this was written:
-- zero rows carried a value.
--
-- The column had no foreign key, unlike `repositories.organization_id` and
-- `developer_organizations.organization_id`, which are real relationships and
-- are not touched here. Neither are the other loose `organization_id` columns
-- on assessments, career_roles, question_bank or hiring_requirements — those
-- modules use the concept as designed.

-- Refuse rather than destroy. The production count was zero when this was
-- written; if something has written to the column since, that is a fact worth
-- knowing before the column disappears, and a failed migration is a much
-- cheaper way to learn it than a restore.
DO $$
DECLARE
    populated bigint;
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'custom_reports' AND column_name = 'organization_id'
    ) THEN
        EXECUTE 'SELECT count(*) FROM custom_reports WHERE organization_id IS NOT NULL'
            INTO populated;

        IF populated > 0 THEN
            RAISE EXCEPTION
                'custom_reports.organization_id has % non-null row(s); not dropping. '
                'Decide what those rows mean before this migration runs.', populated;
        END IF;
    END IF;
END $$;

ALTER TABLE custom_reports DROP COLUMN IF EXISTS organization_id;

SELECT 'custom_reports.organization_id dropped' AS status;
