-- Phase 0 + Phase 1: Data Table Engine - Scope, Visibility, and Authorization
-- Extends crm_objects to serve as the shared data table engine
-- Adds table_collaborators for per-table authorization

-- ============================================================================
-- PHASE 0: Scope & Visibility on crm_objects
-- ============================================================================

-- Discriminator: which module owns this table?
ALTER TABLE crm_objects ADD COLUMN IF NOT EXISTS scope VARCHAR(20) NOT NULL DEFAULT 'crm';
-- 'crm'        — CRM module (existing behavior)
-- 'standalone'  — User-created standalone table
-- 'document'    — Inline database embedded in a doc
-- 'project'     — Project-scoped table (sprints, etc.)

-- Who created this table?
ALTER TABLE crm_objects ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL;

-- Visibility: who can discover this table?
ALTER TABLE crm_objects ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'workspace';
-- 'private'    — only creator + explicit collaborators
-- 'workspace'  — all workspace members can see it
-- 'project'    — project members can see it
-- 'public'     — anyone with link

-- Row-level security mode
ALTER TABLE crm_objects ADD COLUMN IF NOT EXISTS row_access_mode VARCHAR(20) NOT NULL DEFAULT 'all';
-- 'all'           — everyone with table access sees all rows
-- 'owner_only'    — see only your own records
-- 'team_filtered' — see records owned by your team members
-- 'rule_based'    — per-collaborator row_filter applied

-- Link to document for inline databases
ALTER TABLE crm_objects ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES documents(id) ON DELETE SET NULL;

-- Audit configuration
ALTER TABLE crm_objects ADD COLUMN IF NOT EXISTS audit_config JSONB DEFAULT '{"enabled": false}';

-- Backfill existing CRM objects: scope=crm, visibility=workspace
UPDATE crm_objects SET scope = 'crm' WHERE scope IS NULL OR scope = '';
UPDATE crm_objects SET visibility = 'workspace' WHERE visibility IS NULL OR visibility = '';
UPDATE crm_objects SET row_access_mode = 'all' WHERE row_access_mode IS NULL OR row_access_mode = '';

-- Indexes for scope/visibility queries
CREATE INDEX IF NOT EXISTS idx_crm_objects_scope ON crm_objects(workspace_id, scope);
CREATE INDEX IF NOT EXISTS idx_crm_objects_visibility ON crm_objects(workspace_id, visibility);
CREATE INDEX IF NOT EXISTS idx_crm_objects_created_by ON crm_objects(created_by_id);


-- ============================================================================
-- PHASE 1: Authorization Layer - table_collaborators
-- ============================================================================

CREATE TABLE IF NOT EXISTS table_collaborators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL REFERENCES crm_objects(id) ON DELETE CASCADE,

    -- WHO (exactly one of these is set)
    developer_id UUID REFERENCES developers(id) ON DELETE CASCADE,
    role_id UUID REFERENCES custom_roles(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,

    -- WHAT permission level
    permission VARCHAR(20) NOT NULL DEFAULT 'view',
    -- 'view'    — read records
    -- 'comment' — view + add notes
    -- 'edit'    — view + create/update records
    -- 'manage'  — edit + delete records + manage fields
    -- 'admin'   — manage + share + permissions + delete table

    -- Column restrictions (JSONB arrays of attribute slugs)
    hidden_columns JSONB DEFAULT '[]',
    readonly_columns JSONB DEFAULT '[]',

    -- Row restrictions (when row_access_mode = 'rule_based')
    row_filter JSONB DEFAULT NULL,
    -- Same format as saved view filters:
    -- [{"attribute": "region", "operator": "equals", "value": "APAC"}]

    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,

    -- Ensure only one entry per (table, collaborator target)
    CONSTRAINT uq_table_collab_developer UNIQUE (table_id, developer_id),
    CONSTRAINT uq_table_collab_role UNIQUE (table_id, role_id),
    CONSTRAINT uq_table_collab_team UNIQUE (table_id, team_id),

    -- Ensure exactly one target is set
    CONSTRAINT chk_one_target CHECK (
        (developer_id IS NOT NULL)::int +
        (role_id IS NOT NULL)::int +
        (team_id IS NOT NULL)::int = 1
    )
);

-- Indexes for permission lookup
CREATE INDEX IF NOT EXISTS idx_table_collab_table ON table_collaborators(table_id);
CREATE INDEX IF NOT EXISTS idx_table_collab_developer ON table_collaborators(developer_id);
CREATE INDEX IF NOT EXISTS idx_table_collab_role ON table_collaborators(role_id);
CREATE INDEX IF NOT EXISTS idx_table_collab_team ON table_collaborators(team_id);
