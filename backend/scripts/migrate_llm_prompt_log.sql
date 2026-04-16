-- LLM prompt/completion logging for fine-tuning dataset collection.

CREATE TABLE IF NOT EXISTS llm_prompt_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID REFERENCES developers(id) ON DELETE SET NULL,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,

    -- Request
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100),
    operation VARCHAR(100),
    system_prompt TEXT,
    user_prompt TEXT NOT NULL,
    analysis_type VARCHAR(100),

    -- Response
    completion TEXT NOT NULL,
    confidence FLOAT,

    -- Token counts
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,

    -- Quality signals (populated later via feedback or automated eval)
    rating SMALLINT,                    -- 1-5 scale or thumbs up/down (1=bad, 5=great)
    feedback_source VARCHAR(50),        -- "user", "automated", "review"
    is_cached BOOLEAN DEFAULT FALSE,    -- Was this served from cache?
    is_flagged BOOLEAN DEFAULT FALSE,   -- Flagged for review (low confidence, error, etc.)

    -- Metadata
    request_metadata JSONB,             -- Extra context (file_path, language_hint, etc.)
    response_metadata JSONB,            -- Extra response info (languages, frameworks, etc.)

    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_llm_prompt_logs_developer ON llm_prompt_logs(developer_id);
CREATE INDEX IF NOT EXISTS idx_llm_prompt_logs_workspace ON llm_prompt_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_llm_prompt_logs_operation ON llm_prompt_logs(operation);
CREATE INDEX IF NOT EXISTS idx_llm_prompt_logs_rating ON llm_prompt_logs(rating) WHERE rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_llm_prompt_logs_created ON llm_prompt_logs(created_at);
