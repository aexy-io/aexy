"""Assessment platform models: assessments, questions, candidates, and evaluations."""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer


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

    STARTED = "started"  # Attempt created, candidate hasn't answered yet
    IN_PROGRESS = "in_progress"  # Candidate is actively answering questions
    COMPLETED = "completed"  # Candidate finished or time ran out
    TERMINATED = "terminated"  # Manually terminated (e.g., cheating detected)
    EVALUATED = "evaluated"  # Grading completed


class ProctoringEventSeverity(str, Enum):
    """Proctoring event severity levels."""

    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class Assessment(Base):
    """Assessment definition with configuration and settings."""

    __tablename__ = "assessments"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    organization_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        index=True,
    )
    created_by: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Step 1: Basic Information
    title: Mapped[str] = mapped_column(String(255))
    job_designation: Mapped[str] = mapped_column(String(255))
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    experience_min: Mapped[int] = mapped_column(Integer, default=0)
    experience_max: Mapped[int] = mapped_column(Integer, default=10)
    include_freshers: Mapped[bool] = mapped_column(Boolean, default=False)
    skills: Mapped[list] = mapped_column(JSONB, default=list)  # [{id, name, category, weight}]
    enable_skill_weights: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Step 2: Topic Distribution (stored in AssessmentTopic relation)

    # Step 3: Schedule & Settings
    schedule: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # {start_date, end_date, time_zone, access_window_hours}
    proctoring_settings: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # {webcam, screen_recording, face_detection, tab_tracking, ...}
    security_settings: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # {shuffleQuestions, shuffleOptions, preventCopyPaste, ...}
    candidate_fields: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # {required: [...], optional: [...], custom: [...]}

    # Step 4: Email Template
    email_template: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # {subject, body, include_instructions, include_deadline}

    # Computed/Derived
    total_questions: Mapped[int] = mapped_column(Integer, default=0)
    total_duration_minutes: Mapped[int] = mapped_column(Integer, default=0)
    max_score: Mapped[int] = mapped_column(Integer, default=0)

    # Settings from Step 3
    max_attempts: Mapped[int] = mapped_column(Integer, default=1)
    passing_score_percent: Mapped[int] = mapped_column(Integer, default=60)

    # Status
    status: Mapped[str] = mapped_column(
        String(20),
        default=AssessmentStatus.DRAFT.value,
        index=True,
    )
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Public access token for anonymous assessment taking
    public_token: Mapped[str | None] = mapped_column(
        String(64),
        unique=True,
        index=True,
        nullable=True,
    )

    # Wizard State
    wizard_step: Mapped[int] = mapped_column(Integer, default=1)
    wizard_step_status: Mapped[dict] = mapped_column(
        JSONB,
        default=lambda: {
            "step1": "incomplete",
            "step2": "incomplete",
            "step3": "incomplete",
            "step4": "incomplete",
            "step5": "incomplete",
        },
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    creator: Mapped["Developer"] = relationship(
        "Developer",
        foreign_keys=[created_by],
    )
    topics: Mapped[list["AssessmentTopic"]] = relationship(
        "AssessmentTopic",
        back_populates="assessment",
        cascade="all, delete-orphan",
        order_by="AssessmentTopic.sequence_order",
    )
    questions: Mapped[list["Question"]] = relationship(
        "Question",
        back_populates="assessment",
        cascade="all, delete-orphan",
    )
    invitations: Mapped[list["AssessmentInvitation"]] = relationship(
        "AssessmentInvitation",
        back_populates="assessment",
        cascade="all, delete-orphan",
    )


class AssessmentTopic(Base):
    """Topic configuration within an assessment."""

    __tablename__ = "assessment_topics"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    assessment_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("assessments.id", ondelete="CASCADE"),
        index=True,
    )

    topic: Mapped[str] = mapped_column(String(255))
    subtopics: Mapped[list] = mapped_column(JSONB, default=list)  # ["subtopic1", "subtopic2"]
    difficulty_level: Mapped[str] = mapped_column(
        String(20),
        default=DifficultyLevel.MEDIUM.value,
    )

    # Question type distribution
    question_types: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # {code: 2, mcq: 5, subjective: 1}

    # Full-stack assignment config (for code questions)
    fullstack_config: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )  # {type, vm_template, starter_code, problem_statement, ...}

    estimated_time_minutes: Mapped[int] = mapped_column(Integer, default=30)
    max_score: Mapped[int] = mapped_column(Integer, default=100)
    additional_requirements: Mapped[str | None] = mapped_column(Text, nullable=True)
    sequence_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    assessment: Mapped["Assessment"] = relationship(
        "Assessment",
        back_populates="topics",
    )
    questions: Mapped[list["Question"]] = relationship(
        "Question",
        back_populates="topic",
    )


