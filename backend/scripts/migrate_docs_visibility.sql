-- Migration script to add document visibility, favorites, and notifications
-- Run this against your PostgreSQL database

-- Add visibility column to documents table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='documents' AND column_name='visibility'
    ) THEN
        ALTER TABLE documents ADD COLUMN visibility VARCHAR(20) DEFAULT 'workspace';
    END IF;
END $$;

-- Create document_favorites table (if not exists)
CREATE TABLE IF NOT EXISTS document_favorites (
    id VARCHAR(36) PRIMARY KEY,
    document_id VARCHAR(36) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    developer_id VARCHAR(36) NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_document_favorites_doc_dev UNIQUE (document_id, developer_id)
);

-- Create indexes for document_favorites
CREATE INDEX IF NOT EXISTS ix_document_favorites_document_id ON document_favorites(document_id);
CREATE INDEX IF NOT EXISTS ix_document_favorites_developer_id ON document_favorites(developer_id);

-- Create document_notifications table (if not exists)
CREATE TABLE IF NOT EXISTS document_notifications (
    id VARCHAR(36) PRIMARY KEY,
    document_id VARCHAR(36) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    developer_id VARCHAR(36) NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_by_id VARCHAR(36) REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for document_notifications
CREATE INDEX IF NOT EXISTS ix_document_notifications_document_id ON document_notifications(document_id);
CREATE INDEX IF NOT EXISTS ix_document_notifications_developer_id ON document_notifications(developer_id);
CREATE INDEX IF NOT EXISTS ix_document_notifications_is_read ON document_notifications(is_read);
CREATE INDEX IF NOT EXISTS ix_document_notifications_created_at ON document_notifications(created_at);

-- Show success message
SELECT 'Migration completed successfully!' as status;
