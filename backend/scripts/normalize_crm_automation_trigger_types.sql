-- Validator-run one-off repair for legacy CRM automation trigger values.
-- Review the SELECT first in the target database; do not run blindly.
BEGIN;

UPDATE crm_automations
SET trigger_type = REPLACE(trigger_type, '_', '.')
WHERE trigger_type IN (
  'record_created', 'record_updated', 'record_deleted', 'field_changed',
  'stage_changed', 'list_entry_added', 'list_entry_removed',
  'schedule_daily', 'schedule_weekly', 'date_approaching', 'date_passed'
);

COMMIT;
