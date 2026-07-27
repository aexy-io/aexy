-- One-off repair for legacy CRM automation trigger values.
--
-- Deliberately named outside the `migrate*.sql` pattern that
-- scripts/run_migrations.py auto-discovers, so a routine migration run never
-- rewrites trigger values on its own. Apply it explicitly, after reviewing the
-- preview:
--   SELECT id, trigger_type FROM crm_automations WHERE trigger_type LIKE '%\_%';
--   python scripts/run_migrations.py --file normalize_crm_automation_trigger_types.sql
--
-- Explicit per-value mapping. A blanket underscore→dot replace would corrupt
-- the two list-membership values, whose canonical form keeps one underscore
-- (list_entry.added / list_entry.removed).
BEGIN;

UPDATE crm_automations
SET trigger_type = CASE trigger_type
  WHEN 'record_created'     THEN 'record.created'
  WHEN 'record_updated'     THEN 'record.updated'
  WHEN 'record_deleted'     THEN 'record.deleted'
  WHEN 'field_changed'      THEN 'field.changed'
  WHEN 'stage_changed'      THEN 'stage.changed'
  WHEN 'list_entry_added'   THEN 'list_entry.added'
  WHEN 'list_entry_removed' THEN 'list_entry.removed'
  WHEN 'schedule_daily'     THEN 'schedule.daily'
  WHEN 'schedule_weekly'    THEN 'schedule.weekly'
  WHEN 'date_approaching'   THEN 'date.approaching'
  WHEN 'date_passed'        THEN 'date.passed'
  ELSE trigger_type
END
WHERE trigger_type IN (
  'record_created', 'record_updated', 'record_deleted', 'field_changed',
  'stage_changed', 'list_entry_added', 'list_entry_removed',
  'schedule_daily', 'schedule_weekly', 'date_approaching', 'date_passed'
);

COMMIT;
