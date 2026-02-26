-- =============================================================================
-- GTM Features Migration
-- =============================================================================
-- Creates all 11 new GTM component tables and their indexes.
--
-- Components:
--   1. GTM Alerts         - gtm_alert_configs, gtm_alert_logs
--   2. Lead Routing       - gtm_routing_rules, gtm_lead_assignments
--   3. Health Scoring     - gtm_health_scores, gtm_health_configs
--   4. Expansion Playbooks - gtm_expansion_playbooks, gtm_expansion_enrollments
--   5. CS-to-Sales Handoffs - gtm_handoffs
--   6. Intent Signals     - intent_signals, intent_signal_configs
--   7. Competitor Intel   - competitor_profiles, competitor_changes, battle_cards
--   8. SEO Audit          - seo_audits, seo_audit_pages
--   9. Content Gap        - content_analyses
--  10. ABM                - abm_target_lists, abm_accounts
--
-- All tables use IF NOT EXISTS for idempotent execution.
-- All indexes use CREATE INDEX IF NOT EXISTS.
--
-- Date: 2026-02-23
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. GTM Alerts
-- =============================================================================

CREATE TABLE IF NOT EXISTS gtm_alert_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    conditions JSONB NOT NULL DEFAULT '{}',
    channel_type VARCHAR(20) NOT NULL DEFAULT 'slack',
    channel_config JSONB NOT NULL DEFAULT '{}',
    message_template TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gtm_alert_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    alert_config_id UUID NOT NULL REFERENCES gtm_alert_configs(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL DEFAULT '{}',
    channel_type VARCHAR(20) NOT NULL,
    delivery_status VARCHAR(20) NOT NULL DEFAULT 'sent',
    error_message TEXT,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 2. Lead Routing
-- =============================================================================

CREATE TABLE IF NOT EXISTS gtm_routing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    conditions JSONB NOT NULL DEFAULT '[]',
    strategy VARCHAR(30) NOT NULL DEFAULT 'round_robin',
    assignee_pool JSONB NOT NULL DEFAULT '[]',
    sla_first_response_minutes INTEGER,
    sla_follow_up_minutes INTEGER,
    fallback_assignee_id UUID,
    created_by UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gtm_lead_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    record_id UUID NOT NULL,
    routing_rule_id UUID REFERENCES gtm_routing_rules(id) ON DELETE SET NULL,
    assignee_id UUID NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    first_response_at TIMESTAMPTZ,
    sla_first_response_minutes INTEGER,
    sla_breached BOOLEAN NOT NULL DEFAULT FALSE,
    sla_breach_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 3. Health Scoring
-- =============================================================================

CREATE TABLE IF NOT EXISTS gtm_health_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    record_id UUID NOT NULL,
    total_score INTEGER NOT NULL DEFAULT 0,
    engagement_score INTEGER NOT NULL DEFAULT 0,
    usage_score INTEGER NOT NULL DEFAULT 0,
    support_score INTEGER NOT NULL DEFAULT 0,
    nps_score INTEGER NOT NULL DEFAULT 0,
    payment_score INTEGER NOT NULL DEFAULT 0,
    health_status VARCHAR(20) NOT NULL DEFAULT 'neutral',
    trend VARCHAR(20) NOT NULL DEFAULT 'stable',
    previous_score INTEGER NOT NULL DEFAULT 0,
    score_delta INTEGER NOT NULL DEFAULT 0,
    scoring_factors JSONB NOT NULL DEFAULT '{}',
    score_history JSONB NOT NULL DEFAULT '[]',
    last_scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, record_id)
);

CREATE TABLE IF NOT EXISTS gtm_health_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    weights JSONB NOT NULL DEFAULT '{"engagement":25,"usage":30,"support":20,"nps":15,"payment":10}',
    healthy_threshold INTEGER NOT NULL DEFAULT 70,
    at_risk_threshold INTEGER NOT NULL DEFAULT 40,
    critical_threshold INTEGER NOT NULL DEFAULT 20,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 4. Expansion Playbooks
-- =============================================================================

