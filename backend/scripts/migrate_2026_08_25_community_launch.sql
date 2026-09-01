-- Migration: community forum — parity features, opt-in module links, reactions.
--
-- Every column added here defaults to false or null, so an existing community
-- behaves exactly as it did before the migration ran. Nothing becomes visible,
-- postable, or cross-linked because this migration was applied.

-- ── workspace_community: new switches ────────────────────────────────
--
-- allow_new_topics is separate from allow_participation on purpose: replying in
-- a thread the host opened and opening one yourself are different amounts of
-- trust. link_* gate publishing content authored elsewhere (a customer's ticket,
-- a doc) onto a public page — never a default.

ALTER TABLE workspace_community
    ADD COLUMN IF NOT EXISTS allow_new_topics BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE workspace_community
    ADD COLUMN IF NOT EXISTS link_service_desk BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE workspace_community
    ADD COLUMN IF NOT EXISTS link_docs BOOLEAN NOT NULL DEFAULT FALSE;

-- ── chat_topics: accepted answer ─────────────────────────────────────
--
-- No REFERENCES clause: chat_topics.last_message_id already points into
-- chat_messages without one, because chat_messages.topic_id points back and a
-- real constraint in both directions closes a cycle that SQLAlchemy can only
-- create via a post-hoc ALTER TABLE (which SQLite, the test backend, cannot
-- run). The application validates the id belongs to the topic before storing it.

ALTER TABLE chat_topics
    ADD COLUMN IF NOT EXISTS accepted_message_id UUID;

-- ── chat_message_reactions ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_message_reactions (
    id UUID PRIMARY KEY,
    message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    emoji VARCHAR(16) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_chat_message_reaction UNIQUE (message_id, developer_id, emoji)
);

CREATE INDEX IF NOT EXISTS ix_chat_message_reactions_message_id
    ON chat_message_reactions (message_id);

CREATE INDEX IF NOT EXISTS ix_chat_message_reactions_developer_id
    ON chat_message_reactions (developer_id);

-- ── Search indexes ───────────────────────────────────────────────────
--
-- The public search endpoint matches with ILIKE rather than tsvector, because
-- the test suite runs on SQLite in-memory where to_tsvector does not exist and
-- a query the tests cannot execute is a query nobody checks. Trigram GIN
-- indexes are what make a leading-wildcard ILIKE usable at size, so Postgres
-- still gets an index scan for the same SQL the tests run.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS ix_chat_topics_name_trgm
    ON chat_topics USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS ix_chat_messages_content_trgm
    ON chat_messages USING gin (content gin_trgm_ops);

-- Public message listing walks a topic in creation order while filtering the
-- redaction flags; without this it is a per-topic scan on a table that only
-- grows.
CREATE INDEX IF NOT EXISTS ix_chat_messages_topic_created
    ON chat_messages (topic_id, created_at);

-- ── documents: the community thread discussing a document ────────────
--
-- SET NULL, not CASCADE: deleting a discussion thread must not delete the
-- document it was about.

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS community_topic_id UUID
    REFERENCES chat_topics(id) ON DELETE SET NULL;
