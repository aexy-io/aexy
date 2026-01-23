"""Assessment platform Pydantic schemas."""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, EmailStr


# ============================================================================
# ENUMS
# ============================================================================


class AssessmentStatus(str, Enum):
    """Assessment lifecycle status."""

    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class QuestionType(str, Enum):
    """Types of assessment questions."""

    CODE = "code"
    MCQ = "mcq"
    SUBJECTIVE = "subjective"
    PSEUDO_CODE = "pseudo_code"
    AUDIO_REPEAT = "audio_repeat"
    AUDIO_TRANSCRIBE = "audio_transcribe"
    AUDIO_SPOKEN_ANSWER = "audio_spoken_answer"
    AUDIO_READ_SPEAK = "audio_read_speak"


class DifficultyLevel(str, Enum):
    """Question difficulty levels."""

    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class InvitationStatus(str, Enum):
    """Candidate invitation status."""

    PENDING = "pending"
    SENT = "sent"
    STARTED = "started"
    COMPLETED = "completed"
    EXPIRED = "expired"


class AttemptStatus(str, Enum):
    """Assessment attempt status."""

    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    TERMINATED = "terminated"
    EVALUATED = "evaluated"


class ProctoringEventSeverity(str, Enum):
    """Proctoring event severity levels."""

    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class ProctoringEventType(str, Enum):
    """Types of proctoring events."""

    TAB_SWITCH = "tab_switch"
    FACE_NOT_DETECTED = "face_not_detected"
    MULTIPLE_FACES = "multiple_faces"
    FACE_OUT_OF_FRAME = "face_out_of_frame"
    COPY_PASTE_ATTEMPT = "copy_paste_attempt"
    FULLSCREEN_EXIT = "fullscreen_exit"
    BROWSER_RESIZE = "browser_resize"
    RIGHT_CLICK = "right_click"
    DEVTOOLS_OPEN = "devtools_open"


class StepStatus(str, Enum):
    """Wizard step completion status."""

    INCOMPLETE = "incomplete"
    COMPLETE = "complete"
    ERROR = "error"


class EvaluatedBy(str, Enum):
    """Evaluation method."""

    AI = "ai"
    MANUAL = "manual"
    AI_PLUS_MANUAL = "ai_plus_manual"


class Recommendation(str, Enum):
    """Candidate recommendation."""

    STRONG_YES = "strong_yes"
    YES = "yes"
    MAYBE = "maybe"
    NO = "no"


# ============================================================================
# SKILL SCHEMAS
# ============================================================================


class SkillConfig(BaseModel):
    """Skill configuration for assessment."""

    id: str
    name: str
    category: str | None = None
    weight: int | None = Field(default=None, ge=0, le=100)


# ============================================================================
# WIZARD STEP DATA SCHEMAS
# ============================================================================


class Step1Data(BaseModel):
    """Step 1: Assessment Details data."""

    title: str = Field(..., min_length=1, max_length=255)
    job_designation: str = Field(..., min_length=1, max_length=255)
    department: str | None = None
    experience_min: int = Field(default=0, ge=0)
    experience_max: int = Field(default=10, ge=0)
    include_freshers: bool = False
    skills: list[SkillConfig] = Field(default_factory=list, min_length=1)
    enable_skill_weights: bool = False
    description: str | None = Field(default=None, max_length=2000)


class QuestionTypeConfig(BaseModel):
    """Question type count configuration."""

    code: int = Field(default=0, ge=0)
    mcq: int = Field(default=0, ge=0)
    subjective: int = Field(default=0, ge=0)
    pseudo_code: int = Field(default=0, ge=0)


class FullStackConfig(BaseModel):
    """Full-stack assignment configuration."""

    type: str  # frontend, backend, fullstack, devops
    vm_template: str
    duration_minutes: int = Field(default=60, ge=15)
    starter_code: dict | None = None
    problem_statement: dict | None = None
    evaluation_config: dict | None = None