CREATE TABLE IF NOT EXISTS gtm_expansion_playbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    playbook_type VARCHAR(20) NOT NULL DEFAULT 'upsell',
    trigger_conditions JSONB NOT NULL DEFAULT '[]',
    target_product JSONB NOT NULL DEFAULT '{}',
    steps JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    total_enrollments INTEGER NOT NULL DEFAULT 0,
    conversion_count INTEGER NOT NULL DEFAULT 0,
    total_revenue_generated DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    created_by UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gtm_expansion_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    playbook_id UUID NOT NULL REFERENCES gtm_expansion_playbooks(id) ON DELETE CASCADE,
    record_id UUID NOT NULL,
    assigned_to UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    current_step_index INTEGER NOT NULL DEFAULT 0,
    trigger_data JSONB NOT NULL DEFAULT '{}',
    outcome JSONB NOT NULL DEFAULT '{}',
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 5. CS-to-Sales Handoffs
-- =============================================================================

CREATE TABLE IF NOT EXISTS gtm_handoffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    record_id UUID NOT NULL,
    created_by UUID NOT NULL,
    assigned_to UUID NOT NULL,
    handoff_type VARCHAR(20) NOT NULL DEFAULT 'expansion',
    title VARCHAR(255) NOT NULL,
    context TEXT,
    estimated_value DOUBLE PRECISION,
    products JSONB NOT NULL DEFAULT '[]',
    signals JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    accepted_at TIMESTAMPTZ,
    declined_reason TEXT,
    deal_id UUID,
    outcome_notes TEXT,
    sla_accept_minutes INTEGER NOT NULL DEFAULT 120,
    sla_breached BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 6. Intent Signals
-- =============================================================================

CREATE TABLE IF NOT EXISTS intent_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    record_id UUID,
    company_name VARCHAR(500),
    company_domain VARCHAR(255),
    signal_type VARCHAR(30) NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    source_url TEXT,
    source_name VARCHAR(100),
    confidence_score DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    intent_strength VARCHAR(20) NOT NULL DEFAULT 'medium',
    signal_data JSONB NOT NULL DEFAULT '{}',
    is_processed BOOLEAN NOT NULL DEFAULT FALSE,
    is_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intent_signal_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
    monitored_domains JSONB NOT NULL DEFAULT '[]',
    job_title_keywords JSONB NOT NULL DEFAULT '[]',
    tech_keywords JSONB NOT NULL DEFAULT '[]',
    competitor_names JSONB NOT NULL DEFAULT '[]',
    signal_weights JSONB NOT NULL DEFAULT '{"job_posting":15,"tech_change":10,"review_activity":8,"competitor_eval":20,"funding_event":12}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 7. Competitor Intelligence
-- =============================================================================

