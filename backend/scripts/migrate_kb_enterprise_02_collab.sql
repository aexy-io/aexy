-- Knowledge Base — server-authoritative collaborative editing.
--
-- There was no server-side CRDT at all. Each client built an empty Y.Doc and
-- seeded it by calling setContent() with the REST body, so two people opening
-- one page each inserted the whole document into their own Yjs history and the
-- merge duplicated the content. The WebSocket relayed bytes and stored
-- nothing; the only thing that persisted was a debounced PATCH of the entire
-- body, last writer wins.
--
-- See prds/KNOWLEDGE_BASE_ENTERPRISE_PLAN.md §3 1.4 and
-- services/document_collaboration.py.

CREATE TABLE IF NOT EXISTS document_yjs_state (
    document_id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,

    -- A full Yjs update (Doc.get_update()), not an append-only delta log: it
    -- is self-contained, so recovery needs no replay, and rewriting one row
    -- per debounce interval is cheaper than a log that must be compacted.
    state BYTEA NOT NULL,

    -- Yjs state vector, so a reconnecting client can be answered with just
    -- what it is missing rather than the whole document.
    state_vector BYTEA,

    -- The sha of the documents.content snapshot this state was last flattened
    -- into. Equal means the REST body is current; different means search, the
    -- knowledge graph and every AI path are reading a stale body.
    snapshot_sha VARCHAR(64),
    snapshot_at TIMESTAMP WITH TIME ZONE,

    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- The sweeper looks for rooms whose CRDT has outrun their snapshot.
CREATE INDEX IF NOT EXISTS ix_document_yjs_state_stale
    ON document_yjs_state (updated_at)
    WHERE snapshot_sha IS NULL;
