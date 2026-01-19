-- Email Infrastructure Module Migration
-- Multi-domain sending, email warming, and reputation management
-- Run this script to create the email infrastructure tables

-- =============================================================================
-- EMAIL PROVIDERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS email_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Provider identity
    name VARCHAR(255) NOT NULL,
    provider_type VARCHAR(20) NOT NULL, -- ses, sendgrid, mailgun, postmark, smtp
    status VARCHAR(20) NOT NULL DEFAULT 'active',

    -- Credentials (encrypted JSONB)
    credentials JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Rate limiting
    max_sends_per_second INTEGER DEFAULT 10,
    max_daily_sends INTEGER DEFAULT 100000,
    current_daily_sends INTEGER NOT NULL DEFAULT 0,
    daily_sends_reset_at TIMESTAMPTZ,

    -- Priority for routing
    priority INTEGER NOT NULL DEFAULT 1,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_email_provider_workspace_name UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS ix_email_provider_workspace ON email_providers(workspace_id);
CREATE INDEX IF NOT EXISTS ix_email_provider_status ON email_providers(workspace_id, status);

-- =============================================================================
-- WARMING SCHEDULES
-- =============================================================================

CREATE TABLE IF NOT EXISTS warming_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE, -- NULL for system schedules

    -- Schedule identity
    name VARCHAR(100) NOT NULL,
    schedule_type VARCHAR(20) NOT NULL DEFAULT 'custom', -- conservative, moderate, aggressive, custom
    description TEXT,

    -- Schedule configuration (JSONB)
    -- [{"day": 1, "volume": 50}, {"day": 7, "volume": 1000}, ...]
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_days INTEGER NOT NULL DEFAULT 14,

    -- Thresholds for auto-pause
    max_bounce_rate FLOAT NOT NULL DEFAULT 0.05,
    max_complaint_rate FLOAT NOT NULL DEFAULT 0.001,
    min_delivery_rate FLOAT NOT NULL DEFAULT 0.9,

    -- Auto-pause behavior
    auto_pause_on_threshold BOOLEAN NOT NULL DEFAULT true,

    -- System vs custom
    is_system BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_warming_schedule_workspace_name UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS ix_warming_schedule_workspace ON warming_schedules(workspace_id);
CREATE INDEX IF NOT EXISTS ix_warming_schedule_type ON warming_schedules(schedule_type);

-- =============================================================================
-- SENDING DOMAINS
-- =============================================================================

CREATE TABLE IF NOT EXISTS sending_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider_id UUID REFERENCES email_providers(id) ON DELETE SET NULL,

    -- Domain identity
    domain VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, verifying, verified, active, paused, failed

    -- DNS verification status (JSONB)
    -- {"spf": {"verified": true, "record": "..."}, "dkim": {...}, "dmarc": {...}}
    dns_records JSONB NOT NULL DEFAULT '{}'::jsonb,
    verification_token VARCHAR(255),
    verified_at TIMESTAMPTZ,

    -- Warming configuration
    warming_status VARCHAR(20) NOT NULL DEFAULT 'not_started', -- not_started, in_progress, paused, completed
    warming_schedule_id UUID REFERENCES warming_schedules(id) ON DELETE SET NULL,
    warming_started_at TIMESTAMPTZ,
    warming_day INTEGER NOT NULL DEFAULT 0,

    -- Daily limits (from warming or custom)
    daily_limit INTEGER NOT NULL DEFAULT 100,
    daily_sent INTEGER NOT NULL DEFAULT 0,
    daily_reset_at TIMESTAMPTZ,

    -- Reputation
    health_score INTEGER DEFAULT 100, -- 0-100
    health_status VARCHAR(20) DEFAULT 'excellent', -- excellent, good, fair, poor, critical

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_sending_domain_workspace UNIQUE (workspace_id, domain)
);

CREATE INDEX IF NOT EXISTS ix_sending_domain_workspace ON sending_domains(workspace_id);
CREATE INDEX IF NOT EXISTS ix_sending_domain_status ON sending_domains(status);
CREATE INDEX IF NOT EXISTS ix_sending_domain_warming ON sending_domains(warming_status);
CREATE INDEX IF NOT EXISTS ix_sending_domain_health ON sending_domains(health_status);
CREATE INDEX IF NOT EXISTS ix_sending_domain_provider ON sending_domains(provider_id);

-- =============================================================================
-- SENDING IDENTITIES
-- =============================================================================

