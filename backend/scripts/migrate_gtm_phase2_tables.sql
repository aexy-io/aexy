-- GTM Phase 2 Tables Migration
-- Creates 19 tables for GTM features: ABM, Alerts, Competitor Intelligence, Content,
-- Expansion, Handoffs, Health Scoring, Intent Signals, Routing, SEO, and Webhooks.
-- Run: docker exec aexy-backend python scripts/run_migrations.py --file migrate_gtm_phase2_tables.sql

-- =============================================================================
-- ABM TARGET LISTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS abm_target_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Dynamic list criteria
    criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_dynamic BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    account_count INTEGER NOT NULL DEFAULT 0,

    created_by UUID REFERENCES developers(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_abm_target_lists_workspace ON abm_target_lists(workspace_id);

-- =============================================================================
-- ABM ACCOUNTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS abm_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_list_id UUID NOT NULL REFERENCES abm_target_lists(id) ON DELETE CASCADE,
    record_id UUID NOT NULL REFERENCES crm_records(id) ON DELETE CASCADE,

    tier VARCHAR(10) NOT NULL DEFAULT 'tier_2',
    stage VARCHAR(20) NOT NULL DEFAULT 'unaware',
    owner_id UUID,
    engagement_score INTEGER NOT NULL DEFAULT 0,

    -- Contact metrics
    total_contacts INTEGER NOT NULL DEFAULT 0,
    identified_contacts INTEGER NOT NULL DEFAULT 0,
    decision_makers INTEGER NOT NULL DEFAULT 0,

    -- Activity metrics
    contacts_in_sequences INTEGER NOT NULL DEFAULT 0,
    emails_sent INTEGER NOT NULL DEFAULT 0,
    emails_replied INTEGER NOT NULL DEFAULT 0,
    meetings_booked INTEGER NOT NULL DEFAULT 0,
    deals_created INTEGER NOT NULL DEFAULT 0,

    assigned_campaigns JSONB NOT NULL DEFAULT '[]'::jsonb,
    stage_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,

    last_activity_at TIMESTAMPTZ,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_abm_accounts_list_record UNIQUE (target_list_id, record_id)
);

CREATE INDEX IF NOT EXISTS ix_abm_accounts_workspace ON abm_accounts(workspace_id);
CREATE INDEX IF NOT EXISTS ix_abm_accounts_target_list ON abm_accounts(target_list_id);
CREATE INDEX IF NOT EXISTS ix_abm_accounts_record ON abm_accounts(record_id);
CREATE INDEX IF NOT EXISTS ix_abm_accounts_ws_stage ON abm_accounts(workspace_id, stage);
CREATE INDEX IF NOT EXISTS ix_abm_accounts_ws_tier ON abm_accounts(workspace_id, tier);

-- =============================================================================
-- GTM ALERT CONFIGS
-- =============================================================================

CREATE TABLE IF NOT EXISTS gtm_alert_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,

    -- Match conditions
    conditions JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Delivery channel
    channel_type VARCHAR(20) NOT NULL DEFAULT 'slack',
    channel_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    message_template TEXT,

    is_active BOOLEAN NOT NULL DEFAULT true,

    created_by UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_gtm_alert_configs_workspace ON gtm_alert_configs(workspace_id);
CREATE INDEX IF NOT EXISTS ix_gtm_alert_configs_ws_event ON gtm_alert_configs(workspace_id, event_type);

-- =============================================================================
-- GTM ALERT LOGS
-- =============================================================================

CREATE TABLE IF NOT EXISTS gtm_alert_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    alert_config_id UUID NOT NULL REFERENCES gtm_alert_configs(id) ON DELETE CASCADE,

    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    channel_type VARCHAR(20) NOT NULL,
    delivery_status VARCHAR(20) NOT NULL DEFAULT 'sent',
    error_message TEXT,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_gtm_alert_logs_workspace ON gtm_alert_logs(workspace_id);
CREATE INDEX IF NOT EXISTS ix_gtm_alert_logs_config ON gtm_alert_logs(alert_config_id);
CREATE INDEX IF NOT EXISTS ix_gtm_alert_logs_ws_created ON gtm_alert_logs(workspace_id, created_at);

-- =============================================================================
-- COMPETITOR PROFILES
-- =============================================================================

