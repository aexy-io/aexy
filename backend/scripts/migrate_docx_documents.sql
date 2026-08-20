-- A Word document as a first-class Aexy document.
--
-- Model: src/aexy/models/documentation.py (Document, DocumentVersion)
--
-- Why a discriminator rather than a second table. Everything that makes the
-- Docs module worth having is attached to `documents`: the space and parent
-- tree, visibility and collaborator permissions, favourites, comments anchored
-- into the body, version history, and the AI proposed-edit review gate. A
-- parallel `docx_documents` table would have to reproduce all of it, and every
-- one of those features would then need to know which table it was looking at.
-- One column and the bytes in object storage means a .docx inherits the whole
-- module instead.
--
-- Why the bytes are not in the database. A .docx is an opaque zip that only the
-- editor's own engine can read or write losslessly; there is nothing to query
-- inside it, and documents routinely run to several megabytes. `content_text`
-- carries the extracted Markdown, which is what search, embeddings and the
-- knowledge graph actually read — so those keep working for a Word document
-- with no change at all.
--
-- Why `content` stays NOT NULL. Backfilling every existing row to nullable
-- would touch the whole table to express something no caller wants to know.
-- A docx row holds `{}` there, and `content_format` is how a reader knows that
-- emptiness is the format rather than a lost document.

-- ── documents ────────────────────────────────────────────────────────────────

ALTER TABLE documents
    -- 'tiptap' | 'docx'. Defaulted, so every existing row is correct without a
    -- backfill and any writer that predates this column keeps working.
    ADD COLUMN IF NOT EXISTS content_format VARCHAR(20) NOT NULL DEFAULT 'tiptap',

    -- Object-storage key of the current bytes: documents/{id}/current.docx.
    -- Nullable because a tiptap document has none, and because a docx row is
    -- inserted before its upload is confirmed.
    ADD COLUMN IF NOT EXISTS docx_storage_key VARCHAR(1024),

    -- Denormalised so a listing can show a size without a HEAD per row.
    ADD COLUMN IF NOT EXISTS docx_size_bytes BIGINT,

    -- SHA-256 of the current bytes. The docx counterpart of
    -- compute_content_sha(content): it is what an AI proposed edit records as
    -- its base, so approving a stale proposal is detected rather than silently
    -- overwriting an edit the author made in the meantime.
    ADD COLUMN IF NOT EXISTS docx_content_sha VARCHAR(64);

-- Only two values are meaningful, and a typo here would route a document to a
-- renderer that cannot read it — which surfaces as a blank page, not an error.
ALTER TABLE documents
    DROP CONSTRAINT IF EXISTS ck_documents_content_format;
ALTER TABLE documents
    ADD CONSTRAINT ck_documents_content_format
    CHECK (content_format IN ('tiptap', 'docx'));

-- A docx document without its bytes is unreadable, so the pair is enforced
-- rather than left to the service layer. NOT VALID: existing rows are all
-- 'tiptap' and trivially satisfy it, and this skips the full-table scan.
ALTER TABLE documents
    DROP CONSTRAINT IF EXISTS ck_documents_docx_has_key;
ALTER TABLE documents
    ADD CONSTRAINT ck_documents_docx_has_key
    CHECK (content_format <> 'docx' OR docx_storage_key IS NOT NULL)
    NOT VALID;

-- The docs tree, sidebar and space listings all filter by workspace and then
-- branch on format to pick a renderer.
CREATE INDEX IF NOT EXISTS ix_documents_workspace_format
    ON documents (workspace_id, content_format);

-- ── document_versions ────────────────────────────────────────────────────────
--
-- Version history has to work for a Word document or "restore" is a button that
-- silently does nothing. Each saved version is its own immutable object at
-- documents/{document_id}/versions/{version_number}.docx, so restoring is a
-- copy rather than a diff replay — the only approach that is correct for a
-- format this module does not itself parse.

ALTER TABLE document_versions
    ADD COLUMN IF NOT EXISTS content_format VARCHAR(20) NOT NULL DEFAULT 'tiptap',
    ADD COLUMN IF NOT EXISTS docx_storage_key VARCHAR(1024),
    ADD COLUMN IF NOT EXISTS docx_size_bytes BIGINT;

ALTER TABLE document_versions
    DROP CONSTRAINT IF EXISTS ck_document_versions_content_format;
ALTER TABLE document_versions
    ADD CONSTRAINT ck_document_versions_content_format
    CHECK (content_format IN ('tiptap', 'docx'));

ALTER TABLE document_versions
    DROP CONSTRAINT IF EXISTS ck_document_versions_docx_has_key;
ALTER TABLE document_versions
    ADD CONSTRAINT ck_document_versions_docx_has_key
    CHECK (content_format <> 'docx' OR docx_storage_key IS NOT NULL)
    NOT VALID;

-- ── provenance ───────────────────────────────────────────────────────────────
--
-- A docx Document is often promoted from a file already sitting in Drive.
-- Recording which one keeps the two views of the same document connected, so
-- Drive can link to the editor rather than offering a stale download of bytes
-- that have since been edited somewhere else.

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS source_drive_file_id UUID
        REFERENCES drive_files(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_documents_source_drive_file
    ON documents (source_drive_file_id)
    WHERE source_drive_file_id IS NOT NULL;