class TopicConfig(BaseModel):
    """Topic configuration for assessment."""

    id: str | None = None
    topic: str = Field(..., min_length=1, max_length=255)
    subtopics: list[str] = Field(default_factory=list)
    difficulty_level: DifficultyLevel = DifficultyLevel.MEDIUM
    question_types: QuestionTypeConfig = Field(default_factory=QuestionTypeConfig)
    fullstack_config: FullStackConfig | None = None
    estimated_time_minutes: int = Field(default=30, ge=5)
    max_score: int = Field(default=100, ge=1)
    additional_requirements: str | None = None


class Step2Data(BaseModel):
    """Step 2: Topic Distribution data."""

    topics: list[TopicConfig] = Field(default_factory=list, min_length=1)
    enable_ai_generation: bool = True
    total_duration_minutes: int | None = None
    total_questions: int | None = None


class ProctoringSettings(BaseModel):
    """Proctoring configuration."""

    enabled: bool = True
    enable_webcam: bool = True
    enable_screen_recording: bool = True
    enable_face_detection: bool = True
    enable_tab_tracking: bool = True
    enable_copy_paste_detection: bool = True
    enable_fullscreen_enforcement: bool = True
    allow_calculator: bool = False
    allow_ide: bool = False


class SecuritySettings(BaseModel):
    """Security configuration."""

    shuffle_questions: bool = True
    shuffle_options: bool = True
    prevent_copy_paste: bool = True
    prevent_right_click: bool = True
    prevent_devtools: bool = True
    require_fullscreen: bool = True
    max_violations_allowed: int = Field(default=5, ge=1)


class CandidateFieldConfig(BaseModel):
    """Candidate field configuration."""

    required: list[str] = Field(default_factory=lambda: ["name", "email"])
    optional: list[str] = Field(default_factory=lambda: ["phone", "linkedin_url"])
    custom: list[dict] = Field(default_factory=list)  # [{name, label, type, required}]


class ScheduleConfig(BaseModel):
    """Assessment schedule configuration."""

    start_date: datetime
    end_date: datetime
    time_zone: str = "UTC"
    access_window_hours: int | None = None  # None = anytime within window


class Step3Data(BaseModel):
    """Step 3: Schedule & Settings data."""

    schedule: ScheduleConfig
    proctoring_settings: ProctoringSettings = Field(default_factory=ProctoringSettings)
    security_settings: SecuritySettings = Field(default_factory=SecuritySettings)
    candidate_fields: CandidateFieldConfig = Field(default_factory=CandidateFieldConfig)
    max_attempts: int = Field(default=1, ge=1, le=3)
    passing_score_percent: int | None = Field(default=None, ge=0, le=100)


class CandidateInput(BaseModel):
    """Single candidate input."""

    email: EmailStr
    name: str = Field(..., min_length=1, max_length=255)
    phone: str | None = None
    source: str | None = None


class EmailTemplateConfig(BaseModel):
    """Email template configuration."""

    subject: str = Field(
        default="You're invited to take an assessment",
        max_length=255,
    )
    body: str = Field(
        default="Hello {{name}},\n\nYou have been invited to complete an assessment for {{position}}.\n\nPlease click the link below to begin:\n{{assessment_link}}\n\nDeadline: {{deadline}}\n\nBest regards,\n{{company_name}}",
        max_length=5000,
    )
    include_instructions: bool = True
    include_deadline: bool = True
    include_duration: bool = True


class Step4Data(BaseModel):
    """Step 4: Add Candidates data."""

    candidates: list[CandidateInput] = Field(default_factory=list)
    email_template: EmailTemplateConfig = Field(default_factory=EmailTemplateConfig)
    send_immediately: bool = False


class Step5Data(BaseModel):
    """Step 5: Review & Confirm data (read-only summary)."""

    confirmed: bool = False


# ============================================================================
# WIZARD STATUS
# ============================================================================


class WizardStepStatus(BaseModel):
    """Wizard step status."""

    step1: StepStatus = StepStatus.INCOMPLETE
    step2: StepStatus = StepStatus.INCOMPLETE
    step3: StepStatus = StepStatus.INCOMPLETE
    step4: StepStatus = StepStatus.INCOMPLETE
    step5: StepStatus = StepStatus.INCOMPLETE


