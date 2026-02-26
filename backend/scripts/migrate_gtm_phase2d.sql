-- Phase 2D: Scale & Ops — GTM webhooks, provider health, performance indexes
-- Depends on: migrate_gtm_tables.sql, migrate_gtm_outreach.sql

-- =============================================================================
-- GTM WEBHOOKS (outbound event delivery)
-- =============================================================================

CREATE TABLE IF NOT EXISTS gtm_webhooks (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    url VARCHAR(2000) NOT NULL,
    events JSONB NOT NULL DEFAULT '[]',
    secret VARCHAR(64) NOT NULL,
    headers JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    total_deliveries INTEGER NOT NULL DEFAULT 0,
    successful_deliveries INTEGER NOT NULL DEFAULT 0,
    failed_deliveries INTEGER NOT NULL DEFAULT 0,
    last_delivery_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_gtm_webhook_workspace_id ON gtm_webhooks(workspace_id);
CREATE INDEX IF NOT EXISTS ix_gtm_webhook_ws_active ON gtm_webhooks(workspace_id, is_active);

-- =============================================================================
-- GTM WEBHOOK DELIVERIES (delivery attempt log)
-- =============================================================================

CREATE TABLE IF NOT EXISTS gtm_webhook_deliveries (
    id UUID PRIMARY KEY,
    webhook_id UUID NOT NULL REFERENCES gtm_webhooks(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    response_status_code INTEGER,
    response_body TEXT,
    error_message TEXT,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_gtm_webhook_delivery_webhook_id ON gtm_webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS ix_gtm_webhook_delivery_status ON gtm_webhook_deliveries(webhook_id, status);

-- =============================================================================
-- GTM PROVIDER HEALTH METRICS (hourly bucketed)
-- =============================================================================

CREATE TABLE IF NOT EXISTS gtm_provider_health_metrics (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider_slot VARCHAR(50) NOT NULL,
    provider_name VARCHAR(100) NOT NULL,
    bucket_hour TIMESTAMPTZ NOT NULL,
    total_requests INTEGER NOT NULL DEFAULT 0,
    successful_requests INTEGER NOT NULL DEFAULT 0,
    failed_requests INTEGER NOT NULL DEFAULT 0,
    avg_latency_ms INTEGER NOT NULL DEFAULT 0,
    p95_latency_ms INTEGER NOT NULL DEFAULT 0,
    max_latency_ms INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
);

CREATE INDEX IF NOT EXISTS ix_provider_health_ws_slot_hour
    ON gtm_provider_health_metrics(workspace_id, provider_slot, bucket_hour);

-- =============================================================================
-- PERFORMANCE INDEXES for behavioral_events
-- =============================================================================

-- Record-based lookups (engagement scoring, record timeline)
CREATE INDEX IF NOT EXISTS ix_behavioral_events_record_id
    ON behavioral_events(record_id)
    WHERE record_id IS NOT NULL;

-- Session-based lookups (session aggregation, visitor journey)
CREATE INDEX IF NOT EXISTS ix_behavioral_events_session_id
    ON behavioral_events(session_id)
    WHERE session_id IS NOT NULL;

-- Time-range queries (dashboards, retention, analytics)
CREATE INDEX IF NOT EXISTS ix_behavioral_events_occurred_at
    ON behavioral_events(workspace_id, occurred_at DESC);

-- =============================================================================
-- PERFORMANCE INDEXES for outreach step executions
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_outreach_step_exec_ws_executed
    ON outreach_step_executions(workspace_id, executed_at DESC)
    WHERE executed_at IS NOT NULL;

-- =============================================================================
-- PERFORMANCE INDEXES for visitor sessions
-- =============================================================================

CREATE INDEX IF NOT EXISTS ix_visitor_sessions_ws_started
    ON visitor_sessions(workspace_id, started_at DESC);

-- =============================================================================
-- Auto-update updated_at trigger for gtm_webhooks
-- =============================================================================

CREATE OR REPLACE FUNCTION update_gtm_webhooks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gtm_webhooks_updated_at ON gtm_webhooks;
CREATE TRIGGER trg_gtm_webhooks_updated_at
    BEFORE UPDATE ON gtm_webhooks
    FOR EACH ROW
    EXECUTE FUNCTION update_gtm_webhooks_updated_at();
