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
-- UUID, not VARCHAR(36). This file was written when `documents.id` was a
-- string; the model has been `UUID` for a long time, and a VARCHAR(36) column
-- cannot carry a foreign key to a uuid one — Postgres rejects the constraint
-- outright rather than casting. On any database old enough to have this table
-- already the CREATE is skipped and the types were never noticed.
CREATE TABLE IF NOT EXISTS document_favorites (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_document_favorites_doc_dev UNIQUE (document_id, developer_id)
);

-- Create indexes for document_favorites
CREATE INDEX IF NOT EXISTS ix_document_favorites_document_id ON document_favorites(document_id);
CREATE INDEX IF NOT EXISTS ix_document_favorites_developer_id ON document_favorites(developer_id);

-- `document_notifications` used to be created here: a second inbox, rendered
-- in the docs sidebar, that no longer exists. Document notifications now go
-- through the ordinary `notifications` table (`NotificationType.DOCUMENT_*`),
-- which is what gives them an email, a per-user preference and a place in the
-- notification bell.
--
-- It is deleted rather than left in place because it was **breaking every
-- fresh database**: its `document_id VARCHAR(36) REFERENCES documents(id)`
-- cannot be created against today's uuid `documents.id`, `run_migrations.py`
-- stops at the first failure, and so nothing after this file in alphabetical
-- order — the whole `migrate_kb_enterprise_*` set, service desk hardening and
-- reporting — was ever applied. Any database that already has the table keeps
-- it; dropping a table this migration no longer owns is not its business.

-- Show success message
SELECT 'Migration completed successfully!' as status;
