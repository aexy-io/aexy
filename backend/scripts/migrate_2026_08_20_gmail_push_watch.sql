-- When Gmail's push subscription for a mailbox lapses.
--
-- Service desk intake polls: the schedule checks every minute and syncs a desk
-- mailbox on its own interval, so a request waits up to that interval before it
-- is a ticket. Gmail can push instead — `users.watch` plus a Pub/Sub delivery —
-- which turns the wait into seconds.
--
-- The expiry is the whole reason this column exists. Gmail drops a watch after
-- seven days and stops delivering with no error and no callback, just silence.
-- A desk that registered once and trusted it would go quiet a week later and
-- look like the mail had stopped arriving. Tracking the expiry is what lets a
-- schedule renew it before it lapses, and what lets polling stay in place as
-- the floor underneath.
--
-- NULL means push was never registered for this integration, which is every
-- integration until a deployment configures a Pub/Sub topic.

ALTER TABLE google_integrations
    ADD COLUMN IF NOT EXISTS gmail_watch_expires_at TIMESTAMPTZ;

-- The renewal sweep asks "which watches lapse soon", across all workspaces.
CREATE INDEX IF NOT EXISTS ix_google_integrations_gmail_watch_expires
    ON google_integrations (gmail_watch_expires_at)
 WHERE gmail_watch_expires_at IS NOT NULL;
