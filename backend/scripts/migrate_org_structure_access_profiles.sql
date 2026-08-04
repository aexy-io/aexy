-- Department-centric module access.
--
-- FILENAME IS LOAD-BEARING. run_migrations.py applies files in plain
-- alphabetical order and stops at the first failure. This file alters
-- `departments`, which migrate_org_structure.sql creates, so it must sort
-- *after* it — hence the `migrate_org_structure_` prefix. Keep it if you
-- rename this file.
--
-- Until now, what a person could see was decided by their *legacy workspace
-- role*: role "member" resolved to the Engineering bundle for everybody, so a
-- salesperson invited into a CRM workspace got standups, sprints and on-call
-- and no CRM at all. Departments already existed, were already assignable at
-- invite time, and influenced nothing. These columns make the department the
-- baseline instead of the role.

-- =============================================================================
-- DEPARTMENTS: access profile
-- =============================================================================

-- What people in this department can see:
--   {app_id: {"enabled": bool, "modules": {module_id: bool}}}
--
-- Same shape as app_access_templates.app_config, but held here rather than as
-- an FK to that table: those rows are only inserted by
-- migrate_app_access_templates.sql, while dev and test schemas are built by
-- create_all, so an FK would dangle exactly where the seeding never ran.
--
-- '{}' (the default) means "no profile" — members of such a department fall
-- back to their role bundle, which is the pre-existing behaviour. That default
-- is what makes this migration a no-op until a profile is actually assigned.
ALTER TABLE departments
    ADD COLUMN IF NOT EXISTS app_config JSONB NOT NULL DEFAULT '{}';

-- Which system bundle the profile was seeded from ("engineering", "business",
-- "people", "full_access"). Provenance for the UI only — the resolver never
-- reads it, so a renamed or deleted bundle cannot affect anyone's access.
ALTER TABLE departments
    ADD COLUMN IF NOT EXISTS access_profile_slug VARCHAR(100);

-- Default sidebar view for people whose *primary* department this is.
-- NULL falls through to the platform default.
ALTER TABLE departments
    ADD COLUMN IF NOT EXISTS default_persona VARCHAR(32);

-- Resolving access reads the departments a person belongs to on every guarded
-- request, and only ever cares about departments that actually carry a profile.
CREATE INDEX IF NOT EXISTS ix_departments_workspace_profile
    ON departments (workspace_id)
    WHERE app_config <> '{}'::jsonb;

-- =============================================================================
-- DASHBOARD PREFERENCES: sidebar view, decoupled from the dashboard preset
-- =============================================================================

-- The sidebar filter used to read preset_type — the *dashboard widget* preset,
-- which defaults to 'developer' and which nothing but Settings -> Appearance
-- ever set. So every new joiner navigated the product as a developer until they
-- stumbled across an unrelated settings page.
--
-- NULL means "derive my view from my department", which is what everyone who
-- never makes a choice now gets. A non-NULL value is an explicit personal
-- choice and always wins.
ALTER TABLE dashboard_preferences
    ADD COLUMN IF NOT EXISTS sidebar_persona VARCHAR(50);

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'departments'
  AND column_name IN ('app_config', 'access_profile_slug', 'default_persona')
ORDER BY column_name;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'dashboard_preferences'
  AND column_name = 'sidebar_persona';

-- Departments that carry a profile (0 immediately after this migration —
-- profiles are assigned from onboarding or Settings -> Access).
SELECT COUNT(*) AS departments_with_profile
FROM departments
WHERE app_config <> '{}'::jsonb;
