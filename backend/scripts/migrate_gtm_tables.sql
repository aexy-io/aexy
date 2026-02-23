-- GTM (Go-To-Market) Module Migration
-- Visitor intelligence, provider registry, ICP scoring, and behavioral tracking
-- Run: docker exec aexy-backend python scripts/run_migrations.py --file migrate_gtm_tables.sql

-- =============================================================================
-- GTM PROVIDER CONFIGS
-- Per-workspace provider credentials and usage tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS gtm_provider_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Provider identity
    slot VARCHAR(50) NOT NULL,        -- visitor_identification, email_verification, contact_enrichment, linkedin_automation, sms
    provider_name VARCHAR(100) NOT NULL,  -- snitcher, millionverifier, apollo, phantombuster, twilio
    display_name VARCHAR(255),

    -- Credentials (encrypted JSONB)
    credentials JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Configuration
    config JSONB NOT NULL DEFAULT '{}'::jsonb,   -- provider-specific settings
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Usage tracking
    usage_count INTEGER NOT NULL DEFAULT 0,
    usage_limit INTEGER,                          -- monthly limit (null = unlimited)
    usage_reset_at TIMESTAMPTZ,
    monthly_cost_cents INTEGER DEFAULT 0,         -- cost in cents for display

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending_setup', -- pending_setup, active, error, suspended
    last_error TEXT,
    last_tested_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_gtm_provider_workspace_slot_name UNIQUE (workspace_id, slot, provider_name)
);

CREATE INDEX IF NOT EXISTS ix_gtm_provider_workspace ON gtm_provider_configs(workspace_id);
CREATE INDEX IF NOT EXISTS ix_gtm_provider_slot ON gtm_provider_configs(workspace_id, slot);
CREATE INDEX IF NOT EXISTS ix_gtm_provider_default ON gtm_provider_configs(workspace_id, slot, is_default) WHERE is_default = true;

-- =============================================================================
-- BEHAVIORAL EVENTS
-- Raw event stream from tracking pixel
-- =============================================================================

