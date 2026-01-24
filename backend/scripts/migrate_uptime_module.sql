-- Uptime Monitoring Module Migration
-- Creates tables for endpoint monitoring, check results, and incident tracking

-- =============================================================================
-- UPTIME MONITORS TABLE
-- Stores configuration for monitored endpoints (HTTP, TCP, WebSocket)
-- =============================================================================

CREATE TABLE IF NOT EXISTS uptime_monitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Basic info
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Check type: http, tcp, websocket
    check_type VARCHAR(50) NOT NULL DEFAULT 'http',

    -- For HTTP/WebSocket checks
    url VARCHAR(2048),

    -- For TCP checks
    host VARCHAR(255),
    port INTEGER,

    -- HTTP-specific settings
    http_method VARCHAR(10) DEFAULT 'GET',
    expected_status_codes JSONB DEFAULT '[200, 201, 204]'::jsonb,
    request_headers JSONB DEFAULT '{}'::jsonb,
    request_body TEXT,
    verify_ssl BOOLEAN NOT NULL DEFAULT true,
    follow_redirects BOOLEAN NOT NULL DEFAULT true,

    -- WebSocket-specific settings
    ws_message TEXT,
    ws_expected_response TEXT,

    -- Check configuration
    check_interval_seconds INTEGER NOT NULL DEFAULT 300,
    timeout_seconds INTEGER NOT NULL DEFAULT 30,
    consecutive_failures_threshold INTEGER NOT NULL DEFAULT 3,

    -- Current state
    current_status VARCHAR(50) NOT NULL DEFAULT 'up',
    last_check_at TIMESTAMP WITH TIME ZONE,
    next_check_at TIMESTAMP WITH TIME ZONE,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    last_response_time_ms INTEGER,
    last_error_message TEXT,

    -- Notification settings
    notification_channels JSONB DEFAULT '["ticket"]'::jsonb,
    slack_channel_id VARCHAR(255),
    webhook_url VARCHAR(2048),
    notify_on_recovery BOOLEAN NOT NULL DEFAULT true,

    -- Ticket routing
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,

    -- Active/inactive toggle
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,

    -- Constraints
    CONSTRAINT uq_uptime_monitor_name UNIQUE (workspace_id, name),
    CONSTRAINT chk_uptime_monitor_check_type CHECK (check_type IN ('http', 'tcp', 'websocket')),
    CONSTRAINT chk_uptime_monitor_status CHECK (current_status IN ('up', 'down', 'degraded', 'paused', 'unknown')),
    CONSTRAINT chk_uptime_monitor_interval CHECK (check_interval_seconds >= 30),
    CONSTRAINT chk_uptime_monitor_timeout CHECK (timeout_seconds >= 1 AND timeout_seconds <= 300),
    CONSTRAINT chk_uptime_monitor_threshold CHECK (consecutive_failures_threshold >= 1),
    CONSTRAINT chk_uptime_monitor_http_url CHECK (
        (check_type = 'http' AND url IS NOT NULL) OR
        (check_type = 'websocket' AND url IS NOT NULL) OR
        (check_type = 'tcp' AND host IS NOT NULL AND port IS NOT NULL) OR
        check_type NOT IN ('http', 'websocket', 'tcp')
    )
);

