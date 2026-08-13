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

from aexy.api.access_guard import ensure_app_enabled
from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.llm.gateway import get_llm_gateway
from aexy.models.developer import Developer
from aexy.models.team import Team
from aexy.models.workspace import WorkspaceMember
from aexy.services.workspace_service import WorkspaceService
from aexy.schemas.career import (
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
from aexy.services.automation_service import dispatch_automation_event
from aexy.services.hiring_intelligence import HiringIntelligenceService

router = APIRouter(prefix="/hiring")


async def _resolve_team_workspace_or_403(
    db: AsyncSession, team_id: str, caller_id: str
) -> str:
    """Load the team's workspace and require caller to be an active member."""
    team = (
        await db.execute(select(Team).where(Team.id == team_id))
    ).scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if not await WorkspaceService(db).check_permission(
        str(team.workspace_id), caller_id, "viewer"
    ):
        raise HTTPException(status_code=403, detail="Not a member of team's workspace")
    await ensure_app_enabled(db, str(team.workspace_id), "hiring")
    return str(team.workspace_id)


async def _require_workspace_member(
    db: AsyncSession, workspace_id: str, caller_id: str, role: str = "viewer"
) -> None:
    if not await WorkspaceService(db).check_permission(workspace_id, caller_id, role):
        raise HTTPException(status_code=403, detail="Workspace permission required")
    await ensure_app_enabled(db, workspace_id, "hiring")


async def _require_developers_visible(
    db: AsyncSession, caller_id: str, developer_ids: list[str]
) -> None:
    """Every dev id must share an active workspace with the caller. See
    analytics._require_developers_visible — same semantics."""
    if not developer_ids:
        return
    caller_workspaces = (
        await db.execute(
            select(WorkspaceMember.workspace_id).where(
                WorkspaceMember.developer_id == caller_id,
                WorkspaceMember.status == "active",
            )
        )
    ).scalars().all()
    if not caller_workspaces:
        raise HTTPException(status_code=403, detail="No active workspace membership")
    visible = set(
        (
            await db.execute(
                select(WorkspaceMember.developer_id).where(
                    WorkspaceMember.workspace_id.in_(caller_workspaces),
                    WorkspaceMember.developer_id.in_(developer_ids),
                    WorkspaceMember.status == "active",
                )
            )
        ).scalars().all()
    )
    missing = {str(d) for d in developer_ids} - {str(v) for v in visible}
    missing.discard(str(caller_id))
    if missing:
        raise HTTPException(
            status_code=403,
            detail="Cannot read developers outside your workspaces",
        )


async def _require_requirement_workspace_member(
    db: AsyncSession, requirement_id: str, caller_id: str, role: str = "viewer"
):
    """Load HiringRequirement, return it, and require caller to be a member."""
    from aexy.models.career import HiringRequirement
    requirement = (
        await db.execute(
            select(HiringRequirement).where(HiringRequirement.id == requirement_id)
        )
    ).scalar_one_or_none()
    if not requirement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hiring requirement not found",
        )
    # organization_id on HiringRequirement is treated as workspace_id in this
    # codebase (see create_hiring_requirement at the WorkspaceMember filter).
    await _require_workspace_member(
        db, str(requirement.organization_id), caller_id, role
    )
    return requirement


