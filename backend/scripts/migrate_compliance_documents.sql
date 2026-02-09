-- Migration: Compliance Document Center
-- Creates tables for document management within the compliance module

-- 1. Compliance Folders (hierarchical with materialized path)
CREATE TABLE IF NOT EXISTS compliance_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES compliance_folders(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    path TEXT NOT NULL DEFAULT '/',  -- Materialized path e.g. /parent-id/child-id/
    depth INTEGER NOT NULL DEFAULT 0,  -- Max depth 4
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_folders_workspace ON compliance_folders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_compliance_folders_parent ON compliance_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_compliance_folders_path ON compliance_folders(path);
CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_folders_unique_name ON compliance_folders(workspace_id, parent_id, name) WHERE parent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_folders_unique_name_root ON compliance_folders(workspace_id, name) WHERE parent_id IS NULL;

-- 2. Compliance Documents (file metadata)
CREATE TABLE IF NOT EXISTS compliance_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES compliance_folders(id) ON DELETE SET NULL,
    name VARCHAR(500) NOT NULL,
    description TEXT,
    file_key VARCHAR(1000) NOT NULL,  -- S3 object key
    file_size BIGINT NOT NULL DEFAULT 0,  -- Size in bytes
    mime_type VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',  -- active, archived, deleted
    version INTEGER NOT NULL DEFAULT 1,
    uploaded_by UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    archived_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_compliance_documents_workspace ON compliance_documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_compliance_documents_folder ON compliance_documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_compliance_documents_status ON compliance_documents(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_compliance_documents_name ON compliance_documents(workspace_id, name);
CREATE INDEX IF NOT EXISTS idx_compliance_documents_mime ON compliance_documents(workspace_id, mime_type);
CREATE INDEX IF NOT EXISTS idx_compliance_documents_uploaded_by ON compliance_documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_compliance_documents_created ON compliance_documents(workspace_id, created_at DESC);

-- 3. Compliance Document Tags
CREATE TABLE IF NOT EXISTS compliance_document_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES compliance_documents(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    tag VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_doc_tags_document ON compliance_document_tags(document_id);
CREATE INDEX IF NOT EXISTS idx_compliance_doc_tags_workspace ON compliance_document_tags(workspace_id);
CREATE INDEX IF NOT EXISTS idx_compliance_doc_tags_tag ON compliance_document_tags(workspace_id, tag);
CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_doc_tags_unique ON compliance_document_tags(document_id, tag);

-- 4. Compliance Document Links (polymorphic entity links)
CREATE TABLE IF NOT EXISTS compliance_document_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES compliance_documents(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL,  -- reminder, reminder_instance, certification, training, control
    entity_id UUID NOT NULL,
    link_type VARCHAR(50) NOT NULL DEFAULT 'evidence',  -- evidence, reference, attachment
    notes TEXT,
    linked_by UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_doc_links_document ON compliance_document_links(document_id);
CREATE INDEX IF NOT EXISTS idx_compliance_doc_links_entity ON compliance_document_links(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_compliance_doc_links_workspace ON compliance_document_links(workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_doc_links_unique ON compliance_document_links(document_id, entity_type, entity_id);