-- Indexes for uptime_monitors
CREATE INDEX IF NOT EXISTS idx_uptime_monitors_workspace ON uptime_monitors(workspace_id);
CREATE INDEX IF NOT EXISTS idx_uptime_monitors_next_check ON uptime_monitors(next_check_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_uptime_monitors_status ON uptime_monitors(current_status);
CREATE INDEX IF NOT EXISTS idx_uptime_monitors_team ON uptime_monitors(team_id);

-- Comments
COMMENT ON TABLE uptime_monitors IS 'Configuration for monitored endpoints';
COMMENT ON COLUMN uptime_monitors.check_type IS 'Type of check: http, tcp, websocket';
COMMENT ON COLUMN uptime_monitors.expected_status_codes IS 'JSON array of acceptable HTTP status codes';
COMMENT ON COLUMN uptime_monitors.consecutive_failures_threshold IS 'Number of consecutive failures before alerting';
COMMENT ON COLUMN uptime_monitors.current_status IS 'Current monitor status: up, down, degraded, paused, unknown';


-- =============================================================================
-- UPTIME CHECKS TABLE
-- Stores individual check results (time-series data)
-- =============================================================================

CREATE TABLE IF NOT EXISTS uptime_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_id UUID NOT NULL REFERENCES uptime_monitors(id) ON DELETE CASCADE,

    -- Check result
    is_up BOOLEAN NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,

    -- Error details
    error_message TEXT,
    error_type VARCHAR(100),

    -- SSL info (for HTTP/WS checks)
    ssl_expiry_days INTEGER,
    ssl_issuer VARCHAR(255),

    -- Response details
    response_body_snippet TEXT,
    response_headers JSONB,

    -- Timestamp
    checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for uptime_checks (optimized for time-series queries)
CREATE INDEX IF NOT EXISTS idx_uptime_checks_monitor_time ON uptime_checks(monitor_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_uptime_checks_checked_at ON uptime_checks(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_uptime_checks_monitor_is_up ON uptime_checks(monitor_id, is_up) WHERE NOT is_up;

-- Partition hint comment (for future optimization)
COMMENT ON TABLE uptime_checks IS 'Individual check results. Consider partitioning by checked_at for large deployments.';
COMMENT ON COLUMN uptime_checks.error_type IS 'Error category: timeout, connection_refused, ssl_error, dns_error, etc.';
COMMENT ON COLUMN uptime_checks.ssl_expiry_days IS 'Days until SSL certificate expires (negative if expired)';


-- =============================================================================
-- UPTIME INCIDENTS TABLE
-- Groups consecutive failures into incidents, linked to tickets
-- =============================================================================

CREATE TABLE IF NOT EXISTS uptime_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_id UUID NOT NULL REFERENCES uptime_monitors(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Linked ticket (auto-created when incident starts)
    ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,

    -- Incident status
    status VARCHAR(50) NOT NULL DEFAULT 'ongoing',

    -- Timing
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,

    -- Error tracking
    first_error_message TEXT,
    first_error_type VARCHAR(100),
    last_error_message TEXT,
    last_error_type VARCHAR(100),

    -- Check counts
    total_checks INTEGER NOT NULL DEFAULT 0,
    failed_checks INTEGER NOT NULL DEFAULT 0,

    -- Post-incident details
    root_cause TEXT,
    resolution_notes TEXT,

    -- Metadata
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT chk_uptime_incident_status CHECK (status IN ('ongoing', 'resolved')),
    CONSTRAINT chk_uptime_incident_resolution CHECK (
        (status = 'ongoing' AND resolved_at IS NULL) OR
        (status = 'resolved' AND resolved_at IS NOT NULL)
    )
);

-- Indexes for uptime_incidents
CREATE INDEX IF NOT EXISTS idx_uptime_incidents_monitor ON uptime_incidents(monitor_id);
CREATE INDEX IF NOT EXISTS idx_uptime_incidents_workspace ON uptime_incidents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_uptime_incidents_ticket ON uptime_incidents(ticket_id);
CREATE INDEX IF NOT EXISTS idx_uptime_incidents_status ON uptime_incidents(status) WHERE status = 'ongoing';
CREATE INDEX IF NOT EXISTS idx_uptime_incidents_started_at ON uptime_incidents(started_at DESC);

-- Comments
COMMENT ON TABLE uptime_incidents IS 'Groups consecutive check failures into incidents for tracking';
COMMENT ON COLUMN uptime_incidents.ticket_id IS 'Auto-created ticket when incident threshold is reached';
COMMENT ON COLUMN uptime_incidents.first_error_message IS 'Error message from the first failed check';
COMMENT ON COLUMN uptime_incidents.root_cause IS 'Post-mortem root cause analysis (filled during resolution)';


-- =============================================================================
-- HELPER FUNCTION: Get next ticket number for workspace
-- This function already exists for the ticketing module, so we skip if exists
-- =============================================================================

-- Note: The ticket numbering function should already exist from the ticketing module migration.
-- If you need to create tickets from the uptime module, ensure the ticketing module is migrated first.


-- =============================================================================
-- TRIGGER: Update monitor timestamps on update
-- =============================================================================

CREATE OR REPLACE FUNCTION update_uptime_monitor_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_uptime_monitor_updated ON uptime_monitors;
CREATE TRIGGER trigger_uptime_monitor_updated
    BEFORE UPDATE ON uptime_monitors
    FOR EACH ROW
    EXECUTE FUNCTION update_uptime_monitor_timestamp();


-- =============================================================================
-- TRIGGER: Update incident timestamps on update
-- =============================================================================

CREATE OR REPLACE FUNCTION update_uptime_incident_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_uptime_incident_updated ON uptime_incidents;
CREATE TRIGGER trigger_uptime_incident_updated
    BEFORE UPDATE ON uptime_incidents
    FOR EACH ROW
    EXECUTE FUNCTION update_uptime_incident_timestamp();


-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Summary of created objects:
-- Tables: uptime_monitors, uptime_checks, uptime_incidents
-- Indexes: 12 indexes for query optimization
-- Triggers: 2 triggers for automatic timestamp updates
-- Constraints: Check constraints for data integrity
