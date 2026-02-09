-- Developer Insights v4 Migration
-- Adds missing FK constraints, indexes, and JSONB defaults

-- 1. Add FK constraints on insight_alert_history
ALTER TABLE insight_alert_history
ADD CONSTRAINT fk_alert_history_developer
FOREIGN KEY (developer_id) REFERENCES developers(id) ON DELETE SET NULL;

ALTER TABLE insight_alert_history
ADD CONSTRAINT fk_alert_history_team
FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;

ALTER TABLE insight_alert_history
ADD CONSTRAINT fk_alert_history_acknowledged_by
FOREIGN KEY (acknowledged_by_id) REFERENCES developers(id) ON DELETE SET NULL;

-- 2. Add missing indexes
CREATE INDEX IF NOT EXISTS idx_alert_history_developer_id
ON insight_alert_history(developer_id);

CREATE INDEX IF NOT EXISTS idx_alert_history_team_id
ON insight_alert_history(team_id);

CREATE INDEX IF NOT EXISTS idx_alert_rules_created_by_id
ON insight_alert_rules(created_by_id);

CREATE INDEX IF NOT EXISTS idx_insight_settings_workspace_team
ON insight_settings(workspace_id, team_id);

-- 3. Set JSONB column defaults on developer_metrics_snapshots
ALTER TABLE developer_metrics_snapshots
ALTER COLUMN velocity_metrics SET DEFAULT '{}',
ALTER COLUMN efficiency_metrics SET DEFAULT '{}',
ALTER COLUMN quality_metrics SET DEFAULT '{}',
ALTER COLUMN sustainability_metrics SET DEFAULT '{}',
ALTER COLUMN collaboration_metrics SET DEFAULT '{}',
ALTER COLUMN raw_counts SET DEFAULT '{}';
