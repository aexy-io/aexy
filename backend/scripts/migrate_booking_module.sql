-- Calendar Booking Module Migration
-- Creates tables for event types, availability, bookings, calendar connections, and webhooks

-- Event Types Table
CREATE TABLE IF NOT EXISTS booking_event_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,

    -- Basic info
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 30,

    -- Meeting settings
    location_type VARCHAR(50) NOT NULL DEFAULT 'google_meet',
    custom_location VARCHAR(500),
    color VARCHAR(7) NOT NULL DEFAULT '#3B82F6',

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_team_event BOOLEAN NOT NULL DEFAULT FALSE,

    -- Buffer times
    buffer_before INTEGER NOT NULL DEFAULT 0,
    buffer_after INTEGER NOT NULL DEFAULT 0,

    -- Scheduling constraints
    min_notice_hours INTEGER NOT NULL DEFAULT 24,
    max_future_days INTEGER NOT NULL DEFAULT 60,

    -- Custom intake questions (JSONB array)
    questions JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Payment settings (FREE tier only)
    payment_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    payment_amount INTEGER,
    payment_currency VARCHAR(3) NOT NULL DEFAULT 'USD',

    -- Confirmation
    confirmation_message TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT uq_booking_event_type_slug UNIQUE (workspace_id, slug)
);

-- Indexes for event types
CREATE INDEX IF NOT EXISTS idx_booking_event_types_workspace ON booking_event_types(workspace_id);
CREATE INDEX IF NOT EXISTS idx_booking_event_types_owner ON booking_event_types(owner_id);

-- User Availability Table
CREATE TABLE IF NOT EXISTS booking_user_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Day of week (0=Monday, 6=Sunday)
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),

    -- Time range (in user's timezone)
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,

    -- User's timezone
    timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT uq_user_availability_slot UNIQUE (user_id, workspace_id, day_of_week, start_time)
);

-- Indexes for user availability
CREATE INDEX IF NOT EXISTS idx_booking_user_availability_user ON booking_user_availability(user_id);
CREATE INDEX IF NOT EXISTS idx_booking_user_availability_workspace ON booking_user_availability(workspace_id);

-- Availability Overrides Table
CREATE TABLE IF NOT EXISTS booking_availability_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,

    -- Date for the override
    date DATE NOT NULL,

    -- Is the user available on this date?
    is_available BOOLEAN NOT NULL DEFAULT FALSE,

    -- If available, custom hours
    start_time TIME,
    end_time TIME,

    -- Reason for the override
    reason VARCHAR(255),
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for availability overrides
CREATE INDEX IF NOT EXISTS idx_booking_availability_overrides_user ON booking_availability_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_booking_availability_overrides_date ON booking_availability_overrides(date);

