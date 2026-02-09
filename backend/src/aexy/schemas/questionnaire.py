"""Questionnaire import Pydantic schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class QuestionnaireQuestionOut(BaseModel):
    """Schema for a parsed questionnaire question."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    questionnaire_response_id: str
    serial_number: str | None
    domain: str | None
    question_text: str
    response_text: str | None
    possible_responses: str | None
    explanation: str | None
    is_section_header: bool
    response_type: str
    source_row: int | None
    created_at: datetime


class QuestionnaireResponseOut(BaseModel):
    """Schema for a questionnaire response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    title: str
    partner_name: str | None
    assessment_year: str | None
    source_filename: str
    total_questions: int
    total_suggestions_generated: int
    status: str
    extra_metadata: dict
    uploaded_by_id: str | None
    created_at: datetime
    updated_at: datetime


class QuestionnaireImportResult(BaseModel):
    """Result of importing a questionnaire file."""
    questionnaire: QuestionnaireResponseOut
    questions_count: int
    domains: list[str]
    domain_counts: dict[str, int]


class SkippedQuestionOut(BaseModel):
    """A question that was skipped during analysis, with optional link to existing item."""
    question_text: str
    domain: str | None = None
    reason: str  # "header" | "blank" | "negative" | "duplicate" | "no_suggestion"
    duplicate_of_id: str | None = None
    duplicate_of_type: str | None = None  # "suggestion" | "reminder" | "question"
    duplicate_of_title: str | None = None


class SkipSummary(BaseModel):
    """Aggregate counts by skip reason."""
    duplicates: int = 0
    negatives: int = 0
    blanks: int = 0
    headers: int = 0
    other: int = 0


class QuestionnaireAnalyzeResult(BaseModel):
    """Result of analyzing a questionnaire for suggestions."""
    questionnaire_id: str
    suggestions_generated: int
    skipped_questions: int
    domains_covered: list[str]
    skip_summary: SkipSummary | None = None
    skipped_duplicates: list[SkippedQuestionOut] = []


class QuestionnaireListResponse(BaseModel):
    """Schema for paginated questionnaire list."""
    questionnaires: list[QuestionnaireResponseOut]
    total: int
