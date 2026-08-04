-- email_campaigns.last_error — why a campaign's last start attempt was refused.
--
-- The scheduled-campaign poller had nowhere to put this. It flipped a due
-- campaign to `sending` and dispatched by hand, bypassing `start_sending` and so
-- bypassing both the sender gate and `populate_recipients`; with no recipient rows
-- the send activity found nothing pending and marked the campaign `sent`. A
-- campaign that had delivered to nobody reported success, and the only trace was a
-- log line on a worker.
--
-- The poller now goes through `start_sending` and, when it refuses, leaves the
-- campaign `scheduled` and records the reason here — so it sends itself once the
-- domain verifies, and the owner can see what it is waiting for.

ALTER TABLE email_campaigns
    ADD COLUMN IF NOT EXISTS last_error TEXT;
