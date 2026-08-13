-- Migration: give a hiring candidate an owner.
--
-- `candidate_stage_changed` has been a declared notification event with a toggle
-- in notification settings and no emitter, because there was nobody to send it
-- to: `hiring_candidates` had a workspace and a requirement but no recruiter or
-- hiring manager accountable for the candidate. The only options were "notify
-- every member with the hiring app on every Kanban drag" or "notify nobody".
--
-- A pipeline where each stage change is everyone's business or nobody's is a
-- pipeline where candidates stall in `screening` for three weeks and no single
-- person was ever told.
--
-- SET NULL rather than CASCADE on the developer: a recruiter leaving must not
-- delete their candidates.
--
-- Nullable and unbackfilled on purpose. There is no correct guess for who owns an
-- existing candidate — the person who created the row is not recorded, and
-- assigning them all to whoever ran the migration would be worse than leaving
-- them unowned. Unowned candidates simply notify nobody on a stage change, which
-- is exactly the behaviour they have today.

BEGIN;

ALTER TABLE hiring_candidates
    ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES developers(id) ON DELETE SET NULL;

-- The recruiter's own view: "my candidates, by stage".
CREATE INDEX IF NOT EXISTS ix_hiring_candidates_owner_stage
    ON hiring_candidates (owner_id, stage);

CREATE INDEX IF NOT EXISTS ix_hiring_candidates_owner_id
    ON hiring_candidates (owner_id);

COMMIT;
