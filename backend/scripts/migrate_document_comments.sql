-- Migration: document comments.
--
-- `DocumentPermission.COMMENT` has been a grantable permission level since the
-- docs module was written, and `DocumentNotificationType.COMMENT` a notification
-- type, and the notification settings screen has carried a "Document comment"
-- toggle — with no comment feature behind any of them. An admin could grant
-- somebody comment access to a document that had nothing to comment with.
--
-- Threading is one level: a root comment, plus replies pointing at it through
-- `parent_id`. Deeper nesting reads badly in a side panel, and it turns "who is
-- in this conversation?" — which decides who gets notified — into a recursive
-- walk instead of a single query.
--
-- `content` holds rich text in the same shape task comments and ticket replies
-- use, so `extract_mentioned_user_ids` finds `mention:user:{uuid}` hrefs in it
-- and document mentions travel the same path as every other mention in the
-- product, rather than growing a second mention parser.

BEGIN;

CREATE TABLE IF NOT EXISTS document_comments (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    -- CASCADE, not SET NULL: a reply whose parent vanished would render as a
    -- second root comment answering nothing. Soft delete keeps threads intact in
    -- normal use, so this only fires when a document itself goes.
    parent_id UUID REFERENCES document_comments(id) ON DELETE CASCADE,
    author_id UUID REFERENCES developers(id) ON DELETE SET NULL,

    content TEXT NOT NULL,

    -- Resolution belongs to the thread, so it is only meaningful on a root
    -- comment. Resolving is not deleting; a resolved thread stays readable.
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,

    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    is_edited BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The panel's only read: every comment on one document, oldest first.
CREATE INDEX IF NOT EXISTS ix_document_comments_document_created
    ON document_comments (document_id, created_at);

CREATE INDEX IF NOT EXISTS ix_document_comments_parent
    ON document_comments (parent_id);

CREATE INDEX IF NOT EXISTS ix_document_comments_author
    ON document_comments (author_id);

COMMIT;
