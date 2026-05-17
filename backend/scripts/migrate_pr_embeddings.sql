-- PR embeddings for similarity search (Phase 3).
--
-- Stores one vector per pull request. Used by:
--   * GET /code-insights/pull-requests/{id}/similar
--   * Repo-health composer (cluster PR descriptions to surface recurring themes)
--
-- Dim 1024 keeps us interchangeable between OpenRouter
-- `text-embedding-3-large@1024` and Ollama `bge-m3` (same convention as
-- file_embeddings).

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE pull_requests
    ADD COLUMN IF NOT EXISTS embedding vector(1024),
    ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(100),
    ADD COLUMN IF NOT EXISTS embedded_at TIMESTAMPTZ;

-- ivfflat with cosine distance — fine for ≤100k vectors per workspace.
-- Switch to HNSW if a single workspace's PR count grows past that.
CREATE INDEX IF NOT EXISTS ix_pull_requests_embedding_cosine
    ON pull_requests USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
