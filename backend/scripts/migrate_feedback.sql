-- Product feedback: suggestions, problems, questions, and requests for the apps
-- we gate. Model: models/feedback.py
--
-- Separate from app access requests on purpose. An access request asks a
-- workspace's own admin for something they control; this asks us for something
-- they cannot grant, so it goes to platform admins and never into a workspace
-- approval queue.
--
-- Votes are their own table with a uniqueness constraint rather than a counter
-- the API guards: voting is the one thing here worth gaming, and two tabs are
-- enough to race a read-then-write. `feedback.vote_count` is a denormalised
-- copy for ordering, written only by FeedbackService.

CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,

    -- 'suggestion' | 'problem' | 'question' | 'app_request'
    kind VARCHAR(20) NOT NULL DEFAULT 'suggestion',
    subject VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,

    -- Route, app id, release, locale — what the composer showed the author
    -- before they sent it.
    context JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- 'new' | 'triaged' | 'planned' | 'shipped' | 'declined'
    status VARCHAR(20) NOT NULL DEFAULT 'new',
    admin_note TEXT,
    reviewed_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,

    vote_count INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_feedback_workspace_id ON feedback (workspace_id);
CREATE INDEX IF NOT EXISTS ix_feedback_developer_id ON feedback (developer_id);
CREATE INDEX IF NOT EXISTS ix_feedback_kind ON feedback (kind);
CREATE INDEX IF NOT EXISTS ix_feedback_status ON feedback (status);
CREATE INDEX IF NOT EXISTS ix_feedback_created_at ON feedback (created_at);

-- The board's default ordering: most wanted first, newest as the tie-break.
CREATE INDEX IF NOT EXISTS ix_feedback_board_order
    ON feedback (vote_count DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS feedback_votes (
    id UUID PRIMARY KEY,
    feedback_id UUID NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_feedback_vote_once UNIQUE (feedback_id, developer_id)
);

CREATE INDEX IF NOT EXISTS ix_feedback_votes_feedback_id ON feedback_votes (feedback_id);
CREATE INDEX IF NOT EXISTS ix_feedback_votes_developer_id ON feedback_votes (developer_id);
