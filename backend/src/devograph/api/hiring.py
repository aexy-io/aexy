"""Hiring intelligence API endpoints."""

import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status


def is_valid_uuid(value: str) -> bool:
    """Check if a string is a valid UUID."""
    uuid_pattern = re.compile(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        re.IGNORECASE
    )
    return bool(uuid_pattern.match(value))
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.core.database import get_db
from devograph.llm.gateway import get_llm_gateway
from devograph.models.developer import Developer
from devograph.schemas.career import (
    BusFactorRisk,
    CandidateScorecard,
    GeneratedJD,
    HiringPriority,
    HiringRequirementCreate,
    HiringRequirementResponse,
    HiringStatus,
    InterviewQuestion,
    InterviewRubric,
    RoadmapSkillAnalysis,
    SkillRequirement,
    TeamGapAnalysis,
    TeamSkillGapDetail,
)
from devograph.services.hiring_intelligence import HiringIntelligenceService

router = APIRouter(prefix="/hiring")


class TeamGapRequest(BaseModel):
    """Request for team gap analysis."""

    developer_ids: list[str]
    target_skills: list[str] | None = None


class RoadmapSkillRequest(BaseModel):
    """Request for roadmap skill extraction."""

    roadmap_items: list[dict[str, Any]]


class JDGenerationRequest(BaseModel):
    """Request for JD generation."""

    role_title: str
    level: str = "Senior"
    priority: str = "high"
    developer_ids: list[str] | None = None
    roadmap_context: str | None = None


class RubricGenerationRequest(BaseModel):
    """Request for interview rubric generation."""

    jd: GeneratedJD
    developer_ids: list[str] | None = None


class CandidateScorecardRequest(BaseModel):
    """Request for candidate scorecard."""

    requirement_id: str
    candidate_skills: dict[str, int]
    candidate_name: str | None = None


@router.post("/team-gaps", response_model=TeamGapAnalysis)
async def analyze_team_gaps(
    request: TeamGapRequest,
    db: AsyncSession = Depends(get_db),
):
    """Analyze team skill gaps.

    Args:
        request: Team gap request with developer IDs.
        db: Database session.

    Returns:
        Team gap analysis result.
    """
    # Fetch developers
    result = await db.execute(
        select(Developer).where(Developer.id.in_(request.developer_ids))
    )
    developers = list(result.scalars().all())

    if not developers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No developers found",
        )

    llm_gateway = get_llm_gateway()
    service = HiringIntelligenceService(db, llm_gateway)

    analysis = service.analyze_team_gaps(developers, request.target_skills)

    return TeamGapAnalysis(
        team_id=analysis.team_id,
        organization_id=analysis.organization_id,
        total_developers=analysis.total_developers,
        skill_gaps=[
            TeamSkillGapDetail(
                skill=g.skill,
                current_coverage=g.current_coverage,
                average_proficiency=g.average_proficiency,
                gap_severity=g.gap_severity,
                developers_with_skill=g.developers_with_skill,
            )
            for g in analysis.skill_gaps
        ],
        bus_factor_risks=[
            BusFactorRisk(
                skill_or_area=r.skill_or_area,
                risk_level=r.risk_level,
                single_developer=r.single_developer_id,
                developer_name=r.developer_name,
                impact_description=r.impact_description,
                mitigation_suggestion=r.mitigation_suggestion,
            )
            for r in analysis.bus_factor_risks
        ],
        critical_missing_skills=analysis.critical_missing_skills,
        analysis_date=analysis.analysis_date,
    )


@router.post("/bus-factor", response_model=list[BusFactorRisk])
async def get_bus_factor_risks(
    request: TeamGapRequest,
    db: AsyncSession = Depends(get_db),
):
    """Get bus factor risks for a team.

    Args:
        request: Team gap request with developer IDs.
        db: Database session.

    Returns:
        List of bus factor risks.
    """
    result = await db.execute(
        select(Developer).where(Developer.id.in_(request.developer_ids))
    )
    developers = list(result.scalars().all())

    if not developers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No developers found",
        )

    llm_gateway = get_llm_gateway()
    service = HiringIntelligenceService(db, llm_gateway)
    risks = service.get_bus_factor_risks(developers)

    return [
        BusFactorRisk(
            skill_or_area=r.skill_or_area,
            risk_level=r.risk_level,
            single_developer=r.single_developer_id,
            developer_name=r.developer_name,
            impact_description=r.impact_description,
            mitigation_suggestion=r.mitigation_suggestion,
        )
        for r in risks
    ]