CREATE TABLE IF NOT EXISTS competitor_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) NOT NULL,
    tracked_pages JSONB NOT NULL DEFAULT '[]',
    current_snapshot JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, domain)
);

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
    diff_data JSONB NOT NULL DEFAULT '{}',
    is_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS battle_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    competitor_id UUID NOT NULL REFERENCES competitor_profiles(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    overview TEXT,
    strengths JSONB NOT NULL DEFAULT '[]',
    weaknesses JSONB NOT NULL DEFAULT '[]',
    our_advantages JSONB NOT NULL DEFAULT '[]',
    objection_handling JSONB NOT NULL DEFAULT '[]',
    talk_tracks JSONB NOT NULL DEFAULT '[]',
    pricing_comparison JSONB NOT NULL DEFAULT '{}',
    win_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    total_deals INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    common_loss_reasons JSONB NOT NULL DEFAULT '[]',
    common_win_reasons JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    version INTEGER NOT NULL DEFAULT 1,
    generated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 8. SEO Audit
-- =============================================================================

CREATE TABLE IF NOT EXISTS seo_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_url TEXT NOT NULL,
    domain VARCHAR(255) NOT NULL,
    record_id UUID,
    overall_score INTEGER NOT NULL DEFAULT 0,
    meta_score INTEGER NOT NULL DEFAULT 0,
    headings_score INTEGER NOT NULL DEFAULT 0,
    links_score INTEGER NOT NULL DEFAULT 0,
    images_score INTEGER NOT NULL DEFAULT 0,
    performance_score INTEGER NOT NULL DEFAULT 0,
    findings JSONB NOT NULL DEFAULT '{}',
    recommendations JSONB NOT NULL DEFAULT '[]',
    pages_crawled INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    duration_seconds DOUBLE PRECISION,
    triggered_by UUID,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
    issues JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 9. Content Gap Analysis
-- =============================================================================

CREATE TABLE IF NOT EXISTS content_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    our_domain VARCHAR(255) NOT NULL,
    competitor_domains JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    our_topics JSONB NOT NULL DEFAULT '[]',
    competitor_topics JSONB NOT NULL DEFAULT '[]',
    gaps JSONB NOT NULL DEFAULT '[]',
    opportunities JSONB NOT NULL DEFAULT '[]',
    summary TEXT,
    pages_analyzed INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    triggered_by UUID,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 10. ABM (Account-Based Marketing)
-- =============================================================================

CREATE TABLE IF NOT EXISTS abm_target_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    criteria JSONB NOT NULL DEFAULT '{}',
    is_dynamic BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    account_count INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS abm_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_list_id UUID NOT NULL REFERENCES abm_target_lists(id) ON DELETE CASCADE,
    record_id UUID NOT NULL,
    tier VARCHAR(10) NOT NULL DEFAULT 'tier_2',
    stage VARCHAR(20) NOT NULL DEFAULT 'unaware',
    owner_id UUID,
    engagement_score INTEGER NOT NULL DEFAULT 0,
    total_contacts INTEGER NOT NULL DEFAULT 0,
    identified_contacts INTEGER NOT NULL DEFAULT 0,
    decision_makers INTEGER NOT NULL DEFAULT 0,
    contacts_in_sequences INTEGER NOT NULL DEFAULT 0,
    emails_sent INTEGER NOT NULL DEFAULT 0,
    emails_replied INTEGER NOT NULL DEFAULT 0,
    meetings_booked INTEGER NOT NULL DEFAULT 0,
    deals_created INTEGER NOT NULL DEFAULT 0,
    assigned_campaigns JSONB NOT NULL DEFAULT '[]',
    stage_history JSONB NOT NULL DEFAULT '[]',
    notes TEXT,
    last_activity_at TIMESTAMPTZ,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(target_list_id, record_id)
);


-- =============================================================================
-- INDEXES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- GTM Alerts indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_gtm_alert_configs_workspace_id
    ON gtm_alert_configs (workspace_id);

CREATE INDEX IF NOT EXISTS ix_gtm_alert_configs_ws_event
    ON gtm_alert_configs (workspace_id, event_type);

CREATE INDEX IF NOT EXISTS ix_gtm_alert_logs_workspace_id
    ON gtm_alert_logs (workspace_id);

CREATE INDEX IF NOT EXISTS ix_gtm_alert_logs_alert_config_id
    ON gtm_alert_logs (alert_config_id);

