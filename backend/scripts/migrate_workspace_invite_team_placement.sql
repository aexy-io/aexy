-- Let an invite carry a team, and pin down the team-role vocabulary.
--
-- Two related changes, both about teams.
--
-- 1. TEAM PLACEMENT ON INVITE
--
-- An invite could already name a *department*, which decides what the person can
-- see. It could not name a *team*, which is a different question with different
-- consequences: standup prompts, blocker escalation, compliance reminders,
-- review digests, sprint boards and leave approvals all resolve through team
-- membership. A joiner placed in a department but no team therefore arrived with
-- the right navigation and was then silently left out of all of that — nothing
-- errored, they simply never got asked for a standup and their blockers had no
-- lead to escalate to. Both columns are nullable: naming a team stays optional.
--
-- 2. THE UNDECLARED "admin" TEAM ROLE
--
-- `team_members.role` was documented as "lead" | "member" and three places
-- disagreed: project_service wrote "admin" for a project's creator,
-- tracking_tasks escalated to lead/manager/admin, and the Teams settings page
-- had labels for only two of them (so an "admin" rendered as the raw i18n key
-- `settingsTeams.roles.admin`). The value also has teeth: review_service and
-- leave_request_service both look for exactly role = 'lead' when they need
-- someone accountable, so a project creator recorded as "admin" was invisible to
-- both and those lookups fell through to "any workspace manager".

-- =============================================================================
-- WORKSPACE PENDING INVITES: optional team placement
-- =============================================================================

ALTER TABLE workspace_pending_invites
    ADD COLUMN IF NOT EXISTS team_id UUID
        REFERENCES teams(id) ON DELETE SET NULL;

-- lead | manager | member, applied to the team_members row created on accept.
-- NULL means "member" (the model default).
ALTER TABLE workspace_pending_invites
    ADD COLUMN IF NOT EXISTS role_in_team VARCHAR(32);

CREATE INDEX IF NOT EXISTS ix_workspace_pending_invites_team_id
    ON workspace_pending_invites (team_id);

-- =============================================================================
-- TEAM MEMBERS: retire the undeclared "admin" role
-- =============================================================================

-- Scoped deliberately narrowly: only rows on a team that a *project* created
-- (project_service builds a Team sharing the project's id), which is the only
-- writer that ever produced this value. A hand-set "admin" elsewhere — if any
-- environment has one — is left alone rather than reinterpreted on its owner's
-- behalf.
--
-- "lead" is the right reading: the creator of a project's team is its lead, and
-- saying so is what makes them findable by the review and leave-approval lookups
-- that were skipping them. Escalation behaviour is unchanged, since
-- tracking_tasks already treated lead and admin alike.
UPDATE team_members
SET role = 'lead'
WHERE role = 'admin'
  AND team_id IN (SELECT id FROM projects);

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'workspace_pending_invites'
  AND column_name IN ('team_id', 'role_in_team')
ORDER BY column_name;

-- Expect no project-team rows left on the retired value.
SELECT COUNT(*) AS project_team_admins_remaining
FROM team_members
WHERE role = 'admin'
  AND team_id IN (SELECT id FROM projects);

-- Anything still on "admin" is a hand-set row outside a project team, listed so
-- it can be looked at rather than silently rewritten.
SELECT tm.team_id, tm.developer_id
FROM team_members tm
WHERE tm.role = 'admin';
