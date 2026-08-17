-- Remember which pull request queued a document, not just which commit.
--
-- The review queue groups proposals by the change that caused them, and prefers
-- a pull request over a commit: one merge leaving proposals on four documents is
-- a decision somebody can take in one pass, where four commit groups of one are
-- four chores. `ProposedChange` has documented a `pull_request` trigger key
-- since it was built and the grouping has branched on it — but nothing ever
-- wrote it, so every group was per-commit and one merge across four commits
-- became four groups.
--
-- The real-time path can now read the pull request from the merge commit's own
-- subject, which GitHub writes. A batched document cannot: the Temporal activity
-- that drains the queue is handed a document id and nothing else, so the number
-- has to survive in the queue row it drains. Without this column the same push
-- produced a pull-request group for premium documents and a commit group for the
-- pro ones queued beside them.
--
-- Nullable with no default, deliberately: a rebase merge and a direct push name
-- no pull request, and both are ordinary. Null means "grouped by commit", which
-- is exactly what every existing row should keep doing.

ALTER TABLE document_sync_queue
    ADD COLUMN IF NOT EXISTS triggered_by_pull_request INTEGER;

-- No index. This column is read one row at a time, by document id, off a queue
-- that holds a day of work at most — the existing document_id index is the one
-- that matters, and a second index here would cost writes to save nothing.