CREATE TABLE IF NOT EXISTS competitor_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) NOT NULL,

    tracked_pages JSONB NOT NULL DEFAULT '[]'::jsonb,
    current_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_competitor_profiles_ws_domain UNIQUE (workspace_id, domain)
);

CREATE INDEX IF NOT EXISTS ix_competitor_profiles_workspace ON competitor_profiles(workspace_id);

-- =============================================================================
-- COMPETITOR CHANGES
-- =============================================================================

CREATE TABLE IF NOT EXISTS competitor_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    competitor_id UUID NOT NULL REFERENCES competitor_profiles(id) ON DELETE CASCADE,

    page_url TEXT NOT NULL,
    page_label VARCHAR(255),
    change_type VARCHAR(30) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    severity VARCHAR(20) NOT NULL DEFAULT 'info',

    previous_content_hash VARCHAR(64),
    current_content_hash VARCHAR(64) NOT NULL,
    diff_data JSONB NOT NULL DEFAULT '{}'::jsonb,

    is_acknowledged BOOLEAN NOT NULL DEFAULT false,

    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_competitor_changes_workspace ON competitor_changes(workspace_id);
CREATE INDEX IF NOT EXISTS ix_competitor_changes_competitor ON competitor_changes(competitor_id);
CREATE INDEX IF NOT EXISTS ix_competitor_changes_ws_detected ON competitor_changes(workspace_id, detected_at);

-- =============================================================================
-- BATTLE CARDS
-- =============================================================================

CREATE TABLE IF NOT EXISTS battle_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    competitor_id UUID NOT NULL REFERENCES competitor_profiles(id) ON DELETE CASCADE,

    title VARCHAR(500) NOT NULL,
    overview TEXT,

    strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
    weaknesses JSONB NOT NULL DEFAULT '[]'::jsonb,
    our_advantages JSONB NOT NULL DEFAULT '[]'::jsonb,

    objection_handling JSONB NOT NULL DEFAULT '[]'::jsonb,
    talk_tracks JSONB NOT NULL DEFAULT '[]'::jsonb,
    pricing_comparison JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Win/loss data
    win_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    total_deals INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    common_loss_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    common_win_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,

    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    version INTEGER NOT NULL DEFAULT 1,

    generated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_battle_cards_workspace ON battle_cards(workspace_id);
CREATE INDEX IF NOT EXISTS ix_battle_cards_competitor ON battle_cards(competitor_id);

-- =============================================================================
-- CONTENT ANALYSES
-- =============================================================================

CREATE TABLE IF NOT EXISTS content_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    our_domain VARCHAR(255) NOT NULL,
    competitor_domains JSONB NOT NULL DEFAULT '[]'::jsonb,

    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    our_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
    competitor_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
    gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
    opportunities JSONB NOT NULL DEFAULT '[]'::jsonb,

    summary TEXT,
    pages_analyzed INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,

    triggered_by UUID,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_content_analyses_workspace ON content_analyses(workspace_id);

-- =============================================================================
-- GTM EXPANSION PLAYBOOKS
-- =============================================================================

CREATE TABLE IF NOT EXISTS gtm_expansion_playbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    description TEXT,

    playbook_type VARCHAR(20) NOT NULL DEFAULT 'upsell',
    trigger_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
    target_product JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Steps: [{step_index, type, delay_days, config}]
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,

    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Aggregate metrics
    total_enrollments INTEGER NOT NULL DEFAULT 0,
    conversion_count INTEGER NOT NULL DEFAULT 0,
    total_revenue_generated DOUBLE PRECISION NOT NULL DEFAULT 0.0,

    created_by UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_gtm_expansion_playbooks_workspace ON gtm_expansion_playbooks(workspace_id);

-- =============================================================================
-- GTM EXPANSION ENROLLMENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS gtm_expansion_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    playbook_id UUID NOT NULL REFERENCES gtm_expansion_playbooks(id) ON DELETE CASCADE,
    record_id UUID NOT NULL REFERENCES crm_records(id) ON DELETE CASCADE,

    assigned_to UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    current_step_index INTEGER NOT NULL DEFAULT 0,

    trigger_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    outcome JSONB NOT NULL DEFAULT '{}'::jsonb,

    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_gtm_expansion_enrollments_workspace ON gtm_expansion_enrollments(workspace_id);
