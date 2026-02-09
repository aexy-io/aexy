-- Recurring Reminders Module Migration
-- Creates tables for reminders, instances, escalations, and assignment rules

-- =============================================================================
-- ASSIGNMENT RULES TABLE
-- Custom rules for automatic owner assignment
-- =============================================================================

CREATE TABLE IF NOT EXISTS reminder_assignment_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Rule configuration (JSONB)
    -- {
    --   "conditions": [{"field": "category", "operator": "equals", "value": "compliance"}],
    --   "assign_to": {"type": "team", "id": "..."},
    --   "priority": 10
    -- }
    rule_config JSONB NOT NULL DEFAULT '{}',

    -- Priority for rule ordering (higher = evaluated first)
    priority INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for assignment rules
CREATE INDEX IF NOT EXISTS idx_reminder_assignment_rules_workspace ON reminder_assignment_rules(workspace_id);
CREATE INDEX IF NOT EXISTS idx_reminder_assignment_rules_active ON reminder_assignment_rules(workspace_id, is_active, priority DESC) WHERE is_active = true;

COMMENT ON TABLE reminder_assignment_rules IS 'Custom rules for automatic owner assignment to reminders';
COMMENT ON COLUMN reminder_assignment_rules.rule_config IS 'JSON with conditions and assignment target';
COMMENT ON COLUMN reminder_assignment_rules.priority IS 'Higher priority rules are evaluated first';


-- =============================================================================
-- REMINDERS TABLE
-- Recurring reminder definitions
-- =============================================================================

CREATE TABLE IF NOT EXISTS reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Basic info
    title VARCHAR(500) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL DEFAULT 'custom',
    priority VARCHAR(50) NOT NULL DEFAULT 'medium',
    status VARCHAR(50) NOT NULL DEFAULT 'active',

    -- Schedule configuration
    frequency VARCHAR(50) NOT NULL DEFAULT 'monthly',
    cron_expression VARCHAR(100),
    timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',

    -- Date range
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,

    -- Pre-calculated next occurrence for efficient scheduling queries
    next_occurrence TIMESTAMP WITH TIME ZONE,

    -- Assignment configuration
    assignment_strategy VARCHAR(50) NOT NULL DEFAULT 'fixed',
    default_owner_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    default_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    domain VARCHAR(255),

    -- Escalation configuration (JSONB)
    -- {
    --   "enabled": true,
    --   "levels": [
    --     {"level": "l1", "delay_hours": 24, "notify_owner_id": "...", "notify_team_id": "..."},
    --     {"level": "l2", "delay_hours": 48, "notify_owner_id": "...", "slack_channel": "#escalations"}
    --   ]
    -- }
    escalation_config JSONB NOT NULL DEFAULT '{}',

    -- Notification configuration (JSONB)
    -- {
    --   "channels": ["in_app", "email", "slack"],
    --   "notify_before_hours": [24, 1],
    --   "slack_channel": "#reminders"
    -- }
    notification_config JSONB NOT NULL DEFAULT '{}',

    -- Behavior flags
    requires_acknowledgment BOOLEAN NOT NULL DEFAULT true,
    requires_evidence BOOLEAN NOT NULL DEFAULT false,

    -- Round-robin tracking
    round_robin_index INTEGER NOT NULL DEFAULT 0,

    -- Source tracking (for auto-generated reminders)
    source_type VARCHAR(100),
    source_id UUID,
    source_question_id UUID,

    -- Metadata (tags, custom fields, etc.)
    metadata JSONB NOT NULL DEFAULT '{}',

    -- Audit
    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_reminder_category CHECK (category IN ('compliance', 'security', 'audit', 'operational', 'training', 'review', 'custom')),
    CONSTRAINT chk_reminder_priority CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT chk_reminder_status CHECK (status IN ('active', 'paused', 'archived')),
    CONSTRAINT chk_reminder_frequency CHECK (frequency IN ('once', 'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly', 'custom')),
    CONSTRAINT chk_reminder_assignment_strategy CHECK (assignment_strategy IN ('fixed', 'round_robin', 'on_call', 'domain_mapping', 'custom_rule')),
    CONSTRAINT chk_reminder_cron_required CHECK (
        (frequency = 'custom' AND cron_expression IS NOT NULL) OR
        frequency != 'custom'
    )
);

