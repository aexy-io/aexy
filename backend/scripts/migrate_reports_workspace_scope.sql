-- Reports belong to a workspace, not only to whoever made them.
--
-- `custom_reports` had `creator_id` and an `organization_id` that no caller
-- ever set — 0 rows carried one — so the module was the one place in the
-- product where a request named no tenant. That made it unreachable by the app
-- gate (there was no workspace whose toggle could apply) and left listing to
-- lean on the creator alone.
--
-- The column is nullable on purpose. Rows written before this migration have
-- no workspace to attribute them to, and guessing one from the creator's
-- membership would move somebody's saved report into a workspace they happen
-- to belong to. They stay unattributed and stay reachable by their creator,
-- which is exactly what they were.

ALTER TABLE custom_reports
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ix_custom_reports_workspace_id
    ON custom_reports (workspace_id);

-- The listing filters on (workspace_id, creator_id) together on every read.
CREATE INDEX IF NOT EXISTS ix_custom_reports_workspace_creator
    ON custom_reports (workspace_id, creator_id);

SELECT 'custom_reports is workspace-scoped' AS status;
