-- Migration: Polymorphic file metadata + chunk embeddings + video annotations.
--
-- Single source of truth for AI metadata across every file kind. Sources
-- (drive_file / task_attachment / compliance_document) are identified by
-- (source_type, source_id). file_embeddings and video_annotations FK into
-- file_metadata.id so a non-Drive video (e.g. a task attachment) can carry
-- annotations through the same machinery.
--
-- This migration creates the new schema only. There is no backfill from
-- legacy `drive_files.ai_*` columns / `drive_file_embeddings` /
-- `drive_video_annotations` tables — those never shipped to production.

BEGIN;

-- ─── file_metadata ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS file_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type VARCHAR(32) NOT NULL,
    source_id UUID NOT NULL,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- AI status pipeline
    ai_status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | processing | done | failed
    ai_error TEXT,
    ai_summary TEXT,
    ai_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    ai_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
    ai_processed_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Each source row gets at most one metadata row.
    UNIQUE (source_type, source_id)
);

CREATE INDEX IF NOT EXISTS ix_file_metadata_workspace
    ON file_metadata(workspace_id);
CREATE INDEX IF NOT EXISTS ix_file_metadata_pending
    ON file_metadata(ai_status)
    WHERE ai_status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS ix_file_metadata_tags_gin
    ON file_metadata USING GIN (ai_tags jsonb_path_ops);
CREATE INDEX IF NOT EXISTS ix_file_metadata_categories_gin
    ON file_metadata USING GIN (ai_categories jsonb_path_ops);

-- ─── file_embeddings ───────────────────────────────────────────────────────
-- Vector dim 1024 fits both OpenRouter text-embedding-3-large@1024 and
-- Ollama bge-m3. embedding_model lets us roll forward without dropping data.
CREATE TABLE IF NOT EXISTS file_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metadata_id UUID NOT NULL REFERENCES file_metadata(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding vector(1024) NOT NULL,
    embedding_model VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (metadata_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS ix_file_embeddings_metadata
    ON file_embeddings(metadata_id);

-- ivfflat with cosine distance — good for ≤100k vectors. Switch to HNSW when
-- the corpus grows past that.
CREATE INDEX IF NOT EXISTS ix_file_embeddings_cosine
    ON file_embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ─── video_annotations ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metadata_id UUID NOT NULL REFERENCES file_metadata(id) ON DELETE CASCADE,
    t_start_ms INTEGER NOT NULL,
    t_end_ms INTEGER NOT NULL,
    label VARCHAR(255) NOT NULL,
    description TEXT,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    confidence REAL,
    source VARCHAR(20) NOT NULL DEFAULT 'qwen',
    bbox JSONB,
    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_video_annotations_metadata_time
    ON video_annotations(metadata_id, t_start_ms);

COMMIT;

SELECT 'Migration complete: file_metadata + file_embeddings + video_annotations' AS status;