CREATE TABLE IF NOT EXISTS sending_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES sending_domains(id) ON DELETE CASCADE,

    -- Identity
    email VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    reply_to VARCHAR(255),

    -- Status
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Usage tracking
    total_sent INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_sending_identity_email UNIQUE (domain_id, email)
);

CREATE INDEX IF NOT EXISTS ix_sending_identity_domain ON sending_identities(domain_id);
CREATE INDEX IF NOT EXISTS ix_sending_identity_active ON sending_identities(is_active);

-- =============================================================================
-- DEDICATED IPS
-- =============================================================================

CREATE TABLE IF NOT EXISTS dedicated_ips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES email_providers(id) ON DELETE CASCADE,

    -- IP info
    ip_address VARCHAR(45) NOT NULL, -- IPv4 or IPv6
    hostname VARCHAR(255),

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, warming, active, paused

    -- Warming
    warming_status VARCHAR(20) NOT NULL DEFAULT 'not_started',
    warming_schedule_id UUID REFERENCES warming_schedules(id) ON DELETE SET NULL,
    warming_started_at TIMESTAMPTZ,
    warming_day INTEGER NOT NULL DEFAULT 0,

    -- Limits
    daily_limit INTEGER NOT NULL DEFAULT 100,
    daily_sent INTEGER NOT NULL DEFAULT 0,

    -- Reputation
    health_score INTEGER DEFAULT 100,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_dedicated_ip UNIQUE (workspace_id, ip_address)
);

CREATE INDEX IF NOT EXISTS ix_dedicated_ip_workspace ON dedicated_ips(workspace_id);
CREATE INDEX IF NOT EXISTS ix_dedicated_ip_provider ON dedicated_ips(provider_id);
CREATE INDEX IF NOT EXISTS ix_dedicated_ip_status ON dedicated_ips(status);

-- =============================================================================
-- WARMING PROGRESS
-- =============================================================================

CREATE TABLE IF NOT EXISTS warming_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID REFERENCES sending_domains(id) ON DELETE CASCADE,
    ip_id UUID REFERENCES dedicated_ips(id) ON DELETE CASCADE,

    -- Progress tracking
    day_number INTEGER NOT NULL,
    date TIMESTAMPTZ NOT NULL,
    target_volume INTEGER NOT NULL,
    actual_volume INTEGER NOT NULL DEFAULT 0,
    completed BOOLEAN NOT NULL DEFAULT false,

    -- Daily metrics
    sent INTEGER NOT NULL DEFAULT 0,
    delivered INTEGER NOT NULL DEFAULT 0,
    bounced INTEGER NOT NULL DEFAULT 0,
    complaints INTEGER NOT NULL DEFAULT 0,

    -- Rates
    delivery_rate FLOAT,
    bounce_rate FLOAT,
    complaint_rate FLOAT,

    -- Threshold tracking
    threshold_exceeded BOOLEAN NOT NULL DEFAULT false,

    -- AI recommendations (JSONB)
    ai_recommendation JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_warming_progress_domain_day UNIQUE (domain_id, day_number),
    CONSTRAINT uq_warming_progress_ip_day UNIQUE (ip_id, day_number),
    CONSTRAINT chk_warming_progress_entity CHECK (
        (domain_id IS NOT NULL AND ip_id IS NULL) OR
        (domain_id IS NULL AND ip_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS ix_warming_progress_domain ON warming_progress(domain_id);
CREATE INDEX IF NOT EXISTS ix_warming_progress_ip ON warming_progress(ip_id);
CREATE INDEX IF NOT EXISTS ix_warming_progress_date ON warming_progress(date);

-- =============================================================================
-- DOMAIN HEALTH
-- =============================================================================

CREATE TABLE IF NOT EXISTS domain_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES sending_domains(id) ON DELETE CASCADE,
    date TIMESTAMPTZ NOT NULL,

    -- Volume
    total_sent INTEGER NOT NULL DEFAULT 0,
    total_delivered INTEGER NOT NULL DEFAULT 0,
    total_bounced INTEGER NOT NULL DEFAULT 0,
    hard_bounces INTEGER NOT NULL DEFAULT 0,
    soft_bounces INTEGER NOT NULL DEFAULT 0,
    complaints INTEGER NOT NULL DEFAULT 0,
    opens INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,

    -- Rates
    delivery_rate FLOAT,
    bounce_rate FLOAT,
    complaint_rate FLOAT,
    open_rate FLOAT,
    click_rate FLOAT,

    -- Health score
    health_score INTEGER NOT NULL DEFAULT 100,
    health_status VARCHAR(20) NOT NULL DEFAULT 'excellent',

    -- Score breakdown (JSONB)
    score_factors JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_domain_health_date UNIQUE (domain_id, date)
);

CREATE INDEX IF NOT EXISTS ix_domain_health_domain ON domain_health(domain_id);
CREATE INDEX IF NOT EXISTS ix_domain_health_date ON domain_health(date);

-- =============================================================================
-- ISP METRICS
-- =============================================================================

CREATE TABLE IF NOT EXISTS isp_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id UUID NOT NULL REFERENCES sending_domains(id) ON DELETE CASCADE,
    isp VARCHAR(50) NOT NULL, -- gmail, outlook, yahoo, icloud, aol, other
    date TIMESTAMPTZ NOT NULL,

    -- Volume
    sent INTEGER NOT NULL DEFAULT 0,
    delivered INTEGER NOT NULL DEFAULT 0,
    bounced INTEGER NOT NULL DEFAULT 0,
    complaints INTEGER NOT NULL DEFAULT 0,
    opens INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,

    -- Rates
    delivery_rate FLOAT,
    bounce_rate FLOAT,
    complaint_rate FLOAT,
    open_rate FLOAT,

    -- Health
    health_score INTEGER,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_isp_metrics UNIQUE (domain_id, isp, date)
);

