-- Progress updates on tasks and tickets.
--
-- A task carried two kinds of writing and neither said where the work stood.
-- Comments are a conversation, so the current state is buried somewhere in a
-- thread. The activity log is an audit trail of field changes, so it can record
-- that status became in_progress on Tuesday but not why it is still
-- in_progress on Friday. Standups were filling that gap verbally and nothing
-- was written down against the work itself.
--
-- `work_updates` is that missing record: a short, author-owned statement of
-- progress, editable by whoever wrote it, readable per task/ticket and in bulk
-- so a board can show which cards have gone quiet.

CREATE TABLE IF NOT EXISTS work_updates (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL
        REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Polymorphic target: 'task' (sprint_tasks) or 'ticket' (tickets).
    -- No FK — the referent lives in one of two tables. The API validates the
    -- pair against the workspace before writing, and WorkUpdateService
    -- .delete_for_entity clears rows when a target is hard-deleted.
    entity_type VARCHAR(20) NOT NULL,
    entity_id UUID NOT NULL,

    -- SET NULL, not CASCADE: an update is a record of what was said about the
    -- work. Losing it because the author left the company is exactly when you
    -- most want to read it.
    author_id UUID REFERENCES developers(id) ON DELETE SET NULL,

    body TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- NULL means never edited. A plain `updated_at DEFAULT NOW()` could not
    -- express that, and the UI's "edited" marker keys off precisely this.
    edited_at TIMESTAMPTZ,

    CONSTRAINT work_updates_entity_type_known
        CHECK (entity_type IN ('task', 'ticket')),
    CONSTRAINT work_updates_body_not_blank
        CHECK (length(btrim(body)) > 0)
);

-- The per-entity read: newest first for one task or ticket.
CREATE INDEX IF NOT EXISTS ix_work_updates_entity
    ON work_updates (entity_type, entity_id, created_at DESC);

-- Backs the bulk "latest update per card" lookup a board makes.
CREATE INDEX IF NOT EXISTS ix_work_updates_workspace_created
    ON work_updates (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_work_updates_author
    ON work_updates (author_id);
