-- Ask AI conversations and messages
-- Migration for the agentic AI chat feature

CREATE TABLE IF NOT EXISTS ask_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    title VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ask_conversations_workspace ON ask_conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ask_conversations_developer ON ask_conversations(developer_id);
CREATE INDEX IF NOT EXISTS idx_ask_conversations_created ON ask_conversations(created_at DESC);

CREATE TABLE IF NOT EXISTS ask_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ask_conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT,
    tool_calls JSONB DEFAULT '[]'::jsonb,
    token_usage JSONB,
    message_index INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ask_messages_conversation ON ask_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ask_messages_ordering ON ask_messages(conversation_id, message_index);
