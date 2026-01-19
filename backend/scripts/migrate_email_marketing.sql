-- Email Marketing Module Migration
-- Run this script to create the email marketing tables

-- =============================================================================
-- EMAIL TEMPLATES
-- =============================================================================

CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Template identity
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,

    -- Template type
    template_type VARCHAR(20) NOT NULL DEFAULT 'code',
    category VARCHAR(50) NOT NULL DEFAULT 'general',

    -- Email content
    subject_template TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    preview_text VARCHAR(500),

    -- Template variables (JSONB)
    variables JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Visual builder definition (JSONB) - for visual templates
    visual_definition JSONB,

    -- Status and versioning
    is_active BOOLEAN NOT NULL DEFAULT true,
    version INTEGER NOT NULL DEFAULT 1,

    -- Audit
    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_email_template_workspace_slug UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS ix_email_template_workspace ON email_templates(workspace_id);
CREATE INDEX IF NOT EXISTS ix_email_template_workspace_category ON email_templates(workspace_id, category);
CREATE INDEX IF NOT EXISTS ix_email_template_active ON email_templates(is_active);

-- =============================================================================
-- EMAIL CAMPAIGNS
-- =============================================================================

CREATE TABLE IF NOT EXISTS email_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,

    -- Campaign identity
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Audience targeting
    list_id UUID REFERENCES crm_lists(id) ON DELETE SET NULL,
    audience_filters JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Campaign settings
    campaign_type VARCHAR(20) NOT NULL DEFAULT 'one_time',
    status VARCHAR(20) NOT NULL DEFAULT 'draft',

    -- Scheduling
    scheduled_at TIMESTAMPTZ,
    send_window JSONB,

    -- Sender info
    from_name VARCHAR(255) NOT NULL,
    from_email VARCHAR(255) NOT NULL,
    reply_to VARCHAR(255),

    -- Template context overrides (JSONB)
    template_context JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Stats (denormalized for quick access)
    total_recipients INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    delivered_count INTEGER NOT NULL DEFAULT 0,
    open_count INTEGER NOT NULL DEFAULT 0,
    unique_open_count INTEGER NOT NULL DEFAULT 0,
    click_count INTEGER NOT NULL DEFAULT 0,
    unique_click_count INTEGER NOT NULL DEFAULT 0,
    bounce_count INTEGER NOT NULL DEFAULT 0,
    unsubscribe_count INTEGER NOT NULL DEFAULT 0,
    complaint_count INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Audit
    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_email_campaign_workspace ON email_campaigns(workspace_id);
CREATE INDEX IF NOT EXISTS ix_email_campaign_workspace_status ON email_campaigns(workspace_id, status);
CREATE INDEX IF NOT EXISTS ix_email_campaign_scheduled ON email_campaigns(scheduled_at);
CREATE INDEX IF NOT EXISTS ix_email_campaign_template ON email_campaigns(template_id);

-- =============================================================================
-- EMAIL SUBSCRIBERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS email_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    record_id UUID REFERENCES crm_records(id) ON DELETE SET NULL,

    -- Email identity
    email VARCHAR(255) NOT NULL,
    email_hash VARCHAR(64) NOT NULL,

    -- Global status
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    status_changed_at TIMESTAMPTZ,
    status_reason VARCHAR(50),

    -- Verification
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verified_at TIMESTAMPTZ,

    -- Tokens
    preference_token VARCHAR(64) NOT NULL UNIQUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_email_subscriber_email UNIQUE (workspace_id, email_hash)
);

CREATE INDEX IF NOT EXISTS ix_email_subscriber_workspace ON email_subscribers(workspace_id);
CREATE INDEX IF NOT EXISTS ix_email_subscriber_token ON email_subscribers(preference_token);
CREATE INDEX IF NOT EXISTS ix_email_subscriber_status ON email_subscribers(workspace_id, status);
CREATE INDEX IF NOT EXISTS ix_email_subscriber_record ON email_subscribers(record_id);

-- =============================================================================
-- CAMPAIGN RECIPIENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS campaign_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
    record_id UUID REFERENCES crm_records(id) ON DELETE SET NULL,
    subscriber_id UUID REFERENCES email_subscribers(id) ON DELETE SET NULL,

    -- Recipient info
    email VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(255),

    -- Personalization context (JSONB)
    context JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    first_opened_at TIMESTAMPTZ,
    first_clicked_at TIMESTAMPTZ,

    -- Engagement counts
    open_count INTEGER NOT NULL DEFAULT 0,
    click_count INTEGER NOT NULL DEFAULT 0,

    -- Error handling
    error_message TEXT,
    bounce_type VARCHAR(10),

    -- Tracking IDs
    tracking_pixel_id UUID,

    -- Provider message ID (SES, SMTP, etc.)
    message_id VARCHAR(255),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_campaign_recipient_email UNIQUE (campaign_id, email)
);