CREATE INDEX IF NOT EXISTS ix_gtm_expansion_enrollments_playbook ON gtm_expansion_enrollments(playbook_id);
CREATE INDEX IF NOT EXISTS ix_gtm_expansion_enrollments_record ON gtm_expansion_enrollments(record_id);
CREATE INDEX IF NOT EXISTS ix_gtm_expansion_enrollments_ws_status ON gtm_expansion_enrollments(workspace_id, status);

-- =============================================================================
-- GTM HANDOFFS
-- =============================================================================

CREATE TABLE IF NOT EXISTS gtm_handoffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    record_id UUID NOT NULL REFERENCES crm_records(id) ON DELETE CASCADE,

    -- Participants
    created_by UUID NOT NULL,
    assigned_to UUID NOT NULL,

    -- Handoff details
    handoff_type VARCHAR(20) NOT NULL DEFAULT 'expansion',
    title VARCHAR(255) NOT NULL,
    context TEXT,
    estimated_value DOUBLE PRECISION,
    products JSONB NOT NULL DEFAULT '[]'::jsonb,
    signals JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Status flow: pending -> accepted/declined -> in_progress -> converted/lost
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    accepted_at TIMESTAMPTZ,
    declined_reason TEXT,

    -- Conversion
    deal_id UUID,
    outcome_notes TEXT,

    -- SLA
    sla_accept_minutes INTEGER NOT NULL DEFAULT 120,
    sla_breached BOOLEAN NOT NULL DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_gtm_handoffs_workspace ON gtm_handoffs(workspace_id);
CREATE INDEX IF NOT EXISTS ix_gtm_handoffs_record ON gtm_handoffs(record_id);
CREATE INDEX IF NOT EXISTS ix_gtm_handoffs_assigned_to ON gtm_handoffs(assigned_to);
CREATE INDEX IF NOT EXISTS ix_gtm_handoffs_ws_status ON gtm_handoffs(workspace_id, status);
CREATE INDEX IF NOT EXISTS ix_gtm_handoffs_ws_assigned ON gtm_handoffs(workspace_id, assigned_to);

-- =============================================================================
-- GTM HEALTH SCORES
-- =============================================================================

CREATE TABLE IF NOT EXISTS gtm_health_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    record_id UUID NOT NULL REFERENCES crm_records(id) ON DELETE CASCADE,

    -- Score breakdown (0-100)
    total_score INTEGER NOT NULL DEFAULT 0,
    engagement_score INTEGER NOT NULL DEFAULT 0,
    usage_score INTEGER NOT NULL DEFAULT 0,
    support_score INTEGER NOT NULL DEFAULT 0,
    nps_score INTEGER NOT NULL DEFAULT 0,
    payment_score INTEGER NOT NULL DEFAULT 0,

    -- Derived status
    health_status VARCHAR(20) NOT NULL DEFAULT 'neutral',
    trend VARCHAR(20) NOT NULL DEFAULT 'stable',
    previous_score INTEGER NOT NULL DEFAULT 0,
    score_delta INTEGER NOT NULL DEFAULT 0,

    -- History
    scoring_factors JSONB NOT NULL DEFAULT '{}'::jsonb,
    score_history JSONB NOT NULL DEFAULT '[]'::jsonb,

    last_scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_health_scores_ws_record UNIQUE (workspace_id, record_id)
);

CREATE INDEX IF NOT EXISTS ix_gtm_health_scores_workspace ON gtm_health_scores(workspace_id);
CREATE INDEX IF NOT EXISTS ix_gtm_health_scores_record ON gtm_health_scores(record_id);
CREATE INDEX IF NOT EXISTS ix_gtm_health_scores_ws_status ON gtm_health_scores(workspace_id, health_status);

-- =============================================================================
-- GTM HEALTH CONFIGS
-- =============================================================================

CREATE TABLE IF NOT EXISTS gtm_health_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Weights (should sum to 100)
    weights JSONB NOT NULL DEFAULT '{"engagement": 25, "usage": 30, "support": 20, "nps": 15, "payment": 10}'::jsonb,

    -- Thresholds
    healthy_threshold INTEGER NOT NULL DEFAULT 70,
    at_risk_threshold INTEGER NOT NULL DEFAULT 40,
    critical_threshold INTEGER NOT NULL DEFAULT 20,

    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_gtm_health_configs_workspace ON gtm_health_configs(workspace_id);

