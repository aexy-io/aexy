-- A ticket gets a title of its own.
--
-- There was no such column. The subject was written into
-- `field_values["subject"]` by every creation path, which meant:
--
--   * the detail page headlined `form_name`, so every ticket raised through one
--     form displayed the same heading;
--   * sorting and filtering by subject went through a JSONB expression
--     (`field_values->>'subject'`), which no index helps;
--   * a form with no subject field produced tickets with nothing to call them.
--
-- The column is nullable and readers fall back to `field_values['subject']`, so
-- a row this backfill cannot fill still displays as it did before.

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS title VARCHAR(500);

-- Backfill from where the subject has always been kept.
--
-- `->>` yields SQL NULL for a missing key and for a JSON null alike, and
-- NULLIF drops subjects that were stored as an empty string, so a blank stays
-- NULL rather than becoming a title of "". Trimmed because email subjects
-- arrive with leading whitespace often enough to matter when sorting.
--
-- Guarded on `title IS NULL` so a re-run cannot overwrite a title somebody has
-- since edited by hand.
UPDATE tickets
SET title = LEFT(NULLIF(BTRIM(field_values ->> 'subject'), ''), 500)
WHERE title IS NULL
  AND NULLIF(BTRIM(field_values ->> 'subject'), '') IS NOT NULL;

-- Sorting and searching a workspace's tickets by title is the read this exists
-- for; the workspace column leads because every such query is scoped to one.
CREATE INDEX IF NOT EXISTS ix_tickets_workspace_title
    ON tickets (workspace_id, title);
