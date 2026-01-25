-- App Access Templates Migration
-- Creates app_access_templates table for managing app bundle templates

-- =============================================================================
-- APP ACCESS TEMPLATES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_access_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- workspace_id is NULL for system templates
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Template metadata
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,

    -- Visual customization
    icon VARCHAR(50) NOT NULL DEFAULT 'Package',
    color VARCHAR(50) NOT NULL DEFAULT '#6366f1',

    -- App configuration: {app_id: {enabled: bool, modules: {module_id: bool}}}
    -- Example:
    -- {
    --     "tracking": {"enabled": true, "modules": {"standups": true, "blockers": true, "time": false}},
    --     "crm": {"enabled": true, "modules": {"inbox": true, "agents": false}},
    --     "hiring": {"enabled": false}
    -- }
    app_config JSONB NOT NULL DEFAULT '{}',

    -- System template (cannot be deleted or modified by users)
    is_system BOOLEAN NOT NULL DEFAULT FALSE,

    -- Active status (soft delete)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Unique slug per workspace (NULL workspace_id = system templates)
    CONSTRAINT uq_workspace_app_template_slug UNIQUE (workspace_id, slug)
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_app_access_templates_workspace_id ON app_access_templates(workspace_id);
CREATE INDEX IF NOT EXISTS ix_app_access_templates_slug ON app_access_templates(slug);
CREATE INDEX IF NOT EXISTS ix_app_access_templates_is_system ON app_access_templates(is_system);
CREATE INDEX IF NOT EXISTS ix_app_access_templates_is_active ON app_access_templates(is_active);
CREATE INDEX IF NOT EXISTS ix_app_access_templates_workspace_active ON app_access_templates(workspace_id, is_active);

-- GIN index for app_config JSONB queries
CREATE INDEX IF NOT EXISTS ix_app_access_templates_app_config_gin ON app_access_templates USING GIN (app_config);


-- =============================================================================
-- UPDATE TRIGGER FOR updated_at
-- =============================================================================

-- Function should already exist from other migrations
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for app_access_templates table
DROP TRIGGER IF EXISTS update_app_access_templates_updated_at ON app_access_templates;
CREATE TRIGGER update_app_access_templates_updated_at
    BEFORE UPDATE ON app_access_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- =============================================================================
-- INSERT SYSTEM TEMPLATES
-- =============================================================================

-- Engineering Bundle
INSERT INTO app_access_templates (id, workspace_id, name, slug, description, icon, color, app_config, is_system, is_active)
VALUES (
    '11111111-1111-1111-1111-111111111001',
    NULL,
    'Engineering',
    'engineering',
    'Apps for software development teams',
    'Code',
    '#2563eb',
    '{
        "dashboard": {"enabled": true, "modules": {}},
        "tracking": {"enabled": true, "modules": {"standups": true, "blockers": true, "time": true}},
        "sprints": {"enabled": true, "modules": {"board": true, "epics": true, "tasks": true, "backlog": true}},
        "tickets": {"enabled": true, "modules": {}},
        "docs": {"enabled": true, "modules": {}},
        "learning": {"enabled": true, "modules": {}},
        "oncall": {"enabled": true, "modules": {}},
        "reviews": {"enabled": false},
        "hiring": {"enabled": false},
        "crm": {"enabled": false},
        "email_marketing": {"enabled": false},
        "forms": {"enabled": false}
    }'::jsonb,
    TRUE,
    TRUE
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    app_config = EXCLUDED.app_config,
    updated_at = NOW();

-- People Bundle
INSERT INTO app_access_templates (id, workspace_id, name, slug, description, icon, color, app_config, is_system, is_active)
VALUES (
    '11111111-1111-1111-1111-111111111002',
    NULL,
    'People',
    'people',
    'Apps for HR and people operations',
    'Heart',
    '#f43f5e',
    '{
        "dashboard": {"enabled": true, "modules": {}},
        "reviews": {"enabled": true, "modules": {"cycles": true, "goals": true, "peer_requests": true, "manage": true}},
        "hiring": {"enabled": true, "modules": {"dashboard": true, "candidates": true, "assessments": true, "questions": true, "templates": true, "analytics": true}},
        "learning": {"enabled": true, "modules": {}},
        "docs": {"enabled": true, "modules": {}},
        "forms": {"enabled": true, "modules": {}},
        "tracking": {"enabled": false},
        "sprints": {"enabled": false},
        "tickets": {"enabled": false},
        "crm": {"enabled": false},
        "email_marketing": {"enabled": false},
        "oncall": {"enabled": false}
    }'::jsonb,
    TRUE,
    TRUE
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    app_config = EXCLUDED.app_config,
    updated_at = NOW();

