-- Migration: Microsoft (Entra ID / Azure AD) OAuth connection table
-- Mirrors google_connections for Microsoft sign-in and Outlook Mail/Calendar integration.

CREATE TABLE IF NOT EXISTS microsoft_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID NOT NULL UNIQUE REFERENCES developers(id) ON DELETE CASCADE,

    microsoft_id VARCHAR(255) NOT NULL UNIQUE,
    microsoft_email VARCHAR(255) NOT NULL,
    microsoft_name VARCHAR(255),
    microsoft_avatar_url VARCHAR(500),

    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,

    scopes JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_microsoft_connections_microsoft_id
    ON microsoft_connections (microsoft_id);
CREATE INDEX IF NOT EXISTS ix_microsoft_connections_microsoft_email
    ON microsoft_connections (microsoft_email);
