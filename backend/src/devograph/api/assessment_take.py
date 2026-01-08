"""API endpoints for candidates taking assessments."""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.models.assessment import (
    Assessment,
    AssessmentInvitation,
    AssessmentAttempt,
    Question,
    QuestionSubmission,
    AssessmentTopic,
    InvitationStatus,
    AttemptStatus,
    QuestionType,
)
from aexy.services.assessment_evaluation_service import AssessmentEvaluationService
from aexy.services.proctoring_service import ProctoringService

router = APIRouter(prefix="/take", tags=["assessment-take"])


# ============================================================================
# Pydantic Models for Requests/Responses
# ============================================================================

class AssessmentInfoResponse(BaseModel):
    """Assessment information for candidates."""
    assessment_id: str
    title: str
    job_designation: str | None
    description: str | None
    total_questions: int
    total_duration_minutes: int
    topics: list[dict[str, Any]]
    instructions: str | None
    proctoring_enabled: bool
    webcam_required: bool
    fullscreen_required: bool
    deadline: datetime | None
    can_start: bool
    message: str | None = None


class StartAttemptRequest(BaseModel):
    """Request to start an assessment attempt."""
    candidate_name: str | None = None
    candidate_email: str | None = None


class StartAttemptResponse(BaseModel):
    """Response after starting an attempt."""
    attempt_id: str
    started_at: datetime
    time_remaining_seconds: int
    total_questions: int


class QuestionResponse(BaseModel):
    """Question data for candidate."""
    id: str
    sequence: int
    question_type: str
    difficulty: str
    problem_statement: str
    options: list[dict[str, Any]] | None = None
    starter_code: dict[str, str] | None = None
    constraints: list[str] | None = None
    examples: list[dict[str, Any]] | None = None
    max_marks: int
    time_limit_seconds: int | None = None


class QuestionsResponse(BaseModel):
    """All questions for an attempt."""
    questions: list[QuestionResponse]
    total_questions: int
    time_remaining_seconds: int


class SubmitAnswerRequest(BaseModel):
    """Request to submit an answer."""
    content: dict[str, Any] = Field(..., description="Answer content")
    language: str | None = Field(None, description="Programming language for code submissions")
    time_spent_seconds: int = Field(0, description="Time spent on this question")


class SubmitAnswerResponse(BaseModel):
    """Response after submitting an answer."""
    submission_id: str
    submitted_at: datetime
    questions_remaining: int


class CompleteAssessmentResponse(BaseModel):
    """Response after completing the assessment."""
    attempt_id: str
    completed_at: datetime
    status: str
    message: str


class ProctoringEventRequest(BaseModel):
    """Request to log a proctoring event."""
    event_type: str = Field(..., description="Type of event")
    data: dict[str, Any] | None = Field(None, description="Additional event data")
    screenshot_url: str | None = Field(None, description="Screenshot URL if available")


class ProctoringEventResponse(BaseModel):
    """Response after logging a proctoring event."""
    event_id: str
    trust_score: int


# ============================================================================
# Helper Functions
# ============================================================================

async def get_invitation_by_token(
    token: str,
    db: AsyncSession,
) -> AssessmentInvitation:
    """Get invitation by token and validate it."""
    query = select(AssessmentInvitation).where(
        AssessmentInvitation.token == token
    )
    result = await db.execute(query)
    invitation = result.scalar_one_or_none()

    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid assessment link",
        )

    return invitation


async def get_assessment_for_invitation(
    invitation: AssessmentInvitation,
    db: AsyncSession,
) -> Assessment:
    """Get the assessment for an invitation."""
    query = select(Assessment).where(Assessment.id == invitation.assessment_id)
    result = await db.execute(query)
    assessment = result.scalar_one_or_none()

    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found",
        )

    return assessment


