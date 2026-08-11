-- Opt-in sync: a mailbox that stores nothing until a thread is marked.
--
-- Until now a connected account synced its whole INBOX and the exclusion rules
-- subtracted from it. That is the wrong way round for somebody's own mailbox:
-- it asks them to predict everything worth keeping out, and whatever they fail
-- to predict is already in the workspace before they notice. `opt_in` inverts
-- the default so nothing is stored until it is asked for.
--
-- `all` stays the default and every existing row keeps it. A migration that
-- silently stopped syncing live mailboxes would be indistinguishable from an
-- outage, and this is a choice for the person whose mail it is to make.

-- The mode, and the Gmail-side way to say yes without leaving Gmail.
ALTER TABLE google_integrations
    ADD COLUMN IF NOT EXISTS sync_mode VARCHAR(16) NOT NULL DEFAULT 'all';

ALTER TABLE google_integrations
    ADD COLUMN IF NOT EXISTS opt_in_label VARCHAR(255) NOT NULL DEFAULT 'Aexy';

-- Only two modes are meaningful, and a typo in this column would silently
-- change what a mailbox stores. Named so a failure says which column is wrong.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_google_integration_sync_mode'
    ) THEN
        ALTER TABLE google_integrations
            ADD CONSTRAINT ck_google_integration_sync_mode
            CHECK (sync_mode IN ('all', 'opt_in'));
    END IF;
END $$;

-- The permission itself. One row per thread the owner said yes to.
CREATE TABLE IF NOT EXISTS google_thread_optins (
    id UUID PRIMARY KEY,
    integration_id UUID NOT NULL REFERENCES google_integrations(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    gmail_thread_id VARCHAR(255) NOT NULL,
    -- SET NULL rather than CASCADE: somebody leaving the workspace must not
    -- silently revoke the threads they opted in, which would delete synced mail
    -- the rest of the workspace is working from.
    marked_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_google_thread_optin UNIQUE (integration_id, gmail_thread_id)
);

CREATE INDEX IF NOT EXISTS ix_google_thread_optins_integration
    ON google_thread_optins (integration_id);
CREATE INDEX IF NOT EXISTS ix_google_thread_optins_workspace
    ON google_thread_optins (workspace_id);
CREATE INDEX IF NOT EXISTS ix_google_thread_optins_thread
    ON google_thread_optins (gmail_thread_id);

-- What an opt-in account knows about threads it has NOT synced, so there is
-- something to point at when marking one. Headers only — no bodies, no
-- attachments, no snippets. Written only for accounts whose owner chose
-- `opt_in`, and after the exclusion rules have already been applied.
CREATE TABLE IF NOT EXISTS google_thread_index (
    id UUID PRIMARY KEY,
    integration_id UUID NOT NULL REFERENCES google_integrations(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    gmail_thread_id VARCHAR(255) NOT NULL,
    subject TEXT,
    participants JSONB NOT NULL DEFAULT '[]'::jsonb,
    message_count INTEGER NOT NULL DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_google_thread_index UNIQUE (integration_id, gmail_thread_id)
);

CREATE INDEX IF NOT EXISTS ix_google_thread_index_integration
    ON google_thread_index (integration_id);
CREATE INDEX IF NOT EXISTS ix_google_thread_index_workspace
    ON google_thread_index (workspace_id);
CREATE INDEX IF NOT EXISTS ix_google_thread_index_thread
    ON google_thread_index (gmail_thread_id);
-- The list is read newest-first per account, which is the only way it is read.
CREATE INDEX IF NOT EXISTS ix_google_thread_index_recent
    ON google_thread_index (integration_id, last_message_at DESC);
