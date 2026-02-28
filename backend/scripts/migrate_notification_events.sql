-- Migration: Add new notification event types and categories
-- This migration ensures default preferences exist for all new event types.
-- The application auto-creates preferences on first access, but this seeds them
-- for existing users who may not visit the settings page.

-- No schema changes needed — event_type is a VARCHAR(100), not a DB enum.
-- New event types are purely application-level additions.

-- Seed default preferences for all existing developers for the new event types.
-- Uses ON CONFLICT DO NOTHING so re-running is safe.

DO $$
DECLARE
    dev_record RECORD;
    new_events TEXT[] := ARRAY[
        'agent_invoked',
        'blocker_escalated',
        'uptime_incident_created',
        'uptime_incident_resolved',
        'learning_approval_requested',
        'learning_approval_decided',
        'learning_goal_assigned',
        'learning_goal_overdue',
        'learning_activity_completed',
        'form_submission_received',
        'form_submission_failed',
        'campaign_completed',
        'campaign_scheduled',
        'automation_run_failed',
        'automation_run_completed',
        'assessment_invitation_sent',
        'assessment_completed',
        'candidate_stage_changed',
        'gtm_alert_triggered',
        'document_shared',
        'document_mentioned',
        'document_commented'
    ];
    evt TEXT;
BEGIN
    FOR dev_record IN SELECT id FROM developers LOOP
        FOREACH evt IN ARRAY new_events LOOP
            INSERT INTO notification_preferences (
                id, developer_id, event_type,
                in_app_enabled, email_enabled, slack_enabled, web_push_enabled,
                created_at, updated_at
            ) VALUES (
                gen_random_uuid()::text, dev_record.id, evt,
                true, -- in_app_enabled
                CASE
                    WHEN evt IN ('blocker_escalated', 'uptime_incident_created', 'uptime_incident_resolved',
                                 'learning_approval_requested', 'learning_approval_decided',
                                 'learning_goal_assigned', 'learning_goal_overdue',
                                 'form_submission_received', 'form_submission_failed',
                                 'campaign_completed', 'automation_run_failed',
                                 'assessment_completed', 'gtm_alert_triggered',
                                 'document_shared', 'document_mentioned', 'document_commented')
                    THEN true
                    ELSE false
                END, -- email_enabled
                CASE
                    WHEN evt IN ('blocker_escalated', 'uptime_incident_created',
                                 'uptime_incident_resolved', 'gtm_alert_triggered')
                    THEN true
                    ELSE false
                END, -- slack_enabled
                CASE
                    WHEN evt IN ('blocker_escalated', 'uptime_incident_created')
                    THEN true
                    ELSE false
                END, -- web_push_enabled
                NOW(), NOW()
            )
            ON CONFLICT ON CONSTRAINT uq_notification_pref_developer_event DO NOTHING;
        END LOOP;
    END LOOP;
END $$;

-- Seed category preferences for new categories
DO $$
DECLARE
    dev_record RECORD;
    new_categories TEXT[] := ARRAY[
        'agents', 'uptime', 'learning', 'forms',
        'campaigns', 'automations', 'hiring', 'gtm', 'documents'
    ];
    cat TEXT;
BEGIN
    FOR dev_record IN SELECT id FROM developers LOOP
        FOREACH cat IN ARRAY new_categories LOOP
            INSERT INTO notification_category_preferences (
                id, developer_id, category,
                in_app_enabled, email_enabled, slack_enabled, web_push_enabled,
                created_at, updated_at
            ) VALUES (
                gen_random_uuid()::text, dev_record.id, cat,
                true, true, false, false,
                NOW(), NOW()
            )
            ON CONFLICT ON CONSTRAINT uq_notif_cat_pref_developer_category DO NOTHING;
        END LOOP;
    END LOOP;
END $$;
