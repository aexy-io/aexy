"""API endpoints for question bank management."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.core.auth import get_current_developer
from aexy.models import Developer
from aexy.models.assessment import (
    Assessment,
    AssessmentTopic,
    Question,
    QuestionBank,
    QuestionType,
    DifficultyLevel,
)

router = APIRouter(prefix="/question-bank", tags=["question-bank"])


# ============================================================================
# Pydantic Schemas
# ============================================================================

class QuestionBankItem(BaseModel):
    """Question bank item in list response."""
    id: str
    organization_id: str | None = None
    topic: str
    subtopic: str | None = None
    question_type: str
    difficulty: str
    title: str  # Extracted from question_data
    usage_count: int = 0
    average_score: float | None = None
    average_time_seconds: int | None = None
    tags: list[str] = []
    is_verified: bool = False
    is_public: bool = False
    created_by: str | None = None
    created_at: datetime


class QuestionBankListResponse(BaseModel):
    """Response for question bank list."""
    questions: list[QuestionBankItem]
    total: int
    page: int
    per_page: int
    total_pages: int


class QuestionBankDetailResponse(BaseModel):
    """Full question bank entry details."""
    id: str
    organization_id: str | None = None
    topic: str
    subtopic: str | None = None
    question_type: str
    difficulty: str
    question_data: dict
    usage_count: int = 0
    average_score: float | None = None
    average_time_seconds: int | None = None
    tags: list[str] = []
    is_verified: bool = False
    is_public: bool = False
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime


class QuestionBankCreateRequest(BaseModel):
    """Request to create a question bank entry."""
    organization_id: str | None = None
    topic: str
    subtopic: str | None = None
    question_type: str
    difficulty: str
    question_data: dict = Field(..., description="Full question structure")
    tags: list[str] = []
    is_verified: bool = False
    is_public: bool = False


class QuestionBankUpdateRequest(BaseModel):
    """Request to update a question bank entry."""
    topic: str | None = None
    subtopic: str | None = None
    question_type: str | None = None
    difficulty: str | None = None
    question_data: dict | None = None
    tags: list[str] | None = None
    is_verified: bool | None = None
    is_public: bool | None = None


class ImportToAssessmentRequest(BaseModel):
    """Request to import bank question into assessment."""
    assessment_id: str
    topic_id: str | None = None


class ImportFromAssessmentRequest(BaseModel):
    """Request to import questions from assessment to bank."""
    assessment_id: str
    question_ids: list[str] | None = None  # None = all questions


class ImportResponse(BaseModel):
    """Response for import operations."""
    imported_count: int
    skipped_count: int
    skipped_ids: list[str] = []
    message: str


# ============================================================================
# Endpoints
# ============================================================================

@router.get("", response_model=QuestionBankListResponse)
async def list_bank_questions(
    organization_id: str = Query(..., description="Organization ID"),
    topic: str | None = Query(None, description="Filter by topic"),
    subtopic: str | None = Query(None, description="Filter by subtopic"),
    question_type: str | None = Query(None, description="Filter by question type"),
    difficulty: str | None = Query(None, description="Filter by difficulty"),
    is_verified: bool | None = Query(None, description="Filter by verified status"),
    is_public: bool | None = Query(None, description="Filter by public status"),
    search: str | None = Query(None, description="Search in topic/tags"),
    tags: str | None = Query(None, description="Filter by tags (comma-separated)"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", description="Sort order"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
) -> QuestionBankListResponse:
    """List question bank entries with filters."""
    # Build query - include org's questions and public questions
    query = select(QuestionBank).where(
        or_(
            QuestionBank.organization_id == organization_id,
            QuestionBank.is_public == True,
            QuestionBank.organization_id.is_(None),  # Global questions
        )
    )

    # Apply filters
    if topic:
        query = query.where(QuestionBank.topic.ilike(f"%{topic}%"))

    if subtopic:
        query = query.where(QuestionBank.subtopic.ilike(f"%{subtopic}%"))

    if question_type:
        query = query.where(QuestionBank.question_type == question_type)

    if difficulty:
        query = query.where(QuestionBank.difficulty == difficulty)

    if is_verified is not None:
        query = query.where(QuestionBank.is_verified == is_verified)

    if is_public is not None:
        query = query.where(QuestionBank.is_public == is_public)

    if search:
        query = query.where(
            or_(
                QuestionBank.topic.ilike(f"%{search}%"),
                QuestionBank.subtopic.ilike(f"%{search}%"),
            )
        )

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply sorting
    sort_column = getattr(QuestionBank, sort_by, QuestionBank.created_at)
    if sort_order == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())

    # Apply pagination
    offset = (page - 1) * per_page
    query = query.offset(offset).limit(per_page)

    result = await db.execute(query)
    bank_questions = result.scalars().all()

    # Build response
    items = []
    for q in bank_questions:
        title = q.question_data.get("title", q.topic) if q.question_data else q.topic
        items.append(
            QuestionBankItem(
                id=str(q.id),
                organization_id=q.organization_id,
                topic=q.topic,
                subtopic=q.subtopic,
                question_type=q.question_type,
                difficulty=q.difficulty,
                title=title,
                usage_count=q.usage_count,
                average_score=float(q.average_score) if q.average_score else None,
                average_time_seconds=q.average_time_seconds,
                tags=q.tags or [],
                is_verified=q.is_verified,
                is_public=q.is_public,
                created_by=q.created_by,
                created_at=q.created_at,
            )
        )

    total_pages = (total + per_page - 1) // per_page

    return QuestionBankListResponse(
        questions=items,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
    )


@router.get("/{bank_id}", response_model=QuestionBankDetailResponse)
async def get_bank_question(
    bank_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
) -> QuestionBankDetailResponse:
    """Get a question bank entry by ID."""
    bank_question = await db.get(QuestionBank, bank_id)
    if not bank_question:
        raise HTTPException(status_code=404, detail="Question bank entry not found")

    return QuestionBankDetailResponse(
        id=str(bank_question.id),
        organization_id=bank_question.organization_id,
        topic=bank_question.topic,
        subtopic=bank_question.subtopic,
        question_type=bank_question.question_type,
        difficulty=bank_question.difficulty,
        question_data=bank_question.question_data,
        usage_count=bank_question.usage_count,
        average_score=float(bank_question.average_score) if bank_question.average_score else None,
        average_time_seconds=bank_question.average_time_seconds,
        tags=bank_question.tags or [],
        is_verified=bank_question.is_verified,
        is_public=bank_question.is_public,
        created_by=bank_question.created_by,
        created_at=bank_question.created_at,
        updated_at=bank_question.updated_at,
    )


@router.post("", response_model=QuestionBankDetailResponse)
async def create_bank_question(
    request: QuestionBankCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
) -> QuestionBankDetailResponse:
    """Create a new question bank entry."""
    bank_question = QuestionBank(
        organization_id=request.organization_id,
        topic=request.topic,
        subtopic=request.subtopic,
        question_type=request.question_type,
        difficulty=request.difficulty,
        question_data=request.question_data,
        tags=request.tags,
        is_verified=request.is_verified,
        is_public=request.is_public,
        created_by=str(current_user.id),
    )

    db.add(bank_question)
    await db.commit()
    await db.refresh(bank_question)

    return await get_bank_question(str(bank_question.id), db, current_user)


@router.put("/{bank_id}", response_model=QuestionBankDetailResponse)
async def update_bank_question(
    bank_id: str,
    request: QuestionBankUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
) -> QuestionBankDetailResponse:
    """Update a question bank entry."""
    bank_question = await db.get(QuestionBank, bank_id)
    if not bank_question:
        raise HTTPException(status_code=404, detail="Question bank entry not found")

    # Update fields
    update_data = request.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(bank_question, field, value)

    await db.commit()
    await db.refresh(bank_question)

    return await get_bank_question(str(bank_question.id), db, current_user)


@router.delete("/{bank_id}")
async def delete_bank_question(
    bank_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
) -> dict:
    """Delete a question bank entry."""
    bank_question = await db.get(QuestionBank, bank_id)
    if not bank_question:
        raise HTTPException(status_code=404, detail="Question bank entry not found")

    await db.delete(bank_question)
    await db.commit()

    return {"deleted": True, "id": bank_id}


@router.post("/{bank_id}/use", response_model=dict)
async def use_bank_question(
    bank_id: str,
    request: ImportToAssessmentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
) -> dict:
    """Use a bank question in an assessment (creates a copy)."""
    bank_question = await db.get(QuestionBank, bank_id)
    if not bank_question:
        raise HTTPException(status_code=404, detail="Question bank entry not found")

    # Verify assessment exists
    assessment = await db.get(Assessment, request.assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Verify topic if provided
    if request.topic_id:
        topic = await db.get(AssessmentTopic, request.topic_id)
        if not topic or topic.assessment_id != request.assessment_id:
            raise HTTPException(status_code=404, detail="Topic not found")

    # Get max sequence_order
    max_seq_query = select(func.max(Question.sequence_order)).where(
        Question.assessment_id == request.assessment_id
    )
    max_seq_result = await db.execute(max_seq_query)
    max_seq = max_seq_result.scalar() or 0

    # Extract question data
    qdata = bank_question.question_data or {}

    # Create question from bank data
    question = Question(
        assessment_id=request.assessment_id,
        topic_id=request.topic_id,
        question_type=bank_question.question_type,
        difficulty=bank_question.difficulty,
        title=qdata.get("title", bank_question.topic),
        problem_statement=qdata.get("problem_statement", ""),
        options=qdata.get("options"),
        test_cases=qdata.get("test_cases"),
        starter_code=qdata.get("starter_code"),
        constraints=qdata.get("constraints"),
        examples=qdata.get("examples"),
        hints=qdata.get("hints"),
        sample_answer=qdata.get("sample_answer"),
        key_points=qdata.get("key_points"),
        evaluation_rubric=qdata.get("evaluation_rubric"),
        max_marks=qdata.get("max_marks", 10),
        estimated_time_minutes=qdata.get("estimated_time_minutes", 10),
        allowed_languages=qdata.get("allowed_languages"),
        tags=bank_question.tags,
        is_ai_generated=False,
        sequence_order=max_seq + 1,
    )

    db.add(question)

    # Update assessment totals
    assessment.total_questions = (assessment.total_questions or 0) + 1
    assessment.total_duration_minutes = (assessment.total_duration_minutes or 0) + (qdata.get("estimated_time_minutes", 10))
    assessment.max_score = (assessment.max_score or 0) + (qdata.get("max_marks", 10))

    # Increment bank question usage count
    bank_question.usage_count = (bank_question.usage_count or 0) + 1

    await db.commit()
    await db.refresh(question)

    return {
        "success": True,
        "question_id": str(question.id),
        "message": f"Question added to assessment",
    }


@router.post("/import-from-assessment", response_model=ImportResponse)
async def import_from_assessment(
    request: ImportFromAssessmentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
) -> ImportResponse:
    """Import questions from an assessment into the question bank."""
    # Verify assessment exists
    assessment = await db.get(Assessment, request.assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # Get questions to import
    query = select(Question).where(
        Question.assessment_id == request.assessment_id,
        Question.deleted_at.is_(None),
    )

    if request.question_ids:
        query = query.where(Question.id.in_(request.question_ids))

    result = await db.execute(query)
    questions = result.scalars().all()

    imported_count = 0
    skipped_count = 0
    skipped_ids = []

    for q in questions:
        # Check if already in bank (by title and type)
        existing_query = select(QuestionBank).where(
            QuestionBank.organization_id == assessment.organization_id,
            QuestionBank.question_type == q.question_type,
            QuestionBank.question_data["title"].astext == q.title,
        )
        existing_result = await db.execute(existing_query)
        existing = existing_result.scalar_one_or_none()

        if existing:
            skipped_count += 1
            skipped_ids.append(str(q.id))
            continue

        # Create bank entry
        bank_entry = QuestionBank(
            organization_id=assessment.organization_id,
            topic=q.title[:255] if q.title else "Untitled",
            subtopic=q.topic.topic if q.topic else None,
            question_type=q.question_type,
            difficulty=q.difficulty,
            question_data={
                "title": q.title,
                "problem_statement": q.problem_statement,
                "options": q.options,
                "test_cases": q.test_cases,
                "starter_code": q.starter_code,
                "constraints": q.constraints,
                "examples": q.examples,
                "hints": q.hints,
                "sample_answer": q.sample_answer,
                "key_points": q.key_points,
                "evaluation_rubric": q.evaluation_rubric,
                "max_marks": q.max_marks,
                "estimated_time_minutes": q.estimated_time_minutes,
                "allowed_languages": q.allowed_languages,
            },
            tags=q.tags or [],
            is_verified=False,
            is_public=False,
            created_by=str(current_user.id),
        )
        db.add(bank_entry)
        imported_count += 1

    await db.commit()

    return ImportResponse(
        imported_count=imported_count,
        skipped_count=skipped_count,
        skipped_ids=skipped_ids,
        message=f"Imported {imported_count} questions, skipped {skipped_count} duplicates",
    )


@router.post("/{bank_id}/verify")
async def verify_bank_question(
    bank_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
) -> QuestionBankDetailResponse:
    """Mark a question bank entry as verified."""
    bank_question = await db.get(QuestionBank, bank_id)
    if not bank_question:
        raise HTTPException(status_code=404, detail="Question bank entry not found")

    bank_question.is_verified = True
    await db.commit()
    await db.refresh(bank_question)

    return await get_bank_question(str(bank_question.id), db, current_user)


@router.post("/{bank_id}/publish")
async def publish_bank_question(
    bank_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
) -> QuestionBankDetailResponse:
    """Make a question bank entry public."""
    bank_question = await db.get(QuestionBank, bank_id)
    if not bank_question:
        raise HTTPException(status_code=404, detail="Question bank entry not found")

    bank_question.is_public = True
    await db.commit()
    await db.refresh(bank_question)

    return await get_bank_question(str(bank_question.id), db, current_user)
