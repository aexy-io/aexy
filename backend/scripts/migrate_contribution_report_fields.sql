-- Fields a contribution report needs and the sync never stored.
--
-- Everything here is additive and nullable. NULL is meaningful in each case:
-- it marks a row synced before this migration, which a report must treat as
-- "unknown", not as zero. Backfilling any of it would mean re-reading GitHub —
-- the file list, the PR detail payload and the author date are all gone from
-- our side — so the report says what it could not measure instead of guessing.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS throughout, safe to re-run.

-- ── commits ───────────────────────────────────────────────────────────────
-- Source-only churn. `additions`/`deletions` are GitHub's raw numbers and
-- include lockfiles, dist/, vendor/ and generated output — one `npm install`
-- can dwarf a month of real work. These three count source files only.
ALTER TABLE commits ADD COLUMN IF NOT EXISTS source_additions INTEGER;
ALTER TABLE commits ADD COLUMN IF NOT EXISTS source_deletions INTEGER;
ALTER TABLE commits ADD COLUMN IF NOT EXISTS source_files_changed INTEGER;

-- Hash of the change rather than of its position in history, so the same work
-- ported onto a release branch collides with the original. `sha` cannot: a
-- cherry-pick gets a new one, and a team that ports every change onto two
-- branches reads as three times as productive.
ALTER TABLE commits ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);
CREATE INDEX IF NOT EXISTS ix_commits_content_hash ON commits (content_hash);

-- Branch the sync first met the commit on. Not "the branch it lives on".
ALTER TABLE commits ADD COLUMN IF NOT EXISTS branch VARCHAR(255);

-- When the work was written, as opposed to when it landed. A rebase or a
-- cherry-pick moves `committed_at` and leaves this alone.
ALTER TABLE commits ADD COLUMN IF NOT EXISTS authored_at TIMESTAMPTZ;

-- Reporting reads these together, always inside a date window.
CREATE INDEX IF NOT EXISTS ix_commits_repo_committed_at
    ON commits (repository, committed_at);

-- ── pull_requests ─────────────────────────────────────────────────────────
-- Who pressed merge. Not who wrote it — on most teams a couple of people carry
-- the integration load and nothing in the schema could show it.
ALTER TABLE pull_requests
    ADD COLUMN IF NOT EXISTS merged_by_developer_id UUID
    REFERENCES developers(id) ON DELETE SET NULL;
ALTER TABLE pull_requests ADD COLUMN IF NOT EXISTS merged_by_login VARCHAR(255);
CREATE INDEX IF NOT EXISTS ix_pull_requests_merged_by
    ON pull_requests (merged_by_developer_id);

-- PRs that arrived through a backfill sync carry six zeroed metrics: GitHub's
-- list endpoint returns none of them, and only the per-PR detail call does.
-- The zeros also made `size_bucket` "xs", which the AI pass treats as "not
-- worth analysing" — and it stamps `ai_analyzed_at` on the way past, so those
-- PRs would never be looked at again. Clear the stamp on the ones that were
-- skipped without ever being analysed, so they requeue once the sync refills
-- their stats. `ai_analysis IS NULL` is what distinguishes "skipped by the
-- gate" from "analysed and found small".
UPDATE pull_requests
SET ai_analyzed_at = NULL
WHERE ai_analyzed_at IS NOT NULL
  AND ai_analysis IS NULL
  AND size_bucket = 'xs'
  AND additions = 0
  AND deletions = 0
  AND files_changed = 0;
