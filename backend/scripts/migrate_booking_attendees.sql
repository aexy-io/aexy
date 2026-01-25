-- Migration: Add booking attendees for team bookings
-- Date: 2026-01-22
-- Description: Adds support for multiple attendees per booking with RSVP functionality

-- Add ALL_HANDS assignment type value to existing enum
-- Note: assignment_type is stored as VARCHAR, not PostgreSQL enum, so we just need to support the new value in code

-- New table for multiple attendees per booking
CREATE TABLE IF NOT EXISTS booking_attendees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, confirmed, declined
    response_token VARCHAR(64),  -- Token for RSVP actions
    responded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(booking_id, user_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_booking_attendees_booking ON booking_attendees(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_attendees_user ON booking_attendees(user_id);
CREATE INDEX IF NOT EXISTS idx_booking_attendees_token ON booking_attendees(response_token);
CREATE INDEX IF NOT EXISTS idx_booking_attendees_status ON booking_attendees(status);

-- Add team_id to event_type for linking to workspace teams (optional)
ALTER TABLE booking_event_types ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
CREATE INDEX IF NOT EXISTS idx_booking_event_types_team ON booking_event_types(team_id);

-- Add custom_member_ids array for ad-hoc team member selection
ALTER TABLE booking_event_types ADD COLUMN IF NOT EXISTS custom_member_ids UUID[] DEFAULT '{}';

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_booking_attendees_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS booking_attendees_updated_at ON booking_attendees;
CREATE TRIGGER booking_attendees_updated_at
    BEFORE UPDATE ON booking_attendees
    FOR EACH ROW
    EXECUTE FUNCTION update_booking_attendees_updated_at();
