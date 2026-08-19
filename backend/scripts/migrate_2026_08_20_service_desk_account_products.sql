-- Which products each account is served for, and who owns each of them.
--
-- An account carried a single `assigned_owner_id`, which says a partner is one
-- person's to look after. Real desks split them: the same partner's motor work
-- belongs to one owner and its health work to another. The only way to express
-- that before was two accounts sharing a domain, which the sender matcher would
-- then have resolved arbitrarily — so the second owner's tickets went to the
-- first owner about half the time, with nothing to say why.
--
-- `assigned_owner_id` here is nullable and overrides the account's only when
-- set, so a desk that splits nothing never fills it in and nothing about its
-- routing changes. No backfill: an empty table means "no account has been split",
-- which is exactly the behaviour every existing desk has today.

CREATE TABLE IF NOT EXISTS service_desk_account_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES service_desk_accounts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES service_desk_products(id) ON DELETE CASCADE,

    -- SET NULL rather than CASCADE: somebody leaving must not silently delete
    -- the fact that this partner is served for this product. The pairing then
    -- falls back to the account's own owner, which is the safe answer.
    assigned_owner_id UUID REFERENCES developers(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per pairing. Two rows for the same account and product could name two
-- different owners, and routing would pick between them by insertion order.
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_desk_account_product
    ON service_desk_account_products (account_id, product_id);

CREATE INDEX IF NOT EXISTS ix_sd_account_products_workspace
    ON service_desk_account_products (workspace_id);
CREATE INDEX IF NOT EXISTS ix_sd_account_products_account
    ON service_desk_account_products (account_id);
CREATE INDEX IF NOT EXISTS ix_sd_account_products_product
    ON service_desk_account_products (product_id);
-- Routing reads owner-by-pairing on every classified ticket; the assignee
-- lookup is also how "what is this person responsible for" will be answered.
CREATE INDEX IF NOT EXISTS ix_sd_account_products_owner
    ON service_desk_account_products (assigned_owner_id);
