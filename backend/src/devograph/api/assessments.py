"""Assessment management API endpoints."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.core.config import get_settings
from devograph.core.database import get_db
from devograph.schemas.assessment import (
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
from devograph.services.assessment_service import AssessmentService
from devograph.models.assessment import Assessment
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
    from devograph.schemas.assessment import QuestionTypeConfig, DifficultyLevel

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
    from devograph.schemas.assessment import TopicConfig, QuestionTypeConfig, DifficultyLevel
    from devograph.llm.gateway import get_llm_gateway
    from devograph.llm.prompts import TOPIC_SUGGESTION_SYSTEM_PROMPT, TOPIC_SUGGESTION_PROMPT
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
    """AI-powered question generation."""
    # TODO: Implement with LLM gateway
    # For now, return placeholder
    return GeneratedQuestionResponse(
        questions=[],
        generation_metadata={"status": "not_implemented"},
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
            inv_dict["latest_score"] = float(latest.percentage_score) if latest.percentage_score else None
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

        return PublishResponse(
            assessment_id=assessment.id,
            status=assessment.status,
            published_at=assessment.published_at,
            total_invitations=len(invitations),
            emails_sent=emails_sent,
            public_link=None,  # TODO: Generate public link
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
