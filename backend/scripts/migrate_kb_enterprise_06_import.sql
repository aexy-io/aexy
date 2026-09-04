-- Knowledge Base — importing an exported wiki.
--
-- See prds/KNOWLEDGE_BASE_DEFERRED_PLAN.md §1.

CREATE TABLE IF NOT EXISTS document_import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    space_id UUID REFERENCES document_spaces(id) ON DELETE SET NULL,
    requested_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,

    source VARCHAR(20) NOT NULL,          -- notion | confluence | markdown
    archive_key VARCHAR(1024) NOT NULL,
    archive_name VARCHAR(500),

    -- pending | scanning | importing | completed | partial | failed
    --
    -- `partial` is a terminal state, not a failure mode. One page that will not
    -- convert must not roll back the four thousand that did; the job finishes,
    -- says which pages failed and why, and the operator retries those.
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    total_pages INTEGER NOT NULL DEFAULT 0,
    imported_pages INTEGER NOT NULL DEFAULT 0,
    failed_pages INTEGER NOT NULL DEFAULT 0,

    -- source page id -> created document id.
    --
    -- The output of pass one. Import is two passes because a wiki is mostly
    -- forward references: converting bodies in one pass leaves every link to a
    -- not-yet-created page resolving to nothing, which is the majority of them.
    --
    -- It is also what makes a re-run resume rather than duplicate. The first
    -- attempt at a large migration usually fails on something, and an importer
    -- that starts from zero on retry turns one bad page into four thousand
    -- duplicates.
    id_map JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Per-page conversion notes, so a lossy page is visible rather than
    -- silently wrong.
    warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
    error TEXT,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS ix_document_import_jobs_workspace_status
    ON document_import_jobs (workspace_id, status);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_document_import_jobs_source'
    ) THEN
        ALTER TABLE document_import_jobs
            ADD CONSTRAINT ck_document_import_jobs_source
            CHECK (source IN ('notion', 'confluence', 'markdown'));
    END IF;
END $$;
