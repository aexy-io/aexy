-- Migration: Add Team Chat tables (Zulip-inspired channels, topics, messages)
-- Adds: chat_channels, chat_channel_members, chat_topics, chat_messages,
--        chat_topic_read_state, chat_user_presence

-- Chat channels (Zulip streams)
CREATE TABLE IF NOT EXISTS chat_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    description TEXT,
    visibility VARCHAR(20) NOT NULL DEFAULT 'public',  -- 'public' | 'private'
    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_chat_channel_workspace_slug UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_chat_channels_workspace_active
    ON chat_channels (workspace_id) WHERE NOT is_archived;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_chat_channels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chat_channels_updated_at ON chat_channels;
CREATE TRIGGER trg_chat_channels_updated_at
    BEFORE UPDATE ON chat_channels
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_channels_updated_at();


-- Channel members
CREATE TABLE IF NOT EXISTS chat_channel_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member',  -- 'owner' | 'member'
    is_muted BOOLEAN NOT NULL DEFAULT FALSE,
    notification_level VARCHAR(20),  -- NULL | 'all' | 'mentions' | 'none'
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_chat_channel_member UNIQUE (channel_id, developer_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_channel_members_developer
    ON chat_channel_members (developer_id);


-- Chat topics (Zulip's key concept)
CREATE TABLE IF NOT EXISTS chat_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    last_message_id UUID,
    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_topics_channel_last_msg
    ON chat_topics (channel_id, last_message_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_chat_topics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chat_topics_updated_at ON chat_topics;
CREATE TRIGGER trg_chat_topics_updated_at
    BEFORE UPDATE ON chat_topics
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_topics_updated_at();


-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL REFERENCES chat_topics(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    reply_to_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
    is_edited BOOLEAN NOT NULL DEFAULT FALSE,
    edited_at TIMESTAMPTZ,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    mentions JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_topic_created
    ON chat_messages (topic_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_created
    ON chat_messages (channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender
    ON chat_messages (sender_id);


-- Topic read state (unread tracking)
CREATE TABLE IF NOT EXISTS chat_topic_read_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL REFERENCES chat_topics(id) ON DELETE CASCADE,
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    last_read_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_chat_topic_read_state UNIQUE (topic_id, developer_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_topic_read_state_developer
    ON chat_topic_read_state (developer_id);


-- User presence
CREATE TABLE IF NOT EXISTS chat_user_presence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'offline',  -- 'online' | 'away' | 'offline'
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status_text VARCHAR(255),
    status_emoji VARCHAR(50),

    CONSTRAINT uq_chat_user_presence UNIQUE (workspace_id, developer_id)
);
