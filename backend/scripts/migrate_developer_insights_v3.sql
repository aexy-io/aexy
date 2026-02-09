-- Developer Insights v3 Migration
-- Adds engineering_role to developer_working_schedules for role-based benchmarking

ALTER TABLE developer_working_schedules
ADD COLUMN IF NOT EXISTS engineering_role VARCHAR(50) DEFAULT NULL;

COMMENT ON COLUMN developer_working_schedules.engineering_role
IS 'Engineering role for benchmarking: junior, mid, senior, staff, principal, lead, architect';