-- Bookings Table
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type_id UUID NOT NULL REFERENCES booking_event_types(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Host (the person offering the meeting)
    host_id UUID REFERENCES developers(id) ON DELETE SET NULL,

    -- Invitee (the person booking the meeting)
    invitee_email VARCHAR(255) NOT NULL,
    invitee_name VARCHAR(255) NOT NULL,
    invitee_phone VARCHAR(50),

    -- Scheduling
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    timezone VARCHAR(100) NOT NULL,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    -- Meeting location
    location VARCHAR(500),
    meeting_link VARCHAR(500),

    -- Custom question responses (JSONB)
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Cancellation details
    cancellation_reason TEXT,
    cancelled_by VARCHAR(50),
    cancelled_at TIMESTAMP WITH TIME ZONE,

    -- Payment details
    payment_status VARCHAR(20) NOT NULL DEFAULT 'none',
    payment_intent_id VARCHAR(255),
    payment_amount INTEGER,
    payment_currency VARCHAR(3),

    -- External calendar integration
    calendar_event_id VARCHAR(255),
    calendar_provider VARCHAR(50),

    -- Reminders
    reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
    reminder_sent_at TIMESTAMP WITH TIME ZONE,

    -- Secure token for invitee actions (cancel, reschedule)
    action_token VARCHAR(64),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for bookings
CREATE INDEX IF NOT EXISTS idx_bookings_event_type ON bookings(event_type_id);
CREATE INDEX IF NOT EXISTS idx_bookings_workspace ON bookings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_bookings_host ON bookings(host_id);
CREATE INDEX IF NOT EXISTS idx_bookings_invitee_email ON bookings(invitee_email);
CREATE INDEX IF NOT EXISTS idx_bookings_start_time ON bookings(start_time);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_action_token ON bookings(action_token);

-- Calendar Connections Table
CREATE TABLE IF NOT EXISTS booking_calendar_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Provider info
    provider VARCHAR(50) NOT NULL,
    calendar_id VARCHAR(255) NOT NULL,
    calendar_name VARCHAR(255) NOT NULL,
    account_email VARCHAR(255),

    -- OAuth tokens (should be encrypted in production)
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,

    -- Calendar settings
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    check_conflicts BOOLEAN NOT NULL DEFAULT TRUE,
    create_events BOOLEAN NOT NULL DEFAULT TRUE,

    -- Sync tracking
    last_synced_at TIMESTAMP WITH TIME ZONE,
    sync_token VARCHAR(500),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for calendar connections
CREATE INDEX IF NOT EXISTS idx_booking_calendar_connections_user ON booking_calendar_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_booking_calendar_connections_workspace ON booking_calendar_connections(workspace_id);

-- Team Event Members Table
CREATE TABLE IF NOT EXISTS booking_team_event_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type_id UUID NOT NULL REFERENCES booking_event_types(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,

    -- Assignment settings
    assignment_type VARCHAR(50) NOT NULL DEFAULT 'round_robin',
    priority INTEGER NOT NULL DEFAULT 0,

    -- For round-robin tracking
    last_assigned_at TIMESTAMP WITH TIME ZONE,
    assignment_count INTEGER NOT NULL DEFAULT 0,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT uq_team_event_member UNIQUE (event_type_id, user_id)
);

-- Indexes for team event members
CREATE INDEX IF NOT EXISTS idx_booking_team_event_members_event_type ON booking_team_event_members(event_type_id);
CREATE INDEX IF NOT EXISTS idx_booking_team_event_members_user ON booking_team_event_members(user_id);

-- Booking Webhooks Table (Enterprise feature)
CREATE TABLE IF NOT EXISTS booking_webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Webhook configuration
    name VARCHAR(255) NOT NULL,
    url VARCHAR(500) NOT NULL,

    -- Events to trigger (booking.created, booking.cancelled, etc.)
    events TEXT[] NOT NULL DEFAULT '{}',

    -- Security
    secret VARCHAR(64) NOT NULL,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Tracking
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    failure_count INTEGER NOT NULL DEFAULT 0,
    last_failure_at TIMESTAMP WITH TIME ZONE,
    last_failure_reason VARCHAR(500),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for booking webhooks
CREATE INDEX IF NOT EXISTS idx_booking_webhooks_workspace ON booking_webhooks(workspace_id);

-- Updated at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
DROP TRIGGER IF EXISTS update_booking_event_types_updated_at ON booking_event_types;
CREATE TRIGGER update_booking_event_types_updated_at
    BEFORE UPDATE ON booking_event_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_booking_user_availability_updated_at ON booking_user_availability;
CREATE TRIGGER update_booking_user_availability_updated_at
    BEFORE UPDATE ON booking_user_availability
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_booking_availability_overrides_updated_at ON booking_availability_overrides;
CREATE TRIGGER update_booking_availability_overrides_updated_at
    BEFORE UPDATE ON booking_availability_overrides
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
CREATE TRIGGER update_bookings_updated_at
    BEFORE UPDATE ON bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_booking_calendar_connections_updated_at ON booking_calendar_connections;
CREATE TRIGGER update_booking_calendar_connections_updated_at
    BEFORE UPDATE ON booking_calendar_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_booking_team_event_members_updated_at ON booking_team_event_members;
CREATE TRIGGER update_booking_team_event_members_updated_at
    BEFORE UPDATE ON booking_team_event_members
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_booking_webhooks_updated_at ON booking_webhooks;
CREATE TRIGGER update_booking_webhooks_updated_at
    BEFORE UPDATE ON booking_webhooks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE booking_event_types IS 'Event types that can be booked (e.g., 30 min meeting, Technical Interview)';
COMMENT ON TABLE booking_user_availability IS 'Recurring weekly availability for users';
COMMENT ON TABLE booking_availability_overrides IS 'One-off overrides to regular availability (vacation, special hours)';
COMMENT ON TABLE bookings IS 'Scheduled meetings between hosts and invitees';
COMMENT ON TABLE booking_calendar_connections IS 'Connected external calendars (Google, Microsoft)';
COMMENT ON TABLE booking_team_event_members IS 'Team members assigned to team events';
COMMENT ON TABLE booking_webhooks IS 'Webhook endpoints for booking events (Enterprise)';
