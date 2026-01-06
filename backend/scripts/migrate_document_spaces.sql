-- Migration script to add document spaces feature
-- Run this against your PostgreSQL database

-- 1. Create document_spaces table
CREATE TABLE IF NOT EXISTS document_spaces (
    id VARCHAR(36) PRIMARY KEY,
    workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    color VARCHAR(20),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    settings JSONB DEFAULT '{}',
    created_by_id VARCHAR(36) REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_document_spaces_workspace_slug UNIQUE (workspace_id, slug)
);

-- Create indexes for document_spaces
CREATE INDEX IF NOT EXISTS ix_document_spaces_workspace_id ON document_spaces(workspace_id);
CREATE INDEX IF NOT EXISTS ix_document_spaces_is_default ON document_spaces(is_default);
CREATE INDEX IF NOT EXISTS ix_document_spaces_is_archived ON document_spaces(is_archived);

-- 2. Create document_space_members table
CREATE TABLE IF NOT EXISTS document_space_members (
    id VARCHAR(36) PRIMARY KEY,
    space_id VARCHAR(36) NOT NULL REFERENCES document_spaces(id) ON DELETE CASCADE,
    developer_id VARCHAR(36) NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'editor',
    invited_by_id VARCHAR(36) REFERENCES developers(id) ON DELETE SET NULL,
    invited_at TIMESTAMP WITH TIME ZONE,
    joined_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_document_space_members_space_dev UNIQUE (space_id, developer_id)
);

-- Create indexes for document_space_members
CREATE INDEX IF NOT EXISTS ix_document_space_members_space_id ON document_space_members(space_id);
CREATE INDEX IF NOT EXISTS ix_document_space_members_developer_id ON document_space_members(developer_id);
CREATE INDEX IF NOT EXISTS ix_document_space_members_role ON document_space_members(role);

-- 3. Add space_id column to documents table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='documents' AND column_name='space_id'
    ) THEN
        ALTER TABLE documents ADD COLUMN space_id VARCHAR(36) REFERENCES document_spaces(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create index for documents.space_id
CREATE INDEX IF NOT EXISTS ix_documents_space_id ON documents(space_id);

-- Show success message
SELECT 'Document spaces migration completed successfully!' as status;