class WizardStatusResponse(BaseModel):
    """Wizard status response."""

    current_step: int = Field(ge=1, le=5)
    step_status: WizardStepStatus
    is_draft: bool = True
    last_saved_at: datetime | None = None
    can_publish: bool = False
    validation_errors: dict[str, list[str]] = Field(default_factory=dict)


# ============================================================================
# ASSESSMENT SCHEMAS
# ============================================================================


class AssessmentBase(BaseModel):
    """Base assessment schema."""

    title: str = Field(..., min_length=1, max_length=255)
    job_designation: str = Field(..., min_length=1, max_length=255)
    department: str | None = None
    experience_min: int = Field(default=0, ge=0)
    experience_max: int = Field(default=10, ge=0)
    include_freshers: bool = False
    description: str | None = None


class AssessmentCreate(BaseModel):
    """Create assessment request (minimal for draft)."""

    title: str = Field(..., min_length=1, max_length=255)
    job_designation: str | None = None
    organization_id: str


class AssessmentUpdate(BaseModel):
    """Update assessment request."""

    title: str | None = None
    job_designation: str | None = None
    department: str | None = None
    experience_min: int | None = Field(default=None, ge=0)
    experience_max: int | None = Field(default=None, ge=0)
    include_freshers: bool | None = None
    skills: list[SkillConfig] | None = None
    enable_skill_weights: bool | None = None
    description: str | None = None
    schedule: ScheduleConfig | None = None
    proctoring_settings: ProctoringSettings | None = None
    security_settings: SecuritySettings | None = None
    candidate_fields: CandidateFieldConfig | None = None
    email_template: EmailTemplateConfig | None = None


class AssessmentSummary(BaseModel):
    """Assessment summary for list views."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    job_designation: str
    status: AssessmentStatus
    total_questions: int
    total_duration_minutes: int
    total_candidates: int = 0
    completed_candidates: int = 0
    average_score: float | None = None
    created_at: datetime
    published_at: datetime | None = None


class AssessmentResponse(BaseModel):
    """Full assessment response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str
    created_by: str | None = None
    title: str
    job_designation: str
    department: str | None = None
    experience_min: int
    experience_max: int
    include_freshers: bool
    skills: list[SkillConfig]
    enable_skill_weights: bool
    description: str | None = None
    schedule: dict | None = None
    proctoring_settings: dict | None = None
    security_settings: dict | None = None
    candidate_fields: dict | None = None
    email_template: dict | None = None
    topics: list[TopicConfig] = []
    total_questions: int
    total_duration_minutes: int
    total_candidates: int = 0
    max_score: int
    max_attempts: int = 1
    passing_score_percent: int = 60
    status: AssessmentStatus
    wizard_step: int
    wizard_step_status: dict
    published_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


# ============================================================================
# TOPIC SCHEMAS
# ============================================================================


class TopicCreateRequest(BaseModel):
    """Create topic request."""

    topic: str = Field(..., min_length=1, max_length=255)
    subtopics: list[str] = Field(default_factory=list)
    difficulty_level: DifficultyLevel = DifficultyLevel.MEDIUM
    question_types: QuestionTypeConfig = Field(default_factory=QuestionTypeConfig)
    fullstack_config: FullStackConfig | None = None
    estimated_time_minutes: int = Field(default=30, ge=5)
    max_score: int = Field(default=100, ge=1)
    additional_requirements: str | None = None


