-- GitHub Connection Auth Status Migration
-- Adds auth_status and auth_error fields to track connection health
-- so users can see when their GitHub token has been revoked and reconnect.

ALTER TABLE github_connections
ADD COLUMN IF NOT EXISTS auth_status VARCHAR(50) NOT NULL DEFAULT 'active';

ALTER TABLE github_connections
ADD COLUMN IF NOT EXISTS auth_error TEXT;

COMMENT ON COLUMN github_connections.auth_status IS 'Connection health: active or error';
COMMENT ON COLUMN github_connections.auth_error IS 'Error message when auth_status is error (e.g. token revoked)';
