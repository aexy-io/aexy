-- Service Desk: make the module industry-agnostic.
--
-- The desk shipped with one company's vocabulary compiled in. Two problems, and
-- this migration is the data half of fixing both.
--
-- 1) The taxonomy was a pair of Python enums. `PendingWith` fixed the set of
--    parties a request could be waiting on (insurer, partner, KAM, …) and
--    `RequestType` fixed the triage categories (query, policy_issuance, claims,
--    payout) at deploy time. Adding "Legal" meant a code change and a release.
--    They become per-workspace rows: service_desk_stakeholders and
--    service_desk_request_types.
--
-- 2) The master-data tables were named after insurance counterparties —
--    partners, insurers, lines of business — as were three columns on
--    service_desk_tickets and the assigned_kam_id on a partner. Renamed to
--    accounts / vendors / products / assigned_owner_id. The user-facing words
--    ("Partner", "Insurer", "LOB") come from the workspace's terminology
--    setting, so an insurance desk reads exactly as it did before.
--
-- Existing rows are preserved throughout. ALTER TABLE ... RENAME is a catalogue
-- update in Postgres — no table rewrite, no data copy. No taxonomy is seeded
-- here: a workspace picks an industry template on first run, or gets the neutral
-- `generic` set lazily on first read. See section 3.
--
-- Idempotent: safe to re-run. Every step guards on the current catalogue state,
-- so a half-applied run (or a Docker-first environment where create_all already
-- built the new tables) converges rather than erroring.

-- ---------------------------------------------------------------------------
-- 1. Taxonomy tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS service_desk_stakeholders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    slug VARCHAR(64) NOT NULL,
    label VARCHAR(100) NOT NULL,
    -- 'internal' | 'external' | 'closed'. All branching happens on this, never
    -- on slug or label, so a workspace can rename a bucket without changing
    -- which tickets are open or how TAT is measured.
    semantics VARCHAR(20) NOT NULL DEFAULT 'internal',
    -- Matched against departments.function_key for row-level visibility.
    function_key VARCHAR(64),
    -- 'account' | 'vendor' | NULL. Which master-data table an EXTERNAL bucket
    -- speaks for, so a reply's sender is matched against the right one and
    -- writing to an address implies the right stage. Was inferred from the
    -- bucket's label, which broke for any workspace that renamed its nouns.
    links_to VARCHAR(16),
    position INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_service_desk_stakeholder_slug UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS ix_sd_stakeholder_workspace ON service_desk_stakeholders(workspace_id);
CREATE INDEX IF NOT EXISTS ix_sd_stakeholder_semantics ON service_desk_stakeholders(semantics);
CREATE INDEX IF NOT EXISTS ix_sd_stakeholder_function ON service_desk_stakeholders(function_key);

CREATE TABLE IF NOT EXISTS service_desk_request_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    slug VARCHAR(64) NOT NULL,
    label VARCHAR(100) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    position INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_service_desk_request_type_slug UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS ix_sd_request_type_workspace ON service_desk_request_types(workspace_id);

-- Exactly one default request type per workspace — what untriaged mail becomes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_desk_request_type_default
    ON service_desk_request_types(workspace_id) WHERE is_default;

-- ---------------------------------------------------------------------------
-- 2. Master data renames
-- ---------------------------------------------------------------------------
-- Three states have to converge here, and the awkward one is the third:
--
--   a) only the old table exists          -> plain RENAME, the happy path
--   b) only the new table exists          -> nothing to do, already migrated
--   c) BOTH exist                         -> copy rows across, then drop the old
--
-- (c) is not hypothetical. `main.py` runs `create_all` on startup, so any
-- environment where the app booted on the new models before this migration ran
-- already has empty new tables sitting next to the populated old ones. A rename
-- guarded only on "new table absent" would silently skip, and the workspace's
-- accounts would still be in `service_desk_partners` where nothing reads them.
--
-- If both tables hold rows we refuse rather than guess: merging two populated
-- tables needs someone to decide what the duplicates mean.

DO $$
DECLARE
    pair RECORD;
    old_rows BIGINT;
    new_rows BIGINT;
