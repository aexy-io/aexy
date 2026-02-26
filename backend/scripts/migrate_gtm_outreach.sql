-- GTM Multi-Channel Outreach Sequences
-- Run: docker exec aexy-backend python scripts/run_migrations.py --file migrate_gtm_outreach.sql

-- Outreach Sequences
CREATE TABLE IF NOT EXISTS outreach_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    channels JSONB NOT NULL DEFAULT '[]'::jsonb,
    enrolled_count INTEGER NOT NULL DEFAULT 0,
    active_count INTEGER NOT NULL DEFAULT 0,
    completed_count INTEGER NOT NULL DEFAULT 0,
    replied_count INTEGER NOT NULL DEFAULT 0,
    bounced_count INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_outreach_seq_ws_status ON outreach_sequences(workspace_id, status);

-- Outreach Enrollments
CREATE TABLE IF NOT EXISTS outreach_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    sequence_id UUID NOT NULL REFERENCES outreach_sequences(id) ON DELETE CASCADE,
    record_id UUID NOT NULL,
    email VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    current_step_index INTEGER NOT NULL DEFAULT 0,
    next_step_at TIMESTAMPTZ,
    temporal_workflow_id VARCHAR(255),
    exit_reason VARCHAR(50),
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    extra_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_enrollment_seq_status ON outreach_enrollments(sequence_id, status);
CREATE INDEX IF NOT EXISTS ix_enrollment_record ON outreach_enrollments(workspace_id, record_id);
CREATE INDEX IF NOT EXISTS ix_enrollment_next_step ON outreach_enrollments(status, next_step_at);

-- Outreach Step Executions
CREATE TABLE IF NOT EXISTS outreach_step_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES outreach_enrollments(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    step_index INTEGER NOT NULL,
    channel VARCHAR(20) NOT NULL,
    action VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    provider_message_id VARCHAR(255),
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    replied_at TIMESTAMPTZ,
    extra_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_step_exec_enrollment ON outreach_step_executions(enrollment_id, step_index);
CREATE INDEX IF NOT EXISTS ix_step_exec_ws_channel ON outreach_step_executions(workspace_id, channel);