class TopicResponse(BaseModel):
    """Topic response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    assessment_id: str
    topic: str
    subtopics: list[str]
    difficulty_level: str
    question_types: dict
    fullstack_config: dict | None = None
    estimated_time_minutes: int
    max_score: int
    additional_requirements: str | None = None
    sequence_order: int
    created_at: datetime


class TopicSuggestionRequest(BaseModel):
    """Request for AI topic suggestions."""

    skills: list[str]
    job_designation: str
    experience_level: str | None = None
    count: int = Field(default=5, ge=1, le=10)


class TopicSuggestionResponse(BaseModel):
    """AI-suggested topics."""

    topics: list[TopicConfig]
    rationale: str | None = None


# ============================================================================
# QUESTION SCHEMAS
# ============================================================================


class MCQOption(BaseModel):
    """MCQ option."""

    id: str
    text: str
    is_correct: bool = False
    explanation: str | None = None


class TestCase(BaseModel):
    """Code test case."""

    id: str
    input: str
    expected_output: str
    is_hidden: bool = False
    weight: int = Field(default=1, ge=1)
    description: str | None = None


class QuestionExample(BaseModel):
    """Question example."""

    input: str
    output: str
    explanation: str | None = None


class QuestionBase(BaseModel):
    """Base question schema."""

    question_type: QuestionType
    difficulty: DifficultyLevel = DifficultyLevel.MEDIUM
    title: str = Field(..., min_length=1, max_length=500)
    problem_statement: str
    max_marks: int = Field(default=10, ge=1)
    estimated_time_minutes: int = Field(default=10, ge=1)


class QuestionCreate(QuestionBase):
    """Create question request."""

    topic_id: str | None = None
    input_format: str | None = None
    output_format: str | None = None
    examples: list[QuestionExample] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    hints: list[str] = Field(default_factory=list)

    # Code specific
    test_cases: list[TestCase] = Field(default_factory=list)
    starter_code: dict[str, str] = Field(default_factory=dict)
    allowed_languages: list[str] = Field(default_factory=list)
    vm_config: dict | None = None

    # MCQ specific
    options: list[MCQOption] = Field(default_factory=list)
    allow_multiple: bool = False

    # Subjective specific
    sample_answer: str | None = None
    key_points: list[str] = Field(default_factory=list)

    # Audio specific
    audio_url: str | None = None
    audio_transcript: str | None = None

    tags: list[str] = Field(default_factory=list)


class QuestionUpdate(BaseModel):
    """Update question request."""

    title: str | None = None
    problem_statement: str | None = None
    difficulty: DifficultyLevel | None = None
    max_marks: int | None = Field(default=None, ge=1)
    estimated_time_minutes: int | None = Field(default=None, ge=1)
    input_format: str | None = None
    output_format: str | None = None
    examples: list[QuestionExample] | None = None
    constraints: list[str] | None = None
    hints: list[str] | None = None
    test_cases: list[TestCase] | None = None
    starter_code: dict[str, str] | None = None
    options: list[MCQOption] | None = None
    sample_answer: str | None = None
    key_points: list[str] | None = None
    tags: list[str] | None = None


class QuestionResponse(BaseModel):
    """Question response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    assessment_id: str
    topic_id: str | None = None
    question_type: str
    difficulty: str
    title: str
    problem_statement: str
    input_format: str | None = None
    output_format: str | None = None
    examples: list[dict]
    constraints: list[str]
    hints: list[str]
    test_cases: list[dict]
    starter_code: dict
    allowed_languages: list[str]
    vm_config: dict | None = None
    options: list[dict]
    allow_multiple: bool
    sample_answer: str | None = None
    key_points: list[str]
    audio_url: str | None = None
    evaluation_rubric: dict
    max_marks: int
    estimated_time_minutes: int
    tags: list[str]
    sequence_order: int
    is_ai_generated: bool
    created_at: datetime


class QuestionGenerationRequest(BaseModel):
    """Request for AI question generation."""

    topic_id: str
    question_type: QuestionType
    difficulty: DifficultyLevel = DifficultyLevel.MEDIUM
    count: int = Field(default=1, ge=1, le=10)
    context: str | None = None  # Additional context for generation


class GeneratedQuestionResponse(BaseModel):
    """AI-generated question response."""

    questions: list[QuestionCreate]
    generation_metadata: dict | None = None


# ============================================================================
# CANDIDATE SCHEMAS
# ============================================================================


class CandidateCreate(BaseModel):
    """Create candidate request."""

    email: EmailStr
    name: str = Field(..., min_length=1, max_length=255)
    phone: str | None = None
    resume_url: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    portfolio_url: str | None = None
    source: str | None = None
    custom_fields: dict = Field(default_factory=dict)