class TeamGapRequest(BaseModel):
    """Request for team gap analysis."""

    developer_ids: list[str] | None = None
    team_id: str | None = None  # Optional team filter - fetches team members if provided
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
    current_user: Developer = Depends(get_current_developer),
):
    """Analyze team skill gaps.

    Caller must be a member of the workspace owning the team (when `team_id`
    is provided) or of a workspace shared with every listed developer.
    """
    from aexy.models.team import TeamMember

    developer_ids = request.developer_ids or []
    team_id_provided = request.team_id and is_valid_uuid(request.team_id)

    # If team_id provided, verify caller has access then fetch members
    if team_id_provided:
        await _resolve_team_workspace_or_403(db, request.team_id, str(current_user.id))
        team_members_result = await db.execute(
            select(TeamMember.developer_id).where(TeamMember.team_id == request.team_id)
        )
        developer_ids = [str(m) for m in team_members_result.scalars().all()]
    else:
        await _require_developers_visible(db, str(current_user.id), developer_ids)

    if not developer_ids:
        if team_id_provided:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No team members found for the specified team",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either developer_ids or team_id must be provided",
        )

    # Fetch developers
    result = await db.execute(
        select(Developer).where(Developer.id.in_(developer_ids))
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
    current_user: Developer = Depends(get_current_developer),
):
    """Get bus factor risks for a team. Same authz as `analyze_team_gaps`."""
    from aexy.models.team import TeamMember

    developer_ids = request.developer_ids or []
    team_id_provided = request.team_id and is_valid_uuid(request.team_id)

    if team_id_provided:
        await _resolve_team_workspace_or_403(db, request.team_id, str(current_user.id))
        team_members_result = await db.execute(
            select(TeamMember.developer_id).where(TeamMember.team_id == request.team_id)
        )
        developer_ids = [str(m) for m in team_members_result.scalars().all()]
    else:
        await _require_developers_visible(db, str(current_user.id), developer_ids)

    if not developer_ids:
        if team_id_provided:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No team members found for the specified team",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either developer_ids or team_id must be provided",
        )

    result = await db.execute(
        select(Developer).where(Developer.id.in_(developer_ids))
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
    current_user: Developer = Depends(get_current_developer),
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
    team_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List hiring requirements for an organization (== workspace)."""
    # Return empty list for invalid UUIDs (e.g., "demo-org")
    if not is_valid_uuid(organization_id):
        return []

    await _require_workspace_member(db, organization_id, str(current_user.id), "viewer")
    if team_id and is_valid_uuid(team_id):
        team_ws = await _resolve_team_workspace_or_403(db, team_id, str(current_user.id))
        if team_ws != organization_id:
            raise HTTPException(status_code=400, detail="Team does not belong to this organization")

    llm_gateway = get_llm_gateway()
    service = HiringIntelligenceService(db, llm_gateway)

    requirements = await service.get_organization_requirements(
        organization_id,
        status=status_filter,
        team_id=team_id,
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
    current_user: Developer = Depends(get_current_developer),
):
    """Create a hiring requirement. Workspace admin role required."""
    if not is_valid_uuid(data.organization_id):
        raise HTTPException(status_code=400, detail="Invalid organization_id")
    await _require_workspace_member(db, data.organization_id, str(current_user.id), "admin")
    if data.team_id and is_valid_uuid(data.team_id):
        team_ws = await _resolve_team_workspace_or_403(db, data.team_id, str(current_user.id))
        if team_ws != data.organization_id:
            raise HTTPException(status_code=400, detail="Team does not belong to this organization")

    llm_gateway = get_llm_gateway()
    service = HiringIntelligenceService(db, llm_gateway)

    # Fetch developers for gap analysis
    from aexy.models.team import TeamMember
    team_developers = []

    # If team_id is provided, get team members only
    if data.team_id and is_valid_uuid(data.team_id):
        result = await db.execute(
            select(Developer).join(
                TeamMember,
                TeamMember.developer_id == Developer.id
            ).where(
                TeamMember.team_id == data.team_id
            )
        )
        team_developers = list(result.scalars().all())
    elif is_valid_uuid(data.organization_id):
        # Get all developers from the organization/workspace
        result = await db.execute(
            select(Developer).join(
                WorkspaceMember,
                WorkspaceMember.developer_id == Developer.id
            ).where(
                WorkspaceMember.workspace_id == data.organization_id
            )
        )
        team_developers = list(result.scalars().all())

    requirement = await service.create_hiring_requirement(
        organization_id=data.organization_id,
        role_title=data.role_title,
        team_developers=team_developers if team_developers else None,
        team_id=data.team_id,
        target_role_id=data.target_role_id,
        priority=data.priority.value,
        timeline=data.timeline,
        roadmap_items=data.roadmap_items,
    )

    from aexy.services.activity_logger import log_activity
    await log_activity(
        db,
        workspace_id=data.organization_id,
        entity_type="hiring_requirement",
        entity_id=str(requirement.id),
        activity_type="created",
        actor_id=str(current_user.id),
        title=f"Created hiring requirement '{requirement.role_title}'",
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
    current_user: Developer = Depends(get_current_developer),
):
    """Get a hiring requirement by ID. Workspace member required."""
    requirement = await _require_requirement_workspace_member(
        db, requirement_id, str(current_user.id), "viewer"
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
    current_user: Developer = Depends(get_current_developer),
):
    """Generate a job description for a hiring requirement. Workspace admin."""
    requirement = await _require_requirement_workspace_member(
        db, requirement_id, str(current_user.id), "admin"
    )
    llm_gateway = get_llm_gateway()
    service = HiringIntelligenceService(db, llm_gateway)

    # Create a gap analysis from the stored data
    from aexy.services.hiring_intelligence import TeamGapAnalysisResult
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
    current_user: Developer = Depends(get_current_developer),
):
    """Generate an interview rubric for a hiring requirement. Workspace admin."""
    requirement = await _require_requirement_workspace_member(
        db, requirement_id, str(current_user.id), "admin"
    )
    llm_gateway = get_llm_gateway()
    service = HiringIntelligenceService(db, llm_gateway)

    # Create a JD result from requirement
    from aexy.services.hiring_intelligence import GeneratedJDResult

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
    current_user: Developer = Depends(get_current_developer),
):
    """Create a candidate scorecard. Workspace member required."""
    requirement = await _require_requirement_workspace_member(
        db, requirement_id, str(current_user.id), "viewer"
    )
    llm_gateway = get_llm_gateway()
    service = HiringIntelligenceService(db, llm_gateway)

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
    current_user: Developer = Depends(get_current_developer),
):
    """Update hiring requirement status. Workspace admin required."""
    if new_status not in ("draft", "active", "filled", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid status. Must be: draft, active, filled, cancelled",
        )

    await _require_requirement_workspace_member(
        db, requirement_id, str(current_user.id), "admin"
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


# =============================================================================
# Hiring Candidates Pipeline
# =============================================================================

from datetime import datetime
from pydantic import EmailStr, Field
from aexy.models.career import HiringCandidate
from aexy.api.developers import get_current_developer


class HiringCandidateCreate(BaseModel):
    """Create a hiring candidate."""
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    phone: str | None = None
    role: str = Field(..., min_length=1, max_length=255)
    stage: str = Field(default="applied")
    source: str | None = None
    score: int | None = Field(default=None, ge=0, le=100)
    tags: list[str] = Field(default_factory=list)
    notes: str | None = None
    resume_url: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    portfolio_url: str | None = None
    current_company: str | None = None
    current_role: str | None = None
    experience_years: int | None = None
    location: str | None = None
    requirement_id: str | None = None
    applied_at: datetime | None = None
    # The recruiter or hiring manager accountable for this candidate. They are who
    # `candidate_stage_changed` notifies.
    owner_id: str | None = None


class HiringCandidateUpdate(BaseModel):
    """Update a hiring candidate."""
    name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    role: str | None = None
    stage: str | None = None
    source: str | None = None
    score: int | None = Field(default=None, ge=0, le=100)
    tags: list[str] | None = None
    notes: str | None = None
    resume_url: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    portfolio_url: str | None = None
    current_company: str | None = None
    current_role: str | None = None
    experience_years: int | None = None
    location: str | None = None
    requirement_id: str | None = None
    owner_id: str | None = None


class HiringCandidateResponse(BaseModel):
    """Hiring candidate response."""
    id: str
    workspace_id: str
    requirement_id: str | None = None
    name: str
    email: str
    phone: str | None = None
    role: str
    stage: str
    source: str | None = None
    score: int | None = None
    tags: list[str]
    notes: str | None = None
    resume_url: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    portfolio_url: str | None = None
    current_company: str | None = None
    current_role: str | None = None
    experience_years: int | None = None
    location: str | None = None
    owner_id: str | None = None
    owner_name: str | None = None
    applied_at: datetime
    created_at: datetime
    updated_at: datetime


class StageUpdateRequest(BaseModel):
    """Update candidate stage (for drag-drop)."""
    stage: str


VALID_STAGES = ["applied", "screening", "assessment", "interview", "offer", "hired", "rejected"]


async def _assert_owner_is_member(
    db: AsyncSession, workspace_id: str, owner_id: str | None
) -> None:
    """Reject an owner who isn't a member of the candidate's workspace.

    Without this, any developer id from any workspace can be dropped onto a
    candidate: they then show as the owner, get notified about stage changes, and
    have no access to the candidate itself. The same guard sprint tasks apply to
    assignees.
    """
    if not owner_id:
        return
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(
        str(workspace_id), str(owner_id), "viewer"
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Candidate owner must be a member of this workspace",
        )


async def _notify_stage_change(
    db: AsyncSession,
    candidate: HiringCandidate,
    old_stage: str,
    actor: Developer,
) -> None:
    """Tell the candidate's owner that somebody else moved them.

    Nothing fired `candidate_stage_changed` before, because `hiring_candidates`
    had no owner column — the only options were notifying every member with the
    hiring app on every Kanban drag, or notifying nobody. With an owner there is
    one right recipient, and `notify_candidate_stage_changed` drops the actor, so
    a recruiter dragging their own pipeline hears nothing.
    """
    if not candidate.owner_id or candidate.stage == old_stage:
        return

    from aexy.services.notification_service import notify_candidate_stage_changed

    await notify_candidate_stage_changed(
        db=db,
        recipient_id=str(candidate.owner_id),
        actor_id=str(actor.id),
        actor_name=actor.name or "Someone",
        candidate_id=str(candidate.id),
        candidate_name=candidate.name,
        old_stage=old_stage,
        new_stage=candidate.stage,
        workspace_id=str(candidate.workspace_id),
    )


def candidate_to_response(candidate: HiringCandidate) -> HiringCandidateResponse:
    """Convert HiringCandidate model to response."""
    return HiringCandidateResponse(
        id=str(candidate.id),
        workspace_id=str(candidate.workspace_id),
        requirement_id=str(candidate.requirement_id) if candidate.requirement_id else None,
        name=candidate.name,
        email=candidate.email,
        phone=candidate.phone,
        role=candidate.role,
        stage=candidate.stage,
        source=candidate.source,
        score=candidate.score,
        tags=candidate.tags or [],
        notes=candidate.notes,
        resume_url=candidate.resume_url,
        linkedin_url=candidate.linkedin_url,
        github_url=candidate.github_url,
        portfolio_url=candidate.portfolio_url,
        current_company=candidate.current_company,
        current_role=candidate.current_role,
        experience_years=candidate.experience_years,
        location=candidate.location,
        owner_id=str(candidate.owner_id) if candidate.owner_id else None,
        owner_name=candidate.owner.name if candidate.owner else None,
        applied_at=candidate.applied_at,
        created_at=candidate.created_at,
        updated_at=candidate.updated_at,
    )


@router.get("/candidates", response_model=list[HiringCandidateResponse])
async def list_hiring_candidates(
    workspace_id: str,
    stage: str | None = None,
    source: str | None = None,
    role: str | None = None,
    search: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all hiring candidates for a workspace.

    Args:
        workspace_id: Workspace UUID.
        stage: Optional stage filter.
        source: Optional source filter.
        role: Optional role filter.
        search: Optional search query (name/email).
        current_user: Current authenticated user.
        db: Database session.

    Returns:
        List of hiring candidates.
    """
    from aexy.services.workspace_service import WorkspaceService

    # Verify workspace access
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(workspace_id, str(current_user.id), "viewer"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    # Build query
    query = select(HiringCandidate).where(HiringCandidate.workspace_id == workspace_id)

    if stage:
        query = query.where(HiringCandidate.stage == stage)
    if source:
        query = query.where(HiringCandidate.source == source)
    if role:
        query = query.where(HiringCandidate.role == role)
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            (HiringCandidate.name.ilike(search_pattern)) |
            (HiringCandidate.email.ilike(search_pattern))
        )

    query = query.order_by(HiringCandidate.applied_at.desc())

    result = await db.execute(query)
    candidates = result.scalars().all()

    return [candidate_to_response(c) for c in candidates]


class PipelineMetricsResponse(BaseModel):
    """Pipeline metrics response."""
    total: int
    by_stage: dict[str, int]
    conversion_rates: dict[str, float]


@router.get("/candidates/pipeline-metrics", response_model=PipelineMetricsResponse)
async def get_pipeline_metrics(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get hiring pipeline metrics by stage.

    Args:
        workspace_id: Workspace UUID.
        current_user: Current authenticated user.
        db: Database session.

    Returns:
        Pipeline metrics with counts by stage and conversion rates.
    """
    from sqlalchemy import func
    from aexy.services.workspace_service import WorkspaceService

    # Verify workspace access
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(workspace_id, str(current_user.id), "viewer"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    # Get counts by stage
    stage_counts_query = (
        select(
            HiringCandidate.stage,
            func.count(HiringCandidate.id).label("count")
        )
        .where(HiringCandidate.workspace_id == workspace_id)
        .group_by(HiringCandidate.stage)
    )
    result = await db.execute(stage_counts_query)
    stage_counts = {row[0]: row[1] for row in result.all()}

    # Initialize all stages with 0
    by_stage = {stage: stage_counts.get(stage, 0) for stage in VALID_STAGES if stage != "rejected"}

    # Calculate total (excluding rejected)
    total = sum(by_stage.values())

    # Calculate conversion rates (from one stage to the next)
    stages_order = ["applied", "screening", "assessment", "interview", "offer", "hired"]
    conversion_rates = {}
    for i in range(len(stages_order) - 1):
        from_stage = stages_order[i]
        to_stage = stages_order[i + 1]
        from_count = by_stage.get(from_stage, 0)
        to_count = by_stage.get(to_stage, 0)
        # Conversion rate = (people who moved to next stage) / (people in current stage)
        # We use cumulative counts for a more accurate picture
        cumulative_from = sum(by_stage.get(s, 0) for s in stages_order[i:])
        cumulative_to = sum(by_stage.get(s, 0) for s in stages_order[i+1:])
        if cumulative_from > 0:
            conversion_rates[f"{from_stage}_to_{to_stage}"] = round((cumulative_to / cumulative_from) * 100, 1)
        else:
            conversion_rates[f"{from_stage}_to_{to_stage}"] = 0.0

    return PipelineMetricsResponse(
        total=total,
        by_stage=by_stage,
        conversion_rates=conversion_rates,
    )


@router.post("/candidates", response_model=HiringCandidateResponse, status_code=status.HTTP_201_CREATED)
async def create_hiring_candidate(
    workspace_id: str,
    data: HiringCandidateCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new hiring candidate.

    Args:
        workspace_id: Workspace UUID.
        data: Candidate data.
        current_user: Current authenticated user.
        db: Database session.

    Returns:
        Created candidate.
    """
    from aexy.services.workspace_service import WorkspaceService

    # Verify workspace access (need admin to add candidates)
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(workspace_id, str(current_user.id), "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required to add candidates",
        )

    # Validate stage
    if data.stage not in VALID_STAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid stage. Must be one of: {', '.join(VALID_STAGES)}",
        )

    # Check for duplicate email in workspace
    existing = await db.execute(
        select(HiringCandidate).where(
            HiringCandidate.workspace_id == workspace_id,
            HiringCandidate.email == data.email,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A candidate with this email already exists in this workspace",
        )

    await _assert_owner_is_member(db, workspace_id, data.owner_id)

    candidate = HiringCandidate(
        workspace_id=workspace_id,
        requirement_id=data.requirement_id,
        name=data.name,
        email=data.email,
        phone=data.phone,
        role=data.role,
        stage=data.stage,
        source=data.source,
        score=data.score,
        tags=data.tags,
        notes=data.notes,
        resume_url=data.resume_url,
        linkedin_url=data.linkedin_url,
        github_url=data.github_url,
        portfolio_url=data.portfolio_url,
        current_company=data.current_company,
        current_role=data.current_role,
        experience_years=data.experience_years,
        location=data.location,
        owner_id=data.owner_id,
        applied_at=data.applied_at or datetime.utcnow(),
    )

    db.add(candidate)
    await db.commit()
    await db.refresh(candidate)

    # Dispatch automation event
    await dispatch_automation_event(
        db=db,
        workspace_id=workspace_id,
        module="hiring",
        trigger_type="candidate.created",
        entity_id=str(candidate.id),
        trigger_data={
            "email": candidate.email,
            "name": candidate.name,
            "role": candidate.role,
            "stage": candidate.stage,
            "source": candidate.source,
            "score": candidate.score,
            "location": candidate.location,
            "experience_years": candidate.experience_years,
            "current_company": candidate.current_company,
        },
    )

    return candidate_to_response(candidate)


@router.get("/candidates/{candidate_id}", response_model=HiringCandidateResponse)
async def get_hiring_candidate(
    candidate_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a hiring candidate by ID.

    Args:
        candidate_id: Candidate UUID.
        current_user: Current authenticated user.
        db: Database session.

    Returns:
        Hiring candidate.
    """
    from aexy.services.workspace_service import WorkspaceService

    result = await db.execute(
        select(HiringCandidate).where(HiringCandidate.id == candidate_id)
    )
    candidate = result.scalar_one_or_none()

    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found",
        )

    # Verify workspace access
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(str(candidate.workspace_id), str(current_user.id), "viewer"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    return candidate_to_response(candidate)


@router.patch("/candidates/{candidate_id}", response_model=HiringCandidateResponse)
async def update_hiring_candidate(
    candidate_id: str,
    data: HiringCandidateUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a hiring candidate.

    Args:
        candidate_id: Candidate UUID.
        data: Update data.
        current_user: Current authenticated user.
        db: Database session.

    Returns:
        Updated candidate.
    """
    from aexy.services.workspace_service import WorkspaceService

    result = await db.execute(
        select(HiringCandidate).where(HiringCandidate.id == candidate_id)
    )
    candidate = result.scalar_one_or_none()

    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found",
        )

    # Verify workspace access
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(str(candidate.workspace_id), str(current_user.id), "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required to update candidates",
        )

    # Validate stage if provided
    if data.stage and data.stage not in VALID_STAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid stage. Must be one of: {', '.join(VALID_STAGES)}",
        )

    # Update fields
    update_data = data.model_dump(exclude_unset=True)
    if "owner_id" in update_data:
        await _assert_owner_is_member(
            db, str(candidate.workspace_id), update_data["owner_id"]
        )

    # This endpoint can move a candidate's stage too, not just the dedicated
    # /stage one the Kanban board uses, so it notifies from here as well.
    old_stage = candidate.stage

    for field, value in update_data.items():
        setattr(candidate, field, value)

    await db.commit()
    await db.refresh(candidate)

    await _notify_stage_change(db, candidate, old_stage, current_user)

    # Dispatch automation event
    await dispatch_automation_event(
        db=db,
        workspace_id=str(candidate.workspace_id),
        module="hiring",
        trigger_type="candidate.updated",
        entity_id=str(candidate.id),
        trigger_data={
            "email": candidate.email,
            "name": candidate.name,
            "role": candidate.role,
            "stage": candidate.stage,
            "source": candidate.source,
            "score": candidate.score,
            "location": candidate.location,
            "updated_fields": list(update_data.keys()),
        },
    )

    return candidate_to_response(candidate)


@router.patch("/candidates/{candidate_id}/stage", response_model=HiringCandidateResponse)
async def update_candidate_stage(
    candidate_id: str,
    data: StageUpdateRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a candidate's stage (for drag-drop in Kanban).

    Args:
        candidate_id: Candidate UUID.
        data: New stage.
        current_user: Current authenticated user.
        db: Database session.

    Returns:
        Updated candidate.
    """
    from aexy.services.workspace_service import WorkspaceService

    if data.stage not in VALID_STAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid stage. Must be one of: {', '.join(VALID_STAGES)}",
        )

    result = await db.execute(
        select(HiringCandidate).where(HiringCandidate.id == candidate_id)
    )
    candidate = result.scalar_one_or_none()

    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found",
        )

    # Verify workspace access
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(str(candidate.workspace_id), str(current_user.id), "member"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Member permission required to update candidate stage",
        )

    old_stage = candidate.stage
    candidate.stage = data.stage
    await db.commit()
    await db.refresh(candidate)

    await _notify_stage_change(db, candidate, old_stage, current_user)

    # Dispatch automation event
    await dispatch_automation_event(
        db=db,
        workspace_id=str(candidate.workspace_id),
        module="hiring",
        trigger_type="candidate.stage_changed",
        entity_id=str(candidate.id),
        trigger_data={
            "email": candidate.email,
            "name": candidate.name,
            "role": candidate.role,
            "old_stage": old_stage,
            "new_stage": data.stage,
            "score": candidate.score,
        },
    )

    # Dispatch specific triggers for terminal stages
    try:
        stage_lower = data.stage.lower()
        if stage_lower in ("rejected", "declined"):
            await dispatch_automation_event(
                db=db,
                workspace_id=str(candidate.workspace_id),
                module="hiring",
                trigger_type="candidate.rejected",
                entity_id=str(candidate.id),
                trigger_data={
                    "email": candidate.email,
                    "name": candidate.name,
                    "role": candidate.role,
                    "old_stage": old_stage,
                    "score": candidate.score,
                },
            )
        elif stage_lower in ("hired", "accepted", "offer_accepted"):
            await dispatch_automation_event(
                db=db,
                workspace_id=str(candidate.workspace_id),
                module="hiring",
                trigger_type="candidate.hired",
                entity_id=str(candidate.id),
                trigger_data={
                    "email": candidate.email,
                    "name": candidate.name,
                    "role": candidate.role,
                    "old_stage": old_stage,
                    "score": candidate.score,
                },
            )
    except Exception:
        pass  # automation dispatch should not block the main flow

    return candidate_to_response(candidate)


@router.delete("/candidates/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_hiring_candidate(
    candidate_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a hiring candidate.

    Args:
        candidate_id: Candidate UUID.
        current_user: Current authenticated user.
        db: Database session.
    """
    from aexy.services.workspace_service import WorkspaceService

    result = await db.execute(
        select(HiringCandidate).where(HiringCandidate.id == candidate_id)
    )
    candidate = result.scalar_one_or_none()

    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate not found",
        )

    # Verify workspace access
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(str(candidate.workspace_id), str(current_user.id), "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required to delete candidates",
        )

    await db.delete(candidate)
    await db.commit()