CREATE INDEX IF NOT EXISTS ix_gtm_alert_logs_ws_created
    ON gtm_alert_logs (workspace_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Lead Routing indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_gtm_routing_rules_workspace_id
    ON gtm_routing_rules (workspace_id);

CREATE INDEX IF NOT EXISTS ix_gtm_lead_assignments_workspace_id
    ON gtm_lead_assignments (workspace_id);

CREATE INDEX IF NOT EXISTS ix_gtm_lead_assignments_record_id
    ON gtm_lead_assignments (record_id);

CREATE INDEX IF NOT EXISTS ix_gtm_lead_assignments_assignee_id
    ON gtm_lead_assignments (assignee_id);

CREATE INDEX IF NOT EXISTS ix_gtm_lead_assignments_ws_status
    ON gtm_lead_assignments (workspace_id, status);

CREATE INDEX IF NOT EXISTS ix_gtm_lead_assignments_ws_assignee
    ON gtm_lead_assignments (workspace_id, assignee_id);

-- ---------------------------------------------------------------------------
-- Health Scoring indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_gtm_health_scores_workspace_id
    ON gtm_health_scores (workspace_id);

CREATE INDEX IF NOT EXISTS ix_gtm_health_scores_record_id
    ON gtm_health_scores (record_id);

CREATE INDEX IF NOT EXISTS ix_gtm_health_scores_ws_status
    ON gtm_health_scores (workspace_id, health_status);

CREATE INDEX IF NOT EXISTS ix_gtm_health_configs_workspace_id
    ON gtm_health_configs (workspace_id);

-- ---------------------------------------------------------------------------
-- Expansion Playbooks indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_gtm_expansion_playbooks_workspace_id
    ON gtm_expansion_playbooks (workspace_id);

CREATE INDEX IF NOT EXISTS ix_gtm_expansion_enrollments_workspace_id
    ON gtm_expansion_enrollments (workspace_id);

CREATE INDEX IF NOT EXISTS ix_gtm_expansion_enrollments_playbook_id
    ON gtm_expansion_enrollments (playbook_id);

CREATE INDEX IF NOT EXISTS ix_gtm_expansion_enrollments_record_id
    ON gtm_expansion_enrollments (record_id);

CREATE INDEX IF NOT EXISTS ix_gtm_expansion_enrollments_ws_status
    ON gtm_expansion_enrollments (workspace_id, status);

-- ---------------------------------------------------------------------------
-- Handoffs indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_gtm_handoffs_workspace_id
    ON gtm_handoffs (workspace_id);

CREATE INDEX IF NOT EXISTS ix_gtm_handoffs_record_id
    ON gtm_handoffs (record_id);

CREATE INDEX IF NOT EXISTS ix_gtm_handoffs_assigned_to
    ON gtm_handoffs (assigned_to);

CREATE INDEX IF NOT EXISTS ix_gtm_handoffs_ws_status
    ON gtm_handoffs (workspace_id, status);

CREATE INDEX IF NOT EXISTS ix_gtm_handoffs_ws_assigned
    ON gtm_handoffs (workspace_id, assigned_to);

-- ---------------------------------------------------------------------------
-- Intent Signals indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_intent_signals_workspace_id
    ON intent_signals (workspace_id);

CREATE INDEX IF NOT EXISTS ix_intent_signals_record_id
    ON intent_signals (record_id);

CREATE INDEX IF NOT EXISTS ix_intent_signals_company_domain
    ON intent_signals (company_domain);

CREATE INDEX IF NOT EXISTS ix_intent_signals_ws_type
    ON intent_signals (workspace_id, signal_type);

CREATE INDEX IF NOT EXISTS ix_intent_signals_ws_strength
    ON intent_signals (workspace_id, intent_strength);

-- ---------------------------------------------------------------------------
-- Competitor Intelligence indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_competitor_profiles_workspace_id
    ON competitor_profiles (workspace_id);

CREATE INDEX IF NOT EXISTS ix_competitor_changes_workspace_id
    ON competitor_changes (workspace_id);

CREATE INDEX IF NOT EXISTS ix_competitor_changes_competitor_id
    ON competitor_changes (competitor_id);

CREATE INDEX IF NOT EXISTS ix_competitor_changes_ws_detected
    ON competitor_changes (workspace_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS ix_battle_cards_workspace_id
    ON battle_cards (workspace_id);

CREATE INDEX IF NOT EXISTS ix_battle_cards_competitor_id
    ON battle_cards (competitor_id);

-- ---------------------------------------------------------------------------
-- SEO Audit indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_seo_audits_workspace_id
    ON seo_audits (workspace_id);

CREATE INDEX IF NOT EXISTS ix_seo_audits_domain
    ON seo_audits (domain);

CREATE INDEX IF NOT EXISTS ix_seo_audits_ws_domain
    ON seo_audits (workspace_id, domain);

CREATE INDEX IF NOT EXISTS ix_seo_audit_pages_audit_id
    ON seo_audit_pages (audit_id);

-- ---------------------------------------------------------------------------
-- Content Gap Analysis indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_content_analyses_workspace_id
    ON content_analyses (workspace_id);

-- ---------------------------------------------------------------------------
-- ABM indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_abm_target_lists_workspace_id
    ON abm_target_lists (workspace_id);

CREATE INDEX IF NOT EXISTS ix_abm_accounts_workspace_id
    ON abm_accounts (workspace_id);

CREATE INDEX IF NOT EXISTS ix_abm_accounts_target_list_id
    ON abm_accounts (target_list_id);

CREATE INDEX IF NOT EXISTS ix_abm_accounts_record_id
    ON abm_accounts (record_id);

CREATE INDEX IF NOT EXISTS ix_abm_accounts_ws_stage
    ON abm_accounts (workspace_id, stage);

CREATE INDEX IF NOT EXISTS ix_abm_accounts_ws_tier
    ON abm_accounts (workspace_id, tier);

COMMIT;