class CandidateResponse(BaseModel):
    """Candidate response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str
    email: str
    name: str
    phone: str | None = None
    resume_url: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    portfolio_url: str | None = None
    source: str | None = None
    custom_fields: dict
    created_at: datetime


class CandidateImportRequest(BaseModel):
    """Bulk candidate import request."""

    candidates: list[CandidateCreate]


class CandidateImportResponse(BaseModel):
    """Bulk import response."""

    total: int
    imported: int
    duplicates: int
    errors: list[dict]  # [{row, email, error}]


# ============================================================================
# INVITATION SCHEMAS
# ============================================================================


class InvitationResponse(BaseModel):
    """Invitation response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    assessment_id: str
    candidate_id: str
    candidate: CandidateResponse
    invitation_token: str
    status: InvitationStatus
    invited_at: datetime
    email_sent_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    deadline: datetime | None = None


class InvitationWithAttempt(InvitationResponse):
    """Invitation with attempt summary."""

    attempt_count: int = 0
    latest_score: float | None = None
    latest_trust_score: float | None = None


# ============================================================================
# ATTEMPT & SUBMISSION SCHEMAS
# ============================================================================


class AttemptStartRequest(BaseModel):
    """Start assessment attempt request."""

    browser_info: dict | None = None
    device_info: dict | None = None


class AttemptResponse(BaseModel):
    """Attempt response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    invitation_id: str
    attempt_number: int
    status: AttemptStatus
    started_at: datetime
    completed_at: datetime | None = None
    time_taken_seconds: int | None = None
    total_score: float | None = None
    max_possible_score: int | None = None
    percentage_score: float | None = None
    trust_score: float | None = None
    strong_areas: list[str]
    weak_areas: list[str]
    recommendation: Recommendation | None = None


class SubmissionRequest(BaseModel):
    """Submit answer request."""

    content: dict  # {code, language} or {selected_options} or {answer_text} or {audio_url}
    time_taken_seconds: int = Field(ge=0)
    is_final: bool = True


class SubmissionResponse(BaseModel):
    """Submission response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    attempt_id: str
    question_id: str
    submission_type: str
    content: dict
    language: str | None = None
    time_taken_seconds: int
    submitted_at: datetime
    submission_count: int
    is_final: bool


# ============================================================================
# EVALUATION SCHEMAS
# ============================================================================


class TestCaseResult(BaseModel):
    """Test case execution result."""

    test_id: str
    passed: bool
    actual_output: str | None = None
    expected_output: str | None = None
    execution_time_ms: int | None = None
    error: str | None = None


class CodeReviewComment(BaseModel):
    """Code review comment."""

    line: int
    type: str  # suggestion, warning, error
    comment: str
    severity: str = "info"


class EvaluationResponse(BaseModel):
    """Evaluation response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    submission_id: str
    marks_obtained: float
    max_marks: int
    percentage: float | None = None
    feedback: str | None = None
    rubric_scores: dict
    test_case_results: list[TestCaseResult]
    code_quality_analysis: dict | None = None
    code_review_comments: list[CodeReviewComment]
    ai_analysis: dict | None = None
    evaluated_by: EvaluatedBy
    evaluated_at: datetime


# ============================================================================
# PROCTORING SCHEMAS
# ============================================================================


class ProctoringEventRequest(BaseModel):
    """Report proctoring event request."""

    event_type: ProctoringEventType
    event_data: dict = Field(default_factory=dict)
    screenshot_url: str | None = None


class ProctoringEventResponse(BaseModel):
    """Proctoring event response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    attempt_id: str
    event_type: str
    severity: ProctoringEventSeverity
    event_data: dict
    screenshot_url: str | None = None
    timestamp: datetime
    trust_score_deduction: float | None = None


class TrustScoreResponse(BaseModel):
    """Trust score breakdown."""

    score: float = Field(ge=0, le=100)
    category: str  # Excellent, Good, Fair, Poor
    total_violations: int
    violations_by_type: dict[str, int]
    critical_flags: list[str]
    events: list[ProctoringEventResponse]


# ============================================================================
# REPORT SCHEMAS
# ============================================================================


