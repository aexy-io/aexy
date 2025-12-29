"""Career progression API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from gitraki.core.database import get_db
from gitraki.models.developer import Developer
from gitraki.schemas.career import (
    CareerRoleCreate,
    CareerRoleResponse,
    CareerRoleUpdate,
    PromotionReadiness,
    RoleGapAnalysis,
    RoleRequirements,
    RoleSuggestion,
    SkillGap,
)
from gitraki.services.career_progression import CareerProgressionService
from gitraki.services.developer_service import DeveloperService

router = APIRouter(prefix="/career")


@router.get("/roles", response_model=list[dict])
async def list_roles(
    organization_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List all available career roles (predefined + custom).

    Args:
        organization_id: Optional organization for custom roles.
        db: Database session.

    Returns:
        List of career roles.
    """
    service = CareerProgressionService(db)
    roles = await service.get_all_roles(organization_id)
    return roles


@router.post("/roles", response_model=CareerRoleResponse, status_code=status.HTTP_201_CREATED)
async def create_custom_role(
    role_data: CareerRoleCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a custom role for an organization.

    Args:
        role_data: Role creation data.
        db: Database session.

    Returns:
        Created CareerRole.
    """
    if not role_data.organization_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="organization_id is required for custom roles",
        )

    service = CareerProgressionService(db)
    role = await service.create_custom_role(
        organization_id=role_data.organization_id,
        name=role_data.name,
        level=role_data.level,
        track=role_data.track.value,
        description=role_data.description,
        responsibilities=role_data.responsibilities,
        required_skills=role_data.required_skills,
        preferred_skills=role_data.preferred_skills,
        soft_skill_requirements=role_data.soft_skill_requirements,
    )

    return CareerRoleResponse(
        id=str(role.id),
        name=role.name,
        level=role.level,
        track=role_data.track,
        description=role.description,
        responsibilities=role.responsibilities,
        organization_id=role.organization_id,
        required_skills=role.required_skills,
        preferred_skills=role.preferred_skills,
        soft_skill_requirements=role.soft_skill_requirements,
        is_active=role.is_active,
        created_at=role.created_at,
        updated_at=role.updated_at,
    )


@router.get("/roles/{role_id}", response_model=dict | None)
async def get_role(
    role_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a role by ID.

    Args:
        role_id: Role UUID.
        db: Database session.

    Returns:
        Role data or None.
    """
    service = CareerProgressionService(db)
    role = await service.get_role_by_id(role_id)

    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found",
        )

    return {
        "id": str(role.id),
        "name": role.name,
        "level": role.level,
        "track": role.track,
        "description": role.description,
        "responsibilities": role.responsibilities,
        "required_skills": role.required_skills,
        "preferred_skills": role.preferred_skills,
        "soft_skill_requirements": role.soft_skill_requirements,
        "is_active": role.is_active,
    }


@router.get("/roles/{role_id}/requirements", response_model=RoleRequirements | None)
async def get_role_requirements(
    role_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get detailed requirements for a role.

    Args:
        role_id: Role UUID.
        db: Database session.

    Returns:
        Role requirements.
    """
    service = CareerProgressionService(db)
    requirements = await service.get_role_requirements(role_id=role_id)

    if not requirements:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found",
        )

    return RoleRequirements(
        role_id=requirements.get("role_id") or "",
        role_name=requirements.get("role_name", ""),
        level=requirements.get("level", 1),
        track=requirements.get("track", "engineering"),
        required_skills=requirements.get("required_skills", []),
        preferred_skills=requirements.get("preferred_skills", []),
        soft_skills=requirements.get("soft_skills", []),
        responsibilities=requirements.get("responsibilities", []),
    )


@router.get("/developers/{developer_id}/next-roles", response_model=list[RoleSuggestion])
async def suggest_next_roles(
    developer_id: str,
    organization_id: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Suggest next career steps for a developer.

    Args:
        developer_id: Developer UUID.
        organization_id: Optional org for custom roles.
        db: Database session.

    Returns:
        List of role suggestions.
    """
    dev_service = DeveloperService(db)
    developer = await dev_service.get_developer(developer_id)

    if not developer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer not found",
        )

    career_service = CareerProgressionService(db)
    roles = await career_service.get_all_roles(organization_id)
    suggestions = career_service.suggest_next_roles(developer, roles)

    return [
        RoleSuggestion(
            role=CareerRoleResponse(
                id=s.role_id,
                name=s.role_name,
                level=s.level,
                track=s.track,
                description=None,
                responsibilities=[],
                organization_id=None,
                required_skills={},
                preferred_skills={},
                soft_skill_requirements={},
                is_active=True,
                created_at=developer.created_at,
                updated_at=developer.updated_at,
            ),
            readiness_score=s.readiness_score,
            progression_type=s.progression_type,
            key_gaps=s.key_gaps,
            estimated_preparation_months=s.estimated_preparation_months,
        )
        for s in suggestions
    ]


