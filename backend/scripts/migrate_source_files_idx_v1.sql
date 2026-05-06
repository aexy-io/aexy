-- Migration: Covering indexes for the workspace-wide source-files browse
-- endpoint (`GET /workspaces/{ws}/source-files?source_type=...`).
--
-- The endpoint runs three per-source queries:
--
--   drive_file:        SELECT … FROM drive_files
--                      WHERE workspace_id = $1 AND deleted_at IS NULL AND kind <> 'folder'
--                      ORDER BY uploaded_at DESC LIMIT N
--
--   task_attachment:   SELECT ta.* FROM task_attachments ta
--                      JOIN sprint_tasks st ON st.id = ta.task_id
--                      WHERE st.workspace_id = $1
--                      ORDER BY ta.uploaded_at DESC LIMIT N
--
--   compliance_doc:    already has idx_compliance_documents_created
--                      (workspace_id, created_at DESC) — no work needed.
--
-- The drive_file query has `idx_drive_files_workspace_parent` (partial on
-- deleted_at IS NULL) — covers the WHERE but forces a sort step. The
-- task_attachment query has separate single-column indexes — they cover
-- the join lookup but not the ORDER BY, so PG sorts the join result.
--
-- Both are fine until a workspace accumulates tens of thousands of rows.
-- Adding composite (key, uploaded_at DESC) lets PG do an index-ordered
-- scan and skip the sort. Cheap to ship; benign on small workspaces.

-- ─── Drive files ──────────────────────────────────────────────────────────
-- Partial index — folders and soft-deleted rows are excluded by the same
-- predicate the endpoint uses, so the index covers the exact scan.
CREATE INDEX IF NOT EXISTS idx_drive_files_workspace_uploaded
    ON drive_files(workspace_id, uploaded_at DESC)
    WHERE deleted_at IS NULL AND kind <> 'folder';

-- ─── Task attachments ─────────────────────────────────────────────────────
-- Composite on (task_id, uploaded_at DESC) so the merge-style join from
-- sprint_tasks can pull attachments already sorted per task. The existing
-- single-column idx_task_attachments_task_id remains for plain lookups.
CREATE INDEX IF NOT EXISTS idx_task_attachments_task_uploaded
    ON task_attachments(task_id, uploaded_at DESC);

SELECT 'Migration complete: source_files_idx_v1 (drive_files + task_attachments composite uploaded_at indexes)' AS status;
