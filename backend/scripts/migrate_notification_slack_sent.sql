-- Add Slack delivery tracking columns to notifications table
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS slack_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS slack_sent_at TIMESTAMPTZ;
