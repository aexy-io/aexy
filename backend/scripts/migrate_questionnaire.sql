-- Questionnaire Import Module Migration
-- Creates tables for questionnaire responses and parsed questions

-- =============================================================================
-- QUESTIONNAIRE RESPONSES TABLE
-- Tracks uploaded questionnaire files and their analysis status
-- =============================================================================

CREATE TABLE IF NOT EXISTS questionnaire_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- Document info
    title VARCHAR(500) NOT NULL,
    partner_name VARCHAR(255),
    assessment_year VARCHAR(10),
    source_filename VARCHAR(500) NOT NULL,

    -- Parsing stats
    total_questions INTEGER NOT NULL DEFAULT 0,
    total_suggestions_generated INTEGER NOT NULL DEFAULT 0,

    -- Status: uploaded -> analyzed -> reviewed
    status VARCHAR(50) NOT NULL DEFAULT 'uploaded',

    -- Extra metadata from document summary sheet (JSONB)
    extra_metadata JSONB NOT NULL DEFAULT '{}',

    -- Audit
    uploaded_by_id UUID REFERENCES developers(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for questionnaire_responses
CREATE INDEX IF NOT EXISTS idx_questionnaire_responses_workspace ON questionnaire_responses(workspace_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_responses_status ON questionnaire_responses(workspace_id, status);

COMMENT ON TABLE questionnaire_responses IS 'Uploaded questionnaire files for compliance tracking';
COMMENT ON COLUMN questionnaire_responses.status IS 'uploaded = parsed, analyzed = suggestions generated, reviewed = all suggestions reviewed';

-- =============================================================================
-- QUESTIONNAIRE QUESTIONS TABLE
-- Individual parsed questions from a questionnaire
-- =============================================================================

CREATE TABLE IF NOT EXISTS questionnaire_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    questionnaire_response_id UUID NOT NULL REFERENCES questionnaire_responses(id) ON DELETE CASCADE,

    -- Question data
    serial_number VARCHAR(20),
    domain VARCHAR(255),
    question_text TEXT NOT NULL,
    response_text TEXT,
    possible_responses TEXT,
    explanation TEXT,

    -- Classification
    is_section_header BOOLEAN NOT NULL DEFAULT false,
    response_type VARCHAR(50) NOT NULL DEFAULT 'text',  -- yes_no, frequency, text, multi_choice
    source_row INTEGER,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for questionnaire_questions
CREATE INDEX IF NOT EXISTS idx_questionnaire_questions_response ON questionnaire_questions(questionnaire_response_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_questions_domain ON questionnaire_questions(questionnaire_response_id, domain);

COMMENT ON TABLE questionnaire_questions IS 'Individual parsed questions from uploaded questionnaires';
COMMENT ON COLUMN questionnaire_questions.response_type IS 'yes_no, frequency, text, or multi_choice';
COMMENT ON COLUMN questionnaire_questions.is_section_header IS 'True for rows that are section headers, not actual questions';

-- =============================================================================
-- UPDATE TRIGGER (reuse existing function if available)
-- =============================================================================

-- Create the trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_reminder_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to questionnaire_responses
DROP TRIGGER IF EXISTS update_questionnaire_responses_timestamp ON questionnaire_responses;
CREATE TRIGGER update_questionnaire_responses_timestamp
    BEFORE UPDATE ON questionnaire_responses
    FOR EACH ROW
    EXECUTE FUNCTION update_reminder_timestamp();
