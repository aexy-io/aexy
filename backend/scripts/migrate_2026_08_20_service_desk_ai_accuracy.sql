-- What the classifier originally answered, kept next to what the ticket says now.
--
-- `request_type` and `product_id` hold the current value, and a person
-- correcting the model overwrites them — so there was no way to tell a
-- classification somebody agreed with from one they silently fixed. "Is the AI
-- worth trusting on our mail?" was a question the desk could only answer by
-- feel, and the classifier had no way to learn that it keeps mistaking this
-- workspace's renewals for claims.
--
-- NULL means the model never ran on that ticket, which is deliberately not the
-- same as agreeing with it: tickets classified before this migration are
-- excluded from the accuracy figures rather than counted as correct.

ALTER TABLE service_desk_tickets
    ADD COLUMN IF NOT EXISTS ai_request_type VARCHAR(64);

ALTER TABLE service_desk_tickets
    ADD COLUMN IF NOT EXISTS ai_product_id UUID
        REFERENCES service_desk_products(id) ON DELETE SET NULL;

-- The accuracy read is "classified tickets in this workspace, in a date range",
-- and the correction read filters the same set to where the two disagree.
CREATE INDEX IF NOT EXISTS ix_sd_tickets_ai_request_type
    ON service_desk_tickets (workspace_id, ai_request_type)
 WHERE ai_request_type IS NOT NULL;
