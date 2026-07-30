-- Aexy Bimaplan Service Desk — email-intake ticketing layer
-- Models: models/service_desk.py. Plan: prds/BIMAPLAN_SERVICE_DESK_PLAN.md §4–§6.
-- Master data (partners/insurers/LOBs + domains), the Ticket extension, the
-- Pending-With ledger, and the shared-mailbox registry.

-- ============================================
-- MASTER DATA
-- ============================================
CREATE TABLE IF NOT EXISTS service_desk_partners (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    assigned_kam_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_service_desk_partner_name UNIQUE (workspace_id, name)
);
CREATE INDEX IF NOT EXISTS ix_sd_partners_workspace ON service_desk_partners(workspace_id);
CREATE INDEX IF NOT EXISTS ix_sd_partners_kam ON service_desk_partners(assigned_kam_id);

CREATE TABLE IF NOT EXISTS service_desk_partner_domains (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES service_desk_partners(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL,
    CONSTRAINT uq_service_desk_partner_domain UNIQUE (workspace_id, domain)
);
CREATE INDEX IF NOT EXISTS ix_sd_partner_domains_partner ON service_desk_partner_domains(partner_id);
CREATE INDEX IF NOT EXISTS ix_sd_partner_domains_domain ON service_desk_partner_domains(domain);

CREATE TABLE IF NOT EXISTS service_desk_insurers (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_service_desk_insurer_name UNIQUE (workspace_id, name)
);
CREATE INDEX IF NOT EXISTS ix_sd_insurers_workspace ON service_desk_insurers(workspace_id);

CREATE TABLE IF NOT EXISTS service_desk_insurer_domains (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    insurer_id UUID NOT NULL REFERENCES service_desk_insurers(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL,
    CONSTRAINT uq_service_desk_insurer_domain UNIQUE (workspace_id, domain)
);
CREATE INDEX IF NOT EXISTS ix_sd_insurer_domains_insurer ON service_desk_insurer_domains(insurer_id);
CREATE INDEX IF NOT EXISTS ix_sd_insurer_domains_domain ON service_desk_insurer_domains(domain);

CREATE TABLE IF NOT EXISTS service_desk_lobs (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_service_desk_lob_name UNIQUE (workspace_id, name)
);
CREATE INDEX IF NOT EXISTS ix_sd_lobs_workspace ON service_desk_lobs(workspace_id);

-- ============================================
-- SHARED MAILBOXES (intake sources)
-- ============================================
CREATE TABLE IF NOT EXISTS service_desk_mailboxes (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    address VARCHAR(255) NOT NULL,
    channel VARCHAR(20) NOT NULL DEFAULT 'webhook',
    integration_id UUID REFERENCES google_integrations(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_service_desk_mailbox_address UNIQUE (workspace_id, address)
);
CREATE INDEX IF NOT EXISTS ix_sd_mailboxes_workspace ON service_desk_mailboxes(workspace_id);
CREATE INDEX IF NOT EXISTS ix_sd_mailboxes_address ON service_desk_mailboxes(address);
CREATE INDEX IF NOT EXISTS ix_sd_mailboxes_integration ON service_desk_mailboxes(integration_id);

-- ============================================
-- TICKET EXTENSION (1:1 with tickets)
-- ============================================
CREATE TABLE IF NOT EXISTS service_desk_tickets (
    id UUID PRIMARY KEY,
    ticket_id UUID NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    lob_id UUID REFERENCES service_desk_lobs(id) ON DELETE SET NULL,
    partner_id UUID REFERENCES service_desk_partners(id) ON DELETE SET NULL,
    insurer_id UUID REFERENCES service_desk_insurers(id) ON DELETE SET NULL,
    request_type VARCHAR(30) NOT NULL DEFAULT 'query',
    pending_with VARCHAR(20) NOT NULL DEFAULT 'kam',
    origin VARCHAR(20) NOT NULL DEFAULT 'email',
    needs_triage BOOLEAN NOT NULL DEFAULT FALSE,
    ai_confidence DOUBLE PRECISION,
    thread_ref VARCHAR(512),
    source_message_id VARCHAR(512),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_sd_tickets_workspace ON service_desk_tickets(workspace_id);
CREATE INDEX IF NOT EXISTS ix_sd_tickets_partner ON service_desk_tickets(partner_id);
CREATE INDEX IF NOT EXISTS ix_sd_tickets_pending_with ON service_desk_tickets(pending_with);
CREATE INDEX IF NOT EXISTS ix_sd_tickets_request_type ON service_desk_tickets(request_type);
CREATE INDEX IF NOT EXISTS ix_sd_tickets_needs_triage ON service_desk_tickets(needs_triage);
CREATE INDEX IF NOT EXISTS ix_sd_tickets_thread_ref ON service_desk_tickets(thread_ref);
CREATE INDEX IF NOT EXISTS ix_sd_tickets_source_message ON service_desk_tickets(source_message_id);

-- ============================================
-- PENDING-WITH LEDGER
-- ============================================
CREATE TABLE IF NOT EXISTS ticket_pending_segments (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    pending_with VARCHAR(20) NOT NULL,
    entered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    exited_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    changed_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_ticket_pending_segments_ticket ON ticket_pending_segments(ticket_id, entered_at);
CREATE INDEX IF NOT EXISTS ix_ticket_pending_segments_workspace ON ticket_pending_segments(workspace_id);
CREATE INDEX IF NOT EXISTS ix_ticket_pending_segments_pending_with ON ticket_pending_segments(pending_with);
-- at most one OPEN segment per ticket
CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_open_segment
    ON ticket_pending_segments(ticket_id)
    WHERE exited_at IS NULL;
