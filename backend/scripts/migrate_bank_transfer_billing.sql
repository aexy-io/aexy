-- Bank transfer support: manual invoice management for B2B postpaid.

-- Invoice: track payment method and bank transfer details
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'stripe';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bank_transfer_reference VARCHAR(255);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS manual_payment_note TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS marked_paid_by VARCHAR(255);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_payment_method ON invoices(payment_method);
CREATE INDEX IF NOT EXISTS idx_invoices_workspace ON invoices(workspace_id);

-- WorkspacePlanOverride: custom net terms + payment method preference
ALTER TABLE workspace_plan_overrides ADD COLUMN IF NOT EXISTS days_until_due INTEGER;
ALTER TABLE workspace_plan_overrides ADD COLUMN IF NOT EXISTS preferred_payment_method VARCHAR(50);

-- WorkspaceSubscription: payment method preference
ALTER TABLE workspace_subscriptions ADD COLUMN IF NOT EXISTS preferred_payment_method VARCHAR(50) DEFAULT 'stripe';
