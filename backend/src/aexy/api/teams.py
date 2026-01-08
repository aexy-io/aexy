"""Team API endpoints."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer_id
from aexy.core.database import get_db
from aexy.services.team_service import TeamService

router = APIRouter()


class TeamProfileRequest(BaseModel):
    """Request body for team profile generation."""

    developer_ids: list[str]


class SkillCoverageRequest(BaseModel):
    """Request body for skill coverage analysis."""

    developer_ids: list[str]
    required_skills: list[str]


class TeamProfileResponse(BaseModel):
    """Team profile response."""

    team_size: int
    skill_summary: dict[str, Any]
    metrics: dict[str, Any]
    commit_distribution: dict[str, Any]
    bus_factor: dict[str, int]
    bus_factor_risks: list[str]


class SkillCoverageResponse(BaseModel):
    """Skill coverage response."""

    covered: int
    total: int
    percentage: float
    covered_skills: list[str]
    missing_skills: list[str]


@router.post("/profile", response_model=TeamProfileResponse)
async def get_team_profile(
    request: TeamProfileRequest,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),
) -> TeamProfileResponse:
    """Generate team profile from developer IDs.

    Aggregates skills, calculates metrics, and identifies risks.
    """
    if not request.developer_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one developer ID is required",
        )

    service = TeamService()
    profile = await service.generate_team_profile(request.developer_ids, db)

    return TeamProfileResponse(**profile)


@router.post("/skills/coverage", response_model=SkillCoverageResponse)
async def get_skill_coverage(
    request: SkillCoverageRequest,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),
) -> SkillCoverageResponse:
    """Calculate skill coverage against required skills."""
    if not request.developer_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one developer ID is required",
        )

    if not request.required_skills:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one required skill is needed",
        )

    service = TeamService()
    coverage = await service.calculate_skill_coverage(
        developer_ids=request.developer_ids,
        required_skills=request.required_skills,
        db=db,
    )

    return SkillCoverageResponse(**coverage)


@router.post("/skills/gaps")
async def get_skill_gaps(
    request: SkillCoverageRequest,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),
) -> dict[str, list[str]]:
    """Identify missing skills for the team."""
    service = TeamService()
    gaps = await service.identify_skill_gaps(
        developer_ids=request.developer_ids,
        required_skills=request.required_skills,
        db=db,
    )

    return {"missing_skills": gaps}


@router.post("/bus-factor")
async def get_bus_factor(
    request: TeamProfileRequest,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),
) -> dict[str, Any]:
    """Calculate bus factor for team skills.

    Returns skills with their bus factor (number of developers who know them).
    Skills with factor=1 are high risk.
    """
    service = TeamService()
    bus_factor = await service.calculate_bus_factor(request.developer_ids, db)

    # Identify risks
    risks = [skill for skill, factor in bus_factor.items() if factor == 1]

    return {
        "bus_factor": bus_factor,
        "high_risk_skills": risks,
    }


@router.post("/velocity")
async def get_team_velocity(
    request: TeamProfileRequest,
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),
) -> dict[str, Any]:
    """Calculate team velocity metrics."""
    service = TeamService()
    velocity = await service.calculate_team_velocity(
        developer_ids=request.developer_ids,
        db=db,
        days=days,
    )

    return velocity
