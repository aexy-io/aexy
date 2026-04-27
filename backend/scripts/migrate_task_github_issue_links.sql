-- Add GitHub issue support to task_github_links.

ALTER TABLE task_github_links
  ADD COLUMN IF NOT EXISTS github_issue_repository VARCHAR(255),
  ADD COLUMN IF NOT EXISTS github_issue_number INTEGER,
  ADD COLUMN IF NOT EXISTS github_issue_title TEXT,
  ADD COLUMN IF NOT EXISTS github_issue_state VARCHAR(50),
  ADD COLUMN IF NOT EXISTS github_issue_url VARCHAR(500);

CREATE INDEX IF NOT EXISTS ix_task_github_links_github_issue_repository
  ON task_github_links(github_issue_repository);

CREATE INDEX IF NOT EXISTS ix_task_github_links_github_issue_number
  ON task_github_links(github_issue_number);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_task_github_issue_link'
  ) THEN
    ALTER TABLE task_github_links
      ADD CONSTRAINT uq_task_github_issue_link
      UNIQUE (task_id, github_issue_repository, github_issue_number);
  END IF;
END $$;
