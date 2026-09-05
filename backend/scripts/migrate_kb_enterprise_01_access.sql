-- Knowledge Base — Phase 0: access control, trash, lifecycle.
--
-- Every default here is chosen so that applying this migration changes no
-- observable behaviour on its own. The enforcement arrives with the code that
-- reads these columns; a migration that quietly locked people out of spaces
-- they were using would be a worse outage than the leak it closes.
--
-- See prds/KNOWLEDGE_BASE_ENTERPRISE_PLAN.md §3 Phase 0.

-- ============================================================================
-- document_spaces: make the membership list mean something
-- ============================================================================

ALTER TABLE document_spaces
    ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'open',
    ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_document_spaces_visibility'
    ) THEN
        ALTER TABLE document_spaces
            ADD CONSTRAINT ck_document_spaces_visibility
            CHECK (visibility IN ('open', 'restricted'));
    END IF;
END $$;

-- ============================================================================
-- documents: trash
-- ============================================================================

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS deleted_by_id UUID REFERENCES developers(id) ON DELETE SET NULL;

-- ============================================================================
-- documents: lifecycle
-- ============================================================================

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS review_due_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS last_verified_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

-- Seed ownership from authorship. Not a guess about who *should* own each
-- page — it is the only fact we have, and leaving the column null would put
-- every existing document into the "unowned" bucket on day one and make the
-- review queue useless before anyone had a chance to set it.
UPDATE documents SET owner_id = created_by_id WHERE owner_id IS NULL;

-- ============================================================================
-- Indexes for the predicates the access layer adds to every read
-- ============================================================================

CREATE INDEX IF NOT EXISTS ix_documents_workspace_live
    ON documents (workspace_id, deleted_at);

CREATE INDEX IF NOT EXISTS ix_documents_workspace_visibility
    ON documents (workspace_id, visibility);

CREATE INDEX IF NOT EXISTS ix_documents_owner_review
    ON documents (owner_id, review_due_at);

-- Partial index for the live-document case, which is every request that is not
-- the trash screen.
CREATE INDEX IF NOT EXISTS ix_documents_live_tree
    ON documents (workspace_id, parent_id, position)
    WHERE deleted_at IS NULL;

-- The two `EXISTS` subqueries in `DocumentAccess.visible_clause` run once per
-- candidate row; these are the lookups they make.
CREATE INDEX IF NOT EXISTS ix_document_collaborators_developer_document
    ON document_collaborators (developer_id, document_id);

CREATE INDEX IF NOT EXISTS ix_document_space_members_developer_space
    ON document_space_members (developer_id, space_id);

-- ============================================================================
-- Cycle check: report any parent cycles that predate the guard.
-- ============================================================================
--
-- `move_document` had no descendant check, so a cycle was two ordinary moves
-- away, and `get_ancestors` — an unbounded `while` over `parent_id` — spins
-- forever on one. The code guards against creating new ones; this reports rows
-- that already went wrong, loudly, rather than leaving them to hang a worker.

DO $$
DECLARE
    cycle_count INTEGER;
BEGIN
    WITH RECURSIVE walk(id, ancestor, depth, path, looped) AS (
        SELECT d.id, d.parent_id, 1, ARRAY[d.id], FALSE
        FROM documents d
        WHERE d.parent_id IS NOT NULL
        UNION ALL
        SELECT w.id, p.parent_id, w.depth + 1, w.path || p.id, p.id = ANY(w.path)
        FROM walk w
        JOIN documents p ON p.id = w.ancestor
        WHERE NOT w.looped AND w.depth < 100
    )
    SELECT COUNT(DISTINCT id) INTO cycle_count FROM walk WHERE looped;

    IF cycle_count > 0 THEN
        RAISE WARNING
            'documents: % row(s) sit in a parent cycle. Their breadcrumbs will '
            'be truncated by the visited-set guard; re-parent them from the UI.',
            cycle_count;
    END IF;
END $$;

-- ============================================================================
-- documents: real full-text search
-- ============================================================================
--
-- Search was `ILIKE '%q%'` over `content_text`: a leading wildcard, so a
-- sequential scan of every document body in the workspace, ordered by
-- `updated_at` rather than by relevance.
--
-- A generated column rather than a trigger, so the index can never disagree
-- with the content it indexes. Title weighted A above body weighted B —
-- somebody typing a page's name means that page.

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(content_text, '')), 'B')
    ) STORED;

CREATE INDEX IF NOT EXISTS ix_documents_search_vector
    ON documents USING GIN (search_vector);