async def get_active_attempt(
    invitation: AssessmentInvitation,
    db: AsyncSession,
) -> AssessmentAttempt | None:
    """Get any active attempt for this invitation."""
    query = select(AssessmentAttempt).where(
        AssessmentAttempt.invitation_id == invitation.id,
        AssessmentAttempt.status.in_([AttemptStatus.IN_PROGRESS, AttemptStatus.STARTED]),
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/{token}", response_model=AssessmentInfoResponse)
async def get_assessment_info(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> AssessmentInfoResponse:
    """Get assessment information for a candidate.

    This is the landing page data before starting the assessment.
    """
    invitation = await get_invitation_by_token(token, db)
    assessment = await get_assessment_for_invitation(invitation, db)

    # Check if assessment is active
    if assessment.status.value != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This assessment is not currently active",
        )

    # Check deadline
    can_start = True
    message = None

    if invitation.deadline and datetime.now(timezone.utc) > invitation.deadline:
        can_start = False
        message = "The deadline for this assessment has passed"

    if invitation.status == InvitationStatus.COMPLETED:
        can_start = False
        message = "You have already completed this assessment"

    if invitation.status == InvitationStatus.EXPIRED:
        can_start = False
        message = "This invitation has expired"

    # Check schedule
    schedule = assessment.schedule or {}
    if schedule.get("start_date"):
        start_date = datetime.fromisoformat(schedule["start_date"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) < start_date:
            can_start = False
            message = f"This assessment will be available from {start_date.strftime('%B %d, %Y')}"

    if schedule.get("end_date"):
        end_date = datetime.fromisoformat(schedule["end_date"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > end_date:
            can_start = False
            message = "This assessment is no longer available"

    # Get topics
    topics_query = select(AssessmentTopic).where(
        AssessmentTopic.assessment_id == assessment.id
    ).order_by(AssessmentTopic.sequence)
    topics_result = await db.execute(topics_query)
    topics = topics_result.scalars().all()

    topics_data = [
        {
            "name": t.name,
            "duration_minutes": t.duration_minutes,
            "question_count": t.question_count,
        }
        for t in topics
    ]

    # Proctoring settings
    proctoring = assessment.proctoring_settings or {}

    return AssessmentInfoResponse(
        assessment_id=str(assessment.id),
        title=assessment.title,
        job_designation=assessment.job_designation,
        description=assessment.description,
        total_questions=assessment.total_questions or 0,
        total_duration_minutes=assessment.total_duration_minutes or 0,
        topics=topics_data,
        instructions=assessment.instructions,
        proctoring_enabled=proctoring.get("enabled", False),
        webcam_required=proctoring.get("webcam_required", False),
        fullscreen_required=proctoring.get("fullscreen_required", False),
        deadline=invitation.deadline,
        can_start=can_start,
        message=message,
    )


@router.post("/{token}/start", response_model=StartAttemptResponse)
async def start_assessment(
    token: str,
    request: StartAttemptRequest | None = None,
    db: AsyncSession = Depends(get_db),
) -> StartAttemptResponse:
    """Start an assessment attempt."""
    invitation = await get_invitation_by_token(token, db)
    assessment = await get_assessment_for_invitation(invitation, db)

    # Check if can start
    info = await get_assessment_info(token, db)
    if not info.can_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=info.message or "Cannot start this assessment",
        )

    # Check for existing active attempt
    existing_attempt = await get_active_attempt(invitation, db)
    if existing_attempt:
        # Return existing attempt info
        time_remaining = (assessment.total_duration_minutes or 60) * 60
        if existing_attempt.started_at:
            elapsed = (datetime.now(timezone.utc) - existing_attempt.started_at).total_seconds()
            time_remaining = max(0, time_remaining - int(elapsed))

        return StartAttemptResponse(
            attempt_id=str(existing_attempt.id),
            started_at=existing_attempt.started_at or datetime.now(timezone.utc),
            time_remaining_seconds=time_remaining,
            total_questions=assessment.total_questions or 0,
        )

    # Check max attempts
    attempts_query = select(AssessmentAttempt).where(
        AssessmentAttempt.invitation_id == invitation.id
    )
    attempts_result = await db.execute(attempts_query)
    existing_attempts = len(attempts_result.scalars().all())

    max_attempts = assessment.max_attempts or 1
    if existing_attempts >= max_attempts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum attempts ({max_attempts}) exceeded",
        )

    # Create new attempt
    attempt = AssessmentAttempt(
        invitation_id=invitation.id,
        status=AttemptStatus.IN_PROGRESS,
        started_at=datetime.now(timezone.utc),
        attempt_number=existing_attempts + 1,
    )

    # Update invitation status
    invitation.status = InvitationStatus.IN_PROGRESS

    db.add(attempt)
    await db.commit()
    await db.refresh(attempt)

    return StartAttemptResponse(
        attempt_id=str(attempt.id),
        started_at=attempt.started_at,
        time_remaining_seconds=(assessment.total_duration_minutes or 60) * 60,
        total_questions=assessment.total_questions or 0,
    )


@router.get("/{token}/questions", response_model=QuestionsResponse)
async def get_questions(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> QuestionsResponse:
    """Get questions for the assessment."""
    invitation = await get_invitation_by_token(token, db)
    assessment = await get_assessment_for_invitation(invitation, db)

    # Get active attempt
    attempt = await get_active_attempt(invitation, db)
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please start the assessment first",
        )

    # Check time
    time_remaining = (assessment.total_duration_minutes or 60) * 60
    if attempt.started_at:
        elapsed = (datetime.now(timezone.utc) - attempt.started_at).total_seconds()
        time_remaining = max(0, int((assessment.total_duration_minutes or 60) * 60 - elapsed))

    if time_remaining <= 0:
        # Auto-submit
        attempt.status = AttemptStatus.COMPLETED
        attempt.completed_at = datetime.now(timezone.utc)
        await db.commit()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Time limit exceeded",
        )

    # Get questions
    questions_query = select(Question).where(
        Question.assessment_id == assessment.id
    ).order_by(Question.sequence)
    questions_result = await db.execute(questions_query)
    questions = questions_result.scalars().all()

    # Check security settings for shuffling
    security = assessment.security_settings or {}
    if security.get("shuffle_questions", False):
        import random
        questions = list(questions)
        random.shuffle(questions)

    questions_data = []
    for q in questions:
        options = q.options
        if options and security.get("shuffle_options", False):
            import random
            options = list(options)
            random.shuffle(options)
            # Remove is_correct from options sent to candidate
            options = [
                {k: v for k, v in opt.items() if k != "is_correct" and k != "explanation"}
                for opt in options
            ]

        questions_data.append(
            QuestionResponse(
                id=str(q.id),
                sequence=q.sequence or 0,
                question_type=q.question_type.value,
                difficulty=q.difficulty.value,
                problem_statement=q.problem_statement or "",
                options=options,
                starter_code=q.starter_code,
                constraints=q.constraints,
                examples=q.examples,
                max_marks=q.max_marks or 0,
                time_limit_seconds=q.time_limit_seconds,
            )
        )

    return QuestionsResponse(
        questions=questions_data,
        total_questions=len(questions_data),
        time_remaining_seconds=time_remaining,
    )


@router.post("/{token}/submit/{question_id}", response_model=SubmitAnswerResponse)
async def submit_answer(
    token: str,
    question_id: str,
    request: SubmitAnswerRequest,
    db: AsyncSession = Depends(get_db),
) -> SubmitAnswerResponse:
    """Submit an answer for a question."""
    invitation = await get_invitation_by_token(token, db)
    assessment = await get_assessment_for_invitation(invitation, db)

    # Get active attempt
    attempt = await get_active_attempt(invitation, db)
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active attempt found",
        )

    # Check time
    if attempt.started_at:
        elapsed = (datetime.now(timezone.utc) - attempt.started_at).total_seconds()
        if elapsed > (assessment.total_duration_minutes or 60) * 60:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Time limit exceeded",
            )

    # Get question
    question_query = select(Question).where(
        Question.id == question_id,
        Question.assessment_id == assessment.id,
    )
    question_result = await db.execute(question_query)
    question = question_result.scalar_one_or_none()

    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question not found",
        )

    # Check for existing submission
    existing_query = select(QuestionSubmission).where(
        QuestionSubmission.attempt_id == attempt.id,
        QuestionSubmission.question_id == question_id,
    )
    existing_result = await db.execute(existing_query)
    existing = existing_result.scalar_one_or_none()

    if existing:
        # Update existing submission
        existing.content = request.content
        existing.language = request.language
        existing.submitted_at = datetime.now(timezone.utc)
        existing.time_taken_seconds = (existing.time_taken_seconds or 0) + request.time_spent_seconds
        submission = existing
    else:
        # Create new submission
        submission = QuestionSubmission(
            attempt_id=attempt.id,
            question_id=question_id,
            content=request.content,
            language=request.language,
            submitted_at=datetime.now(timezone.utc),
            time_taken_seconds=request.time_spent_seconds,
        )
        db.add(submission)

    await db.commit()
    await db.refresh(submission)

    # Count remaining questions
    submitted_query = select(QuestionSubmission).where(
        QuestionSubmission.attempt_id == attempt.id
    )
    submitted_result = await db.execute(submitted_query)
    submitted_count = len(submitted_result.scalars().all())

    total_questions = assessment.total_questions or 0
    questions_remaining = max(0, total_questions - submitted_count)

    return SubmitAnswerResponse(
        submission_id=str(submission.id),
        submitted_at=submission.submitted_at,
        questions_remaining=questions_remaining,
    )


