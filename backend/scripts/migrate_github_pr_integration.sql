-- GitHub PR Integration Migration
-- Add AI analysis and PR-Issue linking fields to pull_requests table
-- Create pr_agent_interactions table for tracking AI agent decisions
-- Author: Claude Sonnet 4.6
-- Date: 2026-04-23

BEGIN;

-- Add AI analysis and linking fields to pull_requests
ALTER TABLE pull_requests
ADD COLUMN IF NOT EXISTS ai_tags JSONB,
ADD COLUMN IF NOT EXISTS ai_summary TEXT,
ADD COLUMN IF NOT EXISTS ai_analysis JSONB,
ADD COLUMN IF NOT EXISTS link_status VARCHAR(50) DEFAULT 'unlinked',
ADD COLUMN IF NOT EXISTS issue_number INTEGER,
ADD COLUMN IF NOT EXISTS issue_url VARCHAR(255),
ADD COLUMN IF NOT EXISTS linked_at TIMESTAMP WITH TIME ZONE;

-- Create PR agent interactions tracking table
CREATE TABLE IF NOT EXISTS pr_agent_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pr_id UUID NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
    agent_action VARCHAR(100) NOT NULL,
    agent_decision TEXT NOT NULL,
    confidence_score FLOAT NOT NULL,
    requires_approval BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_pr_link_status ON pull_requests(link_status);
CREATE INDEX IF NOT EXISTS idx_pr_issue_number ON pull_requests(issue_number);

-- Add comments to explain the migration
COMMENT ON COLUMN pull_requests.ai_tags IS 'AI-generated tags from agent analysis (stored as JSON array)';
COMMENT ON COLUMN pull_requests.ai_summary IS 'AI-generated summary of PR content';
COMMENT ON COLUMN pull_requests.ai_analysis IS 'Full AI analysis of PR including code, files, reviewers (stored as JSON object)';
COMMENT ON COLUMN pull_requests.link_status IS 'PR linking status: unlinked, linked, auto_linked';
COMMENT ON COLUMN pull_requests.issue_number IS 'GitHub issue number if PR is linked to an issue';
COMMENT ON COLUMN pull_requests.issue_url IS 'GitHub issue URL if PR is linked to an issue';
COMMENT ON COLUMN pull_requests.linked_at IS 'Timestamp when PR was linked to an issue';
COMMENT ON TABLE pr_agent_interactions IS 'Track AI agent decisions for PR analysis, tagging, and issue creation';

COMMIT;
