-- Multi-branch sync (D1).
--
-- Adds an optional per-repo branch whitelist. NULL means "use the default
-- policy" (active branches: any branch whose tip is < 90 days old). A
-- non-null array is the explicit list of branches to sync, in order.
--
-- Idempotent.

ALTER TABLE repositories
    ADD COLUMN IF NOT EXISTS sync_branches JSONB;
