-- Add project_id column to bugs table
-- This allows bugs to be associated with specific projects

-- Add the project_id column
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bugs_project_id ON bugs(project_id);
