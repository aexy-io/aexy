-- Record what caused a proposal, so review can be organised around it.
--
-- A proposal knew what it would change and never why it existed. The sync
-- service had the commit and the matched paths in hand at the moment it
-- created one, and dropped both.
--
-- That is what stopped the review queue being grouped by cause. One merge can
-- leave proposals on a dozen documents, and "the auth rework touched these
-- four pages" is a decision somebody can take in one pass, where a list of
-- four unrelated documents is a chore they will put off. Without a cause
-- recorded there was nothing to group by, so the queue stayed a flat list.
--
-- Deliberately not backfilled. Existing proposals genuinely have no recorded
-- cause, and inferring one from a code link's last commit would attribute
-- them to whatever happened to be latest rather than to what actually
-- produced them — a plausible wrong answer in a column people will trust.
--
-- Idempotent: safe to re-run.

ALTER TABLE proposed_changes
    ADD COLUMN IF NOT EXISTS trigger JSONB;

-- Grouping reads the commit out of the trigger for a workspace's pending rows.
-- Expression index rather than a column: the shape may grow a pull request or
-- a run id, and a generated column per key would mean a migration each time.
CREATE INDEX IF NOT EXISTS ix_proposed_changes_trigger_commit
    ON proposed_changes ((trigger ->> 'commit_sha'))
    WHERE status = 'pending';
