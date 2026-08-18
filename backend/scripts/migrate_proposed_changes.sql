-- One queue for everything waiting on a human.
--
-- Two gates produce work for people. The content gate holds a result — prose
-- to diff against the page it would replace. The policy gate holds an intent —
-- a tool call stopped before it ran. They were two tables because those are
-- genuinely different things, and merging them naively meant eighteen columns
-- that apply to one kind and are null on every row of the other.
--
-- Putting the kind-specific part in one JSONB `payload` removes that. What is
-- left is common to both — who asked, when, what for, what was decided — and a
-- single table gives one queue, one lifecycle, and a review inbox that is a
-- query rather than two lists merged in the client.
--
-- Both source tables are copied, not dropped. Keeping them until the code has
-- run against the new table for a release means a rollback is a deploy rather
-- than a restore, and `document_proposed_edits` holds the only review history
-- this workspace has.
--
-- Idempotent: safe to re-run. The backfills skip rows already carried over.

CREATE TABLE IF NOT EXISTS proposed_changes (
    id UUID PRIMARY KEY,
    kind VARCHAR(20) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    source VARCHAR(64),
    base_version VARCHAR(64),
    summary JSONB,

    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    requested_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    reviewed_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    reason TEXT,
    result JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_proposed_changes_workspace_id
    ON proposed_changes (workspace_id);

CREATE INDEX IF NOT EXISTS ix_proposed_changes_entity_id
    ON proposed_changes (entity_id);

-- The queue's own question: what is waiting here, oldest first. Partial,
-- because resolved rows outnumber pending ones permanently.
CREATE INDEX IF NOT EXISTS ix_proposed_changes_workspace_pending
    ON proposed_changes (workspace_id, created_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS ix_proposed_changes_entity
    ON proposed_changes (entity_type, entity_id, status);

-- ─── document proposals ────────────────────────────────────────────────
-- `workspace_id` comes from the document, because the old table had no such
-- column: the queue was per-document and never needed one.
INSERT INTO proposed_changes (
    id, kind, entity_type, entity_id, workspace_id,
    payload, source, base_version, summary,
    status, requested_by_id, reviewed_by_id, reviewed_at, reason,
    created_at, updated_at
)
SELECT
    p.id,
    'content',
    'document',
    p.document_id,
    d.workspace_id,
    jsonb_build_object('content', p.proposed_content),
    p.source,
    p.base_content_sha,
    p.diff_summary,
    p.status,
    p.proposed_by_id,
    p.reviewed_by_id,
    p.reviewed_at,
    p.reason,
    p.proposed_at,
    p.updated_at
FROM document_proposed_edits AS p
JOIN documents AS d ON d.id = p.document_id
ON CONFLICT (id) DO NOTHING;

-- ─── held agent actions ────────────────────────────────────────────────
-- `entity_id` stays null on purpose: a call stopped before it ran has not yet
-- told us what it would have touched, and inventing a target here would be a
-- guess the reviewer might believe.
INSERT INTO proposed_changes (
    id, kind, entity_type, entity_id, workspace_id,
    payload, source, summary,
    status, requested_by_id, reviewed_by_id, reviewed_at, reason, result,
    created_at, updated_at
)
SELECT
    a.id,
    'action',
    'agent_action',
    NULL,
    a.workspace_id,
    jsonb_build_object(
        'tool_name', a.tool_name,
        'action', a.action,
        'method', a.method,
        'path', a.path,
        'arguments', a.arguments
    ),
    a.policy_id::text,
    NULL,
    a.status,
    a.requested_by_id,
    a.reviewed_by_id,
    a.reviewed_at,
    COALESCE(a.review_note, a.reason),
    a.result,
    a.created_at,
    a.created_at
FROM agent_pending_actions AS a
ON CONFLICT (id) DO NOTHING;
