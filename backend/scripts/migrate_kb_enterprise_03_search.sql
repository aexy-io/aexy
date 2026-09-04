-- Knowledge Base — semantic search and version retention.
--
-- Documents were the one body of text in the workspace that keyword search
-- reached and semantic search did not: `file_embeddings` already indexed Drive
-- files, task attachments and compliance documents, and documents were simply
-- never registered as a source.
--
-- Keyed to documents.id rather than routed through file_metadata because that
-- pipeline resolves a source id to *bytes*, and a TipTap document has none.
-- Keying here also means the access predicate is a plain join to `documents`.
--
-- See prds/KNOWLEDGE_BASE_ENTERPRISE_PLAN.md §3 1.1 and 1.2.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS document_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,

    -- Denormalised so the vector search filters by workspace without a join on
    -- every candidate row.
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,

    -- 1024 to match file_embeddings, so one embedding model serves both and a
    -- workspace does not need two.
    embedding vector(1024) NOT NULL,
    embedding_model VARCHAR(100) NOT NULL,

    -- The sha of the body these chunks were built from. Re-embedding is skipped
    -- while it still matches — which matters because the collaborative editor
    -- flushes a document every few seconds while somebody is typing in it, and
    -- embedding is a paid call per chunk.
    content_sha VARCHAR(64) NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_document_embedding_chunk UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS ix_document_embeddings_document
    ON document_embeddings (document_id);

CREATE INDEX IF NOT EXISTS ix_document_embeddings_workspace
    ON document_embeddings (workspace_id);

-- HNSW over cosine distance, matching the operator the query uses. An IVFFlat
-- index would need training data this table does not have on day one.
CREATE INDEX IF NOT EXISTS ix_document_embeddings_vector
    ON document_embeddings USING hnsw (embedding vector_cosine_ops);

-- ============================================================================
-- document_versions: retention
-- ============================================================================
--
-- Every content change writes a full JSONB snapshot of the body, autosaves
-- included, with no dedup and no ceiling. These two columns are what the
-- retention sweep is forbidden to touch.

ALTER TABLE document_versions
    ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS label VARCHAR(120);

-- The sweep walks a document's versions newest-first.
CREATE INDEX IF NOT EXISTS ix_document_versions_document_created
    ON document_versions (document_id, created_at DESC);
