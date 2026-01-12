-- Forms Module Migration
-- Creates standalone forms tables with CRM and Ticketing integration

-- =============================================================================
-- FORMS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Form identity
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    description TEXT,

    -- Template base
    template_type VARCHAR(50),

    -- Public access settings
    public_url_token VARCHAR(32) UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Authentication settings
    auth_mode VARCHAR(50) NOT NULL DEFAULT 'anonymous',
    require_email BOOLEAN NOT NULL DEFAULT TRUE,

    -- Form appearance
    theme JSONB NOT NULL DEFAULT '{}',
    success_message TEXT,
    redirect_url VARCHAR(500),

    -- Ticketing integration
    auto_create_ticket BOOLEAN NOT NULL DEFAULT FALSE,
    ticket_config JSONB NOT NULL DEFAULT '{}',
    default_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    ticket_assignment_mode VARCHAR(50) NOT NULL DEFAULT 'none',
    ticket_assignee_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    default_severity VARCHAR(50),
    default_priority VARCHAR(50),
    ticket_field_mappings JSONB NOT NULL DEFAULT '{}',

    -- CRM record integration
    auto_create_record BOOLEAN NOT NULL DEFAULT FALSE,
    crm_object_id UUID REFERENCES crm_objects(id) ON DELETE SET NULL,
    crm_field_mappings JSONB NOT NULL DEFAULT '{}',
    record_owner_id UUID REFERENCES developers(id) ON DELETE SET NULL,

    -- Deal integration
    auto_create_deal BOOLEAN NOT NULL DEFAULT FALSE,
    deal_pipeline_id UUID,
    deal_stage_id UUID,
    deal_field_mappings JSONB NOT NULL DEFAULT '{}',
    link_deal_to_record BOOLEAN NOT NULL DEFAULT TRUE,

    -- Automation integration
    trigger_automations BOOLEAN NOT NULL DEFAULT TRUE,
    automation_ids JSONB NOT NULL DEFAULT '[]',

    -- External destinations
    destinations JSONB NOT NULL DEFAULT '[]',

    -- Conditional logic
    conditional_rules JSONB NOT NULL DEFAULT '[]',

    -- Stats
    submission_count INTEGER NOT NULL DEFAULT 0,

    -- Creator
    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT uq_form_slug UNIQUE (workspace_id, slug)
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_forms_workspace_id ON forms(workspace_id);
CREATE INDEX IF NOT EXISTS ix_forms_crm_object_id ON forms(crm_object_id);
CREATE INDEX IF NOT EXISTS ix_forms_workspace_active ON forms(workspace_id, is_active);


-- =============================================================================
-- FORM FIELDS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS form_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,

    -- Field identity
    name VARCHAR(255) NOT NULL,
    field_key VARCHAR(100) NOT NULL,

    -- Field type
    field_type VARCHAR(50) NOT NULL DEFAULT 'text',

    -- Display configuration
    placeholder VARCHAR(255),
    default_value TEXT,
    help_text TEXT,

    -- Validation
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    validation_rules JSONB NOT NULL DEFAULT '{}',

    -- For select/multiselect/radio
    options JSONB,

    -- Layout
    position INTEGER NOT NULL DEFAULT 0,
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    width VARCHAR(20) NOT NULL DEFAULT 'full',

    -- CRM attribute mapping
    crm_attribute_id UUID,

    -- External platform mappings
    external_mappings JSONB NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT uq_form_field_key UNIQUE (form_id, field_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_form_fields_form_id ON form_fields(form_id);
CREATE INDEX IF NOT EXISTS ix_form_fields_form_position ON form_fields(form_id, position);


-- =============================================================================
-- FORM SUBMISSIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS form_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Submission data
    data JSONB NOT NULL DEFAULT '{}',
    attachments JSONB NOT NULL DEFAULT '[]',

    -- Submitter information
    email VARCHAR(255),
    name VARCHAR(255),

    -- Email verification
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verification_token VARCHAR(64),
    verified_at TIMESTAMP WITH TIME ZONE,

    -- Processing status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    processing_errors JSONB NOT NULL DEFAULT '[]',

    -- Created resources
    ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
    crm_record_id UUID REFERENCES crm_records(id) ON DELETE SET NULL,
    deal_id UUID REFERENCES crm_records(id) ON DELETE SET NULL,
    external_issues JSONB NOT NULL DEFAULT '[]',
    automations_triggered JSONB NOT NULL DEFAULT '[]',

    -- Metadata
    ip_address VARCHAR(45),
    user_agent TEXT,
    referrer_url VARCHAR(2000),
    utm_params JSONB NOT NULL DEFAULT '{}',

    -- Timestamps
    submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,

    -- Constraints
    CONSTRAINT ix_form_submissions_form_submitted UNIQUE (form_id, submitted_at)
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_form_submissions_form_id ON form_submissions(form_id);
CREATE INDEX IF NOT EXISTS ix_form_submissions_workspace_id ON form_submissions(workspace_id);
CREATE INDEX IF NOT EXISTS ix_form_submissions_email ON form_submissions(email);
CREATE INDEX IF NOT EXISTS ix_form_submissions_status ON form_submissions(status);
CREATE INDEX IF NOT EXISTS ix_form_submissions_ticket_id ON form_submissions(ticket_id);
CREATE INDEX IF NOT EXISTS ix_form_submissions_crm_record_id ON form_submissions(crm_record_id);
CREATE INDEX IF NOT EXISTS ix_form_submissions_deal_id ON form_submissions(deal_id);
CREATE INDEX IF NOT EXISTS ix_form_submissions_workspace_submitted ON form_submissions(workspace_id, submitted_at);
CREATE INDEX IF NOT EXISTS ix_form_submissions_data_gin ON form_submissions USING GIN (data);


-- =============================================================================
-- FORM AUTOMATION LINKS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS form_automation_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    automation_id UUID NOT NULL REFERENCES crm_automations(id) ON DELETE CASCADE,

    -- Link enabled/disabled
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Optional condition overrides
    conditions JSONB NOT NULL DEFAULT '[]',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT uq_form_automation_link UNIQUE (form_id, automation_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_form_automation_links_form_id ON form_automation_links(form_id);
CREATE INDEX IF NOT EXISTS ix_form_automation_links_automation_id ON form_automation_links(automation_id);


-- =============================================================================
-- UPDATE TRIGGER FOR updated_at
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for forms table
DROP TRIGGER IF EXISTS update_forms_updated_at ON forms;
CREATE TRIGGER update_forms_updated_at
    BEFORE UPDATE ON forms
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Triggers for form_fields table
DROP TRIGGER IF EXISTS update_form_fields_updated_at ON form_fields;
CREATE TRIGGER update_form_fields_updated_at
    BEFORE UPDATE ON form_fields
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- =============================================================================
-- GRANT PERMISSIONS (if needed)
-- =============================================================================

-- Add any necessary grants here based on your database user setup


-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Verify tables were created
SELECT 'forms' as table_name, COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name = 'forms'
UNION ALL
SELECT 'form_fields', COUNT(*)
FROM information_schema.columns
WHERE table_name = 'form_fields'
UNION ALL
SELECT 'form_submissions', COUNT(*)
FROM information_schema.columns
WHERE table_name = 'form_submissions'
UNION ALL
SELECT 'form_automation_links', COUNT(*)
FROM information_schema.columns
WHERE table_name = 'form_automation_links';
