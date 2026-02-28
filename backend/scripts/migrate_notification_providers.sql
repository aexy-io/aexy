-- Migration: Add web push notifications, category preferences, and Slack channel routing
-- Date: 2026-02-28

-- Add web_push_enabled to notification_preferences
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS web_push_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Web push subscriptions (per-device browser push endpoints)
CREATE TABLE IF NOT EXISTS web_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    user_agent TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(developer_id, endpoint)
);
CREATE INDEX IF NOT EXISTS idx_web_push_subs_developer ON web_push_subscriptions(developer_id, is_active);

-- Category-level notification preferences (master toggles + slack channel routing)
CREATE TABLE IF NOT EXISTS notification_category_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    slack_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    web_push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    slack_channel_id VARCHAR(50),
    slack_channel_name VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(developer_id, category)
);
CREATE INDEX IF NOT EXISTS idx_notif_cat_pref_developer ON notification_category_preferences(developer_id);
