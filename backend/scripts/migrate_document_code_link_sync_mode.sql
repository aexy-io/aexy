-- Let a document say how it wants to be kept up to date.
--
-- Every linked document behaved identically: any change to its code produced
-- a proposal, and somebody had to review it. That is right for a page people
-- have written by hand and wrong for a generated reference nobody reads
-- closely, and there was no way to say which was which.
--
-- The failure mode this prevents is proposal fatigue. Once a repository
-- documents itself module by module, a busy week puts a review queue in front
-- of someone who did not ask for one, and the response is to stop opening the
-- queue — which costs more than the feature was ever worth.
--
--   propose  queue for review (the default, and today's behaviour)
--   auto     apply without asking, but only for updates derived from the
--            existing prose — a full regeneration always falls back to
--            proposing, because it cannot know what a human wrote
--   off      stop watching entirely, including the "behind" badge
--
-- NOT NULL with a default of 'propose', so every existing row keeps behaving
-- exactly as it does today and the column can be read without a null check.
--
-- Idempotent: safe to re-run.

ALTER TABLE document_code_links
    ADD COLUMN IF NOT EXISTS sync_mode VARCHAR(20) NOT NULL DEFAULT 'propose';

-- Partial index: `handle_code_change` filters out the muted links on every
-- push, and they are the minority, so this keeps that filter off a seq scan
-- without indexing the rows that never match it.
CREATE INDEX IF NOT EXISTS ix_document_code_links_active_sync
    ON document_code_links (repository_id)
    WHERE sync_mode <> 'off';
