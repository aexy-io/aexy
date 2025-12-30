"""Workspace Teams API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.core.database import get_db
from devograph.api.developers import get_current_developer
from devograph.models.developer import Developer
from devograph.schemas.team import (
    TeamCreate,
    TeamUpdate,
    TeamResponse,
    TeamListResponse,
    TeamMemberAdd,
    TeamMemberUpdate,
    TeamMemberResponse,
    TeamFromRepositoryRequest,
    TeamSyncResult,
    TeamProfileResponse,
    TeamBusFactorResponse,
    TeamSkillCoverageResponse,
)
from devograph.services.workspace_service import WorkspaceService
from devograph.services.team_management_service import TeamManagementService
from devograph.services.team_service import TeamService

router = APIRouter(prefix="/workspaces/{workspace_id}/teams", tags=["Teams"])


def team_to_response(team, member_count: int = 0) -> TeamResponse:
    """Convert Team model to response schema."""
    return TeamResponse(
        id=str(team.id),
        workspace_id=str(team.workspace_id),
        name=team.name,
        slug=team.slug,
        description=team.description,
        type=team.type,
        source_repository_ids=team.source_repository_ids,
        auto_sync_enabled=team.auto_sync_enabled,
        member_count=member_count,
        is_active=team.is_active,
        created_at=team.created_at,
        updated_at=team.updated_at,
    )


def member_to_response(member) -> TeamMemberResponse:
    """Convert TeamMember model to response schema."""
    developer = member.developer
    return TeamMemberResponse(
        id=str(member.id),
        team_id=str(member.team_id),
        developer_id=str(member.developer_id),
        developer_name=developer.name if developer else None,
        developer_email=developer.email if developer else None,
        developer_avatar_url=developer.avatar_url if developer else None,
        role=member.role,
        source=member.source,
        joined_at=member.joined_at,
        created_at=member.created_at,
    )


async def verify_workspace_access(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
    required_role: str = "viewer",
) -> WorkspaceService:
    """Verify the user has access to the workspace."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(workspace_id, str(current_user.id), required_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{required_role.capitalize()} permission required",
        )

    return workspace_service


