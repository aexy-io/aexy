-- Migration: Add workflow execution tracking tables
-- Created: 2026-01-10
-- Description: Adds tables for tracking workflow executions and individual steps
--              to support wait node scheduling and execution history

-- =============================================================================
-- WORKFLOW EXECUTIONS TABLE
-- =============================================================================
-- Tracks individual workflow executions for persistence and resumption

CREATE TABLE IF NOT EXISTS crm_workflow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES crm_workflow_definitions(id) ON DELETE CASCADE,
    automation_id UUID NOT NULL REFERENCES crm_automations(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    record_id UUID REFERENCES crm_records(id) ON DELETE SET NULL,

    -- Execution status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    -- Current position in workflow (for resumption)
    current_node_id VARCHAR(100),
    next_node_id VARCHAR(100),

    -- Execution context (preserved between pauses)
    context JSONB NOT NULL DEFAULT '{}',

    -- Trigger information
    trigger_data JSONB NOT NULL DEFAULT '{}',

    -- For wait node scheduling
    resume_at TIMESTAMP WITH TIME ZONE,
    wait_event_type VARCHAR(100),
    wait_timeout_at TIMESTAMP WITH TIME ZONE,

    -- Execution metrics
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    paused_at TIMESTAMP WITH TIME ZONE,

    -- Error tracking
    error TEXT,
    error_node_id VARCHAR(100),

    -- Dry run flag
    is_dry_run BOOLEAN NOT NULL DEFAULT false,

    -- Who triggered this execution
    triggered_by UUID REFERENCES developers(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for workflow executions
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id
    ON crm_workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_automation_id
    ON crm_workflow_executions(automation_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workspace_id
    ON crm_workflow_executions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status
    ON crm_workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_resume_at
    ON crm_workflow_executions(resume_at)
    WHERE status = 'paused' AND resume_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workflow_executions_wait_event
    ON crm_workflow_executions(wait_event_type)
    WHERE status = 'paused' AND wait_event_type IS NOT NULL;

-- =============================================================================
-- WORKFLOW EXECUTION STEPS TABLE
-- =============================================================================
-- Tracks individual node executions within a workflow execution

CREATE TABLE IF NOT EXISTS crm_workflow_execution_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES crm_workflow_executions(id) ON DELETE CASCADE,
    node_id VARCHAR(100) NOT NULL,
    node_type VARCHAR(50) NOT NULL,
    node_label VARCHAR(255),

    -- Step status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    -- Step data
    input_data JSONB,
    output_data JSONB,

    -- For condition/branch nodes
    condition_result BOOLEAN,
    selected_branch VARCHAR(100),

    -- Error tracking
    error TEXT,

    -- Timing
    duration_ms INTEGER,
    executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for execution steps
CREATE INDEX IF NOT EXISTS idx_workflow_execution_steps_execution_id
    ON crm_workflow_execution_steps(execution_id);
CREATE INDEX IF NOT EXISTS idx_workflow_execution_steps_node_id
    ON crm_workflow_execution_steps(execution_id, node_id);

-- =============================================================================
-- WORKFLOW EVENT SUBSCRIPTIONS TABLE
-- =============================================================================
-- Tracks event subscriptions for workflows waiting for external events

CREATE TABLE IF NOT EXISTS crm_workflow_event_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES crm_workflow_executions(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Event matching
    event_type VARCHAR(100) NOT NULL,
    event_filter JSONB NOT NULL DEFAULT '{}',

    -- Timeout
    timeout_at TIMESTAMP WITH TIME ZONE,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    matched_at TIMESTAMP WITH TIME ZONE,
    matched_event_data JSONB,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for event subscriptions
CREATE INDEX IF NOT EXISTS idx_event_subscriptions_execution
    ON crm_workflow_event_subscriptions(execution_id);
CREATE INDEX IF NOT EXISTS idx_event_subscriptions_workspace
    ON crm_workflow_event_subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_event_subscriptions_event_type
    ON crm_workflow_event_subscriptions(event_type)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_event_subscriptions_active
    ON crm_workflow_event_subscriptions(is_active, event_type)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_event_subscriptions_timeout
    ON crm_workflow_event_subscriptions(timeout_at)
    WHERE is_active = true AND timeout_at IS NOT NULL;

-- =============================================================================
-- UPDATE TRIGGER FOR updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION update_workflow_execution_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_workflow_execution_updated_at ON crm_workflow_executions;
CREATE TRIGGER trigger_workflow_execution_updated_at
    BEFORE UPDATE ON crm_workflow_executions
    FOR EACH ROW
    EXECUTE FUNCTION update_workflow_execution_updated_at();

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE crm_workflow_executions IS 'Tracks workflow execution instances for persistence, resumption after waits, and audit logging';
COMMENT ON TABLE crm_workflow_execution_steps IS 'Tracks individual node executions within a workflow for debugging and audit purposes';

COMMENT ON COLUMN crm_workflow_executions.status IS 'pending, running, paused, completed, failed, cancelled';
COMMENT ON COLUMN crm_workflow_executions.resume_at IS 'When to resume execution after a duration/datetime wait';
COMMENT ON COLUMN crm_workflow_executions.wait_event_type IS 'Event type being waited for (e.g., email.opened, form.submitted)';
COMMENT ON COLUMN crm_workflow_executions.context IS 'Serialized WorkflowExecutionContext for resumption';

COMMENT ON COLUMN crm_workflow_execution_steps.status IS 'pending, running, success, failed, skipped, waiting';
