-- Declare which master-data table an EXTERNAL stakeholder bucket speaks for:
-- 'account' | 'vendor' | NULL for one with records of neither kind (a loss
-- adjuster, say). Was inferred from the bucket's label, which silently broke
-- for any workspace that renamed its nouns. Decides which table a reply's
-- sender is matched against on hand-back, and which stage writing to an
-- address implies.
--
-- Its own migration file on purpose: migrate_service_desk_agnostic.sql has
-- already been applied, and the runner skips applied files whose checksum
-- changed rather than re-running them.

ALTER TABLE service_desk_stakeholders ADD COLUMN IF NOT EXISTS links_to VARCHAR(16);

-- Desks created before links_to existed: record what the insurance template's
-- two external buckets always meant. Slug-scoped on purpose, so a workspace
-- that renamed them is left alone rather than guessed at.
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
