-- Remember which commit a document was actually written from.
--
-- `document_code_links.last_commit_sha` was doing two jobs. `handle_code_change`
-- sets it to the pushed commit the moment a push touches the link's path, so it
-- means "the newest commit we have seen". But the regeneration path needed the
-- other thing entirely — the commit the current prose was written from — and
-- that value had already been overwritten by the time anything looked for it.
--
-- With one column there is no way to ask "what changed since this document was
-- written?", only "what is the latest commit?". So every code change fell back
-- to regenerating the whole document from scratch: the most expensive option,
-- and the one most likely to discard good prose nothing asked to change.
--
-- Deliberately NOT backfilled. `last_commit_sha` on a link with pending changes
-- is the *new* commit, not the base, so seeding from it would assert a base
-- that is wrong precisely for the links that are about to be regenerated —
-- producing a diff against the wrong starting point. NULL means "we do not
-- know", and the code treats that as a reason to regenerate in full. Existing
-- links become incremental the first time they sync after this ships.
--
-- `template_category` is here for a smaller bug in the same path: regeneration
-- hardcoded FUNCTION_DOCS, so re-syncing a module document silently converted
-- it into function docs. Also left NULL — the generation service already has a
-- default, and guessing a category per link from existing data would be a
-- worse answer than falling back to it.
--
-- Idempotent: safe to re-run.

ALTER TABLE document_code_links
    ADD COLUMN IF NOT EXISTS last_synced_commit_sha VARCHAR(40);

ALTER TABLE document_code_links
    ADD COLUMN IF NOT EXISTS template_category VARCHAR(50);
