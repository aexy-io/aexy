-- Knowledge Base — the human approval gate.
--
-- `document_spaces.requires_approval` shipped in migration 01 and was read by
-- nothing. These columns are what makes it work for people rather than only
-- for agents.
--
-- See prds/KNOWLEDGE_BASE_DEFERRED_PLAN.md §2.

-- Who may approve in this space. Empty means any space admin, which is the
-- sensible default and the one that does not need configuring before the
-- feature works.
ALTER TABLE document_spaces
    ADD COLUMN IF NOT EXISTS approval_reviewers JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Who a proposal is *for*. `reviewed_by_id` records who acted, which is only
-- known afterwards — so without this a proposal is addressed to nobody and
-- sits in a queue hoping somebody opens it.
ALTER TABLE proposed_changes
    ADD COLUMN IF NOT EXISTS assigned_reviewer_id UUID
        REFERENCES developers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_proposed_changes_assigned_reviewer
    ON proposed_changes (assigned_reviewer_id)
    WHERE status = 'pending';

-- ============================================================================
-- A note on what is NOT here
-- ============================================================================
--
-- No draft/approved split on `documents`. A space that requires approval does
-- not get live collaborative editing: `DocumentRoom._flatten` writes the CRDT
-- straight through `update_document` on a debounce, so co-editing would bypass
-- the gate, and a gate anyone can step over by opening the editor is worse than
-- no gate because it is believed. The socket refuses (close code 4005) and
-- those spaces use single-writer saves, which become proposals.
--
-- The alternative — a draft body distinct from an approved one, the model
-- `published_documents` already uses externally — keeps both features and is a
-- much larger change touching every reader, the search index and the knowledge
-- graph. Deliberately deferred rather than half-built.
