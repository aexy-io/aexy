-- Which pages a pull request affects, and what its author has been told.
--
-- Models: src/aexy/models/document_impact.py
--
-- The existing sync tables answer "is this page behind its code", after a merge,
-- for whoever wrote the page. These answer a different question for a different
-- person: which pages *your* change affects, while the pull request is still
-- open and updating them is part of the same piece of work.
--
-- No backfill on either table. An absent row means "this pull request has not
-- been evaluated", which is true of every pull request that predates this
-- migration; they are not evaluated retroactively, because a notification about
-- a pull request that merged last month is spam and a comment on it is worse.

CREATE TABLE IF NOT EXISTS pull_request_doc_impacts (
    id UUID PRIMARY KEY,

    -- Keyed on the repository and number rather than a workspace. A repository
    -- can be adopted by more than one workspace, but a pull request has exactly
    -- one comment thread and one checks list, so a workspace-scoped header would
    -- post two comments on one pull request. Workspace scoping lives on the
    -- items instead.
    --
    -- repositories.id is VARCHAR(36), not UUID.
    repository_id VARCHAR(36) NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    pull_request_number INTEGER NOT NULL,

    -- Nullable on purpose: the evaluation can arrive before pull-request
    -- ingestion has committed its row, and losing the evaluation to that race
    -- would mean the author is told nothing at all.
    pull_request_id UUID REFERENCES pull_requests(id) ON DELETE SET NULL,

    -- Snapshot, so the page still renders when there is no local row.
    title TEXT,

    -- SET NULL, never CASCADE: losing the author must not delete the record of
    -- which pages their merge left behind.
    author_developer_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    -- An external contributor synced from GitHub has no account here, and the
    -- login is then the only way to name them.
    author_login VARCHAR(255),

    head_sha VARCHAR(40) NOT NULL,
    state VARCHAR(20) NOT NULL DEFAULT 'open',

    -- Substantive paths only, so "3 of 34 changed files are described by a page
    -- here" has two numbers that both mean something.
    changed_path_count INTEGER NOT NULL DEFAULT 0,

    -- The high-water mark of what the author has already been told, which never
    -- shrinks. That is the whole noise-control rule: a later push notifies only
    -- when the affected set grew, so reverting a file and re-adding it in the
    -- next commit cannot re-notify.
    --
    -- This is also why the state lives here rather than being derived from the
    -- notifications table: create_notification writes no row at all when the
    -- recipient has in-app notifications off, so "no prior notification" would be
    -- indistinguishable from "never evaluated" — and the pull-request comment
    -- would re-post on every push forever, for exactly the people who had opted
    -- out of hearing about it.
    notified_document_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    notified_open_at TIMESTAMP WITH TIME ZONE,
    notified_merged_at TIMESTAMP WITH TIME ZONE,

    -- The identity of a GitHub artifact, which must survive independently of
    -- whether anybody was notified. One comment per pull request, edited in
    -- place: the message states current state rather than announcing an event.
    pr_comment_id BIGINT,
    pr_comment_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    pr_comment_error TEXT,

    -- A check run belongs to a commit, so the sha it was created for is stored
    -- beside it: a new head sha needs a new run, not an update, or the new
    -- commit is left unannotated.
    check_run_id BIGINT,
    check_run_head_sha VARCHAR(40),
    check_run_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    check_run_error TEXT,

    detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    merged_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_pr_doc_impact UNIQUE (repository_id, pull_request_number)
);

CREATE TABLE IF NOT EXISTS pull_request_doc_impact_items (
    id UUID PRIMARY KEY,
    impact_id UUID NOT NULL
        REFERENCES pull_request_doc_impacts(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,

    -- Denormalised from the document so a read can scope to a workspace without
    -- a join, and so a repository shared by two workspaces cannot leak one's
    -- pages onto the other's page.
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- [{code_link_id, path, link_type, branch, matched_paths: [...]}]
    --
    -- Unioned across pushes rather than replaced: a second commit touching one
    -- more file must not make the card forget the file from the first. What the
    -- author needs is everything this pull request did, not everything its most
    -- recent commit did.
    matched JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- "No update needed", per pull request per document, attributed. The
    -- affordance this feature lives or dies on: with no way to say no, the only
    -- way to stop being asked is to mute the category.
    dismissed_at TIMESTAMP WITH TIME ZONE,
    dismissed_by_developer_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    dismiss_reason VARCHAR(280),

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_pr_doc_impact_item UNIQUE (impact_id, document_id)
);

-- Index names below are SQLAlchemy's own convention (ix_<table>_<column>), on
-- purpose: the models declare these with `index=True`, so a database built by
-- `create_all` and a database built by this file are only the same schema as
-- long as the names match too. `test_document_impact_schema.py` asserts that
-- rather than trusting it — the two sides have diverged before, and the cost of
-- a missing index is a query plan that is fine in development and wrong in
-- production.
--
-- No index on pull_request_doc_impacts.repository_id: the unique constraint
-- above leads with that column and already serves the webhook's only lookup.

CREATE INDEX IF NOT EXISTS ix_pull_request_doc_impact_items_impact_id
    ON pull_request_doc_impact_items (impact_id);

-- The reverse read: "which pull requests affected this page".
CREATE INDEX IF NOT EXISTS ix_pull_request_doc_impact_items_document_id
    ON pull_request_doc_impact_items (document_id);

-- Workspace-scoped reads, which is every read the page makes.
CREATE INDEX IF NOT EXISTS ix_pull_request_doc_impact_items_workspace_id
    ON pull_request_doc_impact_items (workspace_id);