class Question(Base):
    """Assessment question with content and evaluation criteria."""

    __tablename__ = "assessment_questions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    assessment_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("assessments.id", ondelete="CASCADE"),
        index=True,
    )
    topic_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("assessment_topics.id", ondelete="SET NULL"),
        nullable=True,
    )

    question_type: Mapped[str] = mapped_column(String(30))
    difficulty: Mapped[str] = mapped_column(
        String(20),
        default=DifficultyLevel.MEDIUM.value,
    )

    # Question content
    title: Mapped[str] = mapped_column(String(500))
    problem_statement: Mapped[str] = mapped_column(Text)
    input_format: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_format: Mapped[str | None] = mapped_column(Text, nullable=True)
    examples: Mapped[list] = mapped_column(
        JSONB,
        default=list,
    )  # [{input, output, explanation}]
    constraints: Mapped[list] = mapped_column(JSONB, default=list)
    hints: Mapped[list] = mapped_column(JSONB, default=list)

    # Code question specific
    test_cases: Mapped[list] = mapped_column(
        JSONB,
        default=list,
    )  # [{input, expected_output, is_hidden, weight}]
    starter_code: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # {python: "...", javascript: "...", ...}
    allowed_languages: Mapped[list] = mapped_column(
        JSONB,
        default=list,
    )  # ["python", "javascript", ...]
    vm_config: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )  # {template, cpu, memory, timeout, ...}

    # MCQ specific
    options: Mapped[list] = mapped_column(
        JSONB,
        default=list,
    )  # [{id, text, is_correct, explanation}]
    allow_multiple: Mapped[bool] = mapped_column(Boolean, default=False)

    # Subjective specific
    sample_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_points: Mapped[list] = mapped_column(JSONB, default=list)  # Points to look for

    # Audio question specific
    audio_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    audio_transcript: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Evaluation
    evaluation_rubric: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # {criteria: [{name, weight, description}]}
    max_marks: Mapped[int] = mapped_column(Integer, default=10)
    estimated_time_minutes: Mapped[int] = mapped_column(Integer, default=10)

    # Metadata
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    sequence_order: Mapped[int] = mapped_column(Integer, default=0)
    is_ai_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    generation_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Soft delete
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )
    deleted_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    assessment: Mapped["Assessment"] = relationship(
        "Assessment",
        back_populates="questions",
    )
    topic: Mapped["AssessmentTopic | None"] = relationship(
        "AssessmentTopic",
        back_populates="questions",
    )
    submissions: Mapped[list["QuestionSubmission"]] = relationship(
        "QuestionSubmission",
        back_populates="question",
    )
    analytics: Mapped["QuestionAnalytics | None"] = relationship(
        "QuestionAnalytics",
        back_populates="question",
        uselist=False,
    )


class Candidate(Base):
    """Candidate profile for assessment invitations."""

    __tablename__ = "assessment_candidates"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    organization_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        index=True,
    )

    email: Mapped[str] = mapped_column(String(255), index=True)
    name: Mapped[str] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Profile links
    resume_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    github_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    portfolio_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Custom fields collected during assessment
    custom_fields: Mapped[dict] = mapped_column(JSONB, default=dict)

    # Source tracking
    source: Mapped[str | None] = mapped_column(String(100), nullable=True)  # LinkedIn, Referral, etc.
    source_details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    invitations: Mapped[list["AssessmentInvitation"]] = relationship(
        "AssessmentInvitation",
        back_populates="candidate",
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "email", name="uq_candidate_org_email"),
    )