@router.post("/roadmap-skills", response_model=RoadmapSkillAnalysis)
async def extract_roadmap_skills(
    request: RoadmapSkillRequest,
    db: AsyncSession = Depends(get_db),
):
    """Extract skill requirements from roadmap items.

    Args:
        request: Roadmap items to analyze.
        db: Database session.

    Returns:
        Roadmap skill analysis.
    """
    llm_gateway = get_llm_gateway()
    service = HiringIntelligenceService(db, llm_gateway)

    requirements = await service.extract_roadmap_skills(request.roadmap_items)

    return RoadmapSkillAnalysis(
        roadmap_skills=[
            {
                "skill": r.skill,
                "priority": r.priority,
                "source_items": r.source_items,
                "estimated_demand": r.estimated_demand,
            }
            for r in requirements
        ],
        gaps_vs_team=[],  # Would need team context
        hiring_recommendations=[
            f"Consider hiring for {r.skill}" for r in requirements if r.priority in ("critical", "high")
        ][:3],
    )


@router.get("/requirements", response_model=list[HiringRequirementResponse])
async def list_hiring_requirements(
    organization_id: str,
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List hiring requirements for an organization.

    Args:
        organization_id: Organization UUID.
        status_filter: Optional status filter.
        db: Database session.

    Returns:
        List of hiring requirements.
    """
    # Return empty list for invalid UUIDs (e.g., "demo-org")
    if not is_valid_uuid(organization_id):
        return []

    llm_gateway = get_llm_gateway()
    service = HiringIntelligenceService(db, llm_gateway)

    requirements = await service.get_organization_requirements(
        organization_id,
        status=status_filter,
    )

    return [
        HiringRequirementResponse(
            id=str(r.id),
            organization_id=str(r.organization_id),
            team_id=str(r.team_id) if r.team_id else None,
            target_role_id=str(r.target_role_id) if r.target_role_id else None,
            role_title=r.role_title,
            priority=HiringPriority(r.priority),
            timeline=r.timeline,
            must_have_skills=r.must_have_skills or [],
            nice_to_have_skills=r.nice_to_have_skills or [],
            soft_skill_requirements=r.soft_skill_requirements or {},
            gap_analysis=r.gap_analysis or {},
            roadmap_items=r.roadmap_items or [],
            job_description=r.job_description,
            interview_rubric=r.interview_rubric or {},
            status=HiringStatus(r.status),
            generated_by_model=r.generated_by_model,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in requirements
    ]


@router.post("/requirements", response_model=HiringRequirementResponse, status_code=status.HTTP_201_CREATED)
async def create_hiring_requirement(
    data: HiringRequirementCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a hiring requirement.

    Args:
        data: Hiring requirement data.
        db: Database session.

    Returns:
        Created hiring requirement.
    """
    llm_gateway = get_llm_gateway()
    service = HiringIntelligenceService(db, llm_gateway)

    requirement = await service.create_hiring_requirement(
        organization_id=data.organization_id,
        role_title=data.role_title,
        team_id=data.team_id,
        target_role_id=data.target_role_id,
        priority=data.priority.value,
        timeline=data.timeline,
        roadmap_items=data.roadmap_items,
    )

    return HiringRequirementResponse(
        id=str(requirement.id),
        organization_id=str(requirement.organization_id),
        team_id=str(requirement.team_id) if requirement.team_id else None,
        target_role_id=str(requirement.target_role_id) if requirement.target_role_id else None,
        role_title=requirement.role_title,
        priority=HiringPriority(requirement.priority),
        timeline=requirement.timeline,
        must_have_skills=requirement.must_have_skills or [],
        nice_to_have_skills=requirement.nice_to_have_skills or [],
        soft_skill_requirements=requirement.soft_skill_requirements or {},
        gap_analysis=requirement.gap_analysis or {},
        roadmap_items=requirement.roadmap_items or [],
        job_description=requirement.job_description,
        interview_rubric=requirement.interview_rubric or {},
        status=HiringStatus(requirement.status),
        generated_by_model=requirement.generated_by_model,
        created_at=requirement.created_at,
        updated_at=requirement.updated_at,
    )


@router.get("/requirements/{requirement_id}", response_model=HiringRequirementResponse)
async def get_hiring_requirement(
    requirement_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a hiring requirement by ID.

    Args:
        requirement_id: Requirement UUID.
        db: Database session.

    Returns:
        Hiring requirement.
    """
    llm_gateway = get_llm_gateway()
    service = HiringIntelligenceService(db, llm_gateway)
    requirement = await service.get_hiring_requirement(requirement_id)

    if not requirement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hiring requirement not found",
        )

    return HiringRequirementResponse(
        id=str(requirement.id),
        organization_id=str(requirement.organization_id),
        team_id=str(requirement.team_id) if requirement.team_id else None,
        target_role_id=str(requirement.target_role_id) if requirement.target_role_id else None,
        role_title=requirement.role_title,
        priority=HiringPriority(requirement.priority),
        timeline=requirement.timeline,
        must_have_skills=requirement.must_have_skills or [],
        nice_to_have_skills=requirement.nice_to_have_skills or [],
        soft_skill_requirements=requirement.soft_skill_requirements or {},
        gap_analysis=requirement.gap_analysis or {},
        roadmap_items=requirement.roadmap_items or [],
        job_description=requirement.job_description,
        interview_rubric=requirement.interview_rubric or {},
        status=HiringStatus(requirement.status),
        generated_by_model=requirement.generated_by_model,
        created_at=requirement.created_at,
        updated_at=requirement.updated_at,
    )


@router.post("/requirements/{requirement_id}/jd", response_model=GeneratedJD)
async def generate_job_description(
    requirement_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Generate a job description for a hiring requirement.

    Args:
        requirement_id: Requirement UUID.
        db: Database session.

    Returns:
        Generated job description.
    """
    llm_gateway = get_llm_gateway()
    service = HiringIntelligenceService(db, llm_gateway)
    requirement = await service.get_hiring_requirement(requirement_id)

    if not requirement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hiring requirement not found",
        )

    # Create a gap analysis from the stored data
    from devograph.services.hiring_intelligence import TeamGapAnalysisResult
    from datetime import datetime

    gap_analysis = TeamGapAnalysisResult(
        team_id=requirement.team_id,
        organization_id=str(requirement.organization_id),
        total_developers=requirement.gap_analysis.get("total_developers", 0),
        skill_gaps=[],
        bus_factor_risks=[],
        critical_missing_skills=requirement.gap_analysis.get("critical_skills", []),
        analysis_date=datetime.utcnow(),
    )

    jd = await service.generate_job_description(
        gap_analysis=gap_analysis,
        role_title=requirement.role_title,
        level="Senior",  # Default
        priority=requirement.priority,
    )

    # Update requirement with JD
    requirement.job_description = jd.full_text
    await db.commit()

    return GeneratedJD(
        role_title=jd.role_title,
        level=jd.level,
        summary=jd.summary,
        must_have_skills=[
            SkillRequirement(
                skill=s.get("skill", ""),
                level=s.get("level", 60),
                reasoning=s.get("reasoning"),
            )
            for s in jd.must_have_skills
        ],
        nice_to_have_skills=[
            SkillRequirement(
                skill=s.get("skill", ""),
                level=s.get("level", 40),
                reasoning=s.get("reasoning"),
            )
            for s in jd.nice_to_have_skills
        ],
        responsibilities=jd.responsibilities,
        qualifications=jd.qualifications,
        cultural_indicators=jd.cultural_indicators,
        full_text=jd.full_text,
    )


@router.post("/requirements/{requirement_id}/rubric", response_model=InterviewRubric)
async def generate_interview_rubric(
    requirement_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Generate an interview rubric for a hiring requirement.

    Args:
        requirement_id: Requirement UUID.
        db: Database session.

    Returns:
        Interview rubric.
    """
    llm_gateway = get_llm_gateway()
    service = HiringIntelligenceService(db, llm_gateway)
    requirement = await service.get_hiring_requirement(requirement_id)

    if not requirement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hiring requirement not found",
        )

    # Create a JD result from requirement
    from devograph.services.hiring_intelligence import GeneratedJDResult

    jd = GeneratedJDResult(
        role_title=requirement.role_title,
        level="Senior",
        summary="",
        must_have_skills=requirement.must_have_skills or [],
        nice_to_have_skills=requirement.nice_to_have_skills or [],
        responsibilities=[],
        qualifications=[],
        cultural_indicators=[],
        full_text=requirement.job_description or "",
    )

    rubric = await service.generate_interview_rubric(jd)

    # Update requirement with rubric
    requirement.interview_rubric = {
        "role_title": rubric.role_title,
        "technical_questions": [
            {
                "question": q.question,
                "skill_assessed": q.skill_assessed,
                "difficulty": q.difficulty,
                "evaluation_criteria": q.evaluation_criteria,
                "red_flags": q.red_flags,
                "bonus_indicators": q.bonus_indicators,
            }
            for q in rubric.technical_questions
        ],
        "behavioral_questions": [
            {
                "question": q.question,
                "skill_assessed": q.skill_assessed,
                "difficulty": q.difficulty,
                "evaluation_criteria": q.evaluation_criteria,
                "red_flags": q.red_flags,
                "bonus_indicators": q.bonus_indicators,
            }
            for q in rubric.behavioral_questions
        ],
        "system_design_prompt": rubric.system_design_prompt,
        "culture_fit_criteria": rubric.culture_fit_criteria,
    }
    await db.commit()

    return InterviewRubric(
        role_title=rubric.role_title,
        technical_questions=[
            InterviewQuestion(
                question=q.question,
                skill_assessed=q.skill_assessed,
                difficulty=q.difficulty,
                evaluation_criteria=q.evaluation_criteria,
                red_flags=q.red_flags,
                bonus_indicators=q.bonus_indicators,
            )
            for q in rubric.technical_questions
        ],
        behavioral_questions=[
            InterviewQuestion(
                question=q.question,
                skill_assessed=q.skill_assessed,
                difficulty=q.difficulty,
                evaluation_criteria=q.evaluation_criteria,
                red_flags=q.red_flags,
                bonus_indicators=q.bonus_indicators,
            )
            for q in rubric.behavioral_questions
        ],
        system_design_prompt=rubric.system_design_prompt,
        culture_fit_criteria=rubric.culture_fit_criteria,
    )


@router.post("/requirements/{requirement_id}/scorecard", response_model=CandidateScorecard)
async def create_candidate_scorecard(
    requirement_id: str,
    request: CandidateScorecardRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a candidate scorecard.

    Args:
        requirement_id: Requirement UUID.
        request: Candidate skills data.
        db: Database session.

    Returns:
        Candidate scorecard.
    """
    llm_gateway = get_llm_gateway()
    service = HiringIntelligenceService(db, llm_gateway)
    requirement = await service.get_hiring_requirement(requirement_id)

    if not requirement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hiring requirement not found",
        )

    scorecard = service.create_candidate_scorecard(
        requirement=requirement,
        candidate_skills=request.candidate_skills,
        candidate_name=request.candidate_name,
    )

    return CandidateScorecard(
        requirement_id=scorecard.requirement_id,
        role_title=scorecard.role_title,
        candidate_name=scorecard.candidate_name,
        overall_score=scorecard.overall_score,
        must_have_met=scorecard.must_have_met,
        must_have_total=scorecard.must_have_total,
        nice_to_have_met=scorecard.nice_to_have_met,
        nice_to_have_total=scorecard.nice_to_have_total,
        skill_assessments=[
            {
                "skill": a.skill,
                "candidate_level": a.candidate_level,
                "required_level": a.required_level,
                "meets_requirement": a.meets_requirement,
                "gap": a.gap,
            }
            for a in scorecard.skill_assessments
        ],
        strengths=scorecard.strengths,
        concerns=scorecard.concerns,
        recommendation=scorecard.recommendation,
    )


@router.patch("/requirements/{requirement_id}/status")
async def update_requirement_status(
    requirement_id: str,
    new_status: str,
    db: AsyncSession = Depends(get_db),
):
    """Update hiring requirement status.

    Args:
        requirement_id: Requirement UUID.
        new_status: New status value.
        db: Database session.

    Returns:
        Success status.
    """
    if new_status not in ("draft", "active", "filled", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid status. Must be: draft, active, filled, cancelled",
        )

    llm_gateway = get_llm_gateway()
    service = HiringIntelligenceService(db, llm_gateway)
    success = await service.update_requirement_status(requirement_id, new_status)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hiring requirement not found",
        )

    return {"status": new_status, "requirement_id": requirement_id}
