-- Phase 3-7: Inline databases, shared views, sharing, audit trail
-- Run after migrate_data_tables.sql

-- Phase 4: Extend CRM lists to support multiple entity types
ALTER TABLE crm_lists ADD COLUMN IF NOT EXISTS entity_type VARCHAR(30) NOT NULL DEFAULT 'crm_record';
-- 'crm_record'  — existing CRM behavior
-- 'sprint_task'  — saved views for sprint tasks
-- 'ticket'       — saved views for tickets
-- 'candidate'    — saved views for hiring candidates

ALTER TABLE crm_lists ADD COLUMN IF NOT EXISTS entity_scope_id UUID;
-- For sprint_task: project_id
-- For ticket: form_id or NULL
-- For candidate: NULL (workspace-wide)

ALTER TABLE crm_lists ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_lists_entity_type ON crm_lists(entity_type);
CREATE INDEX IF NOT EXISTS idx_crm_lists_entity_scope ON crm_lists(entity_type, entity_scope_id) WHERE entity_scope_id IS NOT NULL;

-- Backfill existing lists
UPDATE crm_lists SET entity_type = 'crm_record' WHERE entity_type IS NULL OR entity_type = 'crm_record';

-- Phase 5: Share links for public/external access
CREATE TABLE IF NOT EXISTS table_share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL REFERENCES crm_objects(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    permission VARCHAR(20) NOT NULL DEFAULT 'view',

    -- Restrictions
    password_hash VARCHAR(255),
    expires_at TIMESTAMPTZ,
    max_uses INTEGER,
    use_count INTEGER DEFAULT 0,

    -- What to show
    view_id UUID REFERENCES crm_lists(id) ON DELETE SET NULL,
    hidden_columns JSONB DEFAULT '[]',
    row_filter JSONB DEFAULT NULL,

    is_active BOOLEAN DEFAULT TRUE,
    created_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_links_table ON table_share_links(table_id);
CREATE INDEX IF NOT EXISTS idx_share_links_token ON table_share_links(token) WHERE is_active = TRUE;

-- Phase 7: Audit trail
CREATE TABLE IF NOT EXISTS table_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL REFERENCES crm_objects(id) ON DELETE CASCADE,
    record_id UUID REFERENCES crm_records(id) ON DELETE SET NULL,
    actor_id UUID NOT NULL REFERENCES developers(id),
    action VARCHAR(30) NOT NULL,
    -- record_created, record_updated, record_deleted, field_changed,
    -- permission_changed, table_shared, bulk_delete, export
    changes JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_table ON table_audit_log(table_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_record ON table_audit_log(record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON table_audit_log(actor_id, created_at DESC);