-- =============================================================================
-- INTENT SIGNALS
-- =============================================================================

CREATE TABLE IF NOT EXISTS intent_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    record_id UUID REFERENCES crm_records(id) ON DELETE SET NULL,

    company_name VARCHAR(500),
    company_domain VARCHAR(255),

    signal_type VARCHAR(30) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    source_url TEXT,
    source_name VARCHAR(100),

    confidence_score DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    intent_strength VARCHAR(20) NOT NULL DEFAULT 'medium',

    signal_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_processed BOOLEAN NOT NULL DEFAULT false,
    is_dismissed BOOLEAN NOT NULL DEFAULT false,

    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_intent_signals_workspace ON intent_signals(workspace_id);
CREATE INDEX IF NOT EXISTS ix_intent_signals_record ON intent_signals(record_id);
CREATE INDEX IF NOT EXISTS ix_intent_signals_domain ON intent_signals(company_domain);
CREATE INDEX IF NOT EXISTS ix_intent_signals_ws_type ON intent_signals(workspace_id, signal_type);
CREATE INDEX IF NOT EXISTS ix_intent_signals_ws_strength ON intent_signals(workspace_id, intent_strength);

-- =============================================================================
-- INTENT SIGNAL CONFIGS
-- =============================================================================

CREATE TABLE IF NOT EXISTS intent_signal_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,

    monitored_domains JSONB NOT NULL DEFAULT '[]'::jsonb,
    job_title_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
    tech_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
    competitor_names JSONB NOT NULL DEFAULT '[]'::jsonb,

    signal_weights JSONB NOT NULL DEFAULT '{"job_posting": 15, "tech_change": 10, "review_activity": 8, "competitor_eval": 20, "funding_event": 12}'::jsonb,

    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- GTM ROUTING RULES
-- =============================================================================

CREATE TABLE IF NOT EXISTS gtm_routing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Match conditions
    conditions JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Assignment strategy
    strategy VARCHAR(30) NOT NULL DEFAULT 'round_robin',
    assignee_pool JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- SLA configuration (minutes)
    sla_first_response_minutes INTEGER,
    sla_follow_up_minutes INTEGER,

    -- Fallback
    fallback_assignee_id UUID,

    created_by UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_gtm_routing_rules_workspace ON gtm_routing_rules(workspace_id);

-- =============================================================================
-- GTM LEAD ASSIGNMENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS gtm_lead_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    record_id UUID NOT NULL REFERENCES crm_records(id) ON DELETE CASCADE,
    routing_rule_id UUID REFERENCES gtm_routing_rules(id) ON DELETE SET NULL,
    assignee_id UUID NOT NULL,

    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    first_response_at TIMESTAMPTZ,

    -- SLA
    sla_first_response_minutes INTEGER,
    sla_breached BOOLEAN NOT NULL DEFAULT false,
    sla_breach_at TIMESTAMPTZ,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_gtm_lead_assignments_workspace ON gtm_lead_assignments(workspace_id);
CREATE INDEX IF NOT EXISTS ix_gtm_lead_assignments_record ON gtm_lead_assignments(record_id);
CREATE INDEX IF NOT EXISTS ix_gtm_lead_assignments_assignee ON gtm_lead_assignments(assignee_id);
CREATE INDEX IF NOT EXISTS ix_gtm_lead_assignments_ws_status ON gtm_lead_assignments(workspace_id, status);
CREATE INDEX IF NOT EXISTS ix_gtm_lead_assignments_ws_assignee ON gtm_lead_assignments(workspace_id, assignee_id);

-- =============================================================================
-- SEO AUDITS
-- =============================================================================

