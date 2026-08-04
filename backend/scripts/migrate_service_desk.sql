-- Aexy Service Desk — email-intake ticketing layer
-- Models: models/service_desk.py.
-- Master data (accounts/vendors/products + domains), the Ticket extension, the
-- Pending-With ledger, and the shared-mailbox registry.
--
-- This file creates the tables in their CURRENT shape. It originally created an
-- insurance-shaped one — service_desk_partners / _insurers / _lobs, with
-- partner_id / insurer_id / lob_id on service_desk_tickets — which
-- migrate_service_desk_agnostic.sql then renamed. Creating five tables so that a
-- later migration in the same run can rename them is churn at best, and on a
-- Docker-first database it was a hard failure: `main.py` runs `create_all` on
-- startup, so a database whose app had booted already had service_desk_tickets
-- with `account_id`, the `CREATE TABLE IF NOT EXISTS` here no-oped, and
-- `CREATE INDEX ... (partner_id)` errored with "column partner_id does not
-- exist" — stopping the whole migration run at the third file.
--
-- Nothing is deployed, so the shape is corrected in place rather than layered.
-- A database that already applied the old version is unaffected: the runner
-- treats a changed checksum as a warning and will not re-run without --force,
-- and migrate_service_desk_agnostic.sql performs the rename for it. That
-- migration is still required — it creates the taxonomy tables — and is now a
-- no-op on a database built from this file.

-- ============================================
-- MASTER DATA
-- ============================================
CREATE TABLE IF NOT EXISTS service_desk_accounts (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    assigned_owner_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_service_desk_account_name UNIQUE (workspace_id, name)
);
CREATE INDEX IF NOT EXISTS ix_sd_accounts_workspace ON service_desk_accounts(workspace_id);
CREATE INDEX IF NOT EXISTS ix_sd_accounts_owner ON service_desk_accounts(assigned_owner_id);

CREATE TABLE IF NOT EXISTS service_desk_account_domains (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES service_desk_accounts(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL,
    CONSTRAINT uq_service_desk_account_domain UNIQUE (workspace_id, domain)
);
CREATE INDEX IF NOT EXISTS ix_sd_account_domains_account ON service_desk_account_domains(account_id);
CREATE INDEX IF NOT EXISTS ix_sd_account_domains_domain ON service_desk_account_domains(domain);

CREATE TABLE IF NOT EXISTS service_desk_vendors (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_service_desk_vendor_name UNIQUE (workspace_id, name)
);
CREATE INDEX IF NOT EXISTS ix_sd_vendors_workspace ON service_desk_vendors(workspace_id);

CREATE TABLE IF NOT EXISTS service_desk_vendor_domains (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES service_desk_vendors(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL,
    CONSTRAINT uq_service_desk_vendor_domain UNIQUE (workspace_id, domain)
);
CREATE INDEX IF NOT EXISTS ix_sd_vendor_domains_vendor ON service_desk_vendor_domains(vendor_id);
CREATE INDEX IF NOT EXISTS ix_sd_vendor_domains_domain ON service_desk_vendor_domains(domain);

CREATE TABLE IF NOT EXISTS service_desk_products (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_service_desk_product_name UNIQUE (workspace_id, name)
);
CREATE INDEX IF NOT EXISTS ix_sd_products_workspace ON service_desk_products(workspace_id);

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
-- request_type and pending_with hold taxonomy *slugs*, not foreign keys: a
-- ticket's history has to stay readable after a bucket is retired. They carry no
-- column default, because the starting bucket comes from the workspace's own
-- taxonomy — a default here would write one industry's slugs into every desk.
CREATE TABLE IF NOT EXISTS service_desk_tickets (
    id UUID PRIMARY KEY,
    ticket_id UUID NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    -- Unnamed on purpose: Postgres names these service_desk_tickets_<col>_fkey,
    -- which is what create_all produces and what the agnostic migration's
    -- constraint-rename loop lands on. Naming them here would make the
    -- constraint in an error message depend on which path built the database.
    product_id UUID REFERENCES service_desk_products(id) ON DELETE SET NULL,
    account_id UUID REFERENCES service_desk_accounts(id) ON DELETE SET NULL,
    vendor_id UUID REFERENCES service_desk_vendors(id) ON DELETE SET NULL,
    request_type VARCHAR(64) NOT NULL,
    pending_with VARCHAR(64) NOT NULL,
    origin VARCHAR(20) NOT NULL DEFAULT 'email',
    needs_triage BOOLEAN NOT NULL DEFAULT FALSE,
    ai_confidence DOUBLE PRECISION,
    thread_ref VARCHAR(512),
    source_message_id VARCHAR(512),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_sd_tickets_workspace ON service_desk_tickets(workspace_id);
CREATE INDEX IF NOT EXISTS ix_sd_tickets_account ON service_desk_tickets(account_id);
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
    pending_with VARCHAR(64) NOT NULL,
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
