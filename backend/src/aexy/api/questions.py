"""API endpoints for question management across assessments."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from statistics import median

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_, or_, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload

from aexy.core.database import get_db
from aexy.core.auth import get_current_developer
from aexy.models import Developer
from aexy.models.assessment import (
    Assessment,
    AssessmentTopic,
    Question,
    QuestionSubmission,
    SubmissionEvaluation,
    QuestionBank,
    QuestionAnalytics,
    Candidate,
    AssessmentInvitation,
    AssessmentAttempt,
    QuestionType,
    DifficultyLevel,
)

router = APIRouter(prefix="/questions", tags=["questions"])


# ============================================================================
# Pydantic Schemas
# ============================================================================

class QuestionListItem(BaseModel):
    """Question item in list response."""
    id: str
    assessment_id: str
    assessment_title: str
    topic_id: str | None = None
    topic_name: str | None = None
    question_type: str
    difficulty: str
    title: str
    max_marks: int
    is_ai_generated: bool
    created_at: datetime
    deleted_at: datetime | None = None
    # Analytics summary
    total_attempts: int = 0
    average_score_percent: float = 0.0
    average_time_seconds: int = 0


class QuestionListResponse(BaseModel):
    """Response for question list endpoint."""
    questions: list[QuestionListItem]
    total: int
    page: int
    per_page: int
    total_pages: int


class QuestionAnalyticsResponse(BaseModel):
    """Detailed analytics for a question."""
    question_id: str
    total_attempts: int = 0
    unique_candidates: int = 0
    average_score_percent: float = 0.0
    median_score_percent: float = 0.0
    min_score_percent: float = 0.0
    max_score_percent: float = 0.0
    average_time_seconds: int = 0
    median_time_seconds: int = 0
    min_time_seconds: int = 0
    max_time_seconds: int = 0
    score_distribution: dict[str, int] = {}
    time_distribution: dict[str, int] = {}
    stated_difficulty: str | None = None
    calculated_difficulty: str | None = None
    difficulty_accuracy: float = 0.0
    skip_rate: float = 0.0
    completion_rate: float = 0.0
    partial_credit_rate: float = 0.0
    # MCQ specific
    option_selection_distribution: dict[str, int] | None = None
    # Code specific
    test_case_pass_rates: list[dict] | None = None
    last_calculated_at: datetime | None = None


class QuestionDetailResponse(BaseModel):
    """Full question details with analytics."""
    id: str
    assessment_id: str
    assessment_title: str
    topic_id: str | None = None
    topic_name: str | None = None
    question_type: str
    difficulty: str
    title: str
    problem_statement: str
    options: list[dict] | None = None
    test_cases: list[dict] | None = None
    starter_code: dict | None = None
    constraints: list[str] | None = None
    examples: list[dict] | None = None
    hints: list[str] | None = None
    sample_answer: str | None = None
    key_points: list[str] | None = None
    evaluation_rubric: dict | None = None
    max_marks: int
    estimated_time_minutes: int
    allowed_languages: list[str] | None = None
    is_ai_generated: bool
    tags: list[str] = []
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None
    analytics: QuestionAnalyticsResponse | None = None


class QuestionSubmissionItem(BaseModel):
    """Submission item for a question."""
    submission_id: str
    candidate_id: str
    candidate_name: str
    candidate_email: str
    attempt_id: str
    submitted_at: datetime
    time_taken_seconds: int
    score_obtained: float | None = None
    max_score: float
    score_percent: float | None = None
    status: str  # evaluated, pending


class QuestionSubmissionsResponse(BaseModel):
    """Response for question submissions endpoint."""
    submissions: list[QuestionSubmissionItem]
    total: int
    page: int
    per_page: int
    total_pages: int


class DeleteQuestionResponse(BaseModel):
    """Response for question deletion."""
    deleted: bool
    question_id: str
    action: str  # deleted, soft_deleted, archived
    warnings: list[str] = []
    submissions_affected: int = 0


class BulkDeleteResponse(BaseModel):
    """Response for bulk deletion."""
    deleted_count: int
    failed_count: int
    failed_ids: list[str] = []
    warnings: list[str] = []


class QuestionCreateRequest(BaseModel):
    """Request to create a question."""
    assessment_id: str
    topic_id: str | None = None
    question_type: str
    difficulty: str
    title: str
    problem_statement: str
    options: list[dict] | None = None
    test_cases: list[dict] | None = None
    starter_code: dict | None = None
    constraints: list[str] | None = None
    examples: list[dict] | None = None
    hints: list[str] | None = None
    sample_answer: str | None = None
    key_points: list[str] | None = None
    evaluation_rubric: dict | None = None
    max_marks: int = 10
    estimated_time_minutes: int = 10
    allowed_languages: list[str] | None = None
    tags: list[str] = []
    add_to_bank: bool = False


class QuestionUpdateRequest(BaseModel):
    """Request to update a question."""
    topic_id: str | None = None
    question_type: str | None = None
    difficulty: str | None = None
    title: str | None = None
    problem_statement: str | None = None
    options: list[dict] | None = None
    test_cases: list[dict] | None = None
    starter_code: dict | None = None
    constraints: list[str] | None = None
    examples: list[dict] | None = None
    hints: list[str] | None = None
    sample_answer: str | None = None
    key_points: list[str] | None = None
    evaluation_rubric: dict | None = None
    max_marks: int | None = None
    estimated_time_minutes: int | None = None
    allowed_languages: list[str] | None = None
    tags: list[str] | None = None


# ============================================================================
# Helper Functions
# ============================================================================

async def calculate_question_analytics(
    question_id: str,
    db: AsyncSession,
) -> QuestionAnalyticsResponse:
    """Calculate analytics for a question from submissions."""
    # Get question
    question = await db.get(Question, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # Get all submissions for this question with evaluations
    submissions_query = (
        select(QuestionSubmission)
        .options(selectinload(QuestionSubmission.evaluation))
        .where(QuestionSubmission.question_id == question_id)
    )
    result = await db.execute(submissions_query)
    submissions = result.scalars().all()

    if not submissions:
        return QuestionAnalyticsResponse(
            question_id=question_id,
            stated_difficulty=question.difficulty,
        )

    # Calculate metrics
    scores = []
    times = []
    unique_candidates = set()
    correct_count = 0
    partial_count = 0
    skipped_count = 0

    # MCQ option tracking
    option_counts: dict[str, int] = {}

    # Code test case tracking
    test_case_results: dict[str, dict] = {}

    for sub in submissions:
        # Track unique candidates via attempt
        if sub.attempt_id:
            unique_candidates.add(sub.attempt_id)

        # Time tracking
        if sub.time_taken_seconds:
            times.append(sub.time_taken_seconds)

        # Score tracking from evaluation
        if sub.evaluation:
            eval_data = sub.evaluation
            if eval_data.marks_obtained is not None and question.max_marks:
                score_pct = (float(eval_data.marks_obtained) / question.max_marks) * 100
                scores.append(score_pct)

                if score_pct >= 100:
                    correct_count += 1
                elif score_pct > 0:
                    partial_count += 1

            # Track test case results for code questions
            if eval_data.test_case_results:
                for tc in eval_data.test_case_results:
                    tc_id = tc.get("test_id", str(tc.get("index", 0)))
                    if tc_id not in test_case_results:
                        test_case_results[tc_id] = {"total": 0, "passed": 0}
                    test_case_results[tc_id]["total"] += 1
                    if tc.get("passed"):
                        test_case_results[tc_id]["passed"] += 1

        # MCQ option tracking
        if question.question_type == "mcq" and sub.content:
            selected = sub.content.get("selected_answer") or sub.content.get("answer")
            if selected:
                option_counts[selected] = option_counts.get(selected, 0) + 1

        # Track skipped
        if not sub.content or sub.content == {}:
            skipped_count += 1

    # Calculate distributions
    score_dist = {"0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0}
    for s in scores:
        if s <= 20:
            score_dist["0-20"] += 1
        elif s <= 40:
            score_dist["21-40"] += 1
        elif s <= 60:
            score_dist["41-60"] += 1
        elif s <= 80:
            score_dist["61-80"] += 1
        else:
            score_dist["81-100"] += 1

    time_dist = {"0-60": 0, "61-120": 0, "121-300": 0, "301-600": 0, "600+": 0}
    for t in times:
        if t <= 60:
            time_dist["0-60"] += 1
        elif t <= 120:
            time_dist["61-120"] += 1
        elif t <= 300:
            time_dist["121-300"] += 1
        elif t <= 600:
            time_dist["301-600"] += 1
        else:
            time_dist["600+"] += 1

    # Calculate difficulty based on scores
    avg_score = sum(scores) / len(scores) if scores else 0
    if avg_score >= 80:
        calculated_diff = "easy"
    elif avg_score >= 50:
        calculated_diff = "medium"
    else:
        calculated_diff = "hard"

    # Difficulty accuracy
    diff_map = {"easy": 0, "medium": 1, "hard": 2}
    stated = diff_map.get(question.difficulty, 1)
    calculated = diff_map.get(calculated_diff, 1)
    diff_accuracy = 1.0 - (abs(stated - calculated) / 2)

    # Test case pass rates
    tc_pass_rates = None
    if test_case_results:
        tc_pass_rates = [
            {
                "test_id": tc_id,
                "pass_rate": data["passed"] / data["total"] if data["total"] > 0 else 0
            }
            for tc_id, data in test_case_results.items()
        ]

    total = len(submissions)
    return QuestionAnalyticsResponse(
        question_id=question_id,
        total_attempts=total,
        unique_candidates=len(unique_candidates),
        average_score_percent=round(avg_score, 2),
        median_score_percent=round(median(scores), 2) if scores else 0,
        min_score_percent=round(min(scores), 2) if scores else 0,
        max_score_percent=round(max(scores), 2) if scores else 0,
        average_time_seconds=int(sum(times) / len(times)) if times else 0,
        median_time_seconds=int(median(times)) if times else 0,
        min_time_seconds=min(times) if times else 0,
        max_time_seconds=max(times) if times else 0,
        score_distribution=score_dist,
        time_distribution=time_dist,
        stated_difficulty=question.difficulty,
        calculated_difficulty=calculated_diff,
        difficulty_accuracy=round(diff_accuracy, 2),
        skip_rate=round((skipped_count / total) * 100, 2) if total > 0 else 0,
        completion_rate=round(((total - skipped_count) / total) * 100, 2) if total > 0 else 0,
        partial_credit_rate=round((partial_count / total) * 100, 2) if total > 0 else 0,
        option_selection_distribution=option_counts if option_counts else None,
        test_case_pass_rates=tc_pass_rates,
        last_calculated_at=datetime.now(timezone.utc),
    )


# ============================================================================
# Endpoints
# ============================================================================

@router.get("", response_model=QuestionListResponse)
async def list_questions(
    organization_id: str = Query(..., description="Organization ID"),
    assessment_id: str | None = Query(None, description="Filter by assessment"),
    topic: str | None = Query(None, description="Filter by topic name"),
    question_type: str | None = Query(None, description="Filter by question type"),
    difficulty: str | None = Query(None, description="Filter by difficulty"),
    search: str | None = Query(None, description="Search in title/problem"),
    is_ai_generated: bool | None = Query(None, description="Filter AI-generated"),
    include_deleted: bool = Query(False, description="Include soft-deleted questions"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", description="Sort order"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
) -> QuestionListResponse:
    """List all questions with filters."""
    # Build query
    query = (
        select(Question)
        .join(Assessment, Question.assessment_id == Assessment.id)
        .outerjoin(AssessmentTopic, Question.topic_id == AssessmentTopic.id)
        .where(Assessment.organization_id == organization_id)
    )

    # Apply filters
    if not include_deleted:
        query = query.where(Question.deleted_at.is_(None))

    if assessment_id:
        query = query.where(Question.assessment_id == assessment_id)

    if topic:
        query = query.where(AssessmentTopic.topic.ilike(f"%{topic}%"))

    if question_type:
        query = query.where(Question.question_type == question_type)

    if difficulty:
        query = query.where(Question.difficulty == difficulty)

    if search:
        query = query.where(
            or_(
                Question.title.ilike(f"%{search}%"),
                Question.problem_statement.ilike(f"%{search}%"),
            )
        )

    if is_ai_generated is not None:
        query = query.where(Question.is_ai_generated == is_ai_generated)

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply sorting
    sort_column = getattr(Question, sort_by, Question.created_at)
    if sort_order == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())

    # Apply pagination
    offset = (page - 1) * per_page
    query = query.offset(offset).limit(per_page)

    # Add options for eager loading
    query = query.options(
        joinedload(Question.assessment),
        joinedload(Question.topic),
        selectinload(Question.analytics),
    )

    result = await db.execute(query)
    questions = result.unique().scalars().all()

    # Build response
    items = []
    for q in questions:
        analytics = q.analytics
        items.append(
            QuestionListItem(
                id=str(q.id),
                assessment_id=str(q.assessment_id),
                assessment_title=q.assessment.title if q.assessment else "Unknown",
                topic_id=str(q.topic_id) if q.topic_id else None,
                topic_name=q.topic.topic if q.topic else None,
                question_type=q.question_type,
                difficulty=q.difficulty,
                title=q.title,
                max_marks=q.max_marks or 0,
                is_ai_generated=q.is_ai_generated,
                created_at=q.created_at,
                deleted_at=q.deleted_at,
                total_attempts=analytics.total_attempts if analytics else 0,
                average_score_percent=float(analytics.average_score_percent) if analytics else 0.0,
                average_time_seconds=analytics.average_time_seconds if analytics else 0,
            )
        )

    total_pages = (total + per_page - 1) // per_page

    return QuestionListResponse(
        questions=items,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
    )


@router.get("/{question_id}", response_model=QuestionDetailResponse)
async def get_question_detail(
    question_id: str,
    include_analytics: bool = Query(True, description="Include analytics"),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
) -> QuestionDetailResponse:
    """Get full question details with analytics."""
    query = (
        select(Question)
        .options(
            joinedload(Question.assessment),
            joinedload(Question.topic),
        )
        .where(Question.id == question_id)
    )
    result = await db.execute(query)
    question = result.unique().scalar_one_or_none()

    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # Calculate analytics if requested
    analytics = None
    if include_analytics:
        analytics = await calculate_question_analytics(question_id, db)

    return QuestionDetailResponse(
        id=str(question.id),
        assessment_id=str(question.assessment_id),
        assessment_title=question.assessment.title if question.assessment else "Unknown",
        topic_id=str(question.topic_id) if question.topic_id else None,
        topic_name=question.topic.topic if question.topic else None,
        question_type=question.question_type,
        difficulty=question.difficulty,
        title=question.title,
        problem_statement=question.problem_statement,
        options=question.options,
        test_cases=question.test_cases,
        starter_code=question.starter_code,
        constraints=question.constraints,
        examples=question.examples,
        hints=question.hints,
        sample_answer=question.sample_answer,
        key_points=question.key_points,
        evaluation_rubric=question.evaluation_rubric,
        max_marks=question.max_marks or 0,
        estimated_time_minutes=question.estimated_time_minutes or 0,
        allowed_languages=question.allowed_languages,
        is_ai_generated=question.is_ai_generated,
        tags=question.tags or [],
        created_at=question.created_at,
        updated_at=question.updated_at,
        deleted_at=question.deleted_at,
        analytics=analytics,
    )


@router.get("/{question_id}/analytics", response_model=QuestionAnalyticsResponse)
async def get_question_analytics(
    question_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
) -> QuestionAnalyticsResponse:
    """Get detailed analytics for a question."""
    return await calculate_question_analytics(question_id, db)


@router.get("/{question_id}/submissions", response_model=QuestionSubmissionsResponse)
async def get_question_submissions(
    question_id: str,
    candidate_id: str | None = Query(None, description="Filter by candidate ID"),
    candidate_email: str | None = Query(None, description="Filter by candidate email"),
    status: str | None = Query(None, description="Filter by status (evaluated, pending)"),
    min_score: float | None = Query(None, description="Minimum score percent"),
    max_score: float | None = Query(None, description="Maximum score percent"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
) -> QuestionSubmissionsResponse:
    """Get submissions for a question with candidate filtering."""
    # Verify question exists
    question = await db.get(Question, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # Build query with joins
    query = (
        select(QuestionSubmission)
        .join(AssessmentAttempt, QuestionSubmission.attempt_id == AssessmentAttempt.id)
        .join(AssessmentInvitation, AssessmentAttempt.invitation_id == AssessmentInvitation.id)
        .join(Candidate, AssessmentInvitation.candidate_id == Candidate.id)
        .outerjoin(SubmissionEvaluation, QuestionSubmission.id == SubmissionEvaluation.submission_id)
        .where(QuestionSubmission.question_id == question_id)
    )

    # Apply filters
    if candidate_id:
        query = query.where(Candidate.id == candidate_id)

    if candidate_email:
        query = query.where(Candidate.email.ilike(f"%{candidate_email}%"))

    if status == "evaluated":
        query = query.where(SubmissionEvaluation.id.isnot(None))
    elif status == "pending":
        query = query.where(SubmissionEvaluation.id.is_(None))

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply pagination
    offset = (page - 1) * per_page
    query = query.order_by(QuestionSubmission.submitted_at.desc())
    query = query.offset(offset).limit(per_page)

    # Add eager loading
    query = query.options(
        selectinload(QuestionSubmission.evaluation),
    )

    result = await db.execute(query)
    submissions = result.unique().scalars().all()

    # Get candidate info separately to avoid complex joins
    items = []
    for sub in submissions:
        # Get candidate through relationships
        attempt_q = select(AssessmentAttempt).where(AssessmentAttempt.id == sub.attempt_id)
        attempt_result = await db.execute(attempt_q)
        attempt = attempt_result.scalar_one_or_none()

        candidate_name = "Unknown"
        candidate_email_val = "unknown@email.com"
        candidate_id_val = ""

        if attempt:
            inv_q = select(AssessmentInvitation).where(AssessmentInvitation.id == attempt.invitation_id)
            inv_result = await db.execute(inv_q)
            invitation = inv_result.scalar_one_or_none()

            if invitation:
                cand_q = select(Candidate).where(Candidate.id == invitation.candidate_id)
                cand_result = await db.execute(cand_q)
                candidate = cand_result.scalar_one_or_none()

                if candidate:
                    candidate_name = candidate.name
                    candidate_email_val = candidate.email
                    candidate_id_val = str(candidate.id)

        score_obtained = None
        score_percent = None
        eval_status = "pending"

        if sub.evaluation:
            score_obtained = float(sub.evaluation.marks_obtained) if sub.evaluation.marks_obtained else None
            if score_obtained is not None and question.max_marks:
                score_percent = (score_obtained / question.max_marks) * 100
            eval_status = "evaluated"

        # Apply score filters
        if min_score is not None and (score_percent is None or score_percent < min_score):
            continue
        if max_score is not None and (score_percent is None or score_percent > max_score):
            continue

        items.append(
            QuestionSubmissionItem(
                submission_id=str(sub.id),
                candidate_id=candidate_id_val,
                candidate_name=candidate_name,
                candidate_email=candidate_email_val,
                attempt_id=str(sub.attempt_id),
                submitted_at=sub.submitted_at,
                time_taken_seconds=sub.time_taken_seconds or 0,
                score_obtained=score_obtained,
                max_score=float(question.max_marks or 0),
                score_percent=round(score_percent, 2) if score_percent is not None else None,
                status=eval_status,
            )
        )

    total_pages = (total + per_page - 1) // per_page

    return QuestionSubmissionsResponse(
        submissions=items,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
    )


@router.post("", response_model=QuestionDetailResponse)
async def create_question(
    request: QuestionCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
) -> QuestionDetailResponse:
    """Create a new question."""
    # Verify assessment exists
    assessment = await db.get(Assessment, request.assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Verify topic if provided
    if request.topic_id:
        topic = await db.get(AssessmentTopic, request.topic_id)
        if not topic or topic.assessment_id != request.assessment_id:
            raise HTTPException(status_code=404, detail="Topic not found")

    # Get current max sequence_order
    max_seq_query = select(func.max(Question.sequence_order)).where(
        Question.assessment_id == request.assessment_id
    )
    max_seq_result = await db.execute(max_seq_query)
    max_seq = max_seq_result.scalar() or 0

    # Create question
    question = Question(
        assessment_id=request.assessment_id,
        topic_id=request.topic_id,
        question_type=request.question_type,
        difficulty=request.difficulty,
        title=request.title,
        problem_statement=request.problem_statement,
        options=request.options,
        test_cases=request.test_cases,
        starter_code=request.starter_code,
        constraints=request.constraints,
        examples=request.examples,
        hints=request.hints,
        sample_answer=request.sample_answer,
        key_points=request.key_points,
        evaluation_rubric=request.evaluation_rubric,
        max_marks=request.max_marks,
        estimated_time_minutes=request.estimated_time_minutes,
        allowed_languages=request.allowed_languages,
        tags=request.tags,
        is_ai_generated=False,
        sequence_order=max_seq + 1,
    )

    db.add(question)

    # Update assessment totals
    assessment.total_questions = (assessment.total_questions or 0) + 1
    assessment.total_duration_minutes = (assessment.total_duration_minutes or 0) + request.estimated_time_minutes
    assessment.max_score = (assessment.max_score or 0) + request.max_marks

    # Add to question bank if requested
    if request.add_to_bank:
        bank_entry = QuestionBank(
            organization_id=assessment.organization_id,
            topic=request.title[:255],
            question_type=request.question_type,
            difficulty=request.difficulty,
            question_data={
                "title": request.title,
                "problem_statement": request.problem_statement,
                "options": request.options,
                "test_cases": request.test_cases,
                "starter_code": request.starter_code,
                "constraints": request.constraints,
                "examples": request.examples,
                "hints": request.hints,
                "sample_answer": request.sample_answer,
                "key_points": request.key_points,
                "evaluation_rubric": request.evaluation_rubric,
                "max_marks": request.max_marks,
                "estimated_time_minutes": request.estimated_time_minutes,
                "allowed_languages": request.allowed_languages,
            },
            tags=request.tags,
            created_by=str(current_user.id),
        )
        db.add(bank_entry)

    await db.commit()
    await db.refresh(question)

    return await get_question_detail(str(question.id), include_analytics=False, db=db, current_user=current_user)


@router.put("/{question_id}", response_model=QuestionDetailResponse)
async def update_question(
    question_id: str,
    request: QuestionUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
) -> QuestionDetailResponse:
    """Update a question."""
    question = await db.get(Question, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    if question.deleted_at:
        raise HTTPException(status_code=400, detail="Cannot update deleted question")

    # Get assessment for updating totals
    assessment = await db.get(Assessment, question.assessment_id)

    # Track changes for assessment totals
    old_time = question.estimated_time_minutes or 0
    old_marks = question.max_marks or 0

    # Update fields
    update_data = request.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(question, field, value)

    # Update assessment totals if time/marks changed
    if assessment:
        new_time = question.estimated_time_minutes or 0
        new_marks = question.max_marks or 0

        if new_time != old_time:
            assessment.total_duration_minutes = (assessment.total_duration_minutes or 0) - old_time + new_time
        if new_marks != old_marks:
            assessment.max_score = (assessment.max_score or 0) - old_marks + new_marks

    await db.commit()
    await db.refresh(question)

    return await get_question_detail(str(question.id), include_analytics=False, db=db, current_user=current_user)


@router.delete("/{question_id}", response_model=DeleteQuestionResponse)
async def delete_question(
    question_id: str,
    force: bool = Query(False, description="Force delete even with submissions"),
    soft_delete: bool = Query(True, description="Soft delete instead of permanent"),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
) -> DeleteQuestionResponse:
    """Delete a question with safety checks."""
    question = await db.get(Question, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    warnings = []

    # Check for submissions
    sub_count_query = select(func.count()).where(QuestionSubmission.question_id == question_id)
    sub_count_result = await db.execute(sub_count_query)
    submission_count = sub_count_result.scalar() or 0

    if submission_count > 0:
        warnings.append(f"Question has {submission_count} existing submissions")
        if not force:
            raise HTTPException(
                status_code=400,
                detail=f"Question has {submission_count} submissions. Use force=true to delete anyway."
            )

    # Get assessment for updating totals
    assessment = await db.get(Assessment, question.assessment_id)

    if soft_delete:
        # Soft delete
        question.deleted_at = datetime.now(timezone.utc)
        question.deleted_by = str(current_user.id)
        action = "soft_deleted"
    else:
        # Hard delete - cascade will handle submissions
        await db.delete(question)
        action = "deleted"

    # Update assessment totals
    if assessment:
        assessment.total_questions = max(0, (assessment.total_questions or 0) - 1)
        assessment.total_duration_minutes = max(0, (assessment.total_duration_minutes or 0) - (question.estimated_time_minutes or 0))
        assessment.max_score = max(0, (assessment.max_score or 0) - (question.max_marks or 0))

    await db.commit()

    return DeleteQuestionResponse(
        deleted=True,
        question_id=question_id,
        action=action,
        warnings=warnings,
        submissions_affected=submission_count,
    )


@router.post("/{question_id}/restore")
async def restore_question(
    question_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
) -> QuestionDetailResponse:
    """Restore a soft-deleted question."""
    question = await db.get(Question, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    if not question.deleted_at:
        raise HTTPException(status_code=400, detail="Question is not deleted")

    # Restore
    question.deleted_at = None
    question.deleted_by = None

    # Update assessment totals
    assessment = await db.get(Assessment, question.assessment_id)
    if assessment:
        assessment.total_questions = (assessment.total_questions or 0) + 1
        assessment.total_duration_minutes = (assessment.total_duration_minutes or 0) + (question.estimated_time_minutes or 0)
        assessment.max_score = (assessment.max_score or 0) + (question.max_marks or 0)

    await db.commit()
    await db.refresh(question)

    return await get_question_detail(str(question.id), include_analytics=False, db=db, current_user=current_user)


@router.post("/{question_id}/duplicate", response_model=QuestionDetailResponse)
async def duplicate_question(
    question_id: str,
    target_assessment_id: str | None = Query(None, description="Target assessment (default: same)"),
    target_topic_id: str | None = Query(None, description="Target topic"),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
) -> QuestionDetailResponse:
    """Duplicate a question."""
    question = await db.get(Question, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # Use same assessment if not specified
    assessment_id = target_assessment_id or str(question.assessment_id)

    # Verify target assessment
    assessment = await db.get(Assessment, assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Target assessment not found")

    # Get max sequence_order
    max_seq_query = select(func.max(Question.sequence_order)).where(
        Question.assessment_id == assessment_id
    )
    max_seq_result = await db.execute(max_seq_query)
    max_seq = max_seq_result.scalar() or 0

    # Create duplicate
    new_question = Question(
        assessment_id=assessment_id,
        topic_id=target_topic_id or (str(question.topic_id) if question.topic_id else None),
        question_type=question.question_type,
        difficulty=question.difficulty,
        title=f"{question.title} (Copy)",
        problem_statement=question.problem_statement,
        options=question.options,
        test_cases=question.test_cases,
        starter_code=question.starter_code,
        constraints=question.constraints,
        examples=question.examples,
        hints=question.hints,
        sample_answer=question.sample_answer,
        key_points=question.key_points,
        evaluation_rubric=question.evaluation_rubric,
        max_marks=question.max_marks,
        estimated_time_minutes=question.estimated_time_minutes,
        allowed_languages=question.allowed_languages,
        tags=question.tags,
        is_ai_generated=question.is_ai_generated,
        generation_metadata=question.generation_metadata,
        sequence_order=max_seq + 1,
    )

    db.add(new_question)

    # Update assessment totals
    assessment.total_questions = (assessment.total_questions or 0) + 1
    assessment.total_duration_minutes = (assessment.total_duration_minutes or 0) + (question.estimated_time_minutes or 0)
    assessment.max_score = (assessment.max_score or 0) + (question.max_marks or 0)

    await db.commit()
    await db.refresh(new_question)

    return await get_question_detail(str(new_question.id), include_analytics=False, db=db, current_user=current_user)


@router.post("/bulk/delete", response_model=BulkDeleteResponse)
async def bulk_delete_questions(
    question_ids: list[str],
    force: bool = Query(False, description="Force delete even with submissions"),
    soft_delete: bool = Query(True, description="Soft delete instead of permanent"),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
) -> BulkDeleteResponse:
    """Bulk delete questions."""
    deleted_count = 0
    failed_count = 0
    failed_ids = []
    warnings = []

    for qid in question_ids:
        try:
            result = await delete_question(
                question_id=qid,
                force=force,
                soft_delete=soft_delete,
                db=db,
                current_user=current_user,
            )
            deleted_count += 1
            warnings.extend(result.warnings)
        except HTTPException as e:
            failed_count += 1
            failed_ids.append(qid)
            warnings.append(f"Failed to delete {qid}: {e.detail}")

    return BulkDeleteResponse(
        deleted_count=deleted_count,
        failed_count=failed_count,
        failed_ids=failed_ids,
        warnings=warnings,
    )


@router.post("/{question_id}/recalculate-analytics", response_model=QuestionAnalyticsResponse)
async def recalculate_analytics(
    question_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
) -> QuestionAnalyticsResponse:
    """Recalculate and cache analytics for a question."""
    analytics_data = await calculate_question_analytics(question_id, db)

    # Get or create analytics record
    existing = await db.execute(
        select(QuestionAnalytics).where(QuestionAnalytics.question_id == question_id)
    )
    analytics = existing.scalar_one_or_none()

    if not analytics:
        analytics = QuestionAnalytics(question_id=question_id)
        db.add(analytics)

    # Update analytics record
    analytics.total_attempts = analytics_data.total_attempts
    analytics.unique_candidates = analytics_data.unique_candidates
    analytics.average_score_percent = Decimal(str(analytics_data.average_score_percent))
    analytics.median_score_percent = Decimal(str(analytics_data.median_score_percent))
    analytics.min_score_percent = Decimal(str(analytics_data.min_score_percent))
    analytics.max_score_percent = Decimal(str(analytics_data.max_score_percent))
    analytics.average_time_seconds = analytics_data.average_time_seconds
    analytics.median_time_seconds = analytics_data.median_time_seconds
    analytics.min_time_seconds = analytics_data.min_time_seconds
    analytics.max_time_seconds = analytics_data.max_time_seconds
    analytics.score_distribution = analytics_data.score_distribution
    analytics.time_distribution = analytics_data.time_distribution
    analytics.stated_difficulty = analytics_data.stated_difficulty
    analytics.calculated_difficulty = analytics_data.calculated_difficulty
    analytics.difficulty_score = Decimal(str(analytics_data.difficulty_accuracy)) if analytics_data.difficulty_accuracy else None
    analytics.skip_rate = Decimal(str(analytics_data.skip_rate))
    analytics.completion_rate = Decimal(str(analytics_data.completion_rate))
    analytics.partial_credit_rate = Decimal(str(analytics_data.partial_credit_rate))
    analytics.option_selection_distribution = analytics_data.option_selection_distribution
    analytics.test_case_pass_rates = analytics_data.test_case_pass_rates
    analytics.last_calculated_at = datetime.now(timezone.utc)

    await db.commit()

    return analytics_data
