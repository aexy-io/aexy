-- Automation email outbox.
--
-- An automation used to start the send workflow inline, inside the still-open
-- request transaction. The background worker reads on its own connection, so
-- it could reach the run before the commit (or before its step list was
-- written), find nothing, and give up - stranding the run on "queued" with no
-- record that the email ever went out.
--
-- Recording the intent to send in the same transaction as the run removes the
-- ordering problem entirely: the row cannot exist unless the run does.

CREATE TABLE IF NOT EXISTS crm_automation_email_outbox (
    id UUID PRIMARY KEY,
    automation_run_id UUID NOT NULL
        REFERENCES crm_automation_runs(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    payload JSONB NOT NULL,
    -- pending -> dispatching -> dispatched | failed
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- When the row was last claimed. Stale-claim recovery keys off this, not
    -- created_at, or a long-pending row looks stale the instant it is claimed
    -- and can be dispatched twice.
    claimed_at TIMESTAMPTZ,
    dispatched_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_crm_automation_email_outbox_run
    ON crm_automation_email_outbox (automation_run_id);

-- The drain only ever looks for rows that are not finished.
CREATE INDEX IF NOT EXISTS ix_crm_automation_email_outbox_status
    ON crm_automation_email_outbox (status)
    WHERE status IN ('pending', 'dispatching');
