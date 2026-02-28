-- AI Feedback & Benchmarking migration
-- Adds latency tracking to ask messages and unified feedback table

-- Latency tracking on ask messages
ALTER TABLE ask_messages ADD COLUMN IF NOT EXISTS latency_ms INTEGER;

-- Unified feedback table for all AI features
CREATE TABLE IF NOT EXISTS ai_feedback (
    id VARCHAR PRIMARY KEY,
    entity_type VARCHAR(30) NOT NULL,  -- 'ask_message' | 'agent_execution' | 'automation_run'
    entity_id VARCHAR NOT NULL,
    workspace_id VARCHAR NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    developer_id VARCHAR NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating IN (-1, 1)),  -- thumbs down / up
    comment TEXT,
    tags VARCHAR(500),  -- optional comma-separated tags
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    CONSTRAINT uq_ai_feedback_entity_developer UNIQUE(entity_type, entity_id, developer_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_fb_entity ON ai_feedback(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ai_fb_workspace ON ai_feedback(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_fb_rating ON ai_feedback(workspace_id, entity_type, rating);

-- Ensure unique constraint exists even if table was created by SQLAlchemy create_all()
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_ai_feedback_entity_developer') THEN
        ALTER TABLE ai_feedback ADD CONSTRAINT uq_ai_feedback_entity_developer UNIQUE (entity_type, entity_id, developer_id);
    END IF;
END $$;
