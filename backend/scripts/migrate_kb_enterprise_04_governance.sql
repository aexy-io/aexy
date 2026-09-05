-- Knowledge Base — audit, analytics, publishing.
--
-- See prds/KNOWLEDGE_BASE_ENTERPRISE_PLAN.md §3 Phase 2.

-- ============================================================================
-- document_audit_events
-- ============================================================================
--
-- Separate from `entity_activities`, which the documents module already writes
-- to. That table is a product feed: mutable, no actor IP or user agent, no read
-- events, no permission-change events, no retention policy, no export. It
-- answers "what happened to this page lately" for a colleague. It does not
-- answer "who opened this document, from where, and who changed its sharing"
-- for a security review, and stretching it to try would make the feed
-- unreadable and the audit trail untrustworthy at the same time.
--
-- Note what is deliberately NOT a foreign key: `document_id` and `actor_id`.
-- Purging a document must not erase the record that it existed and who read it,
-- and a departed employee's audit trail has to outlive their row. The
-- denormalised title and actor name are the only thing left after either.

CREATE TABLE IF NOT EXISTS document_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    document_id UUID,
    document_title VARCHAR(500),
    space_id UUID,

    action VARCHAR(50) NOT NULL,

    actor_id UUID,
    actor_name VARCHAR(255),
    actor_email VARCHAR(320),
    -- 'user' | 'agent' | 'system', from the token's verified `actor` claim, so
    -- an agent's action is distinguishable from the person it acted for.
    actor_kind VARCHAR(20) NOT NULL DEFAULT 'user',

    ip_address INET,
    user_agent TEXT,

    -- Before/after for changes worth diffing. Never document content: an audit
    -- log is not a second copy of the knowledge base, and storing bodies here
    -- would make retention and erasure requests intractable.
    before JSONB,
    after JSONB,
    context JSONB,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_document_audit_workspace_time
    ON document_audit_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_document_audit_document_time
    ON document_audit_events (document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_document_audit_actor_time
    ON document_audit_events (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_document_audit_action_time
    ON document_audit_events (action, created_at DESC);

-- Append-only, enforced by the database rather than by convention. An audit
-- trail the application can rewrite is evidence of nothing.
--
-- A trigger rather than a role grant because this deployment's application user
-- owns the schema, and an owner's privileges cannot be revoked from itself.
-- Retention deletion runs as a maintenance job that sets the escape hatch
-- first, which is itself a deliberate, visible act.

CREATE OR REPLACE FUNCTION document_audit_is_append_only()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('aexy.audit_maintenance', true) = 'on' THEN
        RETURN COALESCE(OLD, NEW);
    END IF;
    RAISE EXCEPTION
        'document_audit_events is append-only (attempted %). Set '
        'aexy.audit_maintenance to run a retention job.', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_document_audit_append_only ON document_audit_events;
CREATE TRIGGER trg_document_audit_append_only
    BEFORE UPDATE OR DELETE ON document_audit_events
    FOR EACH ROW EXECUTE FUNCTION document_audit_is_append_only();

-- ============================================================================
-- document_views
-- ============================================================================
--
-- Aggregated per person per day rather than one row per open: a document left
-- pinned in a browser tab would otherwise write thousands of rows and drown
-- both the table and the analytics. `view_count` and `total_dwell_seconds`
-- keep the detail that matters without the row per event.

CREATE TABLE IF NOT EXISTS document_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    viewer_id UUID REFERENCES developers(id) ON DELETE CASCADE,

    -- The UTC date this row aggregates, as text so the unique constraint
    -- behaves identically on SQLite (tests) and PostgreSQL.
    view_date VARCHAR(10) NOT NULL,

    view_count INTEGER NOT NULL DEFAULT 1,
    total_dwell_seconds INTEGER NOT NULL DEFAULT 0,

    first_viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_document_view_day
    ON document_views (document_id, viewer_id, view_date);
CREATE INDEX IF NOT EXISTS ix_document_views_workspace_date
    ON document_views (workspace_id, view_date);

-- ============================================================================
-- published_documents
-- ============================================================================
--
-- `documents.is_published` and `visibility = 'public'` shipped on every row,
-- were returned in every API response, and were read by nothing: no public
-- endpoint existed anywhere, so publishing a page did nothing at all.
--
-- A snapshot table rather than more columns on `documents`, and that is the
-- whole design. A published page that silently follows its source means an
-- accidental edit to an internal document is instantly public, made by
-- somebody who does not know the page is externally visible. It is also the
-- security boundary: the public router queries only this table, so an internal
-- page cannot leak through a forgotten filter — it is simply not here.

CREATE TABLE IF NOT EXISTS published_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Unique across the deployment, not per workspace: the portal serves
    -- /kb/{slug} and two workspaces publishing "refund-policy" cannot both own
    -- it.
    slug VARCHAR(200) NOT NULL UNIQUE,

    title VARCHAR(500) NOT NULL,
    content JSONB NOT NULL DEFAULT '{}',
    content_text TEXT,
    -- The sha of the source when the snapshot was taken. Different from the
    -- document's current sha means the published copy is behind, which is what
    -- `stale_publications` reports.
    source_sha VARCHAR(64),

    -- 'public'    anyone with the link
    -- 'workspace' signed-in members only — a portal for the company rather
    --             than for its customers
    audience VARCHAR(20) NOT NULL DEFAULT 'public',

    published_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    published_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    view_count INTEGER NOT NULL DEFAULT 0
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_published_documents_audience'
    ) THEN
        ALTER TABLE published_documents
            ADD CONSTRAINT ck_published_documents_audience
            CHECK (audience IN ('public', 'workspace'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_published_documents_workspace
    ON published_documents (workspace_id);
CREATE INDEX IF NOT EXISTS ix_published_documents_audience
    ON published_documents (audience);

-- The portal's own search. Public articles only, which is why the partial
-- index is scoped that way rather than covering the whole table.
CREATE INDEX IF NOT EXISTS ix_published_documents_search
    ON published_documents USING GIN (
        to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content_text, ''))
    )
    WHERE audience = 'public';

-- ============================================================================
-- Reconcile is_published with reality
-- ============================================================================
--
-- Rows may carry is_published = true from before this table existed, when the
-- flag meant nothing. Clearing them is honest: none of those pages is actually
-- published, and leaving the flag set would show an admin a "public" badge on a
-- page with no public URL.

UPDATE documents
SET is_published = FALSE, published_at = NULL
WHERE is_published = TRUE
  AND NOT EXISTS (
      SELECT 1 FROM published_documents p WHERE p.document_id = documents.id
  );
