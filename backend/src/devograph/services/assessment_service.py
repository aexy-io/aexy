"""Assessment service for managing assessments, questions, and candidates."""

import logging
import secrets
from datetime import datetime, timedelta
from typing import Any
from uuid import uuid4, UUID

from sqlalchemy import func, select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from devograph.models.assessment import (
    Assessment,
    AssessmentTopic,
    Question,
    Candidate,
    AssessmentInvitation,
    AssessmentAttempt,
    QuestionSubmission,
    SubmissionEvaluation,
    ProctoringEvent,
    AssessmentStatus,
    InvitationStatus,
    AttemptStatus,
)
from devograph.schemas.assessment import (
    AssessmentCreate,
    AssessmentUpdate,
    Step1Data,
    Step2Data,
    Step3Data,
    Step4Data,
    Step5Data,
    TopicConfig,
    CandidateCreate,
    WizardStepStatus,
    StepStatus,
)

logger = logging.getLogger(__name__)


class AssessmentService:
    """Service for assessment CRUD and wizard management."""

    def __init__(self, db: AsyncSession) -> None:
        """Initialize service with database session."""
        self.db = db

    # =========================================================================
    # ASSESSMENT CRUD
    # =========================================================================

    async def create_assessment(
        self,
        data: AssessmentCreate,
        created_by: str,
    ) -> Assessment:
        """Create a new assessment draft."""
        assessment = Assessment(
            id=str(uuid4()),
            organization_id=data.organization_id,
            created_by=created_by,
            title=data.title,
            job_designation=data.job_designation or "",
            status=AssessmentStatus.DRAFT.value,
            wizard_step=1,
            wizard_step_status={
                "step1": "incomplete",
                "step2": "incomplete",
                "step3": "incomplete",
                "step4": "incomplete",
                "step5": "incomplete",
            },
        )
        self.db.add(assessment)
        await self.db.flush()
        await self.db.refresh(assessment)
        return assessment

    async def clone_assessment(
        self,
        assessment_id: str,
        organization_id: str,
        created_by: str,
        new_title: str | None = None,
    ) -> Assessment | None:
        """Clone an existing assessment as a new draft."""
        # Get the source assessment with topics and questions
        source = await self.get_assessment(assessment_id, organization_id)
        if not source:
            return None

        # Create new assessment
        new_assessment = Assessment(
            id=str(uuid4()),
            organization_id=source.organization_id,
            created_by=created_by,
            title=new_title or f"{source.title} (Copy)",
            job_designation=source.job_designation,
            department=source.department,
            experience_min=source.experience_min,
            experience_max=source.experience_max,
            include_freshers=source.include_freshers,
            skills=source.skills.copy() if source.skills else [],
            enable_skill_weights=source.enable_skill_weights,
            description=source.description,
            schedule={},  # Reset schedule for clone
            proctoring_settings=source.proctoring_settings.copy() if source.proctoring_settings else {},
            security_settings=source.security_settings.copy() if source.security_settings else {},
            candidate_fields=source.candidate_fields.copy() if source.candidate_fields else {},
            email_template=source.email_template.copy() if source.email_template else {},
            total_questions=source.total_questions,
            total_duration_minutes=source.total_duration_minutes,
            max_score=source.max_score,
            max_attempts=source.max_attempts,
            passing_score_percent=source.passing_score_percent,
            status=AssessmentStatus.DRAFT.value,
            wizard_step=1,
            wizard_step_status={
                "step1": "complete" if source.title else "incomplete",
                "step2": "complete" if source.topics else "incomplete",
                "step3": "incomplete",  # Require new schedule
                "step4": "incomplete",  # Don't clone candidates
                "step5": "incomplete",
            },
        )
        self.db.add(new_assessment)
        await self.db.flush()

        # Clone topics
        if source.topics:
            for topic in source.topics:
                new_topic = AssessmentTopic(
                    id=str(uuid4()),
                    assessment_id=new_assessment.id,
                    topic=topic.topic,
                    subtopics=topic.subtopics.copy() if topic.subtopics else [],
                    difficulty_distribution=topic.difficulty_distribution.copy() if topic.difficulty_distribution else {},
                    question_types=topic.question_types.copy() if topic.question_types else [],
                    question_count=topic.question_count,
                    duration_minutes=topic.duration_minutes,
                    weight=topic.weight,
                    sequence_order=topic.sequence_order,
                )
                self.db.add(new_topic)

        # Clone questions
        if source.questions:
            for question in source.questions:
                new_question = Question(
                    id=str(uuid4()),
                    assessment_id=new_assessment.id,
                    topic_id=None,  # Topics have new IDs
                    question_type=question.question_type,
                    difficulty=question.difficulty,
                    problem_statement=question.problem_statement,
                    options=question.options.copy() if question.options else None,
                    correct_answer=question.correct_answer,
                    explanation=question.explanation,
                    test_cases=question.test_cases.copy() if question.test_cases else None,
                    starter_code=question.starter_code.copy() if question.starter_code else None,
                    rubric=question.rubric.copy() if question.rubric else None,
                    max_marks=question.max_marks,
                    time_limit_seconds=question.time_limit_seconds,
                    sequence_order=question.sequence_order,
                    tags=question.tags.copy() if question.tags else [],
                )
                self.db.add(new_question)

        await self.db.flush()

        # Re-fetch with relationships loaded to avoid lazy loading issues
        return await self.get_assessment(new_assessment.id, organization_id)

    async def get_assessment(
        self,
        assessment_id: str,
        organization_id: str | None = None,
    ) -> Assessment | None:
        """Get assessment by ID with optional organization filter."""
        query = select(Assessment).where(Assessment.id == assessment_id)
        if organization_id:
            query = query.where(Assessment.organization_id == organization_id)
        query = query.options(
            selectinload(Assessment.topics),
            selectinload(Assessment.questions),
            selectinload(Assessment.invitations).selectinload(AssessmentInvitation.candidate),
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_assessments(
        self,
        organization_id: str,
        status: AssessmentStatus | None = None,
        search: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[Assessment], int]:
        """List assessments with filters and pagination."""
        query = select(Assessment).where(
            Assessment.organization_id == organization_id
        )
        count_query = select(func.count(Assessment.id)).where(
            Assessment.organization_id == organization_id
        )

        if status:
            query = query.where(Assessment.status == status.value)
            count_query = count_query.where(Assessment.status == status.value)

        if search:
            search_filter = or_(
                Assessment.title.ilike(f"%{search}%"),
                Assessment.job_designation.ilike(f"%{search}%"),
            )
            query = query.where(search_filter)
            count_query = count_query.where(search_filter)

        # Get total count
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # Get paginated results
        query = query.order_by(Assessment.created_at.desc())
        query = query.offset(offset).limit(limit)
        result = await self.db.execute(query)
        assessments = list(result.scalars().all())

        return assessments, total

    async def update_assessment(
        self,
        assessment_id: str,
        data: AssessmentUpdate,
        organization_id: str | None = None,
    ) -> Assessment | None:
        """Update assessment fields."""
        assessment = await self.get_assessment(assessment_id, organization_id)
        if not assessment:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if hasattr(assessment, field):
                if field in ("schedule", "proctoring_settings", "security_settings", "candidate_fields", "email_template"):
                    # Convert Pydantic models to dicts
                    if value is not None and hasattr(value, "model_dump"):
                        value = value.model_dump()
                setattr(assessment, field, value)

        assessment.updated_at = datetime.utcnow()
        await self.db.flush()
        await self.db.refresh(assessment)
        return assessment

    async def delete_assessment(
        self,
        assessment_id: str,
        organization_id: str,
    ) -> bool:
        """Delete assessment (only drafts)."""
        assessment = await self.get_assessment(assessment_id, organization_id)
        if not assessment:
            return False

        if assessment.status != AssessmentStatus.DRAFT.value:
            raise ValueError("Can only delete draft assessments")

        await self.db.delete(assessment)
        return True

    # =========================================================================
    # WIZARD STEP MANAGEMENT
    # =========================================================================

    async def get_wizard_status(
        self,
        assessment_id: str,
        organization_id: str,
    ) -> dict[str, Any] | None:
        """Get wizard status for assessment."""
        assessment = await self.get_assessment(assessment_id, organization_id)
        if not assessment:
            return None

        # Check if can publish
        can_publish = all(
            status == "complete"
            for status in assessment.wizard_step_status.values()
        )

        return {
            "current_step": assessment.wizard_step,
            "step_status": assessment.wizard_step_status,
            "is_draft": assessment.status == AssessmentStatus.DRAFT.value,
            "last_saved_at": assessment.updated_at,
            "can_publish": can_publish,
            "validation_errors": {},
        }

    async def save_step_1(
        self,
        assessment_id: str,
        data: Step1Data,
        organization_id: str,
    ) -> Assessment | None:
        """Save Step 1: Assessment Details."""
        assessment = await self.get_assessment(assessment_id, organization_id)
        if not assessment:
            return None

        # Update assessment fields
        assessment.title = data.title
        assessment.job_designation = data.job_designation
        assessment.department = data.department
        assessment.experience_min = data.experience_min
        assessment.experience_max = data.experience_max
        assessment.include_freshers = data.include_freshers
        assessment.skills = [skill.model_dump() for skill in data.skills]
        assessment.enable_skill_weights = data.enable_skill_weights
        assessment.description = data.description

        # Update wizard status
        step_status = dict(assessment.wizard_step_status)
        step_status["step1"] = "complete"
        assessment.wizard_step_status = step_status

        if assessment.wizard_step < 2:
            assessment.wizard_step = 2

        assessment.updated_at = datetime.utcnow()
        await self.db.flush()
        await self.db.refresh(assessment)
        return assessment

    async def save_step_2(
        self,
        assessment_id: str,
        data: Step2Data,
        organization_id: str,
    ) -> Assessment | None:
        """Save Step 2: Topic Distribution."""
        assessment = await self.get_assessment(assessment_id, organization_id)
        if not assessment:
            return None

        # Delete existing topics
        existing_topics = await self.db.execute(
            select(AssessmentTopic).where(
                AssessmentTopic.assessment_id == assessment_id
            )
        )
        for topic in existing_topics.scalars():
            await self.db.delete(topic)

        # Create new topics
        total_duration = 0
        total_questions = 0
        total_score = 0

        for idx, topic_config in enumerate(data.topics):
            # Validate topic ID is a valid UUID, otherwise generate new one
            topic_id = str(uuid4())
            if topic_config.id:
                try:
                    # Try to parse as UUID to validate format
                    UUID(topic_config.id)
                    topic_id = topic_config.id
                except ValueError:
                    # Invalid UUID format, use generated one
                    pass

            topic = AssessmentTopic(
                id=topic_id,
                assessment_id=assessment_id,
                topic=topic_config.topic,
                subtopics=topic_config.subtopics,
                difficulty_level=topic_config.difficulty_level.value,
                question_types=topic_config.question_types.model_dump(),
                fullstack_config=topic_config.fullstack_config.model_dump() if topic_config.fullstack_config else None,
                estimated_time_minutes=topic_config.estimated_time_minutes,
                max_score=topic_config.max_score,
                additional_requirements=topic_config.additional_requirements,
                sequence_order=idx,
            )
            self.db.add(topic)

            total_duration += topic_config.estimated_time_minutes
            total_score += topic_config.max_score
            qt = topic_config.question_types
            total_questions += qt.code + qt.mcq + qt.subjective + qt.pseudo_code

        # Update assessment totals
        assessment.total_duration_minutes = total_duration
        assessment.total_questions = total_questions
        assessment.max_score = total_score

        # Update wizard status
        step_status = dict(assessment.wizard_step_status)
        step_status["step2"] = "complete"
        assessment.wizard_step_status = step_status

        if assessment.wizard_step < 3:
            assessment.wizard_step = 3

        assessment.updated_at = datetime.utcnow()
        await self.db.flush()
        await self.db.refresh(assessment)
        return assessment

    async def save_step_3(
        self,
        assessment_id: str,
        data: Step3Data,
        organization_id: str,
    ) -> Assessment | None:
        """Save Step 3: Schedule & Settings."""
        assessment = await self.get_assessment(assessment_id, organization_id)
        if not assessment:
            return None

        assessment.schedule = data.schedule.model_dump(mode="json")
        assessment.proctoring_settings = data.proctoring_settings.model_dump()
        assessment.security_settings = data.security_settings.model_dump()
        assessment.candidate_fields = data.candidate_fields.model_dump()
        assessment.max_attempts = data.max_attempts
        assessment.passing_score_percent = data.passing_score_percent or 60

        # Update wizard status
        step_status = dict(assessment.wizard_step_status)
        step_status["step3"] = "complete"
        assessment.wizard_step_status = step_status

        if assessment.wizard_step < 4:
            assessment.wizard_step = 4

        assessment.updated_at = datetime.utcnow()
        await self.db.flush()
        await self.db.refresh(assessment)
        return assessment

    async def save_step_4(
        self,
        assessment_id: str,
        data: Step4Data,
        organization_id: str,
    ) -> Assessment | None:
        """Save Step 4: Add Candidates."""
        assessment = await self.get_assessment(assessment_id, organization_id)
        if not assessment:
            return None

        # Add candidates and create invitations
        for candidate_input in data.candidates:
            # Check if candidate exists
            existing_candidate = await self.db.execute(
                select(Candidate).where(
                    and_(
                        Candidate.organization_id == organization_id,
                        Candidate.email == candidate_input.email,
                    )
                )
            )
            candidate = existing_candidate.scalar_one_or_none()

            if not candidate:
                # Create new candidate
                candidate = Candidate(
                    id=str(uuid4()),
                    organization_id=organization_id,
                    email=candidate_input.email,
                    name=candidate_input.name,
                    phone=candidate_input.phone,
                    source=candidate_input.source,
                )
                self.db.add(candidate)
                await self.db.flush()

            # Check if invitation exists
            existing_invitation = await self.db.execute(
                select(AssessmentInvitation).where(
                    and_(
                        AssessmentInvitation.assessment_id == assessment_id,
                        AssessmentInvitation.candidate_id == candidate.id,
                    )
                )
            )
            if not existing_invitation.scalar_one_or_none():
                # Parse deadline from schedule
                deadline = None
                if assessment.schedule and assessment.schedule.get("end_date"):
                    end_date_str = assessment.schedule.get("end_date")
                    if isinstance(end_date_str, str):
                        try:
                            deadline = datetime.fromisoformat(end_date_str.replace("Z", "+00:00"))
                        except (ValueError, TypeError):
                            pass
                    elif isinstance(end_date_str, datetime):
                        deadline = end_date_str

                # Create invitation
                invitation = AssessmentInvitation(
                    id=str(uuid4()),
                    assessment_id=assessment_id,
                    candidate_id=candidate.id,
                    invitation_token=secrets.token_urlsafe(32),
                    status=InvitationStatus.PENDING.value,
                    deadline=deadline,
                )
                self.db.add(invitation)

        # Save email template
        assessment.email_template = data.email_template.model_dump()

        # Update wizard status
        step_status = dict(assessment.wizard_step_status)
        step_status["step4"] = "complete"
        assessment.wizard_step_status = step_status

        if assessment.wizard_step < 5:
            assessment.wizard_step = 5

        assessment.updated_at = datetime.utcnow()
        await self.db.flush()
        await self.db.refresh(assessment)
        return assessment

    async def save_step_5(
        self,
        assessment_id: str,
        data: Step5Data,
        organization_id: str,
    ) -> Assessment | None:
        """Save Step 5: Review & Confirm."""
        assessment = await self.get_assessment(assessment_id, organization_id)
        if not assessment:
            return None

        # Update wizard status
        step_status = dict(assessment.wizard_step_status)
        step_status["step5"] = "complete"
        assessment.wizard_step_status = step_status

        assessment.updated_at = datetime.utcnow()
        await self.db.flush()
        await self.db.refresh(assessment)
        return assessment

    # =========================================================================
    # TOPIC MANAGEMENT
    # =========================================================================

    async def get_topics(
        self,
        assessment_id: str,
    ) -> list[AssessmentTopic]:
        """Get all topics for an assessment."""
        result = await self.db.execute(
            select(AssessmentTopic)
            .where(AssessmentTopic.assessment_id == assessment_id)
            .order_by(AssessmentTopic.sequence_order)
        )
        return list(result.scalars().all())

    async def add_topic(
        self,
        assessment_id: str,
        topic_config: TopicConfig,
    ) -> AssessmentTopic:
        """Add a topic to assessment."""
        # Get current max sequence
        result = await self.db.execute(
            select(func.max(AssessmentTopic.sequence_order)).where(
                AssessmentTopic.assessment_id == assessment_id
            )
        )
        max_seq = result.scalar() or -1

        topic = AssessmentTopic(
            id=str(uuid4()),
            assessment_id=assessment_id,
            topic=topic_config.topic,
            subtopics=topic_config.subtopics,
            difficulty_level=topic_config.difficulty_level.value,
            question_types=topic_config.question_types.model_dump(),
            fullstack_config=topic_config.fullstack_config.model_dump() if topic_config.fullstack_config else None,
            estimated_time_minutes=topic_config.estimated_time_minutes,
            max_score=topic_config.max_score,
            additional_requirements=topic_config.additional_requirements,
            sequence_order=max_seq + 1,
        )
        self.db.add(topic)
        await self.db.flush()
        await self.db.refresh(topic)
        return topic

    # =========================================================================
    # QUESTION MANAGEMENT
    # =========================================================================

    async def get_questions(
        self,
        assessment_id: str,
        topic_id: str | None = None,
    ) -> list[Question]:
        """Get questions for an assessment, optionally filtered by topic."""
        query = select(Question).where(Question.assessment_id == assessment_id)
        if topic_id:
            query = query.where(Question.topic_id == topic_id)
        query = query.order_by(Question.sequence_order)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def add_question(
        self,
        assessment_id: str,
        question_data: dict[str, Any],
    ) -> Question:
        """Add a question to assessment."""
        # Get current max sequence
        result = await self.db.execute(
            select(func.max(Question.sequence_order)).where(
                Question.assessment_id == assessment_id
            )
        )
        max_seq = result.scalar() or -1

        question = Question(
            id=str(uuid4()),
            assessment_id=assessment_id,
            sequence_order=max_seq + 1,
            **question_data,
        )
        self.db.add(question)
        await self.db.flush()
        await self.db.refresh(question)

        # Update assessment question count
        assessment = await self.get_assessment(assessment_id)
        if assessment:
            assessment.total_questions = (assessment.total_questions or 0) + 1
            await self.db.flush()

        return question

    async def update_question(
        self,
        question_id: str,
        update_data: dict[str, Any],
    ) -> Question | None:
        """Update a question."""
        result = await self.db.execute(
            select(Question).where(Question.id == question_id)
        )
        question = result.scalar_one_or_none()
        if not question:
            return None

        for field, value in update_data.items():
            if hasattr(question, field) and value is not None:
                setattr(question, field, value)

        question.updated_at = datetime.utcnow()
        await self.db.flush()
        await self.db.refresh(question)
        return question

    async def delete_question(
        self,
        question_id: str,
    ) -> bool:
        """Delete a question."""
        result = await self.db.execute(
            select(Question).where(Question.id == question_id)
        )
        question = result.scalar_one_or_none()
        if not question:
            return False

        assessment_id = question.assessment_id
        await self.db.delete(question)

        # Update assessment question count
        assessment = await self.get_assessment(assessment_id)
        if assessment:
            assessment.total_questions = max(0, (assessment.total_questions or 1) - 1)
            await self.db.flush()

        return True

    # =========================================================================
    # CANDIDATE MANAGEMENT
    # =========================================================================

    async def get_candidates(
        self,
        assessment_id: str,
    ) -> list[AssessmentInvitation]:
        """Get all candidates invited to an assessment."""
        result = await self.db.execute(
            select(AssessmentInvitation)
            .where(AssessmentInvitation.assessment_id == assessment_id)
            .options(
                selectinload(AssessmentInvitation.candidate),
                selectinload(AssessmentInvitation.attempts),
            )
            .order_by(AssessmentInvitation.created_at.desc())
        )
        return list(result.scalars().all())

    async def add_candidate(
        self,
        assessment_id: str,
        organization_id: str,
        candidate_data: CandidateCreate,
    ) -> tuple[Candidate, AssessmentInvitation]:
        """Add a candidate to assessment."""
        # Check if candidate exists
        existing = await self.db.execute(
            select(Candidate).where(
                and_(
                    Candidate.organization_id == organization_id,
                    Candidate.email == candidate_data.email,
                )
            )
        )
        candidate = existing.scalar_one_or_none()

        if not candidate:
            candidate = Candidate(
                id=str(uuid4()),
                organization_id=organization_id,
                **candidate_data.model_dump(),
            )
            self.db.add(candidate)
            await self.db.flush()

        # Check for existing invitation
        existing_invite = await self.db.execute(
            select(AssessmentInvitation).where(
                and_(
                    AssessmentInvitation.assessment_id == assessment_id,
                    AssessmentInvitation.candidate_id == candidate.id,
                )
            )
        )
        invitation = existing_invite.scalar_one_or_none()

        if not invitation:
            # Get assessment for deadline
            assessment = await self.get_assessment(assessment_id)
            deadline = None
            if assessment and assessment.schedule:
                deadline = assessment.schedule.get("end_date")

            invitation = AssessmentInvitation(
                id=str(uuid4()),
                assessment_id=assessment_id,
                candidate_id=candidate.id,
                invitation_token=secrets.token_urlsafe(32),
                status=InvitationStatus.PENDING.value,
                deadline=deadline,
            )
            self.db.add(invitation)
            await self.db.flush()

        await self.db.refresh(candidate)
        await self.db.refresh(invitation)
        return candidate, invitation

    async def remove_candidate(
        self,
        assessment_id: str,
        candidate_id: str,
    ) -> bool:
        """Remove a candidate from assessment."""
        result = await self.db.execute(
            select(AssessmentInvitation).where(
                and_(
                    AssessmentInvitation.assessment_id == assessment_id,
                    AssessmentInvitation.candidate_id == candidate_id,
                )
            )
        )
        invitation = result.scalar_one_or_none()
        if not invitation:
            return False

        # Can't remove if already started
        if invitation.status in (InvitationStatus.STARTED.value, InvitationStatus.COMPLETED.value):
            raise ValueError("Cannot remove candidate who has started the assessment")

        await self.db.delete(invitation)
        return True

    async def import_candidates(
        self,
        assessment_id: str,
        organization_id: str,
        candidates: list[CandidateCreate],
    ) -> dict[str, Any]:
        """Bulk import candidates."""
        imported = 0
        duplicates = 0
        errors = []

        for idx, candidate_data in enumerate(candidates):
            try:
                _, invitation = await self.add_candidate(
                    assessment_id, organization_id, candidate_data
                )
                if invitation:
                    imported += 1
            except Exception as e:
                if "duplicate" in str(e).lower():
                    duplicates += 1
                else:
                    errors.append({
                        "row": idx + 1,
                        "email": candidate_data.email,
                        "error": str(e),
                    })

        return {
            "total": len(candidates),
            "imported": imported,
            "duplicates": duplicates,
            "errors": errors,
        }

    # =========================================================================
    # PUBLISHING
    # =========================================================================

    async def pre_publish_check(
        self,
        assessment_id: str,
        organization_id: str,
    ) -> dict[str, Any]:
        """Check if assessment is ready to publish."""
        assessment = await self.get_assessment(assessment_id, organization_id)
        if not assessment:
            return {"can_publish": False, "errors": ["Assessment not found"], "issues": ["Assessment not found"]}

        warnings = []
        errors = []
        issues = []  # Step-specific issues for UI display

        checklist = {
            "has_title": bool(assessment.title),
            "has_job_designation": bool(assessment.job_designation),
            "has_skills": bool(assessment.skills and len(assessment.skills) > 0),
            "has_topics": len(assessment.topics) > 0,
            "has_questions": assessment.total_questions > 0,
            "has_candidates": len(assessment.invitations) > 0,
            "has_schedule": bool(assessment.schedule and assessment.schedule.get("start_date")),
            "all_steps_complete": all(
                s == "complete" for s in assessment.wizard_step_status.values()
            ),
        }

        # Step 1: Assessment Details
        if not checklist["has_title"]:
            errors.append("Assessment title is required")
            issues.append("[Step 1] Assessment title is required")
        if not checklist["has_job_designation"]:
            errors.append("Job designation is required")
            issues.append("[Step 1] Job designation is required")
        if not checklist["has_skills"]:
            errors.append("At least one skill is required")
            issues.append("[Step 1] Add at least one skill")

        # Step 2: Topics & Questions
        if not checklist["has_topics"]:
            errors.append("At least one topic is required")
            issues.append("[Step 2] Add at least one topic - click 'AI Suggest Topics' or add manually")
        if not checklist["has_questions"]:
            warnings.append("No questions have been generated yet")
            issues.append("[Step 2] Generate questions for your topics (optional - will be auto-generated)")

        # Step 3: Schedule
        if not checklist["has_schedule"]:
            errors.append("Schedule is required")
            issues.append("[Step 3] Set assessment start and end dates")

        # Step 4: Candidates
        if not checklist["has_candidates"]:
            warnings.append("No candidates have been added")
            issues.append("[Step 4] Add at least one candidate to send invitations")

        # Summary
        steps_incomplete = []
        step_status = assessment.wizard_step_status or {}
        if step_status.get("step1") != "complete":
            steps_incomplete.append("Step 1 (Assessment Details)")
        if step_status.get("step2") != "complete":
            steps_incomplete.append("Step 2 (Topics)")
        if step_status.get("step3") != "complete":
            steps_incomplete.append("Step 3 (Schedule)")
        if step_status.get("step4") != "complete":
            steps_incomplete.append("Step 4 (Candidates)")

        if steps_incomplete:
            issues.insert(0, f"Incomplete steps: {', '.join(steps_incomplete)}")

        return {
            "can_publish": len(errors) == 0,
            "warnings": warnings,
            "errors": errors,
            "issues": issues,
            "checklist": checklist,
        }

    async def publish_assessment(
        self,
        assessment_id: str,
        organization_id: str,
        send_invitations: bool = True,
    ) -> Assessment | None:
        """Publish assessment and optionally send invitations."""
        assessment = await self.get_assessment(assessment_id, organization_id)
        if not assessment:
            return None

        # Verify can publish
        check = await self.pre_publish_check(assessment_id, organization_id)
        if not check["can_publish"]:
            raise ValueError(f"Cannot publish: {', '.join(check['errors'])}")

        # Update status
        assessment.status = AssessmentStatus.ACTIVE.value
        assessment.published_at = datetime.utcnow()
        assessment.updated_at = datetime.utcnow()

        # Mark invitations as sent if sending
        if send_invitations:
            invitations = await self.get_candidates(assessment_id)
            for invitation in invitations:
                if invitation.status == InvitationStatus.PENDING.value:
                    invitation.status = InvitationStatus.SENT.value
                    invitation.email_sent_at = datetime.utcnow()

        await self.db.flush()
        await self.db.refresh(assessment)
        return assessment

    # =========================================================================
    # METRICS
    # =========================================================================

    async def get_assessment_metrics(
        self,
        assessment_id: str,
    ) -> dict[str, Any]:
        """Get metrics for an assessment."""
        # Total candidates
        total_invites = await self.db.execute(
            select(func.count(AssessmentInvitation.id)).where(
                AssessmentInvitation.assessment_id == assessment_id
            )
        )
        total_candidates = total_invites.scalar() or 0

        # Attempts
        attempts_query = (
            select(func.count(AssessmentAttempt.id))
            .join(AssessmentInvitation)
            .where(AssessmentInvitation.assessment_id == assessment_id)
        )
        attempts_result = await self.db.execute(attempts_query)
        total_attempts = attempts_result.scalar() or 0

        # Completed
        completed_query = (
            select(func.count(AssessmentAttempt.id))
            .join(AssessmentInvitation)
            .where(
                and_(
                    AssessmentInvitation.assessment_id == assessment_id,
                    AssessmentAttempt.status.in_([
                        AttemptStatus.COMPLETED.value,
                        AttemptStatus.EVALUATED.value,
                    ]),
                )
            )
        )
        completed_result = await self.db.execute(completed_query)
        completed = completed_result.scalar() or 0

        # Average score
        avg_score_query = (
            select(func.avg(AssessmentAttempt.percentage_score))
            .join(AssessmentInvitation)
            .where(
                and_(
                    AssessmentInvitation.assessment_id == assessment_id,
                    AssessmentAttempt.percentage_score.isnot(None),
                )
            )
        )
        avg_result = await self.db.execute(avg_score_query)
        avg_score = avg_result.scalar()

        attempt_rate = (total_attempts / total_candidates * 100) if total_candidates > 0 else 0
        completion_rate = (completed / total_attempts * 100) if total_attempts > 0 else 0

        return {
            "total_candidates": total_candidates,
            "total_invitations": total_candidates,
            "unique_attempts": total_attempts,
            "attempt_rate": round(attempt_rate, 1),
            "completion_rate": round(completion_rate, 1),
            "average_score": round(float(avg_score), 1) if avg_score else None,
            "average_trust_score": None,  # TODO: Calculate
        }

    async def get_organization_metrics(
        self,
        organization_id: str,
    ) -> dict[str, Any]:
        """Get aggregate metrics for organization dashboard."""
        # Total assessments
        assessments_result = await self.db.execute(
            select(func.count(Assessment.id)).where(
                Assessment.organization_id == organization_id
            )
        )
        total_tests = assessments_result.scalar() or 0

        # Total candidates
        candidates_result = await self.db.execute(
            select(func.count(func.distinct(AssessmentInvitation.candidate_id)))
            .join(Assessment)
            .where(Assessment.organization_id == organization_id)
        )
        total_candidates = candidates_result.scalar() or 0

        # Total attempts
        attempts_result = await self.db.execute(
            select(func.count(AssessmentAttempt.id))
            .join(AssessmentInvitation)
            .join(Assessment)
            .where(Assessment.organization_id == organization_id)
        )
        total_attempts = attempts_result.scalar() or 0

        # Calculate attempt rate
        invitations_result = await self.db.execute(
            select(func.count(AssessmentInvitation.id))
            .join(Assessment)
            .where(Assessment.organization_id == organization_id)
        )
        total_invitations = invitations_result.scalar() or 0
        attempt_rate = (total_attempts / total_invitations * 100) if total_invitations > 0 else 0

        return {
            "total_candidates": total_candidates,
            "total_tests": total_tests,
            "unique_attempts": total_attempts,
            "attempt_rate": round(attempt_rate, 1),
        }
