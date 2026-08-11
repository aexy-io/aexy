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
    target TEXT;
BEGIN
    -- Drop whatever single-column UNIQUE on workspace_id this database has,
    -- discovered rather than guessed. Guessing is what made the first version
    -- of this migration a no-op: it dropped the constraint and two invented
    -- index names, while the real one was `ix_google_integrations_workspace_id`
    -- — a unique *index*, created by SQLAlchemy because the column carried both
    -- `unique=True` and `index=True`. The migration reported success and the
    -- second account still failed to insert.

    -- Table constraints first (these own their backing index).
    FOR target IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'google_integrations'
          AND con.contype = 'u'
          AND array_length(con.conkey, 1) = 1
          AND con.conkey[1] = (
              SELECT attnum FROM pg_attribute
              WHERE attrelid = rel.oid AND attname = 'workspace_id'
          )
    LOOP
        EXECUTE format('ALTER TABLE google_integrations DROP CONSTRAINT %I', target);
    END LOOP;

    -- Then standalone unique indexes with no constraint behind them.
    FOR target IN
        SELECT idx.relname
        FROM pg_index i
        JOIN pg_class idx ON idx.oid = i.indexrelid
        JOIN pg_class rel ON rel.oid = i.indrelid
        WHERE rel.relname = 'google_integrations'
          AND i.indisunique
          AND i.indnatts = 1
          AND i.indkey[0] = (
              SELECT attnum FROM pg_attribute
              WHERE attrelid = rel.oid AND attname = 'workspace_id'
          )
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS %I', target);
    END LOOP;
END $$;

-- Still indexed, just no longer unique — every lookup is by workspace. The
-- model declares `index=True`, so `create_all` recreates this name non-unique
-- on a fresh database.
CREATE INDEX IF NOT EXISTS ix_google_integrations_workspace_id
    ON google_integrations (workspace_id);

-- One row per address per workspace.
--
-- Case-insensitive, because Gmail addresses are: `Ops@acme.com` and
-- `ops@acme.com` are one mailbox, and letting both exist would give a workspace
-- two integrations that sync the same inbox and two cursors fighting over it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_google_integration_address
    ON google_integrations (workspace_id, lower(google_email));
