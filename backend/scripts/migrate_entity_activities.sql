-- Migration: Create entity_activities table for timeline/history tracking
-- Run this migration to enable activity tracking across different entities

-- Create the entity_activities table
CREATE TABLE IF NOT EXISTS entity_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Entity reference (polymorphic)
    entity_type VARCHAR(50) NOT NULL,  -- 'goal', 'task', 'backlog', 'story', 'release', 'roadmap', 'epic', 'bug'
    entity_id UUID NOT NULL,

    -- Activity details
    activity_type VARCHAR(50) NOT NULL,  -- 'created', 'updated', 'comment', 'status_changed', 'assigned', 'progress_updated', 'linked', 'unlinked'

    -- Who performed the action
    actor_id UUID REFERENCES developers(id) ON DELETE SET NULL,

    -- Activity content
    title VARCHAR(500),
    content TEXT,

    -- Change details (for updates)
    changes JSONB,

    -- Additional context
    activity_metadata JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS ix_entity_activities_workspace_id ON entity_activities(workspace_id);
CREATE INDEX IF NOT EXISTS ix_entity_activities_entity_type ON entity_activities(entity_type);
CREATE INDEX IF NOT EXISTS ix_entity_activities_entity_id ON entity_activities(entity_id);
CREATE INDEX IF NOT EXISTS ix_entity_activities_activity_type ON entity_activities(activity_type);
CREATE INDEX IF NOT EXISTS ix_entity_activities_actor_id ON entity_activities(actor_id);
CREATE INDEX IF NOT EXISTS ix_entity_activities_created_at ON entity_activities(created_at DESC);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS ix_entity_activities_entity ON entity_activities(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ix_entity_activities_workspace_created ON entity_activities(workspace_id, created_at DESC);

-- Comments
COMMENT ON TABLE entity_activities IS 'Track activities/changes across different entity types (goals, tasks, etc.)';
COMMENT ON COLUMN entity_activities.entity_type IS 'Type of entity: goal, task, backlog, story, release, roadmap, epic, bug';
COMMENT ON COLUMN entity_activities.activity_type IS 'Type of activity: created, updated, comment, status_changed, assigned, progress_updated, linked, unlinked';
COMMENT ON COLUMN entity_activities.changes IS 'JSON object with field changes: {"field": {"old": value, "new": value}}';
COMMENT ON COLUMN entity_activities.activity_metadata IS 'Additional context like linked entity info';