-- Indexes for reminders
CREATE INDEX IF NOT EXISTS idx_reminders_workspace ON reminders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_reminders_workspace_status ON reminders(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_reminders_next_occurrence ON reminders(next_occurrence) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_reminders_priority ON reminders(priority);
CREATE INDEX IF NOT EXISTS idx_reminders_category ON reminders(category);
CREATE INDEX IF NOT EXISTS idx_reminders_default_owner ON reminders(default_owner_id);
CREATE INDEX IF NOT EXISTS idx_reminders_default_team ON reminders(default_team_id);
CREATE INDEX IF NOT EXISTS idx_reminders_domain ON reminders(domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reminders_source ON reminders(source_type, source_id) WHERE source_type IS NOT NULL;

COMMENT ON TABLE reminders IS 'Recurring reminder definitions for compliance and commitment tracking';
COMMENT ON COLUMN reminders.next_occurrence IS 'Pre-calculated for efficient scheduler queries';
COMMENT ON COLUMN reminders.assignment_strategy IS 'How owners are assigned: fixed, round_robin, on_call, domain_mapping, custom_rule';
COMMENT ON COLUMN reminders.domain IS 'Domain for control owner mapping';
COMMENT ON COLUMN reminders.source_type IS 'Origin: manual, questionnaire';


-- =============================================================================
-- REMINDER INSTANCES TABLE
-- Individual occurrences of recurring reminders
-- =============================================================================

CREATE TABLE IF NOT EXISTS reminder_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reminder_id UUID NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,

    -- When this instance is due
    due_date TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Current status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',

    -- Current escalation level (if escalated)
    current_escalation_level VARCHAR(10),

    -- Assignment
    assigned_owner_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    assigned_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,

    -- Notification tracking
    initial_notified_at TIMESTAMP WITH TIME ZONE,
    last_notified_at TIMESTAMP WITH TIME ZONE,
    notification_count INTEGER NOT NULL DEFAULT 0,

    -- Acknowledgment tracking
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    acknowledgment_notes TEXT,

    -- Completion tracking
    completed_at TIMESTAMP WITH TIME ZONE,
    completed_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    completion_notes TEXT,

    -- Skip tracking
    skipped_at TIMESTAMP WITH TIME ZONE,
    skipped_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    skip_reason TEXT,

    -- Evidence tracking
    evidence_links JSONB NOT NULL DEFAULT '[]',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_instance_status CHECK (status IN ('pending', 'notified', 'acknowledged', 'completed', 'skipped', 'escalated', 'overdue')),
    CONSTRAINT chk_instance_escalation_level CHECK (current_escalation_level IS NULL OR current_escalation_level IN ('l1', 'l2', 'l3', 'l4')),
    CONSTRAINT chk_instance_completion CHECK (
        (status = 'completed' AND completed_at IS NOT NULL) OR status != 'completed'
    ),
    CONSTRAINT chk_instance_skip CHECK (
        (status = 'skipped' AND skipped_at IS NOT NULL) OR status != 'skipped'
    )
);

-- Indexes for reminder instances
CREATE INDEX IF NOT EXISTS idx_reminder_instances_reminder ON reminder_instances(reminder_id);
CREATE INDEX IF NOT EXISTS idx_reminder_instances_due_date ON reminder_instances(due_date);
CREATE INDEX IF NOT EXISTS idx_reminder_instances_status ON reminder_instances(status);
CREATE INDEX IF NOT EXISTS idx_reminder_instances_due_pending ON reminder_instances(due_date, status) WHERE status IN ('pending', 'notified', 'acknowledged');
CREATE INDEX IF NOT EXISTS idx_reminder_instances_assigned_owner ON reminder_instances(assigned_owner_id) WHERE assigned_owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reminder_instances_assigned_team ON reminder_instances(assigned_team_id) WHERE assigned_team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reminder_instances_escalation ON reminder_instances(current_escalation_level, status) WHERE status = 'escalated';

COMMENT ON TABLE reminder_instances IS 'Individual occurrences of recurring reminders';
COMMENT ON COLUMN reminder_instances.status IS 'Lifecycle: pending -> notified -> acknowledged -> completed/skipped/escalated/overdue';
COMMENT ON COLUMN reminder_instances.evidence_links IS 'Array of {url, title, uploaded_at, uploaded_by}';


-- =============================================================================
-- REMINDER ESCALATIONS TABLE
-- Records of escalations for reminder instances
-- =============================================================================

CREATE TABLE IF NOT EXISTS reminder_escalations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID NOT NULL REFERENCES reminder_instances(id) ON DELETE CASCADE,

    -- Escalation level
    level VARCHAR(10) NOT NULL,

    -- Who was notified
    escalated_to_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    escalated_to_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,

    -- When
    notified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- How
    notification_channels JSONB NOT NULL DEFAULT '{}',

    -- Response tracking
    responded_at TIMESTAMP WITH TIME ZONE,
    response_notes TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_escalation_level CHECK (level IN ('l1', 'l2', 'l3', 'l4'))
);

