-- Onboarding: let an invite carry an optional department placement.
--
-- FILENAME IS LOAD-BEARING. run_migrations.py applies files in plain
-- alphabetical order and stops at the first failure. This file references
-- `departments`, which migrate_org_structure.sql creates, so it must sort
-- *after* it — which "migrate_org_onboarding.sql" did not ("o" < "s"), taking
-- every later migration down with it on any database that didn't already
-- happen to have the table from create_all. Keep the `migrate_org_structure_`
-- prefix if you rename this.
--
-- Without this, department membership is only reachable after the person has
-- already accepted and logged in, so every new joiner starts in no department
-- at all — invisible in the directory, out of scope for Service Desk row
-- filtering, and ineligible for KAM auto-assignment.
--
-- Both columns are nullable: naming a department at invite time stays optional,
-- so an admin inviting someone in a hurry is never forced to decide the org
-- structure first.

ALTER TABLE workspace_pending_invites
    ADD COLUMN IF NOT EXISTS department_id UUID
        REFERENCES departments(id) ON DELETE SET NULL;

-- head | manager | member, applied to the department_members row created on
-- accept. NULL means "member" (the schema default).
ALTER TABLE workspace_pending_invites
    ADD COLUMN IF NOT EXISTS role_in_department VARCHAR(32);

CREATE INDEX IF NOT EXISTS ix_workspace_pending_invites_department
    ON workspace_pending_invites(department_id);