@router.get("/developers/{developer_id}/readiness/{role_id}", response_model=PromotionReadiness)
async def get_promotion_readiness(
    developer_id: str,
    role_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Check promotion readiness for a target role.

    Args:
        developer_id: Developer UUID.
        role_id: Target role UUID.
        db: Database session.

    Returns:
        Promotion readiness assessment.
    """
    dev_service = DeveloperService(db)
    developer = await dev_service.get_developer(developer_id)

    if not developer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer not found",
        )

    career_service = CareerProgressionService(db)
    role_requirements = await career_service.get_role_requirements(role_id=role_id)

    if not role_requirements:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found",
        )

    readiness = career_service.get_promotion_readiness(developer, role_requirements)

    return PromotionReadiness(
        developer_id=readiness.developer_id,
        target_role_id=readiness.target_role_id,
        target_role_name=readiness.target_role_name,
        overall_readiness=readiness.overall_readiness,
        met_criteria=readiness.met_criteria,
        missing_criteria=readiness.missing_criteria,
        recommendations=readiness.recommendations,
        timeline_estimate=readiness.timeline_estimate,
    )


@router.get("/developers/{developer_id}/gap/{role_id}", response_model=RoleGapAnalysis)
async def compare_developer_to_role(
    developer_id: str,
    role_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Compare a developer's skills to a role's requirements.

    Args:
        developer_id: Developer UUID.
        role_id: Role UUID.
        db: Database session.

    Returns:
        Detailed gap analysis.
    """
    dev_service = DeveloperService(db)
    developer = await dev_service.get_developer(developer_id)

    if not developer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer not found",
        )

    career_service = CareerProgressionService(db)
    role_requirements = await career_service.get_role_requirements(role_id=role_id)

    if not role_requirements:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role not found",
        )

    gap_result = career_service.compare_developer_to_role(developer, role_requirements)

    return RoleGapAnalysis(
        developer_id=gap_result.developer_id,
        role_id=gap_result.role_id,
        role_name=gap_result.role_name,
        overall_readiness=gap_result.overall_readiness,
        skill_gaps=[
            SkillGap(
                skill=g.skill,
                current=int(g.current),
                target=int(g.target),
                gap=int(g.gap),
            )
            for g in gap_result.skill_gaps
        ],
        met_requirements=gap_result.met_requirements,
        soft_skill_gaps=gap_result.soft_skill_gaps,
        estimated_time_to_ready_months=gap_result.estimated_time_to_ready_months,
    )


@router.post("/roles/seed")
async def seed_predefined_roles(
    db: AsyncSession = Depends(get_db),
):
    """Seed predefined roles into the database.

    Args:
        db: Database session.

    Returns:
        Number of roles created.
    """
    service = CareerProgressionService(db)
    created = await service.seed_predefined_roles()

    return {
        "message": f"Created {len(created)} predefined roles",
        "roles": [r.name for r in created],
    }
