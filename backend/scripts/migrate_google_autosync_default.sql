-- Give already-connected Google accounts a sync interval they never got.
--
-- `auto_sync_interval_minutes` defaulted to 0, and `check_auto_sync_integrations`
-- only picks up integrations with an interval above zero. So an account could
-- have `gmail_sync_enabled = true`, report itself connected, and never sync —
-- silently, forever. The only cure was an admin-gated settings page most of the
-- affected people cannot open.
--
-- 0 is also a legitimate choice: the settings UI offers it as "Off". So this
-- cannot simply set every 0 to 15 — that would override people who deliberately
-- turned syncing off.
--
-- The discriminator is `*_last_sync_at IS NULL`. An account that has *never*
-- synced cannot have been switched off after working; it is one the default
-- stranded. An account that synced and then went to 0 was somebody's decision,
-- and is left alone.
--
-- 15 minutes matches a preset in the settings UI, so the value reads as a
-- selected option rather than a custom number nobody chose.
--
-- Idempotent: re-running changes nothing, because the rows it touches stop
-- matching `= 0` after the first pass.

UPDATE google_integrations
SET auto_sync_interval_minutes = 15
WHERE auto_sync_interval_minutes = 0
  AND gmail_sync_enabled = true
  AND gmail_last_sync_at IS NULL;

UPDATE google_integrations
SET auto_sync_calendar_interval_minutes = 15
WHERE auto_sync_calendar_interval_minutes = 0
  AND calendar_sync_enabled = true
  AND calendar_last_sync_at IS NULL;

-- New rows come from the model default (also 15); this only aligns the column
-- so a database created straight from SQL agrees with one created by the ORM.
ALTER TABLE google_integrations
    ALTER COLUMN auto_sync_interval_minutes SET DEFAULT 15;

ALTER TABLE google_integrations
    ALTER COLUMN auto_sync_calendar_interval_minutes SET DEFAULT 15;
