-- Flexible billing: add billing_model to plans, workspace_plan_overrides table,
-- workspace_subscriptions columns, and workspace_id to billing tables.

-- 1a. Add columns to plans table
ALTER TABLE plans ADD COLUMN IF NOT EXISTS billing_model VARCHAR(50) DEFAULT 'free';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS base_fee_monthly_cents INTEGER DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS per_seat_price_monthly_cents INTEGER DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS min_seats INTEGER DEFAULT 1;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS included_seats INTEGER DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS requires_payment_method BOOLEAN DEFAULT FALSE;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS payment_timing VARCHAR(50) DEFAULT 'prepaid';

-- 1b. Create workspace_plan_overrides table
CREATE TABLE IF NOT EXISTS workspace_plan_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Billing model override
    billing_model VARCHAR(50),

    -- Pricing overrides (all nullable = use plan default)
    price_monthly_cents INTEGER,
    base_fee_monthly_cents INTEGER,
    per_seat_price_monthly_cents INTEGER,
    min_seats INTEGER,
    included_seats INTEGER,

    -- Sync limit overrides
    max_repos INTEGER,
    max_commits_per_repo INTEGER,
    max_prs_per_repo INTEGER,
    sync_history_days INTEGER,

    -- LLM limit overrides
    llm_requests_per_day INTEGER,
    llm_requests_per_minute INTEGER,
    llm_tokens_per_minute INTEGER,
    llm_provider_access TEXT[],
    free_llm_tokens_per_month INTEGER,
    llm_input_cost_per_1k_cents INTEGER,
    llm_output_cost_per_1k_cents INTEGER,
    enable_overage_billing BOOLEAN,

    -- Feature flag overrides
    enable_real_time_sync BOOLEAN,
    enable_advanced_analytics BOOLEAN,
    enable_exports BOOLEAN,
    enable_webhooks BOOLEAN,
    enable_team_features BOOLEAN,

    -- Payment timing override
    payment_timing VARCHAR(50),
    requires_payment_method BOOLEAN,

    -- Stripe overrides (custom Stripe product/price for this org)
    stripe_product_id VARCHAR(255),
    stripe_price_id VARCHAR(255),

    -- Discount
    discount_percent INTEGER,
    discount_description TEXT,

    -- Admin notes
    notes TEXT,
    configured_by VARCHAR(255),

    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_plan_overrides_workspace
    ON workspace_plan_overrides(workspace_id);

-- 1c. Add columns to workspace_subscriptions
ALTER TABLE workspace_subscriptions ADD COLUMN IF NOT EXISTS billing_model VARCHAR(50) DEFAULT 'per_seat';
ALTER TABLE workspace_subscriptions ADD COLUMN IF NOT EXISTS base_fee_monthly_cents INTEGER DEFAULT 0;
ALTER TABLE workspace_subscriptions ADD COLUMN IF NOT EXISTS usage_subscription_item_id VARCHAR(255);
ALTER TABLE workspace_subscriptions ADD COLUMN IF NOT EXISTS payment_timing VARCHAR(50) DEFAULT 'prepaid';
ALTER TABLE workspace_subscriptions ADD COLUMN IF NOT EXISTS postpaid_usage_accrued_cents INTEGER DEFAULT 0;
ALTER TABLE workspace_subscriptions ADD COLUMN IF NOT EXISTS postpaid_last_settled_at TIMESTAMPTZ;

-- 1d. Add workspace_id to billing tables (nullable, additive)
ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE usage_aggregates ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_usage_records_workspace ON usage_records(workspace_id);
CREATE INDEX IF NOT EXISTS idx_usage_aggregates_workspace ON usage_aggregates(workspace_id);

-- 1e. Update existing plan rows

-- Free: unlock all modules, keep AI limited, soft limits for fairness
UPDATE plans SET
    billing_model = 'free',
    enable_real_time_sync = TRUE,
    enable_advanced_analytics = TRUE,
    enable_exports = TRUE,
    enable_webhooks = TRUE,
    enable_team_features = TRUE,
    max_repos = 10,
    max_prs_per_repo = 200,
    max_commits_per_repo = 1000,
    sync_history_days = 90
WHERE tier = 'free';

-- Pro: per-seat billing
UPDATE plans SET
    billing_model = 'per_seat',
    per_seat_price_monthly_cents = 2900,
    requires_payment_method = TRUE,
    payment_timing = 'prepaid'
WHERE tier = 'pro';

-- Enterprise: per-seat billing
UPDATE plans SET
    billing_model = 'per_seat',
    per_seat_price_monthly_cents = 9900,
    requires_payment_method = TRUE,
    payment_timing = 'prepaid'
WHERE tier = 'enterprise';
