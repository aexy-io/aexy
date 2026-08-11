-- Several Google accounts in one workspace.
--
-- `google_integrations.workspace_id` was UNIQUE, so a workspace had exactly one
-- Google account. Nothing decided that: it is the shape of the original CRM
-- sync, from when per-developer `google_connections` existed only for sign-in.
-- The cost was that `connect-from-developer` *overwrote* — the second person to
-- connect silently replaced the first — and a `gmail_sync` Service Desk mailbox
-- could only ever be that one address.
--
-- Everything downstream was already keyed on `integration_id` rather than the
-- workspace: `synced_emails`, `synced_calendar_events`, `email_sync_cursors`,
-- `google_sync_jobs`, `service_desk_mailboxes`. Only the connection layer
-- assumed one, so this migration is a constraint swap and no data movement.
--
-- The replacement is per-address rather than none: connecting the same account
-- twice to one workspace is a mistake, not a feature, and without this the
-- upsert paths would have no key to match on.

DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- Postgres names this constraint automatically, and the name differs
    -- between databases created by `create_all` and by an earlier migration.
    -- Look it up rather than guessing `google_integrations_workspace_id_key`.
    SELECT con.conname INTO constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att
        ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
    WHERE rel.relname = 'google_integrations'
      AND con.contype = 'u'
      AND att.attname = 'workspace_id'
      AND array_length(con.conkey, 1) = 1
    LIMIT 1;

    IF constraint_name IS NOT NULL THEN
        EXECUTE format(
            'ALTER TABLE google_integrations DROP CONSTRAINT %I', constraint_name
        );
    END IF;
END $$;

-- Some databases carry it as a plain unique index rather than a constraint.
DROP INDEX IF EXISTS google_integrations_workspace_id_key;
DROP INDEX IF EXISTS ix_google_integrations_workspace_id_unique;

-- Still indexed, just no longer unique — every lookup is by workspace.
CREATE INDEX IF NOT EXISTS ix_google_integrations_workspace
    ON google_integrations (workspace_id);

-- One row per address per workspace.
--
-- Case-insensitive, because Gmail addresses are: `Ops@acme.com` and
-- `ops@acme.com` are one mailbox, and letting both exist would give a workspace
-- two integrations that sync the same inbox and two cursors fighting over it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_google_integration_address
    ON google_integrations (workspace_id, lower(google_email));