@router.post("/{token}/complete", response_model=CompleteAssessmentResponse)
async def complete_assessment(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> CompleteAssessmentResponse:
    """Complete the assessment and trigger evaluation."""
    invitation = await get_invitation_by_token(token, db)
    assessment = await get_assessment_for_invitation(invitation, db)

    # Get active attempt
    attempt = await get_active_attempt(invitation, db)
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active attempt found",
        )

    # Mark as completed
    attempt.status = AttemptStatus.COMPLETED
    attempt.completed_at = datetime.now(timezone.utc)

    # Update invitation status
    invitation.status = InvitationStatus.COMPLETED

    await db.commit()

    # Trigger evaluation (async in background ideally)
    try:
        eval_service = AssessmentEvaluationService(db)

        # Get all submissions
        submissions_query = select(QuestionSubmission).where(
            QuestionSubmission.attempt_id == attempt.id
        )
        submissions_result = await db.execute(submissions_query)
        submissions = submissions_result.scalars().all()

        # Evaluate each submission
        for submission in submissions:
            question_query = select(Question).where(Question.id == submission.question_id)
            q_result = await db.execute(question_query)
            question = q_result.scalar_one_or_none()

            if question:
                await eval_service.evaluate_submission(submission, question)

        # Calculate overall score
        await eval_service.calculate_attempt_score(str(attempt.id))

    except Exception as e:
        # Log but don't fail - evaluation can be retried
        import logging
        logging.error(f"Evaluation error: {e}")

    return CompleteAssessmentResponse(
        attempt_id=str(attempt.id),
        completed_at=attempt.completed_at,
        status=attempt.status.value,
        message="Assessment completed successfully. Results will be available soon.",
    )