CREATE TABLE IF NOT EXISTS seo_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    target_url TEXT NOT NULL,
    domain VARCHAR(255) NOT NULL,
    record_id UUID REFERENCES crm_records(id) ON DELETE SET NULL,

    -- Scores (0-100)
    overall_score INTEGER NOT NULL DEFAULT 0,
    meta_score INTEGER NOT NULL DEFAULT 0,
    headings_score INTEGER NOT NULL DEFAULT 0,
    links_score INTEGER NOT NULL DEFAULT 0,
    images_score INTEGER NOT NULL DEFAULT 0,
    performance_score INTEGER NOT NULL DEFAULT 0,

    findings JSONB NOT NULL DEFAULT '{}'::jsonb,
    recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,

    pages_crawled INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    duration_seconds DOUBLE PRECISION,
    triggered_by UUID,

    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_seo_audits_workspace ON seo_audits(workspace_id);
CREATE INDEX IF NOT EXISTS ix_seo_audits_domain ON seo_audits(domain);
CREATE INDEX IF NOT EXISTS ix_seo_audits_ws_domain ON seo_audits(workspace_id, domain);

-- =============================================================================
-- SEO AUDIT PAGES
-- =============================================================================

CREATE TABLE IF NOT EXISTS seo_audit_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id UUID NOT NULL REFERENCES seo_audits(id) ON DELETE CASCADE,

    url TEXT NOT NULL,
    status_code INTEGER NOT NULL DEFAULT 200,
    page_score INTEGER NOT NULL DEFAULT 0,

    title VARCHAR(500),
    meta_description TEXT,
    h1_text VARCHAR(500),

    word_count INTEGER NOT NULL DEFAULT 0,
    page_size_kb DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    load_time_ms DOUBLE PRECISION NOT NULL DEFAULT 0.0,

    issues JSONB NOT NULL DEFAULT '[]'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_seo_audit_pages_audit ON seo_audit_pages(audit_id);

-- =============================================================================
-- GTM WEBHOOKS
-- =============================================================================

CREATE TABLE IF NOT EXISTS gtm_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    description TEXT,

    url VARCHAR(2000) NOT NULL,
    events JSONB NOT NULL DEFAULT '[]'::jsonb,
    secret VARCHAR(64) NOT NULL,
    headers JSONB NOT NULL DEFAULT '{}'::jsonb,

    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Delivery stats
    total_deliveries INTEGER NOT NULL DEFAULT 0,
    successful_deliveries INTEGER NOT NULL DEFAULT 0,
    failed_deliveries INTEGER NOT NULL DEFAULT 0,
    last_delivery_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_gtm_webhooks_workspace ON gtm_webhooks(workspace_id);
CREATE INDEX IF NOT EXISTS ix_gtm_webhook_ws_active ON gtm_webhooks(workspace_id, is_active);

-- =============================================================================
-- GTM WEBHOOK DELIVERIES
-- =============================================================================

CREATE TABLE IF NOT EXISTS gtm_webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES gtm_webhooks(id) ON DELETE CASCADE,

    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,

    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    response_status_code INTEGER,
    response_body TEXT,
    error_message TEXT,

    attempt_number INTEGER NOT NULL DEFAULT 1,
    duration_ms INTEGER,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_gtm_webhook_deliveries_webhook ON gtm_webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS ix_gtm_webhook_delivery_status ON gtm_webhook_deliveries(webhook_id, status);

-- =============================================================================
-- GTM PROVIDER HEALTH METRICS
-- =============================================================================

CREATE TABLE IF NOT EXISTS gtm_provider_health_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    provider_slot VARCHAR(50) NOT NULL,
    provider_name VARCHAR(100) NOT NULL,

    bucket_hour TIMESTAMPTZ NOT NULL,

    -- Counts
    total_requests INTEGER NOT NULL DEFAULT 0,
    successful_requests INTEGER NOT NULL DEFAULT 0,
    failed_requests INTEGER NOT NULL DEFAULT 0,

    -- Latency (milliseconds)
    avg_latency_ms INTEGER NOT NULL DEFAULT 0,
    p95_latency_ms INTEGER NOT NULL DEFAULT 0,
    max_latency_ms INTEGER NOT NULL DEFAULT 0,

    last_error TEXT,

    CONSTRAINT uq_provider_health_ws_slot_hour UNIQUE (workspace_id, provider_slot, bucket_hour)
);

CREATE INDEX IF NOT EXISTS ix_provider_health_ws_slot_hour ON gtm_provider_health_metrics(workspace_id, provider_slot, bucket_hour);
