"""Assessment management API endpoints."""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from aexy.core.config import get_settings
from aexy.core.database import get_db
from aexy.schemas.assessment import (
    AssessmentCreate,
    AssessmentUpdate,
    AssessmentResponse,
    AssessmentSummary,
    AssessmentStatus,
    Step1Data,
    Step2Data,
    Step3Data,
    Step4Data,
    Step5Data,
    WizardStatusResponse,
    TopicCreateRequest,
    TopicResponse,
    TopicConfig,
    TopicSuggestionRequest,
    TopicSuggestionResponse,
    QuestionCreate,
    QuestionUpdate,
    QuestionResponse,
    QuestionGenerationRequest,
    GeneratedQuestionResponse,
    CandidateCreate,
    CandidateResponse,
    CandidateImportRequest,
    CandidateImportResponse,
    InvitationResponse,
    InvitationWithAttempt,
    EmailTemplateConfig,
    PublishRequest,
    PublishResponse,
    PrePublishCheckResponse,
    AssessmentMetrics,
)
from aexy.services.assessment_service import AssessmentService
from aexy.services.r2_upload_service import get_r2_upload_service
from aexy.models.assessment import Assessment
from sqlalchemy import inspect

router = APIRouter(prefix="/assessments")
settings = get_settings()
security = HTTPBearer()


async def get_current_developer_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """Extract and validate developer ID from JWT token."""
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.secret_key,
            algorithms=[settings.algorithm],
        )
        developer_id = payload.get("sub")
        if developer_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )
        return developer_id
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from e


def build_assessment_response(assessment: Assessment) -> AssessmentResponse:
    """Build AssessmentResponse with computed fields."""
    from aexy.schemas.assessment import QuestionTypeConfig, DifficultyLevel

    # Use inspect to check if relationships are loaded (avoid lazy loading)
    insp = inspect(assessment)
    unloaded = insp.unloaded

    # Convert topics to TopicConfig
    topics = []
    if 'topics' not in unloaded:
        for topic in assessment.topics:
            # Parse question_types from dict if stored that way
            qt = topic.question_types or {}
            if isinstance(qt, dict):
                question_types_config = QuestionTypeConfig(
                    code=qt.get("code", 0),
                    mcq=qt.get("mcq", 0),
                    subjective=qt.get("subjective", 0),
                    pseudo_code=qt.get("pseudo_code", 0),
                )
            else:
                question_types_config = QuestionTypeConfig()

            # Parse difficulty level
            difficulty_str = topic.difficulty_level or "medium"
            try:
                difficulty_level = DifficultyLevel(difficulty_str)
            except ValueError:
                difficulty_level = DifficultyLevel.MEDIUM

            topics.append(TopicConfig(
                id=topic.id,
                topic=topic.topic,
                subtopics=topic.subtopics or [],
                difficulty_level=difficulty_level,
                question_types=question_types_config,
                estimated_time_minutes=topic.estimated_time_minutes or 30,
                max_score=topic.max_score or 100,
                additional_requirements=topic.additional_requirements,
            ))

    # Count candidates from invitations (only if loaded)
    total_candidates = 0
    if 'invitations' not in unloaded:
        total_candidates = len(assessment.invitations)

    return AssessmentResponse(
        id=assessment.id,
        organization_id=assessment.organization_id,
        created_by=assessment.created_by,
        title=assessment.title,
        job_designation=assessment.job_designation,
        department=assessment.department,
        experience_min=assessment.experience_min,
        experience_max=assessment.experience_max,
        include_freshers=assessment.include_freshers,
        skills=assessment.skills or [],
        enable_skill_weights=assessment.enable_skill_weights,
        description=assessment.description,
        schedule=assessment.schedule,
        proctoring_settings=assessment.proctoring_settings,
        security_settings=assessment.security_settings,
        candidate_fields=assessment.candidate_fields,
        email_template=assessment.email_template,
        topics=topics,
        total_questions=assessment.total_questions,
        total_duration_minutes=assessment.total_duration_minutes,
        total_candidates=total_candidates,
        max_score=assessment.max_score,
        max_attempts=assessment.max_attempts if hasattr(assessment, 'max_attempts') else 1,
        passing_score_percent=assessment.passing_score_percent if hasattr(assessment, 'passing_score_percent') else 60,
        status=AssessmentStatus(assessment.status),
        wizard_step=assessment.wizard_step,
        wizard_step_status=assessment.wizard_step_status or {},
        published_at=assessment.published_at,
        created_at=assessment.created_at,
        updated_at=assessment.updated_at,
    )


# =============================================================================
# ASSESSMENT CRUD
# =============================================================================


