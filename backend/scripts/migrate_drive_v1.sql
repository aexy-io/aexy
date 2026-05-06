-- Migration: Drive (collaborative file storage) + per-plan storage limits
-- + smart views.
--
-- AI metadata (summary, tags, categories), embeddings, and video annotations
-- live on the polymorphic `file_metadata` schema (see migrate_file_metadata_v1.sql)
-- — not on drive_files. drive_files just holds the folder hierarchy + file
-- pointer.
--
-- Adds:
--   plans.max_storage_gb               (with sensible per-tier defaults)
--   workspace_plan_overrides.max_storage_gb
--   drive_files                        (folder hierarchy + file pointer)
--   drive_smart_views                  (filter-based virtual folders)

-- ─── Extensions ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Plan limit columns ────────────────────────────────────────────────────
ALTER TABLE plans
    ADD COLUMN IF NOT EXISTS max_storage_gb INTEGER NOT NULL DEFAULT 5;

ALTER TABLE workspace_plan_overrides
    ADD COLUMN IF NOT EXISTS max_storage_gb INTEGER;

-- Backfill per-tier defaults. -1 = unlimited.
UPDATE plans SET max_storage_gb = CASE tier
    WHEN 'free'             THEN 5
    WHEN 'pro'              THEN 100
    WHEN 'enterprise'       THEN -1
    WHEN 'flat_plus_usage'  THEN 500
    WHEN 'postpaid'         THEN -1
    ELSE max_storage_gb
END
WHERE max_storage_gb = 5;  -- only touch rows still on the post-ALTER default

-- ─── Drive files (folder hierarchy + file pointer) ────────────────────────
CREATE TABLE IF NOT EXISTS drive_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES drive_files(id) ON DELETE CASCADE,
    space_id UUID REFERENCES document_spaces(id) ON DELETE SET NULL,

    -- File / folder metadata
    file_name VARCHAR(500) NOT NULL,
    file_url VARCHAR(2000),                   -- NULL for folders
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    content_type VARCHAR(255),
    kind VARCHAR(20) NOT NULL DEFAULT 'file', -- file | folder | image | video | audio | pdf | doc

    -- Provenance
    uploaded_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE       -- soft delete
);

CREATE INDEX IF NOT EXISTS ix_drive_files_workspace_parent
    ON drive_files(workspace_id, parent_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_drive_files_workspace_kind
    ON drive_files(workspace_id, kind) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_drive_files_uploaded_by
    ON drive_files(uploaded_by_id);

-- ─── Smart Views (filter overlay; no actual moves) ────────────────────────
CREATE TABLE IF NOT EXISTS drive_smart_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    icon VARCHAR(64),
    color VARCHAR(32),
    -- filter_query examples:
    --   {"all_tags": ["invoice"]}
    --   {"any_categories": ["financial", "legal"], "kind": "pdf"}
    -- Tag/category matches resolve against file_metadata, not drive_files.
    filter_query JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_shared BOOLEAN NOT NULL DEFAULT FALSE,
    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_drive_smart_views_workspace
    ON drive_smart_views(workspace_id);

SELECT 'Migration complete: drive_v1 (storage limits + drive files + smart views)' AS status;
