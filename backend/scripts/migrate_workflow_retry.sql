-- Migration: Add retry support to workflow executions
-- Run this migration to add retry and error handling fields

-- Add retry fields to workflow_execution_steps
ALTER TABLE crm_workflow_execution_steps
ADD COLUMN IF NOT EXISTS error_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP WITH TIME ZONE;

-- Create index for retry scheduling
CREATE INDEX IF NOT EXISTS idx_workflow_steps_retry
ON crm_workflow_execution_steps(next_retry_at)
WHERE next_retry_at IS NOT NULL AND status = 'retrying';

-- Add retry config to workflow_definitions
ALTER TABLE crm_workflow_definitions
ADD COLUMN IF NOT EXISTS retry_config JSONB DEFAULT '{"max_retries": 3, "initial_delay_seconds": 60, "backoff_multiplier": 2.0, "max_delay_seconds": 3600, "retryable_errors": ["timeout", "rate_limit", "server_error", "connection_error"]}',
ADD COLUMN IF NOT EXISTS notify_on_failure BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS failure_notification_emails JSONB;

-- Create dead letter queue table for permanently failed executions
CREATE TABLE IF NOT EXISTS crm_workflow_dead_letter (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES crm_workflow_executions(id) ON DELETE CASCADE,
    step_id UUID REFERENCES crm_workflow_execution_steps(id) ON DELETE SET NULL,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    automation_id UUID NOT NULL REFERENCES crm_automations(id) ON DELETE CASCADE,

    -- Error details
    error_type VARCHAR(50) NOT NULL,
    error_message TEXT NOT NULL,
    node_id VARCHAR(100),
    node_type VARCHAR(50),

    -- Context for manual retry
    input_data JSONB,
    execution_context JSONB,

    -- Resolution tracking
    status VARCHAR(20) DEFAULT 'pending',  -- pending, resolved, ignored
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES developers(id),
    resolution_notes TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for dead letter queue
CREATE INDEX IF NOT EXISTS idx_dead_letter_workspace ON crm_workflow_dead_letter(workspace_id);
CREATE INDEX IF NOT EXISTS idx_dead_letter_status ON crm_workflow_dead_letter(status);
CREATE INDEX IF NOT EXISTS idx_dead_letter_automation ON crm_workflow_dead_letter(automation_id);

-- Add comment
COMMENT ON TABLE crm_workflow_dead_letter IS 'Dead letter queue for permanently failed workflow executions';