class AssessmentMetrics(BaseModel):
    """Assessment dashboard metrics."""

    total_candidates: int
    total_invitations: int
    unique_attempts: int
    attempt_rate: float  # percentage
    completion_rate: float  # percentage
    average_score: float | None = None
    average_trust_score: float | None = None


class CandidateProgress(BaseModel):
    """Candidate progress breakdown."""

    shortlisted: int
    not_evaluated: int
    rejected: int
    in_progress: int


class AssessmentReportResponse(BaseModel):
    """Assessment report response."""

    assessment: AssessmentSummary
    metrics: AssessmentMetrics
    candidate_progress: CandidateProgress
    score_distribution: list[dict]  # [{range, count}]
    topic_performance: list[dict]  # [{topic, average_score, average_time}]
    daily_invites: list[dict]  # [{date, count}]


class CandidateReportResponse(BaseModel):
    """Individual candidate report."""

    candidate: CandidateResponse
    attempt: AttemptResponse
    trust_score: TrustScoreResponse
    submissions: list[SubmissionResponse]
    evaluations: list[EvaluationResponse]
    topic_scores: list[dict]  # [{topic, score, max_score, percentage}]
    strong_areas: list[str]
    weak_areas: list[str]
    overall_feedback: str | None = None
    recommendation: Recommendation | None = None


class QuestionAnalysis(BaseModel):
    """Question-level analysis."""

    question_id: str
    question_title: str
    question_type: QuestionType
    difficulty: DifficultyLevel
    total_attempts: int
    average_score: float
    average_time_seconds: int
    success_rate: float  # percentage who scored > 50%
    common_mistakes: list[str]


class AssessmentAnalyticsResponse(BaseModel):
    """Assessment analytics response."""

    assessment_id: str
    metrics: AssessmentMetrics
    question_analysis: list[QuestionAnalysis]
    skill_coverage: list[dict]  # [{skill, questions_count, average_score}]
    difficulty_breakdown: dict[str, dict]  # {easy: {count, avg_score}, ...}
    time_analysis: dict  # {average_total, fastest, slowest, by_question_type}


# ============================================================================
# ASSESSMENT TAKE (CANDIDATE-FACING) SCHEMAS
# ============================================================================


class AssessmentInfoResponse(BaseModel):
    """Assessment info for candidate (public)."""

    id: str
    title: str
    job_designation: str
    description: str | None = None
    total_questions: int
    total_duration_minutes: int
    proctoring_enabled: bool
    required_fields: list[str]
    instructions: list[str]
    deadline: datetime | None = None


class QuestionForCandidate(BaseModel):
    """Question view for candidate (no answers)."""

    id: str
    sequence_number: int
    question_type: str
    difficulty: str
    title: str
    problem_statement: str
    input_format: str | None = None
    output_format: str | None = None
    examples: list[QuestionExample]
    constraints: list[str]
    hints: list[str]
    starter_code: dict  # For code questions
    allowed_languages: list[str]
    options: list[dict]  # For MCQ (without is_correct)
    allow_multiple: bool
    audio_url: str | None = None
    max_marks: int
    estimated_time_minutes: int


class AssessmentSessionResponse(BaseModel):
    """Active assessment session."""

    attempt_id: str
    assessment: AssessmentInfoResponse
    questions: list[QuestionForCandidate]
    current_question_index: int
    time_remaining_seconds: int
    submissions: dict[str, dict]  # {question_id: submission_data}


# ============================================================================
# PUBLISH SCHEMAS
# ============================================================================


class PublishRequest(BaseModel):
    """Publish assessment request."""

    send_invitations: bool = True
    schedule_override: ScheduleConfig | None = None


class PublishResponse(BaseModel):
    """Publish response."""

    assessment_id: str
    status: AssessmentStatus
    published_at: datetime
    total_invitations: int
    emails_sent: int
    public_link: str | None = None


class PrePublishCheckResponse(BaseModel):
    """Pre-publish validation check."""

    can_publish: bool
    warnings: list[str] = []
    errors: list[str] = []
    issues: list[str] = []  # Step-specific issues with step references for UI display
    checklist: dict[str, bool | int] = {}  # {has_questions, has_candidates, actual_question_count, ...}
