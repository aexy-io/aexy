-- Delivery attempts against an external provider, keyed for idempotency.
--
-- Email is protected by the outbox: the intent is written in the same
-- transaction as the run, and the send activity claims the step before
-- contacting the provider, so a retry that follows an uncertain send refuses
-- rather than repeats.
--
-- SMS had no equivalent. The handler called Twilio directly and returned
-- "accepted"; if the local write after that failed, the retry sent the
-- customer a second text. Twilio's Messages API has no idempotency key of its
-- own, so the guard has to live here.
--
-- The unique key is what makes it work: the claim is an INSERT, so two callers
-- racing on the same (run, step, recipient) cannot both win — the loser gets a
-- constraint violation and reads back whatever the winner recorded.

CREATE TABLE IF NOT EXISTS crm_automation_delivery_attempts (
    id UUID PRIMARY KEY,
    -- channel:run-or-execution:step-or-node:recipient
    idempotency_key VARCHAR(500) NOT NULL UNIQUE,
    channel VARCHAR(20) NOT NULL,
    recipient VARCHAR(320) NOT NULL,
    -- sending -> sent | failed. A row stuck on "sending" is an *uncertain*
    -- send: the provider may have accepted it, so it must never be retried
    -- automatically.
    status VARCHAR(20) NOT NULL DEFAULT 'sending',
    provider_message_id VARCHAR(120),
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Operators need to find the uncertain ones; nothing else queries by status.
CREATE INDEX IF NOT EXISTS ix_crm_automation_delivery_attempts_unresolved
    ON crm_automation_delivery_attempts (channel, created_at)
    WHERE status = 'sending';