class AssessmentInvitation(Base):
    """Invitation linking a candidate to an assessment."""

    __tablename__ = "assessment_invitations"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    assessment_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("assessments.id", ondelete="CASCADE"),
        index=True,
    )
    candidate_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("assessment_candidates.id", ondelete="CASCADE"),
        index=True,
    )

    # Unique token for accessing assessment
    invitation_token: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default=InvitationStatus.PENDING.value,
        index=True,
    )

    # Timing
    invited_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    email_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    deadline: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Email tracking
    email_opens: Mapped[int] = mapped_column(Integer, default=0)
    last_email_opened_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    assessment: Mapped["Assessment"] = relationship(
        "Assessment",
        back_populates="invitations",
    )
    candidate: Mapped["Candidate"] = relationship(
        "Candidate",
        back_populates="invitations",
    )
    attempts: Mapped[list["AssessmentAttempt"]] = relationship(
        "AssessmentAttempt",
        back_populates="invitation",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint("assessment_id", "candidate_id", name="uq_assessment_candidate"),
    )


class AssessmentAttempt(Base):
    """A candidate's attempt at completing an assessment."""

    __tablename__ = "assessment_attempts"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    invitation_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("assessment_invitations.id", ondelete="CASCADE"),
        index=True,
    )

    attempt_number: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(
        String(20),
        default=AttemptStatus.IN_PROGRESS.value,
        index=True,
    )

    # Timing
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    time_taken_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Scoring
    total_score: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2),
        nullable=True,
    )
    max_possible_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    percentage_score: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2),
        nullable=True,
    )

    # Trust/Proctoring
    trust_score: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2),
        nullable=True,
    )
    proctoring_summary: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # {total_violations, by_type: {...}, flags: [...]}

    # Recording URLs
    webcam_recording_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    screen_recording_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Session info
    ip_addresses: Mapped[list] = mapped_column(JSONB, default=list)
    browser_info: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    device_info: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Evaluation
    evaluated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    overall_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    strong_areas: Mapped[list] = mapped_column(JSONB, default=list)
    weak_areas: Mapped[list] = mapped_column(JSONB, default=list)
    recommendation: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )  # strong_yes, yes, maybe, no

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    invitation: Mapped["AssessmentInvitation"] = relationship(
        "AssessmentInvitation",
        back_populates="attempts",
    )
    submissions: Mapped[list["QuestionSubmission"]] = relationship(
        "QuestionSubmission",
        back_populates="attempt",
        cascade="all, delete-orphan",
    )
    proctoring_events: Mapped[list["ProctoringEvent"]] = relationship(
        "ProctoringEvent",
        back_populates="attempt",
        cascade="all, delete-orphan",
    )


class QuestionSubmission(Base):
    """A candidate's submission for a question."""

    __tablename__ = "question_submissions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    attempt_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("assessment_attempts.id", ondelete="CASCADE"),
        index=True,
    )
    question_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("assessment_questions.id", ondelete="CASCADE"),
        index=True,
    )

    # Submission content (varies by question type)
    submission_type: Mapped[str] = mapped_column(String(30))  # code, mcq, subjective, audio
    content: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # {code, language} or {selected_options} or {answer_text} or {audio_url}

    # For code submissions
    language: Mapped[str | None] = mapped_column(String(50), nullable=True)
    code_snapshots: Mapped[list] = mapped_column(
        JSONB,
        default=list,
    )  # [{timestamp, code}] for tracking progress

    # Timing
    time_taken_seconds: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Submission tracking
    submission_count: Mapped[int] = mapped_column(Integer, default=1)
    is_final: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    attempt: Mapped["AssessmentAttempt"] = relationship(
        "AssessmentAttempt",
        back_populates="submissions",
    )
    question: Mapped["Question"] = relationship(
        "Question",
        back_populates="submissions",
    )
    evaluation: Mapped["SubmissionEvaluation | None"] = relationship(
        "SubmissionEvaluation",
        back_populates="submission",
        uselist=False,
    )