-- Business Bundle
INSERT INTO app_access_templates (id, workspace_id, name, slug, description, icon, color, app_config, is_system, is_active)
VALUES (
    '11111111-1111-1111-1111-111111111003',
    NULL,
    'Business',
    'business',
    'Apps for sales and customer success',
    'Briefcase',
    '#06b6d4',
    '{
        "dashboard": {"enabled": true, "modules": {}},
        "crm": {"enabled": true, "modules": {"overview": true, "inbox": true, "agents": true, "activities": true, "automations": true, "calendar": true}},
        "email_marketing": {"enabled": true, "modules": {"campaigns": true, "templates": true, "settings": true}},
        "tickets": {"enabled": true, "modules": {}},
        "docs": {"enabled": true, "modules": {}},
        "forms": {"enabled": true, "modules": {}},
        "tracking": {"enabled": false},
        "sprints": {"enabled": false},
        "reviews": {"enabled": false},
        "hiring": {"enabled": false},
        "learning": {"enabled": false},
        "oncall": {"enabled": false}
    }'::jsonb,
    TRUE,
    TRUE
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    app_config = EXCLUDED.app_config,
    updated_at = NOW();

-- Full Access Bundle
INSERT INTO app_access_templates (id, workspace_id, name, slug, description, icon, color, app_config, is_system, is_active)
VALUES (
    '11111111-1111-1111-1111-111111111004',
    NULL,
    'Full Access',
    'full_access',
    'Access to all apps and modules',
    'Shield',
    '#9333ea',
    '{
        "dashboard": {"enabled": true, "modules": {}},
        "tracking": {"enabled": true, "modules": {"standups": true, "blockers": true, "time": true}},
        "sprints": {"enabled": true, "modules": {"board": true, "epics": true, "tasks": true, "backlog": true}},
        "tickets": {"enabled": true, "modules": {}},
        "reviews": {"enabled": true, "modules": {"cycles": true, "goals": true, "peer_requests": true, "manage": true}},
        "hiring": {"enabled": true, "modules": {"dashboard": true, "candidates": true, "assessments": true, "questions": true, "templates": true, "analytics": true}},
        "learning": {"enabled": true, "modules": {}},
        "crm": {"enabled": true, "modules": {"overview": true, "inbox": true, "agents": true, "activities": true, "automations": true, "calendar": true}},
        "email_marketing": {"enabled": true, "modules": {"campaigns": true, "templates": true, "settings": true}},
        "docs": {"enabled": true, "modules": {}},
        "forms": {"enabled": true, "modules": {}},
        "oncall": {"enabled": true, "modules": {}}
    }'::jsonb,
    TRUE,
    TRUE
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    app_config = EXCLUDED.app_config,
    updated_at = NOW();


-- =============================================================================
-- APP ACCESS LOGS TABLE (Enterprise Feature)
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Workspace reference
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Who performed the action
    actor_id UUID REFERENCES developers(id) ON DELETE SET NULL,

    -- Action type (e.g., 'template_applied', 'access_updated', 'access_denied')
    action VARCHAR(50) NOT NULL,

    -- Target information
    target_type VARCHAR(50) NOT NULL, -- 'member', 'template', 'workspace'
    target_id UUID, -- Member or template ID

    -- Description of the action
    description TEXT,

    -- State changes
    old_value JSONB,
    new_value JSONB,

    -- Additional context (app_id, module_id, template_name, etc.)
    extra_data JSONB NOT NULL DEFAULT '{}',

    -- Request metadata
    ip_address VARCHAR(45),
    user_agent TEXT,

    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for app_access_logs
CREATE INDEX IF NOT EXISTS ix_app_access_logs_workspace_id ON app_access_logs(workspace_id);
CREATE INDEX IF NOT EXISTS ix_app_access_logs_actor_id ON app_access_logs(actor_id);
CREATE INDEX IF NOT EXISTS ix_app_access_logs_action ON app_access_logs(action);
CREATE INDEX IF NOT EXISTS ix_app_access_logs_target_id ON app_access_logs(target_id);
CREATE INDEX IF NOT EXISTS ix_app_access_logs_created_at ON app_access_logs(created_at);
CREATE INDEX IF NOT EXISTS ix_app_access_logs_workspace_created ON app_access_logs(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS ix_app_access_logs_actor_action ON app_access_logs(actor_id, action);

-- GIN index for extra_data JSONB queries
CREATE INDEX IF NOT EXISTS ix_app_access_logs_extra_data_gin ON app_access_logs USING GIN (extra_data);


-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Verify tables were created
SELECT 'app_access_templates' as table_name, COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name = 'app_access_templates';

SELECT 'app_access_logs' as table_name, COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name = 'app_access_logs';

-- Verify system templates were inserted
SELECT id, name, slug, is_system, is_active
FROM app_access_templates
WHERE is_system = TRUE
ORDER BY name;