BEGIN
    FOR pair IN
        SELECT * FROM (VALUES
            -- old table, new table, column list on the old side, column list on the new side
            ('service_desk_partners', 'service_desk_accounts',
             'id, workspace_id, name, assigned_kam_id, is_active, created_at, updated_at',
             'id, workspace_id, name, assigned_owner_id, is_active, created_at, updated_at'),
            ('service_desk_partner_domains', 'service_desk_account_domains',
             'id, workspace_id, partner_id, domain',
             'id, workspace_id, account_id, domain'),
            ('service_desk_insurers', 'service_desk_vendors',
             'id, workspace_id, name, is_active, created_at, updated_at',
             'id, workspace_id, name, is_active, created_at, updated_at'),
            ('service_desk_insurer_domains', 'service_desk_vendor_domains',
             'id, workspace_id, insurer_id, domain',
             'id, workspace_id, vendor_id, domain'),
            ('service_desk_lobs', 'service_desk_products',
             'id, workspace_id, name, is_active, created_at',
             'id, workspace_id, name, is_active, created_at')
        ) AS t(old_name, new_name, old_cols, new_cols)
    LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = pair.old_name) THEN
            CONTINUE;  -- (b) already migrated
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = pair.new_name) THEN
            -- (a) catalogue-only rename: no table rewrite, no data copy.
            EXECUTE format('ALTER TABLE %I RENAME TO %I', pair.old_name, pair.new_name);
            -- Rename the columns that changed name, if they are still the old ones.
            IF pair.new_name = 'service_desk_accounts' THEN
                EXECUTE 'ALTER TABLE service_desk_accounts RENAME COLUMN assigned_kam_id TO assigned_owner_id';
            ELSIF pair.new_name = 'service_desk_account_domains' THEN
                EXECUTE 'ALTER TABLE service_desk_account_domains RENAME COLUMN partner_id TO account_id';
            ELSIF pair.new_name = 'service_desk_vendor_domains' THEN
                EXECUTE 'ALTER TABLE service_desk_vendor_domains RENAME COLUMN insurer_id TO vendor_id';
            END IF;
            CONTINUE;
        END IF;

        -- (c) both exist.
        EXECUTE format('SELECT count(*) FROM %I', pair.old_name) INTO old_rows;
        EXECUTE format('SELECT count(*) FROM %I', pair.new_name) INTO new_rows;

        IF old_rows > 0 AND new_rows > 0 THEN
            RAISE EXCEPTION
                'Both %I (% rows) and %I (% rows) hold data. Merge them by hand: '
                'this migration will not guess which rows win.',
                pair.old_name, old_rows, pair.new_name, new_rows;
        END IF;

        IF old_rows > 0 THEN
            EXECUTE format(
                'INSERT INTO %I (%s) SELECT %s FROM %I',
                pair.new_name, pair.new_cols, pair.old_cols, pair.old_name
            );
            RAISE NOTICE 'Moved % rows from % to %', old_rows, pair.old_name, pair.new_name;
        END IF;

        -- CASCADE: the old table's own FKs and indexes go with it. Nothing in the
        -- new code references it, and its rows are now in the new table.
        EXECUTE format('DROP TABLE %I CASCADE', pair.old_name);
    END LOOP;

    -- service_desk_tickets FK columns. This table is never recreated by
    -- create_all (it already existed), so a plain guarded rename is right.
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'service_desk_tickets' AND column_name = 'partner_id') THEN
        ALTER TABLE service_desk_tickets RENAME COLUMN partner_id TO account_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'service_desk_tickets' AND column_name = 'insurer_id') THEN
        ALTER TABLE service_desk_tickets RENAME COLUMN insurer_id TO vendor_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'service_desk_tickets' AND column_name = 'lob_id') THEN
        ALTER TABLE service_desk_tickets RENAME COLUMN lob_id TO product_id;
    END IF;
END $$;

-- The FK targets on service_desk_tickets still point at the dropped/renamed
-- tables' constraints. Re-point them at the new tables so a bad id is still
-- rejected — a missing FK here would let a ticket reference an account that
-- doesn't exist.
DO $$
DECLARE
    spec RECORD;