@router.post("", response_model=AssessmentResponse, status_code=status.HTTP_201_CREATED)
async def create_assessment(
    data: AssessmentCreate,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> AssessmentResponse:
    """Create a new assessment draft."""
    service = AssessmentService(db)
    assessment = await service.create_assessment(data, developer_id)
    return build_assessment_response(assessment)


@router.get("", response_model=dict[str, Any])
async def list_assessments(
    organization_id: str,
    status: AssessmentStatus | None = None,
    search: str | None = None,
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """List assessments with filters and pagination."""
    service = AssessmentService(db)
    assessments, total = await service.list_assessments(
        organization_id=organization_id,
        status=status,
        search=search,
        limit=limit,
        offset=offset,
    )
    return {
        "items": [AssessmentSummary.model_validate(a) for a in assessments],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{assessment_id}", response_model=AssessmentResponse)
async def get_assessment(
    assessment_id: str,
    organization_id: str | None = None,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> AssessmentResponse:
    """Get assessment by ID."""
    service = AssessmentService(db)
    assessment = await service.get_assessment(assessment_id, organization_id)
    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found",
        )
    return build_assessment_response(assessment)


@router.put("/{assessment_id}", response_model=AssessmentResponse)
async def update_assessment(
    assessment_id: str,
    data: AssessmentUpdate,
    organization_id: str | None = None,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> AssessmentResponse:
    """Update assessment."""
    service = AssessmentService(db)
    assessment = await service.update_assessment(assessment_id, data, organization_id)
    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found",
        )
    return build_assessment_response(assessment)


@router.delete("/{assessment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assessment(
    assessment_id: str,
    organization_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete assessment (drafts only)."""
    service = AssessmentService(db)
    try:
        deleted = await service.delete_assessment(assessment_id, organization_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assessment not found",
            )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/{assessment_id}/clone", response_model=AssessmentResponse, status_code=status.HTTP_201_CREATED)
async def clone_assessment(
    assessment_id: str,
    organization_id: str,
    title: str | None = None,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> AssessmentResponse:
    """Clone an assessment as a new draft."""
    service = AssessmentService(db)
    assessment = await service.clone_assessment(
        assessment_id,
        organization_id,
        developer_id,
        new_title=title,
    )
    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found",
        )
    return build_assessment_response(assessment)


# =============================================================================
# WIZARD ENDPOINTS
# =============================================================================


@router.get("/{assessment_id}/wizard/status", response_model=WizardStatusResponse)
async def get_wizard_status(
    assessment_id: str,
    organization_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> WizardStatusResponse:
    """Get wizard completion status."""
    service = AssessmentService(db)
    status = await service.get_wizard_status(assessment_id, organization_id)
    if not status:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found",
        )
    return WizardStatusResponse(**status)


@router.put("/{assessment_id}/step/1", response_model=AssessmentResponse)
async def save_step_1(
    assessment_id: str,
    data: Step1Data,
    organization_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> AssessmentResponse:
    """Save Step 1: Assessment Details."""
    service = AssessmentService(db)
    assessment = await service.save_step_1(assessment_id, data, organization_id)
    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found",
        )
    return build_assessment_response(assessment)


@router.put("/{assessment_id}/step/2", response_model=AssessmentResponse)
async def save_step_2(
    assessment_id: str,
    data: Step2Data,
    organization_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> AssessmentResponse:
    """Save Step 2: Topic Distribution."""
    service = AssessmentService(db)
    assessment = await service.save_step_2(assessment_id, data, organization_id)
    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found",
        )
    return build_assessment_response(assessment)


@router.put("/{assessment_id}/step/3", response_model=AssessmentResponse)
async def save_step_3(
    assessment_id: str,
    data: Step3Data,
    organization_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> AssessmentResponse:
    """Save Step 3: Schedule & Settings."""
    service = AssessmentService(db)
    assessment = await service.save_step_3(assessment_id, data, organization_id)
    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found",
        )
    return build_assessment_response(assessment)


@router.put("/{assessment_id}/step/4", response_model=AssessmentResponse)
async def save_step_4(
    assessment_id: str,
    data: Step4Data,
    organization_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> AssessmentResponse:
    """Save Step 4: Add Candidates."""
    service = AssessmentService(db)
    assessment = await service.save_step_4(assessment_id, data, organization_id)
    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found",
        )
    return build_assessment_response(assessment)


@router.put("/{assessment_id}/step/5", response_model=AssessmentResponse)
async def save_step_5(
    assessment_id: str,
    data: Step5Data,
    organization_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> AssessmentResponse:
    """Save Step 5: Review & Confirm."""
    service = AssessmentService(db)
    assessment = await service.save_step_5(assessment_id, data, organization_id)
    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found",
        )
    return build_assessment_response(assessment)


# =============================================================================
# TOPIC ENDPOINTS
# =============================================================================


@router.get("/{assessment_id}/topics", response_model=list[TopicResponse])
async def list_topics(
    assessment_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> list[TopicResponse]:
    """Get all topics for an assessment."""
    service = AssessmentService(db)
    topics = await service.get_topics(assessment_id)
    return [TopicResponse.model_validate(t) for t in topics]


@router.post("/{assessment_id}/topics/suggest", response_model=TopicSuggestionResponse)
async def suggest_topics(
    assessment_id: str,
    data: TopicSuggestionRequest,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> TopicSuggestionResponse:
    """AI-powered topic suggestions based on skills."""
    from aexy.schemas.assessment import TopicConfig, QuestionTypeConfig, DifficultyLevel
    from aexy.llm.gateway import get_llm_gateway
    from aexy.llm.prompts import TOPIC_SUGGESTION_SYSTEM_PROMPT, TOPIC_SUGGESTION_PROMPT
    import json
    import logging

    logger = logging.getLogger(__name__)
    gateway = get_llm_gateway()

    if gateway is None:
        # Fallback to placeholder suggestions if LLM is not configured
        logger.warning("LLM gateway not configured, using fallback topic suggestions")
        suggested_topics = []
        for skill in data.skills[:data.count]:
            suggested_topics.append(TopicConfig(
                topic=f"{skill} Fundamentals",
                subtopics=[f"{skill} Basics", f"{skill} Best Practices"],
                difficulty_level=DifficultyLevel.MEDIUM,
                question_types=QuestionTypeConfig(code=1, mcq=3, subjective=1),
                estimated_time_minutes=30,
                max_score=100,
            ))
        return TopicSuggestionResponse(
            topics=suggested_topics,
            rationale=f"Topics suggested based on {len(data.skills)} skills for {data.job_designation}",
        )

    # Build the prompt
    prompt = TOPIC_SUGGESTION_PROMPT.format(
        job_designation=data.job_designation,
        skills=", ".join(data.skills),
        experience_level=data.experience_level or "mid",
        count=data.count or 5,
    )

    try:
        # Call the LLM provider directly using internal API
        response_text, _, _, _ = await gateway.provider._call_api(
            system_prompt=TOPIC_SUGGESTION_SYSTEM_PROMPT,
            user_prompt=prompt,
        )

        # Parse the JSON response
        response_text = response_text.strip()
        # Handle markdown code blocks
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()

        result = json.loads(response_text)

        # Convert to TopicConfig objects
        suggested_topics = []
        for topic_data in result.get("topics", []):
            # Parse question_types - might be array or dict
            qt = topic_data.get("question_types", ["mcq"])
            if isinstance(qt, list):
                question_types = QuestionTypeConfig(
                    mcq=3 if "mcq" in qt else 0,
                    code=2 if "code" in qt else 0,
                    subjective=1 if "subjective" in qt else 0,
                )
            else:
                question_types = QuestionTypeConfig(
                    mcq=qt.get("mcq", 0),
                    code=qt.get("code", 0),
                    subjective=qt.get("subjective", 0),
                )

            # Parse difficulty
            difficulty_str = topic_data.get("difficulty_distribution", {})
            # Determine dominant difficulty
            if isinstance(difficulty_str, dict):
                if difficulty_str.get("hard", 0) >= 50:
                    difficulty = DifficultyLevel.HARD
                elif difficulty_str.get("easy", 0) >= 50:
                    difficulty = DifficultyLevel.EASY
                else:
                    difficulty = DifficultyLevel.MEDIUM
            else:
                difficulty = DifficultyLevel.MEDIUM

            suggested_topics.append(TopicConfig(
                topic=topic_data.get("name", topic_data.get("topic", "Unknown Topic")),
                subtopics=topic_data.get("subtopics", []),
                difficulty_level=difficulty,
                question_types=question_types,
                estimated_time_minutes=topic_data.get("duration_minutes", 30),
                max_score=topic_data.get("question_count", 5) * 20,
            ))

        return TopicSuggestionResponse(
            topics=suggested_topics,
            rationale=result.get("coverage_summary", f"AI-suggested topics for {data.job_designation}"),
        )

    except Exception as e:
        logger.error(f"Error generating AI topic suggestions: {e}")
        # Fallback to basic suggestions
        suggested_topics = []
        for skill in data.skills[:data.count]:
            suggested_topics.append(TopicConfig(
                topic=f"{skill} Fundamentals",
                subtopics=[f"{skill} Basics", f"{skill} Best Practices"],
                difficulty_level=DifficultyLevel.MEDIUM,
                question_types=QuestionTypeConfig(code=1, mcq=3, subjective=1),
                estimated_time_minutes=30,
                max_score=100,
            ))
        return TopicSuggestionResponse(
            topics=suggested_topics,
            rationale=f"Topics suggested based on {len(data.skills)} skills for {data.job_designation}",
        )


# =============================================================================
# QUESTION ENDPOINTS
# =============================================================================


@router.get("/{assessment_id}/questions", response_model=list[QuestionResponse])
async def list_questions(
    assessment_id: str,
    topic_id: str | None = None,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> list[QuestionResponse]:
    """Get all questions for an assessment."""
    service = AssessmentService(db)
    questions = await service.get_questions(assessment_id, topic_id)
    return [QuestionResponse.model_validate(q) for q in questions]


@router.post("/{assessment_id}/questions", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
async def create_question(
    assessment_id: str,
    data: QuestionCreate,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> QuestionResponse:
    """Add a question to assessment."""
    service = AssessmentService(db)
    question_data = data.model_dump()
    question = await service.add_question(assessment_id, question_data)
    return QuestionResponse.model_validate(question)


@router.put("/{assessment_id}/questions/{question_id}", response_model=QuestionResponse)
async def update_question(
    assessment_id: str,
    question_id: str,
    data: QuestionUpdate,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> QuestionResponse:
    """Update a question."""
    service = AssessmentService(db)
    update_data = data.model_dump(exclude_unset=True)
    question = await service.update_question(question_id, update_data)
    if not question:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question not found",
        )
    return QuestionResponse.model_validate(question)


@router.delete("/{assessment_id}/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_question(
    assessment_id: str,
    question_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a question."""
    service = AssessmentService(db)
    deleted = await service.delete_question(question_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question not found",
        )


@router.post("/{assessment_id}/questions/generate", response_model=GeneratedQuestionResponse)
async def generate_questions(
    assessment_id: str,
    data: QuestionGenerationRequest,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> GeneratedQuestionResponse:
    """AI-powered question generation.

    Uses the LLM gateway to generate assessment questions based on the topic,
    question type, difficulty level, and optional context.
    Includes assessment context (job role, skills, experience) for better relevance.
    """
    from aexy.services.question_generation_service import QuestionGenerationService
    from aexy.models.assessment import AssessmentTopic
    from aexy.models.repository import Organization

    # Get topic information
    topic_stmt = select(AssessmentTopic).where(AssessmentTopic.id == data.topic_id)
    topic_result = await db.execute(topic_stmt)
    topic = topic_result.scalar_one_or_none()

    if not topic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Topic not found",
        )

    # Get assessment information for context
    assessment_stmt = select(Assessment).where(Assessment.id == assessment_id)
    assessment_result = await db.execute(assessment_stmt)
    assessment = assessment_result.scalar_one_or_none()

    # Get organization name
    organization_name = ""
    if assessment and assessment.organization_id:
        org_stmt = select(Organization).where(Organization.id == assessment.organization_id)
        org_result = await db.execute(org_stmt)
        org = org_result.scalar_one_or_none()
        if org:
            organization_name = org.name or ""

    # Build context from assessment
    job_designation = assessment.job_designation if assessment else ""
    skills = [s.get("name", s) if isinstance(s, dict) else s for s in (assessment.skills or [])] if assessment else []
    experience_min = assessment.experience_min if assessment else None
    experience_max = assessment.experience_max if assessment else None

    # Determine experience level
    if experience_min is not None:
        if experience_min < 2:
            experience_level = "junior"
        elif experience_min < 5:
            experience_level = "mid"
        else:
            experience_level = "senior"
    else:
        experience_level = "mid"

    # Format experience years
    if experience_min is not None and experience_max is not None:
        experience_years = f"{experience_min}-{experience_max} years"
    elif experience_min is not None:
        experience_years = f"{experience_min}+ years"
    else:
        experience_years = "Not specified"

    assessment_description = assessment.description if assessment else ""

    # Initialize service and generate questions with full context
    service = QuestionGenerationService(db)

    # Check if LLM gateway is available
    if not service.gateway:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI question generation is not available. Please configure LLM provider (GEMINI_API_KEY or ANTHROPIC_API_KEY) in environment settings.",
        )

    try:
        generated = await service.generate_questions(
            topic=topic.topic,
            question_type=data.question_type,
            difficulty=data.difficulty,
            count=data.count,
            subtopics=topic.subtopics,
            context=data.context,
            # Assessment context for better question relevance
            job_designation=job_designation,
            skills=skills,
            experience_level=experience_level,
            experience_years=experience_years,
            organization_name=organization_name,
            assessment_description=assessment_description,
        )
    except Exception as e:
        logger.error(f"Question generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI question generation failed: {str(e)}",
        )

    # If no questions were generated, throw an error
    if not generated:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI failed to generate questions. Please try again or check LLM configuration.",
        )

    # Convert generated data to QuestionCreate schemas
    questions = []
    for q_data in generated:
        try:
            question = QuestionCreate(
                topic_id=data.topic_id,
                question_type=data.question_type,
                difficulty=data.difficulty,
                title=q_data.get("title", q_data.get("question_text", "Generated Question")[:100]),
                problem_statement=q_data.get("problem_statement", q_data.get("question_text", "")),
                max_marks=q_data.get("max_marks", q_data.get("total_points", q_data.get("points", 10))),
                estimated_time_minutes=q_data.get("time_limit", q_data.get("time_estimate_minutes", 10)),
                # Code specific
                test_cases=q_data.get("test_cases", []),
                starter_code=q_data.get("starter_code", {}),
                constraints=q_data.get("constraints", []),
                examples=q_data.get("examples", []),
                hints=q_data.get("hints", []),
                # MCQ specific
                options=q_data.get("options", []),
                allow_multiple=q_data.get("allow_multiple", False),
                # Subjective specific
                sample_answer=q_data.get("sample_answer"),
                key_points=q_data.get("key_points", q_data.get("expected_keywords", [])),
                tags=q_data.get("tags", []),
            )
            questions.append(question)
        except Exception as e:
            logger.warning(f"Failed to convert generated question: {e}")
            continue

    return GeneratedQuestionResponse(
        questions=questions,
        generation_metadata={
            "status": "success" if questions else "fallback",
            "generated_count": len(questions),
            "requested_count": data.count,
            "topic": topic.topic,
            "question_type": data.question_type.value,
            "difficulty": data.difficulty.value,
        },
    )


# =============================================================================
# CANDIDATE ENDPOINTS
# =============================================================================


@router.get("/{assessment_id}/candidates", response_model=list[InvitationWithAttempt])
async def list_candidates(
    assessment_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> list[InvitationWithAttempt]:
    """Get all candidates for an assessment."""
    service = AssessmentService(db)
    invitations = await service.get_candidates(assessment_id)

    result = []
    for inv in invitations:
        inv_dict = {
            "id": inv.id,
            "assessment_id": inv.assessment_id,
            "candidate_id": inv.candidate_id,
            "candidate": CandidateResponse.model_validate(inv.candidate),
            "invitation_token": inv.invitation_token,
            "status": inv.status,
            "invited_at": inv.invited_at,
            "email_sent_at": inv.email_sent_at,
            "started_at": inv.started_at,
            "completed_at": inv.completed_at,
            "deadline": inv.deadline,
            "attempt_count": len(inv.attempts) if hasattr(inv, "attempts") else 0,
            "latest_score": None,
            "latest_trust_score": None,
        }
        if hasattr(inv, "attempts") and inv.attempts:
            latest = sorted(inv.attempts, key=lambda a: a.created_at, reverse=True)[0]
            inv_dict["latest_score"] = float(latest.total_score) if latest.total_score else None
            inv_dict["latest_trust_score"] = float(latest.trust_score) if latest.trust_score else None

        result.append(InvitationWithAttempt(**inv_dict))

    return result


@router.post("/{assessment_id}/candidates", response_model=InvitationResponse, status_code=status.HTTP_201_CREATED)
async def add_candidate(
    assessment_id: str,
    data: CandidateCreate,
    organization_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> InvitationResponse:
    """Add a candidate to assessment."""
    service = AssessmentService(db)
    candidate, invitation = await service.add_candidate(assessment_id, organization_id, data)

    return InvitationResponse(
        id=invitation.id,
        assessment_id=invitation.assessment_id,
        candidate_id=invitation.candidate_id,
        candidate=CandidateResponse.model_validate(candidate),
        invitation_token=invitation.invitation_token,
        status=invitation.status,
        invited_at=invitation.invited_at,
        email_sent_at=invitation.email_sent_at,
        started_at=invitation.started_at,
        completed_at=invitation.completed_at,
        deadline=invitation.deadline,
    )


@router.post("/{assessment_id}/candidates/import", response_model=CandidateImportResponse)
async def import_candidates(
    assessment_id: str,
    data: CandidateImportRequest,
    organization_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> CandidateImportResponse:
    """Bulk import candidates."""
    service = AssessmentService(db)
    result = await service.import_candidates(assessment_id, organization_id, data.candidates)
    return CandidateImportResponse(**result)


@router.delete("/{assessment_id}/candidates/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_candidate(
    assessment_id: str,
    candidate_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a candidate from assessment."""
    service = AssessmentService(db)
    try:
        removed = await service.remove_candidate(assessment_id, candidate_id)
        if not removed:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found in assessment",
            )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# =============================================================================
# EMAIL TEMPLATE
# =============================================================================


@router.get("/{assessment_id}/email-template", response_model=EmailTemplateConfig)
async def get_email_template(
    assessment_id: str,
    organization_id: str | None = None,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> EmailTemplateConfig:
    """Get email template for assessment."""
    service = AssessmentService(db)
    assessment = await service.get_assessment(assessment_id, organization_id)
    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found",
        )

    if assessment.email_template:
        return EmailTemplateConfig(**assessment.email_template)
    return EmailTemplateConfig()


@router.put("/{assessment_id}/email-template", response_model=EmailTemplateConfig)
async def update_email_template(
    assessment_id: str,
    data: EmailTemplateConfig,
    organization_id: str | None = None,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> EmailTemplateConfig:
    """Update email template for assessment."""
    service = AssessmentService(db)
    assessment = await service.get_assessment(assessment_id, organization_id)
    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found",
        )

    assessment.email_template = data.model_dump()
    await db.flush()
    return data


# =============================================================================
# PUBLISHING
# =============================================================================


@router.get("/{assessment_id}/publish/check", response_model=PrePublishCheckResponse)
async def pre_publish_check(
    assessment_id: str,
    organization_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> PrePublishCheckResponse:
    """Check if assessment is ready to publish."""
    service = AssessmentService(db)
    result = await service.pre_publish_check(assessment_id, organization_id)
    return PrePublishCheckResponse(**result)


@router.post("/{assessment_id}/publish", response_model=PublishResponse)
async def publish_assessment(
    assessment_id: str,
    data: PublishRequest,
    organization_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> PublishResponse:
    """Publish assessment and send invitations."""
    service = AssessmentService(db)
    try:
        assessment = await service.publish_assessment(
            assessment_id,
            organization_id,
            data.send_invitations,
        )
        if not assessment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assessment not found",
            )

        # Count invitations
        invitations = await service.get_candidates(assessment_id)
        emails_sent = len([i for i in invitations if i.email_sent_at]) if data.send_invitations else 0

        # Generate public link
        settings = get_settings()
        public_link = None
        if assessment.public_token:
            # Use frontend URL from settings or default
            frontend_url = getattr(settings, "frontend_url", "http://localhost:3000")
            public_link = f"{frontend_url}/take-assessment/{assessment.public_token}"

        return PublishResponse(
            assessment_id=assessment.id,
            status=assessment.status,
            published_at=assessment.published_at,
            total_invitations=len(invitations),
            emails_sent=emails_sent,
            public_link=public_link,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# =============================================================================
# METRICS
# =============================================================================


@router.get("/{assessment_id}/metrics", response_model=AssessmentMetrics)
async def get_assessment_metrics(
    assessment_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> AssessmentMetrics:
    """Get metrics for a specific assessment."""
    service = AssessmentService(db)
    metrics = await service.get_assessment_metrics(assessment_id)
    return AssessmentMetrics(**metrics)


@router.get("/organization/{organization_id}/metrics", response_model=dict[str, Any])
async def get_organization_metrics(
    organization_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get aggregate metrics for organization dashboard."""
    service = AssessmentService(db)
    metrics = await service.get_organization_metrics(organization_id)
    return metrics


# =============================================================================
# PUBLIC ASSESSMENT ACCESS
# =============================================================================


@router.get("/public/{public_token}", response_model=dict[str, Any])
async def get_assessment_by_public_token(
    public_token: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get assessment info by public token (no authentication required).

    This endpoint is used by candidates accessing the assessment via the public link.
    Returns limited info about the assessment suitable for the taking interface.
    """
    from aexy.models.assessment import Assessment

    # Find assessment by public token
    stmt = select(Assessment).where(Assessment.public_token == public_token)
    result = await db.execute(stmt)
    assessment = result.scalar_one_or_none()

    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found or link has expired",
        )

    # Check if assessment is active
    if assessment.status != AssessmentStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This assessment is not currently accepting submissions",
        )

    # Check schedule if applicable
    schedule = assessment.schedule or {}
    if schedule.get("end_date"):
        from datetime import datetime, timezone
        end_date = datetime.fromisoformat(schedule["end_date"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > end_date:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This assessment has ended",
            )

    # Return limited public info
    return {
        "id": assessment.id,
        "title": assessment.title,
        "job_designation": assessment.job_designation,
        "department": assessment.department,
        "description": assessment.description,
        "total_questions": assessment.total_questions,
        "total_duration_minutes": assessment.total_duration_minutes,
        "max_attempts": assessment.max_attempts,
        "passing_score_percent": assessment.passing_score_percent,
        "proctoring_settings": assessment.proctoring_settings,
        "candidate_fields": assessment.candidate_fields,
        "schedule": {
            "start_date": schedule.get("start_date"),
            "end_date": schedule.get("end_date"),
            "time_zone": schedule.get("time_zone"),
        },
    }


@router.post("/public/{public_token}/register", response_model=dict[str, Any])
async def register_for_public_assessment(
    public_token: str,
    candidate_data: CandidateCreate,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Register a candidate for a public assessment.

    Creates a candidate and invitation, returns the invitation token for taking the assessment.
    """
    from aexy.models.assessment import Assessment

    # Find assessment by public token
    stmt = select(Assessment).where(Assessment.public_token == public_token)
    result = await db.execute(stmt)
    assessment = result.scalar_one_or_none()

    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found or link has expired",
        )

    # Check if assessment is active
    if assessment.status != AssessmentStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This assessment is not currently accepting submissions",
        )

    # Create candidate and invitation
    service = AssessmentService(db)

    try:
        candidate, invitation = await service.add_candidate(
            assessment.id,
            assessment.organization_id,
            candidate_data,
        )

        return {
            "status": "registered",
            "candidate_id": candidate.id,
            "invitation_token": invitation.invitation_token,
            "message": "Registration successful. You can now start the assessment.",
        }
    except Exception as e:
        # Check if candidate already exists for this assessment
        if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You have already registered for this assessment",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get(
    "/{assessment_id}/candidates/{invitation_id}/details",
    response_model=dict[str, Any],
    tags=["assessments"],
)
async def get_candidate_details(
    assessment_id: str,
    invitation_id: str,
    workspace_id: str | None = Query(None),
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Get detailed candidate information including attempt, submissions, and proctoring data."""
    from aexy.models.assessment import (
        AssessmentInvitation,
        AssessmentAttempt,
        QuestionSubmission,
        SubmissionEvaluation,
        Question,
        ProctoringEvent,
    )
    from aexy.services.proctoring_service import ProctoringService

    # Get assessment
    service = AssessmentService(db)
    assessment = await service.get_assessment(assessment_id, workspace_id)

    if not assessment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment not found"
        )

    # Get invitation with candidate
    invitation_query = (
        select(AssessmentInvitation)
        .where(
            AssessmentInvitation.id == invitation_id,
            AssessmentInvitation.assessment_id == assessment_id
        )
    )
    result = await db.execute(invitation_query)
    invitation = result.scalar_one_or_none()

    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found"
        )

    # Get attempt
    attempt_query = (
        select(AssessmentAttempt)
        .where(AssessmentAttempt.invitation_id == invitation_id)
        .order_by(AssessmentAttempt.created_at.desc())
    )
    result = await db.execute(attempt_query)
    attempt = result.scalar_one_or_none()

    if not attempt:
        return {
            "candidate": {
                "id": invitation.candidate_id,
                "name": invitation.candidate.name if invitation.candidate else None,
                "email": invitation.candidate.email if invitation.candidate else None,
            },
            "status": invitation.status.value if hasattr(invitation.status, 'value') else invitation.status,
            "invited_at": invitation.invited_at.isoformat() if invitation.invited_at else None,
            "attempt": None,
        }

    # Get all submissions for this attempt
    submissions_query = (
        select(QuestionSubmission, SubmissionEvaluation, Question)
        .outerjoin(SubmissionEvaluation, SubmissionEvaluation.submission_id == QuestionSubmission.id)
        .join(Question, Question.id == QuestionSubmission.question_id)
        .where(QuestionSubmission.attempt_id == attempt.id)
        .order_by(Question.sequence_order)
    )
    result = await db.execute(submissions_query)
    submission_rows = result.all()

    # Format submissions with evaluations
    submissions = []
    for submission, evaluation, question in submission_rows:
        submission_data = {
            "question_id": str(question.id),
            "question_title": question.title,
            "question_type": question.question_type.value if hasattr(question.question_type, 'value') else question.question_type,
            "difficulty": question.difficulty.value if hasattr(question.difficulty, 'value') else question.difficulty,
            "max_marks": question.max_marks,
            "sequence": question.sequence_order,
            "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
            "time_taken_seconds": submission.time_taken_seconds,
            "evaluation": None,
        }

        if evaluation:
            submission_data["evaluation"] = {
                "marks_obtained": float(evaluation.marks_obtained) if evaluation.marks_obtained else 0,
                "percentage": float(evaluation.percentage) if evaluation.percentage else 0,
                "feedback": evaluation.feedback,
                "test_case_results": evaluation.test_case_results if hasattr(evaluation, 'test_case_results') else None,
                "evaluated_at": evaluation.evaluated_at.isoformat() if evaluation.evaluated_at else None,
            }

        submissions.append(submission_data)

    # Get proctoring summary
    proctoring_summary = attempt.proctoring_summary or {}

    # Get detailed proctoring events if proctoring was enabled
    proctoring_details = None
    if assessment.proctoring_settings.get("enabled", False):
        proctoring_service = ProctoringService(db)

        # Get event breakdown
        event_breakdown = await proctoring_service.get_trust_score_breakdown(str(attempt.id))

        # Get all events
        events_query = (
            select(ProctoringEvent)
            .where(ProctoringEvent.attempt_id == attempt.id)
            .order_by(ProctoringEvent.timestamp)
        )
        result = await db.execute(events_query)
        all_events = result.scalars().all()

        # Format events
        events_list = []
        for event in all_events:
            events_list.append({
                "event_type": event.event_type,
                "severity": event.severity.value if hasattr(event.severity, 'value') else event.severity,
                "timestamp": event.timestamp.isoformat() if event.timestamp else None,
                "event_data": event.event_data,
            })

        # Generate presigned URLs for recordings if they exist
        webcam_url = None
        screen_url = None
        r2_service = get_r2_upload_service()

        if r2_service.is_configured():
            # Extract R2 key from the stored URL and generate presigned URL
            if attempt.webcam_recording_url:
                # URL format: https://{bucket}.{account_id}.r2.cloudflarestorage.com/{key}
                # Extract the key (everything after the domain)
                try:
                    url_parts = attempt.webcam_recording_url.split(".r2.cloudflarestorage.com/")
                    if len(url_parts) == 2:
                        key = url_parts[1]
                        webcam_url = await r2_service.generate_presigned_download_url(key, expires_in=3600)
                except Exception as e:
                    logger.warning(f"Failed to generate presigned URL for webcam recording: {e}")

            if attempt.screen_recording_url:
                try:
                    url_parts = attempt.screen_recording_url.split(".r2.cloudflarestorage.com/")
                    if len(url_parts) == 2:
                        key = url_parts[1]
                        screen_url = await r2_service.generate_presigned_download_url(key, expires_in=3600)
                except Exception as e:
                    logger.warning(f"Failed to generate presigned URL for screen recording: {e}")

        proctoring_details = {
            "trust_score": event_breakdown.get("trust_score", 100),
            "trust_level": event_breakdown.get("trust_level", "excellent"),
            "total_events": event_breakdown.get("total_events", 0),
            "critical_events": event_breakdown.get("critical_events", 0),
            "event_summary": event_breakdown.get("event_summary", {}),
            "deductions": event_breakdown.get("deductions", {}),
            "events": events_list,
            "webcam_recording_url": webcam_url,
            "screen_recording_url": screen_url,
        }

    # Build response
    return {
        "candidate": {
            "id": invitation.candidate_id,
            "name": invitation.candidate.name if invitation.candidate else None,
            "email": invitation.candidate.email if invitation.candidate else None,
        },
        "invitation": {
            "id": str(invitation.id),
            "status": invitation.status.value if hasattr(invitation.status, 'value') else invitation.status,
            "invited_at": invitation.invited_at.isoformat() if invitation.invited_at else None,
            "started_at": invitation.started_at.isoformat() if invitation.started_at else None,
            "completed_at": invitation.completed_at.isoformat() if invitation.completed_at else None,
        },
        "attempt": {
            "id": str(attempt.id),
            "attempt_number": attempt.attempt_number,
            "status": attempt.status.value if hasattr(attempt.status, 'value') else attempt.status,
            "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
            "completed_at": attempt.completed_at.isoformat() if attempt.completed_at else None,
            "time_taken_seconds": attempt.time_taken_seconds,
            "total_score": float(attempt.total_score) if attempt.total_score else None,
            "percentage_score": float(attempt.percentage_score) if attempt.percentage_score else None,
            "max_possible_score": attempt.max_possible_score,
        },
        "submissions": submissions,
        "proctoring": proctoring_details,
        "assessment": {
            "id": str(assessment.id),
            "title": assessment.title,
            "total_questions": assessment.total_questions,
            "max_score": assessment.max_score,
        },
    }
