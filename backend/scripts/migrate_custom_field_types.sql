-- Custom Field Types migration (Phase 8.7)
-- Workspace-defined custom field types that compose built-in base types

CREATE TABLE IF NOT EXISTS custom_field_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL,
    base_type VARCHAR(30) NOT NULL,
    default_variant VARCHAR(30),
    default_display_config JSONB,
    icon VARCHAR(50),
    color VARCHAR(20),
    validation_rules JSONB,
    preset_options JSONB,
    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_custom_field_types_workspace ON custom_field_types(workspace_id);