class SubmissionEvaluation(Base):
    """Evaluation result for a question submission."""

    __tablename__ = "submission_evaluations"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    submission_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("question_submissions.id", ondelete="CASCADE"),
        unique=True,
    )

    # Scoring
    marks_obtained: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    max_marks: Mapped[int] = mapped_column(Integer, default=10)
    percentage: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)

    # Feedback
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    rubric_scores: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # {criterion_name: {score, max, feedback}}

    # Code evaluation specific
    test_case_results: Mapped[list] = mapped_column(
        JSONB,
        default=list,
    )  # [{test_id, passed, actual_output, expected_output, execution_time}]
    code_quality_analysis: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )  # {complexity, readability, best_practices, security}
    code_review_comments: Mapped[list] = mapped_column(
        JSONB,
        default=list,
    )  # [{line, type, comment, severity}]

    # AI analysis
    ai_analysis: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )  # {strengths, weaknesses, suggestions, overall_assessment}

    # Evaluation metadata
    evaluated_by: Mapped[str] = mapped_column(
        String(20),
        default="ai",
    )  # ai, manual, ai_plus_manual
    evaluator_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
    )  # For manual evaluations
    evaluated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    submission: Mapped["QuestionSubmission"] = relationship(
        "QuestionSubmission",
        back_populates="evaluation",
    )


class ProctoringEvent(Base):
    """Proctoring event during an assessment attempt."""

    __tablename__ = "proctoring_events"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    attempt_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("assessment_attempts.id", ondelete="CASCADE"),
        index=True,
    )

    event_type: Mapped[str] = mapped_column(
        String(50),
        index=True,
    )  # tab_switch, face_not_detected, multiple_faces, etc.
    severity: Mapped[str] = mapped_column(
        String(20),
        default=ProctoringEventSeverity.INFO.value,
    )

    # Event data
    event_data: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # {details specific to event type}
    screenshot_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timing
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    duration_seconds: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )  # For events like face_not_detected

    # Trust score impact
    trust_score_deduction: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2),
        nullable=True,
    )

    # Relationships
    attempt: Mapped["AssessmentAttempt"] = relationship(
        "AssessmentAttempt",
        back_populates="proctoring_events",
    )


class QuestionBank(Base):
    """Reusable question bank for organizations."""

    __tablename__ = "question_bank"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    organization_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
        index=True,
    )  # None = global/shared

    # Question metadata
    topic: Mapped[str] = mapped_column(String(255), index=True)
    subtopic: Mapped[str | None] = mapped_column(String(255), nullable=True)
    question_type: Mapped[str] = mapped_column(String(30), index=True)
    difficulty: Mapped[str] = mapped_column(String(20), index=True)

    # Full question data
    question_data: Mapped[dict] = mapped_column(JSONB)  # Complete question structure

    # Usage stats
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    average_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    average_time_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Metadata
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)

    created_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class QuestionAnalytics(Base):
    """Cached analytics for individual questions."""

    __tablename__ = "question_analytics"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    question_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("assessment_questions.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )

    # Attempt metrics
    total_attempts: Mapped[int] = mapped_column(Integer, default=0)
    unique_candidates: Mapped[int] = mapped_column(Integer, default=0)
    total_correct: Mapped[int] = mapped_column(Integer, default=0)  # For MCQ

    # Score metrics
    average_score_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        default=0,
    )
    median_score_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        default=0,
    )
    min_score_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        default=0,
    )
    max_score_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        default=0,
    )

    # Time metrics
    average_time_seconds: Mapped[int] = mapped_column(Integer, default=0)
    median_time_seconds: Mapped[int] = mapped_column(Integer, default=0)
    min_time_seconds: Mapped[int] = mapped_column(Integer, default=0)
    max_time_seconds: Mapped[int] = mapped_column(Integer, default=0)

    # Distribution data
    score_distribution: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # {"0-20": 5, "21-40": 10, ...}
    time_distribution: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # {"0-60": 3, "61-120": 8, ...}

    # MCQ specific
    option_selection_distribution: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )  # {"A": 10, "B": 25, "C": 5, "D": 60}

    # Code specific
    test_case_pass_rates: Mapped[list | None] = mapped_column(
        JSONB,
        nullable=True,
    )  # [{"test_id": "1", "pass_rate": 0.85}, ...]

    # Difficulty calibration
    stated_difficulty: Mapped[str | None] = mapped_column(String(20), nullable=True)
    calculated_difficulty: Mapped[str | None] = mapped_column(String(20), nullable=True)
    difficulty_score: Mapped[Decimal | None] = mapped_column(
        Numeric(3, 2),
        nullable=True,
    )  # 0.00 to 1.00 (1 = hardest)

    # Quality indicators
    skip_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    completion_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    partial_credit_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)

    # Timestamps
    last_calculated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    question: Mapped["Question"] = relationship(
        "Question",
        back_populates="analytics",
    )
