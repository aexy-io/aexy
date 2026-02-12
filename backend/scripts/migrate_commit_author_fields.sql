-- Add author identity columns to commits table
-- These preserve the original GitHub author even if developer_id changes later

ALTER TABLE commits ADD COLUMN IF NOT EXISTS author_github_login VARCHAR(255);
ALTER TABLE commits ADD COLUMN IF NOT EXISTS author_email VARCHAR(255);
CREATE INDEX IF NOT EXISTS ix_commits_author_github_login ON commits(author_github_login);
CREATE INDEX IF NOT EXISTS ix_commits_author_email ON commits(author_email);
