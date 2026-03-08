-- Notification Delivery Events - event-sourced ledger for tracking delivery status
-- per notification per channel (in_app, email, web_push, slack).

CREATE TABLE IF NOT EXISTS notification_delivery_events (
    id UUID PRIMARY KEY,
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL,
    provider VARCHAR(50),
    provider_message_id VARCHAR(255),
    event_metadata JSONB DEFAULT '{}',
    event_timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Timeline queries per notification
CREATE INDEX IF NOT EXISTS ix_nde_notification_channel
    ON notification_delivery_events (notification_id, channel);

-- User delivery feed (most recent first)
CREATE INDEX IF NOT EXISTS ix_nde_developer_created
    ON notification_delivery_events (developer_id, created_at DESC);

-- Aggregate stats queries
CREATE INDEX IF NOT EXISTS ix_nde_developer_channel_status
    ON notification_delivery_events (developer_id, channel, status);

-- Webhook correlation (find notification by provider message ID)
CREATE INDEX IF NOT EXISTS ix_nde_provider_message_id
    ON notification_delivery_events (provider_message_id);