CREATE INDEX IF NOT EXISTS ix_campaign_recipient_campaign ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS ix_campaign_recipient_status ON campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS ix_campaign_recipient_email ON campaign_recipients(email);
CREATE INDEX IF NOT EXISTS ix_campaign_recipient_record ON campaign_recipients(record_id);

-- =============================================================================
-- EMAIL TRACKING PIXELS
-- =============================================================================

CREATE TABLE IF NOT EXISTS email_tracking_pixels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
    recipient_id UUID REFERENCES campaign_recipients(id) ON DELETE SET NULL,
    record_id UUID REFERENCES crm_records(id) ON DELETE SET NULL,

    -- Tracking data
    opened BOOLEAN NOT NULL DEFAULT false,
    open_count INTEGER NOT NULL DEFAULT 0,
    first_opened_at TIMESTAMPTZ,
    last_opened_at TIMESTAMPTZ,

    -- User agent/IP for analytics (first open)
    user_agent TEXT,
    ip_address VARCHAR(45),
    device_type VARCHAR(20),
    email_client VARCHAR(100),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_tracking_pixel_workspace ON email_tracking_pixels(workspace_id);
CREATE INDEX IF NOT EXISTS ix_tracking_pixel_campaign ON email_tracking_pixels(campaign_id);
CREATE INDEX IF NOT EXISTS ix_tracking_pixel_opened ON email_tracking_pixels(opened);

-- =============================================================================
-- TRACKED LINKS
-- =============================================================================

CREATE TABLE IF NOT EXISTS tracked_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
    template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,

    -- Link details
    original_url TEXT NOT NULL,
    link_name VARCHAR(255),

    -- Stats
    click_count INTEGER NOT NULL DEFAULT 0,
    unique_click_count INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_tracked_link_workspace ON tracked_links(workspace_id);
CREATE INDEX IF NOT EXISTS ix_tracked_link_campaign ON tracked_links(campaign_id);

-- =============================================================================
-- LINK CLICKS
-- =============================================================================

CREATE TABLE IF NOT EXISTS link_clicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    link_id UUID NOT NULL REFERENCES tracked_links(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES campaign_recipients(id) ON DELETE SET NULL,
    record_id UUID REFERENCES crm_records(id) ON DELETE SET NULL,

    -- Click context
    clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_agent TEXT,
    ip_address VARCHAR(45),
    device_type VARCHAR(20),
    referer TEXT
);

CREATE INDEX IF NOT EXISTS ix_link_click_link ON link_clicks(link_id);
CREATE INDEX IF NOT EXISTS ix_link_click_recipient ON link_clicks(recipient_id);

-- =============================================================================
-- HOSTED IMAGES
-- =============================================================================

CREATE TABLE IF NOT EXISTS hosted_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- File info
    filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    file_size INTEGER NOT NULL,

    -- Storage URLs
    storage_url TEXT NOT NULL,
    public_url TEXT NOT NULL,

    -- Stats
    view_count INTEGER NOT NULL DEFAULT 0,

    -- Audit
    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_hosted_image_workspace ON hosted_images(workspace_id);

-- =============================================================================
-- CAMPAIGN ANALYTICS
-- =============================================================================

CREATE TABLE IF NOT EXISTS campaign_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
    date TIMESTAMPTZ NOT NULL,
    hour INTEGER,

    -- Counts
    sent INTEGER NOT NULL DEFAULT 0,
    delivered INTEGER NOT NULL DEFAULT 0,
    bounced INTEGER NOT NULL DEFAULT 0,
    opened INTEGER NOT NULL DEFAULT 0,
    unique_opens INTEGER NOT NULL DEFAULT 0,
    clicked INTEGER NOT NULL DEFAULT 0,
    unique_clicks INTEGER NOT NULL DEFAULT 0,
    unsubscribed INTEGER NOT NULL DEFAULT 0,
    complained INTEGER NOT NULL DEFAULT 0,

    -- Derived rates
    open_rate FLOAT,
    click_rate FLOAT,
    click_to_open_rate FLOAT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_campaign_analytics_time UNIQUE (campaign_id, date, hour)
);

CREATE INDEX IF NOT EXISTS ix_campaign_analytics_campaign ON campaign_analytics(campaign_id);
CREATE INDEX IF NOT EXISTS ix_campaign_analytics_date ON campaign_analytics(date);

-- =============================================================================
-- WORKSPACE EMAIL STATS
-- =============================================================================

