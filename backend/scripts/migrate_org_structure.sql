-- Aexy Organization Structure — hierarchical departments/functions
-- Models: models/organization.py. Plan: prds/BIMAPLAN_SERVICE_DESK_PLAN.md §3.
-- A first-class org layer above the delivery-focused `teams` table:
-- departments (org tree), multi-function membership, headcount seats,
-- plus reporting lines and team rollup on existing tables.

-- ============================================
-- DEPARTMENTS (org tree)
-- ============================================
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    slug VARCHAR(120) NOT NULL,
    description TEXT,

    -- canonical routing key (ops_kam/sales/finance/marketing/hr/engineering/…)
    function_key VARCHAR(64),

    -- hierarchy: materialized path of ancestor ids incl. self ("/a/b/self/")
    parent_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    path TEXT NOT NULL DEFAULT '',
    depth INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,

    head_id UUID REFERENCES developers(id) ON DELETE SET NULL,

    cost_center VARCHAR(64),
    budget_amount NUMERIC(18, 2),
    budget_currency VARCHAR(3),
    headcount_planned INTEGER NOT NULL DEFAULT 0,
    location VARCHAR(255),
    timezone VARCHAR(64),

    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_department_slug UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS ix_departments_workspace ON departments(workspace_id);
CREATE INDEX IF NOT EXISTS ix_departments_parent ON departments(parent_id);
CREATE INDEX IF NOT EXISTS ix_departments_path ON departments(path);
CREATE INDEX IF NOT EXISTS ix_departments_head ON departments(head_id);
-- one department per canonical function_key per workspace (when set)
CREATE UNIQUE INDEX IF NOT EXISTS uq_department_function_key
    ON departments(workspace_id, function_key)
    WHERE function_key IS NOT NULL;

-- ============================================
-- DEPARTMENT MEMBERS (multi-function membership)
-- ============================================
CREATE TABLE IF NOT EXISTS department_members (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,

    role_in_department VARCHAR(20) NOT NULL DEFAULT 'member',
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    allocation_percent INTEGER NOT NULL DEFAULT 100,
    source VARCHAR(32) NOT NULL DEFAULT 'manual',

    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_department_member UNIQUE (department_id, developer_id)
);

CREATE INDEX IF NOT EXISTS ix_department_members_workspace ON department_members(workspace_id);
CREATE INDEX IF NOT EXISTS ix_department_members_department ON department_members(department_id);
CREATE INDEX IF NOT EXISTS ix_department_members_developer ON department_members(developer_id);
-- a developer has at most one PRIMARY department per workspace
CREATE UNIQUE INDEX IF NOT EXISTS uq_department_member_primary
    ON department_members(workspace_id, developer_id)
    WHERE is_primary;

-- ============================================
-- DEPARTMENT POSITIONS (headcount seats — optional)
-- ============================================
CREATE TABLE IF NOT EXISTS department_positions (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,

    title VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    filled_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_department_positions_department ON department_positions(department_id);

-- ============================================
-- EXISTING TABLE EXTENSIONS
-- ============================================
-- Team rollup under a department
ALTER TABLE teams ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_teams_department ON teams(department_id);

-- People-level reporting line on workspace membership
ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES developers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_workspace_members_manager ON workspace_members(manager_id);
