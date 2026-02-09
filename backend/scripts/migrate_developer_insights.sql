-- Developer Insights: metrics snapshots
-- Creates tables for developer and team metrics snapshots

-- Period type enum (if not exists)
DO $$ BEGIN
    CREATE TYPE period_type_enum AS ENUM ('daily', 'weekly', 'sprint', 'monthly');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Developer metrics snapshots
CREATE TABLE IF NOT EXISTS developer_metrics_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    period_type period_type_enum NOT NULL DEFAULT 'weekly',
    velocity_metrics JSONB,
    efficiency_metrics JSONB,
    quality_metrics JSONB,
    sustainability_metrics JSONB,
    collaboration_metrics JSONB,
    raw_counts JSONB,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_dev_metrics_developer_id ON developer_metrics_snapshots(developer_id);
CREATE INDEX IF NOT EXISTS ix_dev_metrics_workspace_id ON developer_metrics_snapshots(workspace_id);
CREATE INDEX IF NOT EXISTS ix_dev_metrics_period ON developer_metrics_snapshots(developer_id, period_type, period_start);

-- Unique constraint: one snapshot per developer/workspace/period_type/period_start
DO $$ BEGIN
    ALTER TABLE developer_metrics_snapshots
        ADD CONSTRAINT uq_developer_metrics_snapshot
        UNIQUE (developer_id, workspace_id, period_type, period_start);
EXCEPTION
    WHEN duplicate_table THEN NULL;
    WHEN duplicate_object THEN NULL;
END $$;

-- Team metrics snapshots
CREATE TABLE IF NOT EXISTS team_metrics_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    period_type period_type_enum NOT NULL DEFAULT 'weekly',
    aggregate_metrics JSONB,
    distribution_metrics JSONB,
    member_count INTEGER NOT NULL DEFAULT 0,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_team_metrics_workspace_id ON team_metrics_snapshots(workspace_id);
CREATE INDEX IF NOT EXISTS ix_team_metrics_team_id ON team_metrics_snapshots(team_id);
CREATE INDEX IF NOT EXISTS ix_team_metrics_period ON team_metrics_snapshots(workspace_id, period_type, period_start);

DO $$ BEGIN
    ALTER TABLE team_metrics_snapshots
        ADD CONSTRAINT uq_team_metrics_snapshot
        UNIQUE (workspace_id, team_id, period_type, period_start);
EXCEPTION
    WHEN duplicate_table THEN NULL;
    WHEN duplicate_object THEN NULL;
END $$;