-- Indexes for escalations
CREATE INDEX IF NOT EXISTS idx_reminder_escalations_instance ON reminder_escalations(instance_id);
CREATE INDEX IF NOT EXISTS idx_reminder_escalations_level ON reminder_escalations(level);
CREATE INDEX IF NOT EXISTS idx_reminder_escalations_escalated_to ON reminder_escalations(escalated_to_id) WHERE escalated_to_id IS NOT NULL;

COMMENT ON TABLE reminder_escalations IS 'Records of escalations for overdue reminder instances';
COMMENT ON COLUMN reminder_escalations.notification_channels IS 'JSON: {"channels": ["email", "slack"], "slack_channel": "#escalations"}';


-- =============================================================================
-- CONTROL OWNERS TABLE
-- Maps controls/domains to their owners for automatic assignment
-- =============================================================================

CREATE TABLE IF NOT EXISTS reminder_control_owners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Control identification
    control_id VARCHAR(255),
    control_name VARCHAR(500) NOT NULL,
    domain VARCHAR(255) NOT NULL,

    -- Ownership
    primary_owner_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    backup_owner_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT uq_control_owner_workspace_control UNIQUE (workspace_id, control_id)
);

-- Indexes for control owners
CREATE INDEX IF NOT EXISTS idx_reminder_control_owners_workspace ON reminder_control_owners(workspace_id);
CREATE INDEX IF NOT EXISTS idx_reminder_control_owners_domain ON reminder_control_owners(workspace_id, domain);
CREATE INDEX IF NOT EXISTS idx_reminder_control_owners_primary ON reminder_control_owners(primary_owner_id) WHERE primary_owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reminder_control_owners_team ON reminder_control_owners(team_id) WHERE team_id IS NOT NULL;

COMMENT ON TABLE reminder_control_owners IS 'Maps compliance controls/domains to responsible owners';
COMMENT ON COLUMN reminder_control_owners.control_id IS 'External control identifier (e.g., SOC2-CC1.1)';
COMMENT ON COLUMN reminder_control_owners.domain IS 'Domain category: security, compliance, infrastructure, etc.';


-- =============================================================================
-- DOMAIN TEAM MAPPINGS TABLE
-- Maps domains to responsible teams
-- =============================================================================

CREATE TABLE IF NOT EXISTS reminder_domain_team_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    domain VARCHAR(255) NOT NULL,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

    -- Priority for handling overlapping domains
    priority INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT uq_domain_team_mapping_workspace_domain_team UNIQUE (workspace_id, domain, team_id)
);

-- Indexes for domain team mappings
CREATE INDEX IF NOT EXISTS idx_reminder_domain_team_workspace ON reminder_domain_team_mappings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_reminder_domain_team_domain ON reminder_domain_team_mappings(workspace_id, domain, priority DESC);

