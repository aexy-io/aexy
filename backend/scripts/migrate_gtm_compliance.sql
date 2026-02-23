-- GTM Compliance Engine Migration
-- Contact consent tracking, suppression lists, and compliance audit logging
-- Run: docker exec aexy-backend python scripts/run_migrations.py --file migrate_gtm_compliance.sql

-- =============================================================================
-- CONTACT CONSENTS
-- Tracks opt-in/opt-out per contact per jurisdiction
-- =============================================================================

CREATE TABLE IF NOT EXISTS contact_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Contact identity
    record_id UUID NOT NULL,                  -- CRM contact ID
    email VARCHAR(255) NOT NULL,

    -- Consent details
    consent_type VARCHAR(30) NOT NULL DEFAULT 'explicit_opt_in',
    -- explicit_opt_in, legitimate_interest, implied
    consent_source VARCHAR(100) NOT NULL,     -- web_form, import, manual, etc.
    jurisdiction VARCHAR(20) NOT NULL DEFAULT 'can_spam',
    -- gdpr, can_spam, casl, other

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    opted_out_at TIMESTAMPTZ,

    -- Dates
    consent_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiry_date TIMESTAMPTZ,                  -- CASL implied consent = 2 years

    -- Metadata
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_contact_consents_workspace ON contact_consents(workspace_id);
CREATE INDEX IF NOT EXISTS ix_contact_consents_record_id ON contact_consents(record_id);
CREATE INDEX IF NOT EXISTS ix_contact_consents_email ON contact_consents(email);
CREATE INDEX IF NOT EXISTS ix_contact_consents_ws_email ON contact_consents(workspace_id, email);
CREATE INDEX IF NOT EXISTS ix_contact_consents_ws_active ON contact_consents(workspace_id, is_active) WHERE is_active = true;

-- =============================================================================
-- SUPPRESSION LISTS
-- Global and workspace suppression entries
-- =============================================================================

CREATE TABLE IF NOT EXISTS suppression_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Suppression target
    email VARCHAR(255) NOT NULL,
    domain VARCHAR(255),                      -- suppress entire domain

    -- Reason and source
    reason VARCHAR(20) NOT NULL DEFAULT 'manual',
    -- unsubscribe, bounce, complaint, manual, legal
    source VARCHAR(100) NOT NULL DEFAULT 'manual',

    -- Who added it
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    added_by UUID REFERENCES developers(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_suppression_lists_workspace ON suppression_lists(workspace_id);
CREATE INDEX IF NOT EXISTS ix_suppression_lists_ws_email ON suppression_lists(workspace_id, email);
CREATE INDEX IF NOT EXISTS ix_suppression_lists_ws_domain ON suppression_lists(workspace_id, domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_suppression_lists_reason ON suppression_lists(workspace_id, reason);

-- =============================================================================
-- COMPLIANCE AUDIT LOGS
-- Every send decision logged for compliance trail
-- =============================================================================

CREATE TABLE IF NOT EXISTS compliance_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Target
    record_id UUID,
    email VARCHAR(255) NOT NULL,

    -- Action details
    action VARCHAR(30) NOT NULL,
    -- send_approved, send_blocked, consent_recorded, consent_revoked, suppression_added, erasure_completed
    reason TEXT,
    jurisdiction VARCHAR(20),

    -- Metadata
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_compliance_audit_workspace ON compliance_audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS ix_compliance_audit_ws_email ON compliance_audit_logs(workspace_id, email);
CREATE INDEX IF NOT EXISTS ix_compliance_audit_ws_action ON compliance_audit_logs(workspace_id, action);
CREATE INDEX IF NOT EXISTS ix_compliance_audit_ws_created ON compliance_audit_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_compliance_audit_email ON compliance_audit_logs(email);