CREATE TABLE IF NOT EXISTS behavioral_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Identity
    anonymous_id VARCHAR(64) NOT NULL,    -- cookie-based anonymous identifier
    record_id UUID,                       -- resolved CRM record (null until identified)
    session_id UUID,                      -- linked visitor session

    -- Event data
    event_type VARCHAR(50) NOT NULL,      -- page_view, scroll, click, form_submit, identify
    page_url TEXT,
    page_title VARCHAR(500),
    referrer TEXT,

    -- UTM parameters
    utm_source VARCHAR(255),
    utm_medium VARCHAR(255),
    utm_campaign VARCHAR(255),
    utm_term VARCHAR(255),
    utm_content VARCHAR(255),

    -- Extended properties
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,  -- scroll_depth, time_on_page, form_data, etc.

    -- Client info
    ip_address INET,
    user_agent TEXT,
    country_code VARCHAR(2),
    region VARCHAR(100),
    city VARCHAR(100),

    -- Timestamps
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_behavioral_events_workspace ON behavioral_events(workspace_id);
CREATE INDEX IF NOT EXISTS ix_behavioral_events_anonymous ON behavioral_events(anonymous_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_behavioral_events_workspace_type ON behavioral_events(workspace_id, event_type);
CREATE INDEX IF NOT EXISTS ix_behavioral_events_session ON behavioral_events(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_behavioral_events_record ON behavioral_events(record_id) WHERE record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_behavioral_events_ip ON behavioral_events(ip_address) WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_behavioral_events_occurred ON behavioral_events(workspace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_behavioral_events_properties ON behavioral_events USING GIN (properties);

-- =============================================================================
-- VISITOR SESSIONS
-- Aggregated sessions from behavioral events
-- =============================================================================

CREATE TABLE IF NOT EXISTS visitor_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Identity
    anonymous_id VARCHAR(64) NOT NULL,
    record_id UUID,                       -- resolved CRM record

    -- Session metrics
    page_count INTEGER NOT NULL DEFAULT 0,
    event_count INTEGER NOT NULL DEFAULT 0,
    duration_seconds INTEGER DEFAULT 0,
    max_scroll_depth INTEGER DEFAULT 0,   -- percentage

    -- First/last touch
    first_page_url TEXT,
    last_page_url TEXT,
    entry_referrer TEXT,

    -- UTM (from first event)
    utm_source VARCHAR(255),
    utm_medium VARCHAR(255),
    utm_campaign VARCHAR(255),

    -- Client info
    ip_address INET,
    user_agent TEXT,
    country_code VARCHAR(2),
    city VARCHAR(100),

    -- Identification
    identification_status VARCHAR(20) NOT NULL DEFAULT 'anonymous', -- anonymous, company_identified, contact_identified
    identified_company VARCHAR(255),
    identified_domain VARCHAR(255),

    -- Timestamps
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_visitor_sessions_workspace ON visitor_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS ix_visitor_sessions_anonymous ON visitor_sessions(anonymous_id);
CREATE INDEX IF NOT EXISTS ix_visitor_sessions_workspace_status ON visitor_sessions(workspace_id, identification_status);
CREATE INDEX IF NOT EXISTS ix_visitor_sessions_workspace_started ON visitor_sessions(workspace_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ix_visitor_sessions_ip ON visitor_sessions(ip_address) WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_visitor_sessions_record ON visitor_sessions(record_id) WHERE record_id IS NOT NULL;

-- =============================================================================
-- VISITOR IDENTIFICATIONS
-- IP-to-company results from Snitcher (or other providers)
-- =============================================================================

CREATE TABLE IF NOT EXISTS visitor_identifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    session_id UUID REFERENCES visitor_sessions(id) ON DELETE SET NULL,

    -- Lookup input
    ip_address INET NOT NULL,
    provider_name VARCHAR(100) NOT NULL DEFAULT 'snitcher',

    -- Company identification
    company_name VARCHAR(500),
    company_domain VARCHAR(255),
    industry VARCHAR(255),
    employee_range VARCHAR(50),       -- "11-50", "51-200", etc.
    revenue_range VARCHAR(50),
    company_type VARCHAR(100),        -- "Business", "ISP", "Education"
    headquarters_location VARCHAR(255),

    -- Confidence & metadata
    confidence FLOAT DEFAULT 0.0,     -- 0.0 to 1.0
    raw_response JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- CRM linkage
    matched_record_id UUID,           -- matched CRM company record

    -- Timestamps
    identified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_visitor_id_workspace ON visitor_identifications(workspace_id);
CREATE INDEX IF NOT EXISTS ix_visitor_id_ip ON visitor_identifications(ip_address);
CREATE INDEX IF NOT EXISTS ix_visitor_id_domain ON visitor_identifications(company_domain) WHERE company_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_visitor_id_session ON visitor_identifications(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_visitor_id_workspace_created ON visitor_identifications(workspace_id, created_at DESC);

-- =============================================================================
-- ICP TEMPLATES
-- Ideal Customer Profile definitions
-- =============================================================================

CREATE TABLE IF NOT EXISTS icp_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Template identity
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Scoring criteria (JSONB with weights)
    -- Structure: {
    --   "firmographic": { "weight": 40, "criteria": [...] },
    --   "behavioral": { "weight": 35, "criteria": [...] },
    --   "engagement": { "weight": 25, "criteria": [...] }
    -- }
    criteria JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Target definitions
    target_industries JSONB DEFAULT '[]'::jsonb,       -- ["SaaS", "FinTech", ...]
    target_employee_ranges JSONB DEFAULT '[]'::jsonb,   -- ["11-50", "51-200", ...]
    target_revenue_ranges JSONB DEFAULT '[]'::jsonb,
    target_locations JSONB DEFAULT '[]'::jsonb,

    -- Thresholds
    mql_threshold INTEGER NOT NULL DEFAULT 40,          -- score >= this = MQL
    sql_threshold INTEGER NOT NULL DEFAULT 70,          -- score >= this = SQL

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES developers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_icp_templates_workspace ON icp_templates(workspace_id);
CREATE INDEX IF NOT EXISTS ix_icp_templates_default ON icp_templates(workspace_id, is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS ix_icp_templates_criteria ON icp_templates USING GIN (criteria);

-- =============================================================================
-- LEAD SCORES
-- Persisted scoring results
-- =============================================================================

CREATE TABLE IF NOT EXISTS lead_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Scored entity
    record_id UUID NOT NULL,              -- CRM record being scored
    icp_template_id UUID REFERENCES icp_templates(id) ON DELETE SET NULL,

    -- Score breakdown (0-100 total)
    total_score INTEGER NOT NULL DEFAULT 0,
    firmographic_score INTEGER NOT NULL DEFAULT 0,    -- 0-40
    behavioral_score INTEGER NOT NULL DEFAULT 0,      -- 0-35
    engagement_score INTEGER NOT NULL DEFAULT 0,      -- 0-25

    -- Lifecycle stage
    lifecycle_stage VARCHAR(20) NOT NULL DEFAULT 'anonymous',
    -- anonymous, known, lead, mql, sql, opportunity, customer

    -- Score history (recent changes)
    score_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- [{"date": "...", "total": 45, "reason": "Company identified"}, ...]

    -- Scoring metadata
    scoring_factors JSONB NOT NULL DEFAULT '{}'::jsonb,  -- detailed factor breakdown
    last_scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_lead_score_record_template UNIQUE (workspace_id, record_id, icp_template_id)
);

CREATE INDEX IF NOT EXISTS ix_lead_scores_workspace ON lead_scores(workspace_id);
CREATE INDEX IF NOT EXISTS ix_lead_scores_record ON lead_scores(record_id);
CREATE INDEX IF NOT EXISTS ix_lead_scores_workspace_stage ON lead_scores(workspace_id, lifecycle_stage);
CREATE INDEX IF NOT EXISTS ix_lead_scores_workspace_total ON lead_scores(workspace_id, total_score DESC);
CREATE INDEX IF NOT EXISTS ix_lead_scores_template ON lead_scores(icp_template_id) WHERE icp_template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_lead_scores_history ON lead_scores USING GIN (score_history);
