-- Leave Management Module Migration
-- Creates tables for leave types, policies, requests, balances, and holidays

-- Leave Types Table
CREATE TABLE IF NOT EXISTS leave_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(20) NOT NULL DEFAULT '#3b82f6',
    icon VARCHAR(50),

    is_paid BOOLEAN NOT NULL DEFAULT TRUE,
    requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
    min_notice_days INTEGER NOT NULL DEFAULT 0,
    allows_half_day BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_leave_type_workspace_slug UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_leave_types_workspace ON leave_types(workspace_id);

-- Leave Policies Table
CREATE TABLE IF NOT EXISTS leave_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,

    annual_quota DOUBLE PRECISION NOT NULL DEFAULT 0,
    accrual_type VARCHAR(20) NOT NULL DEFAULT 'upfront',

    carry_forward_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    max_carry_forward_days DOUBLE PRECISION NOT NULL DEFAULT 0,

    applicable_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
    applicable_team_ids JSONB NOT NULL DEFAULT '[]'::jsonb,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_leave_policy_workspace_type UNIQUE (workspace_id, leave_type_id)
);

CREATE INDEX IF NOT EXISTS idx_leave_policies_workspace ON leave_policies(workspace_id);
CREATE INDEX IF NOT EXISTS idx_leave_policies_leave_type ON leave_policies(leave_type_id);

-- Leave Requests Table
CREATE TABLE IF NOT EXISTS leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,

    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_half_day BOOLEAN NOT NULL DEFAULT FALSE,
    half_day_period VARCHAR(20),
    total_days DOUBLE PRECISION NOT NULL,

    reason TEXT,

    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    approver_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,

    calendar_event_id VARCHAR(255),

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_workspace ON leave_requests(workspace_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_developer ON leave_requests(developer_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_leave_type ON leave_requests(leave_type_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_start_date ON leave_requests(start_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_end_date ON leave_requests(end_date);

-- Leave Balances Table
CREATE TABLE IF NOT EXISTS leave_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,

    year INTEGER NOT NULL,

    total_allocated DOUBLE PRECISION NOT NULL DEFAULT 0,
    used DOUBLE PRECISION NOT NULL DEFAULT 0,
    pending DOUBLE PRECISION NOT NULL DEFAULT 0,
    carried_forward DOUBLE PRECISION NOT NULL DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_leave_balance_dev_type_year UNIQUE (developer_id, leave_type_id, year)
);

CREATE INDEX IF NOT EXISTS idx_leave_balances_workspace ON leave_balances(workspace_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_developer ON leave_balances(developer_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_leave_type ON leave_balances(leave_type_id);

-- Holidays Table
CREATE TABLE IF NOT EXISTS holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    description TEXT,

    is_optional BOOLEAN NOT NULL DEFAULT FALSE,

    applicable_team_ids JSONB NOT NULL DEFAULT '[]'::jsonb,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holidays_workspace ON holidays(workspace_id);
CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
