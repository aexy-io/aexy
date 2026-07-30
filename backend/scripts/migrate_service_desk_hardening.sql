-- Bimaplan Service Desk — hardening follow-up to migrate_service_desk.sql.
--
-- 1) service_desk_ingested_messages: real idempotency for inbound mail. The
--    original intake only compared against service_desk_tickets.source_message_id,
--    which holds the FIRST message of a thread — so a redelivered *reply* (any
--    inbound-parse provider retries on non-2xx) was appended twice. The unique
--    constraint here, not the preceding SELECT, is what makes ingest idempotent
--    under concurrent delivery of the same message.
--
-- 2) service_desk_tickets.mailbox_id: remember which shared mailbox a ticket
--    arrived on, so closure replies go out in-thread from the right sender when
--    a workspace runs more than one mailbox (the old code picked an arbitrary
--    active Gmail mailbox).

CREATE TABLE IF NOT EXISTS service_desk_ingested_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    message_id VARCHAR(512) NOT NULL,
    ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sd_ingested_message UNIQUE (workspace_id, message_id)
);

CREATE INDEX IF NOT EXISTS ix_sd_ingested_workspace ON service_desk_ingested_messages(workspace_id);
CREATE INDEX IF NOT EXISTS ix_sd_ingested_message_id ON service_desk_ingested_messages(message_id);
CREATE INDEX IF NOT EXISTS ix_sd_ingested_ticket ON service_desk_ingested_messages(ticket_id);

-- Backfill the message ids we already know about so previously-ingested mail
-- stays deduplicated after this migration.
INSERT INTO service_desk_ingested_messages (workspace_id, message_id, ticket_id)
SELECT workspace_id, source_message_id, ticket_id
FROM service_desk_tickets
WHERE source_message_id IS NOT NULL
ON CONFLICT (workspace_id, message_id) DO NOTHING;

ALTER TABLE service_desk_tickets
    ADD COLUMN IF NOT EXISTS mailbox_id UUID REFERENCES service_desk_mailboxes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_sd_tickets_mailbox ON service_desk_tickets(mailbox_id);