# Team CRUD
@router.post("", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(
    workspace_id: str,
    data: TeamCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new team in the workspace."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = TeamManagementService(db)

    team = await service.create_team(
        workspace_id=workspace_id,
        name=data.name,
        type=data.type,
        description=data.description,
        source_repository_ids=data.source_repository_ids,
    )

    # Auto-add the creator as a team lead
    await service.add_team_member(
        team_id=str(team.id),
        developer_id=str(current_user.id),
        role="lead",
        source="manual",
    )

    await db.commit()
    return team_to_response(team, member_count=1)


@router.get("", response_model=list[TeamListResponse])
async def list_teams(
    workspace_id: str,
    include_inactive: bool = False,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all teams in the workspace."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = TeamManagementService(db)
    teams = await service.list_workspace_teams(workspace_id, include_inactive=include_inactive)

    results = []
    for team in teams:
        member_count = await service.get_member_count(str(team.id))
        results.append(
            TeamListResponse(
                id=str(team.id),
                workspace_id=str(team.workspace_id),
                name=team.name,
                slug=team.slug,
                type=team.type,
                member_count=member_count,
                is_active=team.is_active,
            )
        )

    return results


@router.get("/{team_id}", response_model=TeamResponse)
async def get_team(
    workspace_id: str,
    team_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a team by ID."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = TeamManagementService(db)
    team = await service.get_team(team_id)

    if not team or str(team.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    member_count = await service.get_member_count(team_id)
    return team_to_response(team, member_count)


@router.patch("/{team_id}", response_model=TeamResponse)
async def update_team(
    workspace_id: str,
    team_id: str,
    data: TeamUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a team."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = TeamManagementService(db)

    # Verify team belongs to workspace
    existing = await service.get_team(team_id)
    if not existing or str(existing.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    team = await service.update_team(
        team_id=team_id,
        name=data.name,
        description=data.description,
        auto_sync_enabled=data.auto_sync_enabled,
        settings=data.settings,
    )

    await db.commit()
    member_count = await service.get_member_count(team_id)
    return team_to_response(team, member_count)


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(
    workspace_id: str,
    team_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a team (soft delete)."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = TeamManagementService(db)

    # Verify team belongs to workspace
    existing = await service.get_team(team_id)
    if not existing or str(existing.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    if not await service.delete_team(team_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    await db.commit()


# Team member management
@router.get("/{team_id}/members", response_model=list[TeamMemberResponse])
async def list_team_members(
    workspace_id: str,
    team_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all members of a team."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = TeamManagementService(db)

    # Verify team belongs to workspace
    team = await service.get_team(team_id)
    if not team or str(team.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    members = await service.get_team_members(team_id)
    return [member_to_response(m) for m in members]


@router.post("/{team_id}/members", response_model=TeamMemberResponse, status_code=status.HTTP_201_CREATED)
async def add_team_member(
    workspace_id: str,
    team_id: str,
    data: TeamMemberAdd,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add a member to a team."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = TeamManagementService(db)
    workspace_service = WorkspaceService(db)

    # Verify team belongs to workspace
    team = await service.get_team(team_id)
    if not team or str(team.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    # Verify the developer is a workspace member
    ws_member = await workspace_service.get_member(workspace_id, data.developer_id)
    if not ws_member or ws_member.status != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Developer must be a workspace member first",
        )

    try:
        member = await service.add_team_member(
            team_id=team_id,
            developer_id=data.developer_id,
            role=data.role,
            source="manual",
        )
        await db.commit()
        await db.refresh(member)
        return member_to_response(member)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.patch("/{team_id}/members/{developer_id}", response_model=TeamMemberResponse)
async def update_team_member_role(
    workspace_id: str,
    team_id: str,
    developer_id: str,
    data: TeamMemberUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a team member's role."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = TeamManagementService(db)

    # Verify team belongs to workspace
    team = await service.get_team(team_id)
    if not team or str(team.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    member = await service.update_team_member_role(
        team_id=team_id,
        developer_id=developer_id,
        new_role=data.role,
    )

    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team member not found",
        )

    await db.commit()
    await db.refresh(member)
    return member_to_response(member)


@router.delete("/{team_id}/members/{developer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_team_member(
    workspace_id: str,
    team_id: str,
    developer_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Remove a member from a team."""
    # Can remove self or need admin permission
    is_self = developer_id == str(current_user.id)
    if not is_self:
        await verify_workspace_access(workspace_id, current_user, db, "admin")
    else:
        await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = TeamManagementService(db)

    # Verify team belongs to workspace
    team = await service.get_team(team_id)
    if not team or str(team.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    if not await service.remove_team_member(team_id, developer_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team member not found",
        )

    await db.commit()


# Team generation from repositories
@router.post("/from-repository", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team_from_repository(
    workspace_id: str,
    data: TeamFromRepositoryRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a team from repository contributors."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = TeamManagementService(db)

    try:
        team = await service.generate_team_from_repository(
            workspace_id=workspace_id,
            repository_id=data.repository_id,
            team_name=data.team_name,
            include_contributors_since_days=data.include_contributors_since_days,
        )
        await db.commit()

        member_count = await service.get_member_count(str(team.id))
        return team_to_response(team, member_count)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/{team_id}/sync", response_model=TeamSyncResult)
async def sync_team_members(
    workspace_id: str,
    team_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Sync members for a repo-based team."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = TeamManagementService(db)

    # Verify team belongs to workspace
    team = await service.get_team(team_id)
    if not team or str(team.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    if team.type != "repo_based":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only sync repo-based teams",
        )

    result = await service.sync_repo_team_members(team_id)
    await db.commit()

    return TeamSyncResult(
        team_id=team_id,
        added_members=result["added"],
        removed_members=result["removed"],
        unchanged_members=result["unchanged"],
    )


# Team analytics (bridge to existing TeamService)
@router.get("/{team_id}/profile", response_model=TeamProfileResponse)
async def get_team_profile(
    workspace_id: str,
    team_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get team profile with aggregated skills and metrics."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    mgmt_service = TeamManagementService(db)

    # Verify team belongs to workspace
    team = await mgmt_service.get_team(team_id)
    if not team or str(team.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    # Get developer IDs for this team
    developer_ids = await mgmt_service.get_developer_ids_for_team(team_id)

    if not developer_ids:
        return TeamProfileResponse(
            team_id=team_id,
            team_name=team.name,
            member_count=0,
        )

    # Use existing TeamService for analytics
    analytics_service = TeamService()
    profile = await analytics_service.generate_team_profile(developer_ids, db)

    skill_summary = profile.get("skill_summary", {})
    return TeamProfileResponse(
        team_id=team_id,
        team_name=team.name,
        member_count=len(developer_ids),
        languages=skill_summary.get("languages", []),
        frameworks=skill_summary.get("frameworks", []),
        domains=skill_summary.get("domains", []),
        tools=skill_summary.get("tools", []),
        velocity=profile.get("metrics"),
        commit_distribution=profile.get("commit_distribution"),
    )


@router.get("/{team_id}/velocity")
async def get_team_velocity(
    workspace_id: str,
    team_id: str,
    period_days: int = 30,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get team velocity metrics."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    mgmt_service = TeamManagementService(db)

    # Verify team belongs to workspace
    team = await mgmt_service.get_team(team_id)
    if not team or str(team.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    developer_ids = await mgmt_service.get_developer_ids_for_team(team_id)

    if not developer_ids:
        return {"velocity": 0, "trend": 0, "commits_per_day": 0}

    analytics_service = TeamService()
    velocity = await analytics_service.calculate_team_velocity(developer_ids, db, period_days)

    return velocity


@router.get("/{team_id}/bus-factor", response_model=TeamBusFactorResponse)
async def get_team_bus_factor(
    workspace_id: str,
    team_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get team bus factor analysis."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    mgmt_service = TeamManagementService(db)

    # Verify team belongs to workspace
    team = await mgmt_service.get_team(team_id)
    if not team or str(team.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    developer_ids = await mgmt_service.get_developer_ids_for_team(team_id)

    if not developer_ids:
        return TeamBusFactorResponse(team_id=team_id)

    analytics_service = TeamService()
    bus_factor = await analytics_service.calculate_bus_factor(developer_ids, db)

    # Find critical skills (bus factor = 1)
    critical_skills = [skill for skill, factor in bus_factor.items() if factor == 1]

    return TeamBusFactorResponse(
        team_id=team_id,
        bus_factor_skills=bus_factor,
        critical_skills=critical_skills,
    )


@router.get("/{team_id}/skill-coverage", response_model=TeamSkillCoverageResponse)
async def get_team_skill_coverage(
    workspace_id: str,
    team_id: str,
    required_skills: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get team skill coverage analysis.

    Args:
        required_skills: Comma-separated list of skills to check coverage for.
    """
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    mgmt_service = TeamManagementService(db)

    # Verify team belongs to workspace
    team = await mgmt_service.get_team(team_id)
    if not team or str(team.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    developer_ids = await mgmt_service.get_developer_ids_for_team(team_id)

    if not developer_ids:
        return TeamSkillCoverageResponse(team_id=team_id)

    skills_list = []
    if required_skills:
        skills_list = [s.strip() for s in required_skills.split(",") if s.strip()]

    analytics_service = TeamService()
    coverage = await analytics_service.calculate_skill_coverage(developer_ids, skills_list, db)

    return TeamSkillCoverageResponse(
        team_id=team_id,
        coverage_percentage=coverage.get("percentage", 0.0),
        covered_skills=coverage.get("covered_skills", []),
        missing_skills=coverage.get("missing_skills", []),
    )
