-- Migration: Add question management features
-- Adds soft delete columns to assessment_questions table
-- Creates question_analytics table for caching question statistics

-- Add soft delete columns to assessment_questions
ALTER TABLE assessment_questions
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL REFERENCES developers(id) ON DELETE SET NULL;

-- Add index for soft delete queries
CREATE INDEX IF NOT EXISTS idx_assessment_questions_deleted_at
ON assessment_questions(deleted_at);

-- Create question_analytics table
CREATE TABLE IF NOT EXISTS question_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL UNIQUE REFERENCES assessment_questions(id) ON DELETE CASCADE,

    -- Attempt metrics
    total_attempts INTEGER NOT NULL DEFAULT 0,
    unique_candidates INTEGER NOT NULL DEFAULT 0,
    total_correct INTEGER NOT NULL DEFAULT 0,

    -- Score metrics
    average_score_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
    median_score_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
    min_score_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
    max_score_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,

    -- Time metrics
    average_time_seconds INTEGER NOT NULL DEFAULT 0,
    median_time_seconds INTEGER NOT NULL DEFAULT 0,
    min_time_seconds INTEGER NOT NULL DEFAULT 0,
    max_time_seconds INTEGER NOT NULL DEFAULT 0,

    -- Distribution data
    score_distribution JSONB NOT NULL DEFAULT '{}',
    time_distribution JSONB NOT NULL DEFAULT '{}',

    -- MCQ specific
    option_selection_distribution JSONB NULL,

    -- Code specific
    test_case_pass_rates JSONB NULL,

    -- Difficulty calibration
    stated_difficulty VARCHAR(20) NULL,
    calculated_difficulty VARCHAR(20) NULL,
    difficulty_score NUMERIC(3, 2) NULL,

    -- Quality indicators
    skip_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
    completion_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
    partial_credit_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,

    -- Timestamps
    last_calculated_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add index for question_id lookups
CREATE INDEX IF NOT EXISTS idx_question_analytics_question_id
ON question_analytics(question_id);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_question_analytics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_question_analytics_updated_at ON question_analytics;
CREATE TRIGGER trigger_question_analytics_updated_at
    BEFORE UPDATE ON question_analytics
    FOR EACH ROW
    EXECUTE FUNCTION update_question_analytics_updated_at();
