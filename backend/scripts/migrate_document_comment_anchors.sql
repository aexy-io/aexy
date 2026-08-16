-- Migration: anchor a document comment to the passage it is about.
--
-- Comments were a flat list under the document, which does not survive past about
-- three remarks: nothing says *which* sentence "is this still true?" refers to.
--
-- Two nullable columns rather than a second table, because an anchored thread and
-- a whole-document remark are the same object with the same threading, resolution
-- and notification behaviour. `anchor_id IS NULL` *is* the whole-document comment,
-- so the distinction is this field and the foot-of-document section keeps working
-- with no change to how it queries.
--
-- `anchor_id` is not a foreign key and not a position. The matching value lives in
-- a `commentAnchor` mark inside `documents.content`, and that pairing is the whole
-- link — storing character offsets would mean every edit above a comment silently
-- moved it. The consequence is that the mark can be edited away while the row
-- stays, which is intended: the thread is still the record of a conversation. The
-- editor knows which ids still have marks and groups the rest as unanchored, so
-- there is deliberately no `is_orphaned` column for the server to keep in step.
--
-- `quoted_text` is the passage as it read when the comment was made. Without it an
-- orphaned thread is unreadable, and it is what lets the UI show "this no longer
-- matches the document" rather than just losing the context.
--
-- Both nullable with no backfill: every existing comment is a whole-document one,
-- which is exactly what NULL means here.

BEGIN;

ALTER TABLE document_comments
    ADD COLUMN IF NOT EXISTS anchor_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS quoted_text TEXT;

-- The rail's query is "every anchored thread on this document", so the index
-- leads with document_id. Partial on anchor_id IS NOT NULL: the whole-document
-- comments are the rows that will never be looked up this way, and on a busy
-- document they are the minority worth excluding from the index.
CREATE INDEX IF NOT EXISTS ix_document_comments_document_anchor
    ON document_comments (document_id, anchor_id)
    WHERE anchor_id IS NOT NULL;

COMMIT;
