-- Canonical parent link for Service Desk tickets created by automatic or
-- human splitting. JSON fields remain presentation/audit metadata only.

ALTER TABLE service_desk_tickets
    ADD COLUMN IF NOT EXISTS split_parent_ticket_id UUID
    REFERENCES tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_sd_tickets_split_parent
    ON service_desk_tickets(split_parent_ticket_id);

-- Safely backfill children created before this column existed. Both tickets
-- and both Service Desk extensions must already agree on the same workspace.
UPDATE service_desk_tickets AS child_sd
SET split_parent_ticket_id = parent_ticket.id
FROM tickets AS child_ticket
JOIN tickets AS parent_ticket
  ON parent_ticket.id::text = child_ticket.field_values->>'split_from_ticket_id'
 AND parent_ticket.workspace_id = child_ticket.workspace_id
JOIN service_desk_tickets AS parent_sd
  ON parent_sd.ticket_id = parent_ticket.id
 AND parent_sd.workspace_id = child_ticket.workspace_id
WHERE child_sd.ticket_id = child_ticket.id
  AND child_sd.workspace_id = child_ticket.workspace_id
  AND child_sd.split_parent_ticket_id IS NULL;

-- PostgreSQL cannot express a same-workspace self-reference as a CHECK
-- constraint. This constraint trigger closes that gap without changing the
-- existing Ticket primary key or delete behaviour.
CREATE OR REPLACE FUNCTION enforce_service_desk_split_parent_workspace()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.split_parent_ticket_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM service_desk_tickets AS parent_sd
        WHERE parent_sd.ticket_id = NEW.split_parent_ticket_id
          AND parent_sd.workspace_id = NEW.workspace_id
    ) THEN
        RAISE EXCEPTION
            'service desk split parent % is missing or belongs to another workspace',
            NEW.split_parent_ticket_id
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sd_split_parent_workspace ON service_desk_tickets;
CREATE CONSTRAINT TRIGGER trg_sd_split_parent_workspace
AFTER INSERT OR UPDATE OF split_parent_ticket_id, workspace_id
ON service_desk_tickets
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION enforce_service_desk_split_parent_workspace();