COMMENT ON TABLE reminder_domain_team_mappings IS 'Maps domains to responsible teams for automatic assignment';


-- =============================================================================
-- REMINDER SUGGESTIONS TABLE
-- Auto-generated reminder suggestions from questionnaire analysis
-- =============================================================================

CREATE TABLE IF NOT EXISTS reminder_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Source
    questionnaire_response_id UUID,
    question_id UUID,
    answer_text TEXT,

    -- Suggested reminder details
    suggested_title VARCHAR(500) NOT NULL,
    suggested_description TEXT,
    suggested_category VARCHAR(50) NOT NULL DEFAULT 'compliance',
    suggested_frequency VARCHAR(50) NOT NULL,
    suggested_domain VARCHAR(255),

    -- Confidence score (0-1)
    confidence_score FLOAT NOT NULL DEFAULT 0.5,

    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',

    -- If accepted, link to created reminder
    created_reminder_id UUID REFERENCES reminders(id) ON DELETE SET NULL,

    -- Review tracking
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    rejection_reason TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_suggestion_status CHECK (status IN ('pending', 'accepted', 'rejected'))
);

-- Indexes for reminder suggestions
CREATE INDEX IF NOT EXISTS idx_reminder_suggestions_workspace ON reminder_suggestions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_reminder_suggestions_status ON reminder_suggestions(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_reminder_suggestions_questionnaire ON reminder_suggestions(questionnaire_response_id) WHERE questionnaire_response_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reminder_suggestions_confidence ON reminder_suggestions(confidence_score DESC) WHERE status = 'pending';

COMMENT ON TABLE reminder_suggestions IS 'Auto-generated reminder suggestions from questionnaire analysis';
COMMENT ON COLUMN reminder_suggestions.confidence_score IS 'AI confidence in suggestion (0-1)';


-- =============================================================================
-- TRIGGERS: Update timestamps on update
-- =============================================================================

CREATE OR REPLACE FUNCTION update_reminder_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_reminder_updated ON reminders;
CREATE TRIGGER trigger_reminder_updated
    BEFORE UPDATE ON reminders
    FOR EACH ROW
    EXECUTE FUNCTION update_reminder_timestamp();

DROP TRIGGER IF EXISTS trigger_reminder_instance_updated ON reminder_instances;
CREATE TRIGGER trigger_reminder_instance_updated
    BEFORE UPDATE ON reminder_instances
    FOR EACH ROW
    EXECUTE FUNCTION update_reminder_timestamp();

DROP TRIGGER IF EXISTS trigger_reminder_assignment_rule_updated ON reminder_assignment_rules;
CREATE TRIGGER trigger_reminder_assignment_rule_updated
    BEFORE UPDATE ON reminder_assignment_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_reminder_timestamp();

DROP TRIGGER IF EXISTS trigger_reminder_control_owner_updated ON reminder_control_owners;
CREATE TRIGGER trigger_reminder_control_owner_updated
    BEFORE UPDATE ON reminder_control_owners
    FOR EACH ROW
    EXECUTE FUNCTION update_reminder_timestamp();

DROP TRIGGER IF EXISTS trigger_reminder_domain_team_mapping_updated ON reminder_domain_team_mappings;
CREATE TRIGGER trigger_reminder_domain_team_mapping_updated
    BEFORE UPDATE ON reminder_domain_team_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_reminder_timestamp();


-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Summary of created objects:
-- Tables:
--   - reminder_assignment_rules (custom assignment rules)
--   - reminders (recurring reminder definitions)
--   - reminder_instances (individual occurrences)
--   - reminder_escalations (escalation records)
--   - reminder_control_owners (control-to-owner mappings)
--   - reminder_domain_team_mappings (domain-to-team mappings)
--   - reminder_suggestions (AI-generated suggestions)
-- Indexes: 30+ indexes for query optimization
-- Triggers: 5 triggers for automatic timestamp updates
-- Constraints: Check constraints for data integrity
