-- Pad short issue keys to the format the app actually produces.
--
-- Both the old generator and the current allocator format `%03d` — `BUG-045`,
-- `STORY-010` — but rows seeded by hand or imported carry unpadded keys, so a
-- workspace ends up with `BUG-41` sitting next to `BUG-045`. They sort wrongly
-- (`BUG-41` after `BUG-045` as strings), they read as two different schemes, and
-- a person eyeballing a list cannot tell which is which.
--
-- Renaming an issue key is not free: anything referring to it by string — a task
-- description, a commit message, a comment, a link somebody pasted — still says
-- the old one. So this is deliberately narrow:
--
--   * only keys whose numeric part is SHORTER than three digits, so nothing
--     already correct is touched and `BUG-1234` is left alone;
--   * only keys of the exact shape PREFIX-digits, so `JIRA-4021` imported from
--     another tracker and `BUG-legacy` typed by hand are both skipped;
--   * skipped entirely for any workspace where the padded form already exists,
--     because renaming into an occupied key would either violate the unique
--     index or, worse, merge two issues in a reader's mind.
--
-- Idempotent: a second run finds nothing left to pad.

-- ── bugs ─────────────────────────────────────────────────────────────────────

UPDATE bugs b
   SET key = split_part(b.key, '-', 1) || '-' ||
             lpad(split_part(b.key, '-', 2), 3, '0')
 WHERE b.key ~ '^[A-Z]+-[0-9]{1,2}$'
   -- Nothing already sitting on the padded form.
   AND NOT EXISTS (
       SELECT 1 FROM bugs other
        WHERE other.workspace_id = b.workspace_id
          AND other.id <> b.id
          AND other.key = split_part(b.key, '-', 1) || '-' ||
                          lpad(split_part(b.key, '-', 2), 3, '0')
   );

-- ── stories ──────────────────────────────────────────────────────────────────

UPDATE user_stories s
   SET key = split_part(s.key, '-', 1) || '-' ||
             lpad(split_part(s.key, '-', 2), 3, '0')
 WHERE s.key ~ '^[A-Z]+-[0-9]{1,2}$'
   AND NOT EXISTS (
       SELECT 1 FROM user_stories other
        WHERE other.workspace_id = s.workspace_id
          AND other.id <> s.id
          AND other.key = split_part(s.key, '-', 1) || '-' ||
                          lpad(split_part(s.key, '-', 2), 3, '0')
   );

-- Anything left unpadded was skipped on purpose — a collision, or a key that is
-- not PREFIX-digits. Reported rather than left silent, since the point of this
-- migration is a consistent format and a partial result should say so.
DO $$
DECLARE
    remaining TEXT;
BEGIN
    SELECT string_agg(key, ', ') INTO remaining
      FROM (
          SELECT key FROM bugs WHERE key ~ '^[A-Z]+-[0-9]{1,2}$'
          UNION ALL
          SELECT key FROM user_stories WHERE key ~ '^[A-Z]+-[0-9]{1,2}$'
      ) d;

    IF remaining IS NOT NULL THEN
        RAISE WARNING
            'these keys were left unpadded because the padded form is already taken: %',
            remaining;
    END IF;
END $$;
