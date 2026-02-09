-- Developer Insights v2: Settings, alerts, schedules, dashboards, working schedules
-- Extends the original migration with metadata/config tables

-- Enums
DO $$ BEGIN
    CREATE TYPE alert_severity_enum AS ENUM ('info', 'warning', 'critical');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE alert_status_enum AS ENUM ('triggered', 'acknowledged', 'resolved', 'snoozed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE insight_schedule_freq_enum AS ENUM ('daily', 'weekly', 'biweekly', 'monthly');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 1. Insight Settings (workspace-level and team-level config)
CREATE TABLE IF NOT EXISTS insight_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    working_hours JSONB,
    health_score_weights JSONB,
    bottleneck_multiplier DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    auto_generate_snapshots BOOLEAN NOT NULL DEFAULT FALSE,
    snapshot_frequency VARCHAR(20) NOT NULL DEFAULT 'daily',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_insight_settings_workspace ON insight_settings(workspace_id);
CREATE INDEX IF NOT EXISTS ix_insight_settings_team ON insight_settings(team_id);

DO $$ BEGIN
    ALTER TABLE insight_settings
        ADD CONSTRAINT uq_insight_settings_workspace_team
        UNIQUE (workspace_id, team_id);
EXCEPTION
    WHEN duplicate_table THEN NULL;
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Developer Working Schedules
CREATE TABLE IF NOT EXISTS developer_working_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    start_hour INTEGER NOT NULL DEFAULT 9,
    end_hour INTEGER NOT NULL DEFAULT 18,
    working_days JSONB,
    late_night_threshold_hour INTEGER NOT NULL DEFAULT 22,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_dev_working_sched_developer ON developer_working_schedules(developer_id);
CREATE INDEX IF NOT EXISTS ix_dev_working_sched_workspace ON developer_working_schedules(workspace_id);

DO $$ BEGIN
    ALTER TABLE developer_working_schedules
        ADD CONSTRAINT uq_developer_working_schedule
        UNIQUE (developer_id, workspace_id);
EXCEPTION
    WHEN duplicate_table THEN NULL;
    WHEN duplicate_object THEN NULL;
END $$;

-- 3. Insight Alert Rules
CREATE TABLE IF NOT EXISTS insight_alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    metric_category VARCHAR(50) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    condition_operator VARCHAR(10) NOT NULL,
    condition_value DOUBLE PRECISION NOT NULL,
    scope_type VARCHAR(20) NOT NULL DEFAULT 'team',
    scope_id UUID,
    severity alert_severity_enum NOT NULL DEFAULT 'warning',
    notification_channels JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_alert_rules_workspace ON insight_alert_rules(workspace_id);
CREATE INDEX IF NOT EXISTS ix_alert_rules_active ON insight_alert_rules(workspace_id, is_active) WHERE is_active = TRUE;

-- 4. Insight Alert History
CREATE TABLE IF NOT EXISTS insight_alert_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES insight_alert_rules(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    developer_id UUID,
    team_id UUID,
    metric_value DOUBLE PRECISION NOT NULL,
    threshold_value DOUBLE PRECISION NOT NULL,
    severity alert_severity_enum NOT NULL DEFAULT 'warning',
    status alert_status_enum NOT NULL DEFAULT 'triggered',
    message TEXT,
    acknowledged_by_id UUID,
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_alert_history_rule ON insight_alert_history(rule_id);
CREATE INDEX IF NOT EXISTS ix_alert_history_workspace ON insight_alert_history(workspace_id);
CREATE INDEX IF NOT EXISTS ix_alert_history_status ON insight_alert_history(workspace_id, status);
CREATE INDEX IF NOT EXISTS ix_alert_history_triggered ON insight_alert_history(triggered_at DESC);

-- 5. Insight Report Schedules
CREATE TABLE IF NOT EXISTS insight_report_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    report_type VARCHAR(50) NOT NULL DEFAULT 'team_weekly',
    config JSONB,
    frequency insight_schedule_freq_enum NOT NULL DEFAULT 'weekly',
    day_of_week INTEGER,
    day_of_month INTEGER,
    time_utc VARCHAR(5) NOT NULL DEFAULT '09:00',
    recipients JSONB,
    export_format VARCHAR(10) NOT NULL DEFAULT 'pdf',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_sent_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_report_schedules_workspace ON insight_report_schedules(workspace_id);
CREATE INDEX IF NOT EXISTS ix_report_schedules_next_run ON insight_report_schedules(next_run_at) WHERE is_active = TRUE;

-- 6. Saved Insight Dashboards
CREATE TABLE IF NOT EXISTS saved_insight_dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    layout JSONB,
    widgets JSONB,
    default_period_type VARCHAR(20) NOT NULL DEFAULT 'weekly',
    default_team_id UUID,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_shared BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_saved_dashboards_workspace ON saved_insight_dashboards(workspace_id);
CREATE INDEX IF NOT EXISTS ix_saved_dashboards_creator ON saved_insight_dashboards(created_by_id);
