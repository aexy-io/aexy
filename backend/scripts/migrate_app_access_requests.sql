-- Migration: App Access Requests
-- Allows non-admin users to request access to apps they don't have

CREATE TABLE IF NOT EXISTS app_access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    app_id VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    reason TEXT,
    reviewed_by_id UUID REFERENCES developers(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, requester_id, app_id, status)
);

CREATE INDEX IF NOT EXISTS idx_access_requests_workspace ON app_access_requests(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_access_requests_requester ON app_access_requests(requester_id);