BEGIN
    FOR spec IN
        SELECT * FROM (VALUES
            ('account_id', 'service_desk_accounts', 'fk_sd_ticket_account'),
            ('vendor_id',  'service_desk_vendors',  'fk_sd_ticket_vendor'),
            ('product_id', 'service_desk_products', 'fk_sd_ticket_product')
        ) AS t(col, target, fk_name)
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'service_desk_tickets' AND column_name = spec.col
        ) AND NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
            WHERE c.conrelid = 'service_desk_tickets'::regclass
              AND c.contype = 'f'
              AND a.attname = spec.col
        ) THEN
            EXECUTE format(
                'ALTER TABLE service_desk_tickets ADD CONSTRAINT %I '
                'FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE SET NULL',
                spec.fk_name, spec.col, spec.target
            );
        END IF;
    END LOOP;
END $$;

-- Constraints and indexes carry the old names after a table rename, which makes
-- every future error message and EXPLAIN lie about what it's talking about.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT conname, conrelid::regclass AS tbl,
               replace(replace(replace(conname, 'partner', 'account'), 'insurer', 'vendor'), 'lob', 'product') AS new_name
        FROM pg_constraint
        WHERE conrelid::regclass::text LIKE 'service_desk_%'
          AND (conname LIKE '%partner%' OR conname LIKE '%insurer%' OR conname LIKE '%lob%')
    LOOP
        IF r.conname <> r.new_name
           AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = r.new_name) THEN
            EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', r.tbl, r.conname, r.new_name);
        END IF;
    END LOOP;

    FOR r IN
        SELECT indexname,
               replace(replace(replace(indexname, 'partner', 'account'), 'insurer', 'vendor'), 'lob', 'product') AS new_name
        FROM pg_indexes
        WHERE tablename LIKE 'service_desk_%'
          AND (indexname LIKE '%partner%' OR indexname LIKE '%insurer%' OR indexname LIKE '%lob%')
    LOOP
        IF r.indexname <> r.new_name
           AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = r.new_name) THEN
            EXECUTE format('ALTER INDEX %I RENAME TO %I', r.indexname, r.new_name);
        END IF;
    END LOOP;
END $$;

-- Taxonomy slugs outgrew VARCHAR(20) ('transaction_dispute' is 19, and a
-- workspace naming its own buckets will go past it).
ALTER TABLE service_desk_tickets ALTER COLUMN pending_with TYPE VARCHAR(64);
ALTER TABLE service_desk_tickets ALTER COLUMN request_type TYPE VARCHAR(64);
ALTER TABLE ticket_pending_segments ALTER COLUMN pending_with TYPE VARCHAR(64);

-- The enum defaults are gone; intake resolves the starting bucket from the
-- workspace's own taxonomy now. Leaving 'kam'/'query' as column defaults would
-- silently write insurance slugs into a software company's desk.
ALTER TABLE service_desk_tickets ALTER COLUMN pending_with DROP DEFAULT;
ALTER TABLE service_desk_tickets ALTER COLUMN request_type DROP DEFAULT;

-- ---------------------------------------------------------------------------
-- 3. No taxonomy backfill
-- ---------------------------------------------------------------------------
-- An earlier draft seeded the insurance stakeholder/request-type set into every
-- workspace that already had desk data, on the theory that its ticket rows
-- already contained those slugs. Nothing has been deployed, so no such rows
-- exist, and guessing an industry for a workspace is exactly what the industry
-- templates are there to avoid.
--
-- A workspace picks its template on first run (the Service Desk shows the picker
-- when it has no stakeholders), or gets the neutral `generic` set lazily on first
-- read — see `services/service_desk_taxonomy.py::load_taxonomy`.

-- Desks created before links_to existed: add the column, then record what the
-- insurance template's two external buckets always meant. Slug-scoped on
-- purpose, so a workspace that renamed them is left alone rather than guessed at.
ALTER TABLE service_desk_stakeholders ADD COLUMN IF NOT EXISTS links_to VARCHAR(16);

UPDATE service_desk_stakeholders
   SET links_to = 'vendor'
 WHERE links_to IS NULL AND semantics = 'external' AND slug = 'insurer';

UPDATE service_desk_stakeholders
   SET links_to = 'account'
 WHERE links_to IS NULL AND semantics = 'external' AND slug = 'partner';

-- At most one bucket may claim each table, or the resolver picks arbitrarily.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sd_stakeholder_links_to
    ON service_desk_stakeholders(workspace_id, links_to)
 WHERE links_to IS NOT NULL;