CREATE INDEX IF NOT EXISTS ix_isp_metrics_domain ON isp_metrics(domain_id);
CREATE INDEX IF NOT EXISTS ix_isp_metrics_isp ON isp_metrics(isp);
CREATE INDEX IF NOT EXISTS ix_isp_metrics_date ON isp_metrics(date);

-- =============================================================================
-- SENDING POOLS
-- =============================================================================

CREATE TABLE IF NOT EXISTS sending_pools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Pool identity
    name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Routing strategy
    routing_strategy VARCHAR(20) NOT NULL DEFAULT 'round_robin', -- round_robin, weighted, health_based, failover

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_default BOOLEAN NOT NULL DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_sending_pool_name UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS ix_sending_pool_workspace ON sending_pools(workspace_id);

-- =============================================================================
-- SENDING POOL MEMBERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS sending_pool_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id UUID NOT NULL REFERENCES sending_pools(id) ON DELETE CASCADE,
    domain_id UUID NOT NULL REFERENCES sending_domains(id) ON DELETE CASCADE,

    -- Configuration
    weight INTEGER NOT NULL DEFAULT 1, -- For weighted routing
    priority INTEGER NOT NULL DEFAULT 1, -- For failover routing

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_pool_member UNIQUE (pool_id, domain_id)
);

CREATE INDEX IF NOT EXISTS ix_pool_member_pool ON sending_pool_members(pool_id);
CREATE INDEX IF NOT EXISTS ix_pool_member_domain ON sending_pool_members(domain_id);

-- =============================================================================
-- PROVIDER EVENT LOG
-- =============================================================================

CREATE TABLE IF NOT EXISTS provider_event_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider_id UUID REFERENCES email_providers(id) ON DELETE SET NULL,
    domain_id UUID REFERENCES sending_domains(id) ON DELETE SET NULL,

    -- Event data
    event_type VARCHAR(20) NOT NULL, -- send, delivery, bounce, complaint, open, click, unsubscribe, reject
    message_id VARCHAR(255),
    recipient_email VARCHAR(255),

    -- Bounce/complaint details
    bounce_type VARCHAR(10), -- hard, soft
    bounce_subtype VARCHAR(50),
    complaint_type VARCHAR(50),

    -- Raw event payload (JSONB)
    raw_event JSONB,

    -- Processing status
    processed BOOLEAN NOT NULL DEFAULT false,
    processed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_provider_event_workspace ON provider_event_logs(workspace_id);
CREATE INDEX IF NOT EXISTS ix_provider_event_provider ON provider_event_logs(provider_id);
CREATE INDEX IF NOT EXISTS ix_provider_event_domain ON provider_event_logs(domain_id);
CREATE INDEX IF NOT EXISTS ix_provider_event_type ON provider_event_logs(event_type);
CREATE INDEX IF NOT EXISTS ix_provider_event_message ON provider_event_logs(message_id);
CREATE INDEX IF NOT EXISTS ix_provider_event_processed ON provider_event_logs(processed);
CREATE INDEX IF NOT EXISTS ix_provider_event_created ON provider_event_logs(created_at);

-- =============================================================================
-- ALTER EMAIL CAMPAIGNS TABLE (Add routing fields)
-- =============================================================================

