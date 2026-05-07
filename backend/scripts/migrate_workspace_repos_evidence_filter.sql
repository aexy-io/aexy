-- Tighten the workspace_repositories backfill from
-- migrate_workspace_team_repositories.sql to only keep adoptions where
-- there's evidence the workspace actually works on the repo.
--
-- The original backfill was too greedy: every active workspace member's
-- DeveloperRepository.is_enabled rows got adopted into every workspace
-- they belong to. A member in two workspaces dragged all of their
-- enabled repos into both, so personal repos and cross-workspace org
-- repos leaked into shared workspaces.
--
-- Evidence we accept (any one of these counts as "the workspace uses
-- this repo"):
--   - A pull_request whose `repository` (full_name) matches the repo,
--     authored by an active workspace member.
--   - A commit whose `repository` matches the repo, authored by an
--     active workspace member.
--   - A SprintTask whose source_url references the repo (covers
--     manually-imported issues / linked issues).
--   - last_sync_at IS NOT NULL (we've actually synced this repo into
--     the workspace before the cutover — preserve it).
--
-- Idempotent: safe to re-run. team_repositories cascades on delete
-- via the FK, so links pointing at the dropped workspace_repositories
-- disappear automatically.

WITH evidence AS (
    -- PR-author evidence
    SELECT DISTINCT
        wm.workspace_id,
        r.id AS repository_id
    FROM workspace_members wm
    JOIN pull_requests pr ON pr.developer_id = wm.developer_id
    JOIN repositories r ON r.full_name = pr.repository
    WHERE wm.status = 'active'

    UNION

    -- Commit-author evidence
    SELECT DISTINCT
        wm.workspace_id,
        r.id AS repository_id
    FROM workspace_members wm
    JOIN commits c ON c.developer_id = wm.developer_id
    JOIN repositories r ON r.full_name = c.repository
    WHERE wm.status = 'active'

    UNION

    -- Task-reference evidence: any sprint_task in this workspace whose
    -- source_url contains the repo's full_name. Heuristic but cheap
    -- and accurate for the github_issue / pull_request case where the
    -- URL is github.com/{owner}/{repo}/issues/{n} or .../pull/{n}.
    SELECT DISTINCT
        st.workspace_id,
        r.id AS repository_id
    FROM sprint_tasks st
    JOIN repositories r
        ON st.source_url ILIKE '%/' || r.full_name || '/%'
    WHERE st.workspace_id IS NOT NULL
)
DELETE FROM workspace_repositories wr
WHERE wr.last_sync_at IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM evidence e
      WHERE e.workspace_id = wr.workspace_id
        AND e.repository_id = wr.repository_id
  );