CREATE TABLE IF NOT EXISTS workspace_email_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    period VARCHAR(10) NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,

    -- Totals
    campaigns_sent INTEGER NOT NULL DEFAULT 0,
    emails_sent INTEGER NOT NULL DEFAULT 0,
    emails_delivered INTEGER NOT NULL DEFAULT 0,
    total_opens INTEGER NOT NULL DEFAULT 0,
    total_clicks INTEGER NOT NULL DEFAULT 0,
    unsubscribes INTEGER NOT NULL DEFAULT 0,

    -- Averages
    avg_open_rate FLOAT,
    avg_click_rate FLOAT,

    -- Health metrics
    bounce_rate FLOAT,
    complaint_rate FLOAT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_workspace_email_stats_period UNIQUE (workspace_id, period, period_start)
);

CREATE INDEX IF NOT EXISTS ix_workspace_email_stats ON workspace_email_stats(workspace_id);

-- =============================================================================
-- SUBSCRIPTION CATEGORIES
-- =============================================================================

CREATE TABLE IF NOT EXISTS subscription_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Category info
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL,
    description TEXT,

    -- Defaults
    default_subscribed BOOLEAN NOT NULL DEFAULT true,
    required BOOLEAN NOT NULL DEFAULT false,

    -- Display
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_subscription_category_slug UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS ix_subscription_category_workspace ON subscription_categories(workspace_id);

-- =============================================================================
-- SUBSCRIPTION PREFERENCES
-- =============================================================================

CREATE TABLE IF NOT EXISTS subscription_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscriber_id UUID NOT NULL REFERENCES email_subscribers(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES subscription_categories(id) ON DELETE CASCADE,

    -- Preference settings
    is_subscribed BOOLEAN NOT NULL DEFAULT true,
    frequency VARCHAR(20),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_subscription_preference UNIQUE (subscriber_id, category_id)
);

CREATE INDEX IF NOT EXISTS ix_subscription_preference_subscriber ON subscription_preferences(subscriber_id);
CREATE INDEX IF NOT EXISTS ix_subscription_preference_category ON subscription_preferences(category_id);

-- =============================================================================
-- UNSUBSCRIBE EVENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS unsubscribe_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscriber_id UUID NOT NULL REFERENCES email_subscribers(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
    category_id UUID REFERENCES subscription_categories(id) ON DELETE SET NULL,

    -- Event details
    unsubscribe_type VARCHAR(20) NOT NULL,
    source VARCHAR(30) NOT NULL,

    -- Context
    ip_address VARCHAR(45),
    user_agent TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_unsubscribe_event_subscriber ON unsubscribe_events(subscriber_id);

-- =============================================================================
-- TRIGGERS FOR UPDATED_AT
-- =============================================================================

-- Create trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for tables with updated_at
DROP TRIGGER IF EXISTS update_email_templates_updated_at ON email_templates;
CREATE TRIGGER update_email_templates_updated_at
    BEFORE UPDATE ON email_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_email_campaigns_updated_at ON email_campaigns;
CREATE TRIGGER update_email_campaigns_updated_at
    BEFORE UPDATE ON email_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_email_subscribers_updated_at ON email_subscribers;
CREATE TRIGGER update_email_subscribers_updated_at
    BEFORE UPDATE ON email_subscribers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscription_categories_updated_at ON subscription_categories;
CREATE TRIGGER update_subscription_categories_updated_at
    BEFORE UPDATE ON subscription_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscription_preferences_updated_at ON subscription_preferences;
CREATE TRIGGER update_subscription_preferences_updated_at
    BEFORE UPDATE ON subscription_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_workspace_email_stats_updated_at ON workspace_email_stats;
CREATE TRIGGER update_workspace_email_stats_updated_at
    BEFORE UPDATE ON workspace_email_stats
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- DONE
-- =============================================================================

COMMENT ON TABLE email_templates IS 'User-defined email templates with Jinja2/Handlebars variable support';
COMMENT ON TABLE email_campaigns IS 'Email campaign definitions for batch email sending';
COMMENT ON TABLE email_subscribers IS 'Subscriber records with global preferences and consent tracking';
COMMENT ON TABLE campaign_recipients IS 'Individual recipient status and engagement for campaigns';
COMMENT ON TABLE email_tracking_pixels IS 'Open tracking pixels for email analytics';
COMMENT ON TABLE tracked_links IS 'Click tracking for links in emails';
COMMENT ON TABLE link_clicks IS 'Individual link click events';
COMMENT ON TABLE hosted_images IS 'CDN-hosted images with view analytics';
COMMENT ON TABLE campaign_analytics IS 'Time-series metrics for campaigns';
COMMENT ON TABLE workspace_email_stats IS 'Aggregated workspace-level email statistics';
COMMENT ON TABLE subscription_categories IS 'Email subscription categories for preference center';
COMMENT ON TABLE subscription_preferences IS 'Per-category subscription preferences';
COMMENT ON TABLE unsubscribe_events IS 'Compliance log of unsubscribe events';
