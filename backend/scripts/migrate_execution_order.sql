-- Migration: Add execution_order column to workflow definitions
-- This stores the precomputed topological sort order for faster execution

ALTER TABLE crm_workflow_definitions
ADD COLUMN IF NOT EXISTS execution_order JSONB;

-- Add a comment explaining the column
COMMENT ON COLUMN crm_workflow_definitions.execution_order IS
    'Precomputed topological sort order of node IDs for execution performance';

-- Backfill existing workflows with computed execution order
-- This is done via application code after migration since it requires
-- the topological sort algorithm
