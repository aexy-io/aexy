-- The scope CHECK, for databases where the table already existed.
--
-- Model: src/aexy/models/ai_model_override.py
--
-- `migrate_ai_model_overrides.sql` creates this table WITH a CHECK on `scope`,
-- but it uses CREATE TABLE IF NOT EXISTS — so on any database where the app's
-- own `Base.metadata.create_all` had already made the table (every test run, and
-- any dev machine that started the app before migrating) the whole statement
-- no-opped and the constraint was never added. The ORM model did not declare it
-- either, so `create_all` could not have produced it.
--
-- Found by running that migration against a database in exactly that state and
-- then checking the result rather than the exit code: the table was there, the
-- unique constraint and both foreign keys were there, and the CHECK was not.
--
-- The model now declares it too, so the two paths agree from here on. This is
-- for the databases that already diverged.
--
-- A separate file rather than an edit to the original: that migration is
-- recorded in `schema_migrations` with its checksum, and rewriting an applied
-- migration means the ledger no longer describes what ran.

DO $$
BEGIN
    IF to_regclass('workspace_ai_model_overrides') IS NULL THEN
        -- The table's own migration has not run yet; it will create the CHECK
        -- itself. Nothing to repair.
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'workspace_ai_model_overrides'::regclass
           AND conname = 'ck_ai_model_override_scope'
    ) THEN
        RETURN;
    END IF;

    -- Rows that would violate it. There should be none — the API validates
    -- `scope` with a pattern and the resolver ignores a scope it does not know —
    -- but adding a constraint over data that breaks it fails the migration, so
    -- say what is wrong rather than just failing.
    IF EXISTS (
        SELECT 1 FROM workspace_ai_model_overrides
         WHERE scope NOT IN ('category', 'feature')
    ) THEN
        RAISE WARNING
            'workspace_ai_model_overrides holds scopes outside (category, feature), so ck_ai_model_override_scope was NOT added. Offending values: %',
            (SELECT string_agg(DISTINCT scope, ', ')
               FROM workspace_ai_model_overrides
              WHERE scope NOT IN ('category', 'feature'));
        RETURN;
    END IF;

    ALTER TABLE workspace_ai_model_overrides
        ADD CONSTRAINT ck_ai_model_override_scope
        CHECK (scope IN ('category', 'feature'));
END $$;