ALTER TABLE email_campaigns
ADD COLUMN IF NOT EXISTS sending_pool_id UUID REFERENCES sending_pools(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS sending_identity_id UUID REFERENCES sending_identities(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS routing_config JSONB;

CREATE INDEX IF NOT EXISTS ix_email_campaign_pool ON email_campaigns(sending_pool_id);
CREATE INDEX IF NOT EXISTS ix_email_campaign_identity ON email_campaigns(sending_identity_id);

-- =============================================================================
-- ALTER CAMPAIGN RECIPIENTS TABLE (Add sent_via fields)
-- =============================================================================

ALTER TABLE campaign_recipients
ADD COLUMN IF NOT EXISTS sent_via_domain_id UUID REFERENCES sending_domains(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS sent_via_provider_id UUID REFERENCES email_providers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS sent_via_ip_id UUID REFERENCES dedicated_ips(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_campaign_recipient_domain ON campaign_recipients(sent_via_domain_id);
CREATE INDEX IF NOT EXISTS ix_campaign_recipient_provider ON campaign_recipients(sent_via_provider_id);

-- =============================================================================
-- TRIGGERS FOR UPDATED_AT
-- =============================================================================

-- Create trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for tables with updated_at
DROP TRIGGER IF EXISTS update_email_providers_updated_at ON email_providers;
CREATE TRIGGER update_email_providers_updated_at
    BEFORE UPDATE ON email_providers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_warming_schedules_updated_at ON warming_schedules;
CREATE TRIGGER update_warming_schedules_updated_at
    BEFORE UPDATE ON warming_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sending_domains_updated_at ON sending_domains;
CREATE TRIGGER update_sending_domains_updated_at
    BEFORE UPDATE ON sending_domains
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sending_identities_updated_at ON sending_identities;
CREATE TRIGGER update_sending_identities_updated_at
    BEFORE UPDATE ON sending_identities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_dedicated_ips_updated_at ON dedicated_ips;
CREATE TRIGGER update_dedicated_ips_updated_at
    BEFORE UPDATE ON dedicated_ips
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sending_pools_updated_at ON sending_pools;
CREATE TRIGGER update_sending_pools_updated_at
    BEFORE UPDATE ON sending_pools
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- INSERT SYSTEM WARMING SCHEDULES
-- =============================================================================

INSERT INTO warming_schedules (id, workspace_id, name, schedule_type, description, steps, total_days, is_system, is_active)
VALUES
(
    gen_random_uuid(),
    NULL,
    'Conservative (21 days)',
    'conservative',
    'Safe warming schedule for new domains. Gradually increases volume over 21 days.',
    '[{"day": 1, "volume": 50}, {"day": 7, "volume": 1000}, {"day": 14, "volume": 15000}, {"day": 21, "volume": 100000}]'::jsonb,
    21,
    true,
    true
),
(
    gen_random_uuid(),
    NULL,
    'Moderate (14 days)',
    'moderate',
    'Balanced warming schedule. Reaches full volume in 14 days.',
    '[{"day": 1, "volume": 100}, {"day": 7, "volume": 7500}, {"day": 14, "volume": 100000}]'::jsonb,
    14,
    true,
    true
),
(
    gen_random_uuid(),
    NULL,
    'Aggressive (7 days)',
    'aggressive',
    'Fast warming for domains with good reputation history. Use with caution.',
    '[{"day": 1, "volume": 200}, {"day": 4, "volume": 15000}, {"day": 7, "volume": 100000}]'::jsonb,
    7,
    true,
    true
)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- DONE
-- =============================================================================

COMMENT ON TABLE email_providers IS 'Email provider configurations (SES, SendGrid, Mailgun, Postmark, SMTP)';
COMMENT ON TABLE warming_schedules IS 'Warming schedules for domain/IP reputation building';
COMMENT ON TABLE sending_domains IS 'Verified sending domains with DNS records and warming status';
COMMENT ON TABLE sending_identities IS 'From addresses within sending domains';
COMMENT ON TABLE dedicated_ips IS 'Dedicated IP addresses for email sending';
COMMENT ON TABLE warming_progress IS 'Daily warming progress tracking with AI recommendations';
COMMENT ON TABLE domain_health IS 'Daily domain health metrics and scoring';
COMMENT ON TABLE isp_metrics IS 'ISP-specific deliverability metrics (Gmail, Outlook, Yahoo, etc.)';
COMMENT ON TABLE sending_pools IS 'Groups of domains for smart routing';
COMMENT ON TABLE sending_pool_members IS 'Domain membership in sending pools';
COMMENT ON TABLE provider_event_logs IS 'Webhook events from email providers';
