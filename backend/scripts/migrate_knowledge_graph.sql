-- Migration script for Knowledge Graph feature
-- Creates tables for entities, mentions, relationships, and extraction jobs

-- ============================================================================
-- Knowledge Entities Table
-- Stores extracted entities from documents (people, concepts, technologies, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS knowledge_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Entity identification
    name VARCHAR(500) NOT NULL,
    normalized_name VARCHAR(500) NOT NULL,
    entity_type VARCHAR(50) NOT NULL DEFAULT 'concept',
    description TEXT,

    -- Aliases for the same entity (e.g., "React", "ReactJS", "React.js")
    aliases TEXT[] DEFAULT '{}',

    -- Additional data (URLs, external IDs, etc.)
    extra_data JSONB DEFAULT '{}',

    -- Quality metrics
    confidence_score FLOAT DEFAULT 0.5,
    occurrence_count INTEGER DEFAULT 1,

    -- Temporal tracking
    first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for knowledge_entities
CREATE INDEX IF NOT EXISTS ix_knowledge_entities_workspace_id ON knowledge_entities(workspace_id);
CREATE INDEX IF NOT EXISTS ix_knowledge_entities_normalized_name ON knowledge_entities(normalized_name);
CREATE INDEX IF NOT EXISTS ix_knowledge_entities_workspace_type ON knowledge_entities(workspace_id, entity_type);
CREATE INDEX IF NOT EXISTS ix_knowledge_entities_confidence ON knowledge_entities(workspace_id, confidence_score);

-- Unique constraint: one entity per normalized name + type per workspace
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_entity_workspace_name_type
    ON knowledge_entities(workspace_id, normalized_name, entity_type);


-- ============================================================================
-- Knowledge Entity Mentions Table
-- Tracks where entities appear in documents with context
-- ============================================================================
CREATE TABLE IF NOT EXISTS knowledge_entity_mentions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,

    -- Context around the mention
    context_text TEXT,

    -- Position data (JSON for flexibility - could include line, char offset, etc.)
    position_data JSONB,

    -- Quality metrics
    confidence_score FLOAT DEFAULT 0.5,

    -- When was this mention extracted
    extracted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for knowledge_entity_mentions
CREATE INDEX IF NOT EXISTS ix_entity_mentions_entity_id ON knowledge_entity_mentions(entity_id);
CREATE INDEX IF NOT EXISTS ix_entity_mentions_document ON knowledge_entity_mentions(document_id);
CREATE INDEX IF NOT EXISTS ix_entity_mentions_entity_doc ON knowledge_entity_mentions(entity_id, document_id);


-- ============================================================================
-- Knowledge Relationships Table
-- Relationships between entities (entity-to-entity connections)
-- ============================================================================
CREATE TABLE IF NOT EXISTS knowledge_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source_entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
    target_entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,

    -- Relationship properties
    relationship_type VARCHAR(50) NOT NULL DEFAULT 'related_to',
    strength FLOAT DEFAULT 0.5,
    bidirectional BOOLEAN DEFAULT FALSE,

    -- Additional context data
    extra_data JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for knowledge_relationships
CREATE INDEX IF NOT EXISTS ix_knowledge_relationships_workspace ON knowledge_relationships(workspace_id);
CREATE INDEX IF NOT EXISTS ix_knowledge_relationships_source ON knowledge_relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS ix_knowledge_relationships_target ON knowledge_relationships(target_entity_id);
CREATE INDEX IF NOT EXISTS ix_knowledge_relationships_type ON knowledge_relationships(workspace_id, relationship_type);

-- Unique constraint: one relationship per source-target-type per workspace
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_relationship
    ON knowledge_relationships(workspace_id, source_entity_id, target_entity_id, relationship_type);


-- ============================================================================
-- Knowledge Document Relationships Table
-- Relationships between documents (document-to-document connections)
-- ============================================================================
CREATE TABLE IF NOT EXISTS knowledge_document_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    target_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,

    -- Relationship properties
    relationship_type VARCHAR(50) NOT NULL DEFAULT 'related_to',

    -- Shared entities between documents (entity IDs as text array)
    shared_entities TEXT[] DEFAULT '{}',

    -- Connection strength based on shared entities and other factors
    strength FLOAT DEFAULT 0.5,

    -- Additional data
    extra_data JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for knowledge_document_relationships
CREATE INDEX IF NOT EXISTS ix_knowledge_doc_relationships_workspace ON knowledge_document_relationships(workspace_id);
CREATE INDEX IF NOT EXISTS ix_knowledge_doc_relationships_source ON knowledge_document_relationships(source_document_id);
CREATE INDEX IF NOT EXISTS ix_knowledge_doc_relationships_target ON knowledge_document_relationships(target_document_id);
CREATE INDEX IF NOT EXISTS ix_knowledge_doc_relationships_strength ON knowledge_document_relationships(workspace_id, strength);

-- Unique constraint: one relationship per source-target-type per workspace
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_doc_relationship
    ON knowledge_document_relationships(workspace_id, source_document_id, target_document_id, relationship_type);


-- ============================================================================
-- Knowledge Extraction Jobs Table
-- Tracks knowledge extraction jobs for documents
-- ============================================================================
CREATE TABLE IF NOT EXISTS knowledge_extraction_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    triggered_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,

    -- Job properties
    job_type VARCHAR(50) NOT NULL DEFAULT 'single_document',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',

    -- Results
    entities_found INTEGER DEFAULT 0,
    relationships_found INTEGER DEFAULT 0,
    documents_processed INTEGER DEFAULT 0,

    -- Error tracking
    error_message TEXT,

    -- LLM usage tracking
    tokens_used INTEGER DEFAULT 0,

    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for knowledge_extraction_jobs
CREATE INDEX IF NOT EXISTS ix_extraction_jobs_workspace ON knowledge_extraction_jobs(workspace_id);
CREATE INDEX IF NOT EXISTS ix_extraction_jobs_workspace_status ON knowledge_extraction_jobs(workspace_id, status);
CREATE INDEX IF NOT EXISTS ix_extraction_jobs_document ON knowledge_extraction_jobs(document_id);


-- ============================================================================
-- Update trigger for updated_at columns
-- ============================================================================
CREATE OR REPLACE FUNCTION update_knowledge_graph_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
DROP TRIGGER IF EXISTS trg_knowledge_entities_updated_at ON knowledge_entities;
CREATE TRIGGER trg_knowledge_entities_updated_at
    BEFORE UPDATE ON knowledge_entities
    FOR EACH ROW EXECUTE FUNCTION update_knowledge_graph_updated_at();

DROP TRIGGER IF EXISTS trg_knowledge_relationships_updated_at ON knowledge_relationships;
CREATE TRIGGER trg_knowledge_relationships_updated_at
    BEFORE UPDATE ON knowledge_relationships
    FOR EACH ROW EXECUTE FUNCTION update_knowledge_graph_updated_at();

DROP TRIGGER IF EXISTS trg_knowledge_doc_relationships_updated_at ON knowledge_document_relationships;
CREATE TRIGGER trg_knowledge_doc_relationships_updated_at
    BEFORE UPDATE ON knowledge_document_relationships
    FOR EACH ROW EXECUTE FUNCTION update_knowledge_graph_updated_at();


-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON TABLE knowledge_entities IS 'Stores extracted entities from documents (people, concepts, technologies, etc.)';
COMMENT ON TABLE knowledge_entity_mentions IS 'Tracks where entities appear in documents with context';
COMMENT ON TABLE knowledge_relationships IS 'Relationships between entities (entity-to-entity connections)';
COMMENT ON TABLE knowledge_document_relationships IS 'Relationships between documents based on shared entities';
COMMENT ON TABLE knowledge_extraction_jobs IS 'Tracks knowledge extraction jobs for documents';

COMMENT ON COLUMN knowledge_entities.normalized_name IS 'Lowercase, trimmed name for deduplication';
COMMENT ON COLUMN knowledge_entities.aliases IS 'Alternative names for the same entity (e.g., React, ReactJS)';
COMMENT ON COLUMN knowledge_entities.confidence_score IS 'LLM confidence in entity extraction (0-1)';
COMMENT ON COLUMN knowledge_entities.occurrence_count IS 'Number of times this entity appears across documents';

COMMENT ON COLUMN knowledge_entity_mentions.context_text IS 'Surrounding text context where the entity was mentioned';
COMMENT ON COLUMN knowledge_entity_mentions.position_data IS 'JSON containing position info (line, offset, etc.)';

COMMENT ON COLUMN knowledge_relationships.strength IS 'Relationship strength/weight (0-1)';
COMMENT ON COLUMN knowledge_relationships.bidirectional IS 'Whether the relationship applies in both directions';

COMMENT ON COLUMN knowledge_document_relationships.shared_entities IS 'Array of entity IDs shared between documents';
COMMENT ON COLUMN knowledge_document_relationships.strength IS 'Connection strength based on shared entities';

COMMENT ON COLUMN knowledge_extraction_jobs.job_type IS 'single_document, full_workspace, or incremental';
COMMENT ON COLUMN knowledge_extraction_jobs.tokens_used IS 'LLM tokens consumed by this extraction job';