@router.post("/{token}/proctoring/event", response_model=ProctoringEventResponse)
async def log_proctoring_event(
    token: str,
    request: ProctoringEventRequest,
    db: AsyncSession = Depends(get_db),
) -> ProctoringEventResponse:
    """Log a proctoring event."""
    invitation = await get_invitation_by_token(token, db)

    # Get active attempt
    attempt = await get_active_attempt(invitation, db)
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active attempt found",
        )

    proctoring_service = ProctoringService(db)

    event = await proctoring_service.log_event(
        attempt_id=str(attempt.id),
        event_type=request.event_type,
        data=request.data,
        screenshot_url=request.screenshot_url,
    )

    trust_score = await proctoring_service.calculate_trust_score(str(attempt.id))

    return ProctoringEventResponse(
        event_id=str(event.id),
        trust_score=trust_score,
    )


@router.get("/{token}/status")
async def get_attempt_status(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get current attempt status."""
    invitation = await get_invitation_by_token(token, db)
    assessment = await get_assessment_for_invitation(invitation, db)

    attempt = await get_active_attempt(invitation, db)

    if not attempt:
        # Check for completed attempts
        completed_query = select(AssessmentAttempt).where(
            AssessmentAttempt.invitation_id == invitation.id,
            AssessmentAttempt.status == AttemptStatus.COMPLETED,
        ).order_by(AssessmentAttempt.completed_at.desc())
        completed_result = await db.execute(completed_query)
        completed_attempt = completed_result.scalar_one_or_none()

        if completed_attempt:
            return {
                "status": "completed",
                "attempt_id": str(completed_attempt.id),
                "score": completed_attempt.total_score,
                "completed_at": completed_attempt.completed_at.isoformat() if completed_attempt.completed_at else None,
            }

        return {
            "status": "not_started",
            "can_start": True,
        }

    # Calculate time remaining
    time_remaining = (assessment.total_duration_minutes or 60) * 60
    if attempt.started_at:
        elapsed = (datetime.now(timezone.utc) - attempt.started_at).total_seconds()
        time_remaining = max(0, int((assessment.total_duration_minutes or 60) * 60 - elapsed))

    # Get submission count
    submissions_query = select(QuestionSubmission).where(
        QuestionSubmission.attempt_id == attempt.id
    )
    submissions_result = await db.execute(submissions_query)
    submitted_count = len(submissions_result.scalars().all())

    return {
        "status": "in_progress",
        "attempt_id": str(attempt.id),
        "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
        "time_remaining_seconds": time_remaining,
        "questions_submitted": submitted_count,
        "total_questions": assessment.total_questions or 0,
    }
