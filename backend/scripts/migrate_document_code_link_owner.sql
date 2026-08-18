-- Give a document's code link an owner of its own.
--
-- The sync behaviour of a linked document was read from
-- `documents.created_by_id` — the person who wrote the prose. That is
-- usually not the person who wired the document to a repository, and after
-- a whole-repository run it is one person for every document in it, so a
-- single developer's plan tier silently governed an entire repository's
-- documentation. Worse, GitHub access resolved through that same developer,
-- so their departure stopped every one of those syncs.
--
-- ON DELETE SET NULL, deliberately: losing a developer must never delete the
-- link between a document and the code it describes. A null owner is an
-- orphaned sync, which the transfer path repairs.
--
-- Backfill seeds the column from the document's creator, which is exactly
-- what the code read before this migration — so behaviour is unchanged on
-- the day it runs, and only diverges as ownership is transferred.
--
-- Idempotent: safe to re-run.

ALTER TABLE document_code_links
    ADD COLUMN IF NOT EXISTS owner_developer_id UUID
        REFERENCES developers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_document_code_links_owner_developer_id
    ON document_code_links (owner_developer_id);

UPDATE document_code_links AS l
SET owner_developer_id = d.created_by_id
FROM documents AS d
WHERE l.document_id = d.id
  AND l.owner_developer_id IS NULL
  AND d.created_by_id IS NOT NULL;
