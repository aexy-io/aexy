-- Migration: Add scheduled timeline + estimated effort + attachments to sprint_tasks
-- - start_date, end_date: scheduled task timeline (used to detect "overdue")
-- - estimated_hours: estimated effort, compared against actual cycle time for "over estimate" indicator
-- - task_attachments: per-task uploaded files (multi-attachment support)

-- Add scheduled timeline + estimated effort columns
ALTER TABLE sprint_tasks
ADD COLUMN IF NOT EXISTS start_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS end_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS estimated_hours DOUBLE PRECISION;

-- Index end_date so overdue queries can use a range scan
CREATE INDEX IF NOT EXISTS idx_sprint_tasks_end_date ON sprint_tasks(end_date);

-- Attachments table
CREATE TABLE IF NOT EXISTS task_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES sprint_tasks(id) ON DELETE CASCADE,
    file_name VARCHAR(500) NOT NULL,
    file_url VARCHAR(2000) NOT NULL,
    file_size INTEGER,
    content_type VARCHAR(255),
    uploaded_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON task_attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_attachments_uploaded_by ON task_attachments(uploaded_by_id);

SELECT 'Migration complete: sprint_tasks scheduled timeline + estimated_hours + task_attachments' AS status;
