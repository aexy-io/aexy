-- Migration: Add workspace_id to slack_integrations
-- This allows Slack integrations to be linked directly to workspaces for CRM automation

-- Add workspace_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'slack_integrations'
        AND column_name = 'workspace_id'
    ) THEN
        ALTER TABLE slack_integrations
        ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;

        -- Create index for faster lookups
        CREATE INDEX idx_slack_integrations_workspace_id ON slack_integrations(workspace_id);
    END IF;
END $$;

COMMENT ON COLUMN slack_integrations.workspace_id IS 'Optional direct link to workspace for CRM automation slack notifications';
