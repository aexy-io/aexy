"""Workspace + team repository endpoints.

Workspace catalog: which repos the workspace tracks. Admin-only writes.
Team subset: which catalog entries a project (team) works against.
Replaces the per-developer enable/disable surface.
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer_id
from aexy.core.database import get_db
from aexy.models.repository import DeveloperRepository, Repository
from aexy.models.team import Team
from aexy.models.workspace import WorkspaceMember
from aexy.services.workspace_repository_service import WorkspaceRepositoryService
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(tags=["Repositories"])


class RepositorySummary(BaseModel):
    id: str
    full_name: str
    name: str
    owner_login: str
    owner_type: str
    description: str | None = None
    is_private: bool
    is_archived: bool
    language: str | None = None


class WorkspaceRepositoryResponse(BaseModel):
    id: str
    workspace_id: str
    repository: RepositorySummary
    adopted_by_developer_id: str | None
    adopted_by_name: str | None = None
    adopter_active: bool = True
    is_active: bool
    sync_status: str
    last_sync_at: datetime | None = None
    sync_error: str | None = None
    commits_synced: int = 0
    prs_synced: int = 0
    reviews_synced: int = 0
    created_at: datetime
    updated_at: datetime


class AdoptRepositoryRequest(BaseModel):
    repository_id: str


class ReclaimRepositoryRequest(BaseModel):
    new_adopter_id: str | None = None  # None = pick any active member with reach


class TeamRepositoryLinkRequest(BaseModel):
    workspace_repository_id: str


def _wr_to_response(
    wr,
    *,
    adopter_name: str | None = None,
    adopter_active: bool = True,
    sync_override: dict | None = None,
) -> WorkspaceRepositoryResponse:
    repo = wr.repository
    sync = sync_override or {}
    return WorkspaceRepositoryResponse(
        id=str(wr.id),
        workspace_id=str(wr.workspace_id),
        repository=RepositorySummary(
            id=str(repo.id),
            full_name=repo.full_name,
            name=repo.name,
            owner_login=repo.owner_login,
            owner_type=repo.owner_type,
            description=repo.description,
            is_private=repo.is_private,
            is_archived=repo.is_archived,
            language=repo.language,
        ),
        adopted_by_developer_id=str(wr.adopted_by_developer_id)
        if wr.adopted_by_developer_id
        else None,
        adopted_by_name=adopter_name,
        adopter_active=adopter_active,
        is_active=wr.is_active,
        sync_status=sync.get("sync_status", wr.sync_status),
        last_sync_at=sync.get("last_sync_at", wr.last_sync_at),
        sync_error=sync.get("sync_error", wr.sync_error),
        commits_synced=sync.get("commits_synced", wr.commits_synced),
        prs_synced=sync.get("prs_synced", wr.prs_synced),
        reviews_synced=sync.get("reviews_synced", wr.reviews_synced),
        created_at=wr.created_at,
        updated_at=wr.updated_at,
    )


async def _verify_workspace_role(
    db: AsyncSession,
    workspace_id: str,
    developer_id: str,
    required_role: str,
) -> None:
    ws = WorkspaceService(db)
    if not await ws.check_permission(workspace_id, developer_id, required_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Workspace {required_role} role required",
        )


async def _verify_team_role(
    db: AsyncSession,
    team_id: str,
    developer_id: str,
    required_role: str,
) -> Team:
    team = await db.get(Team, team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Team not found"
        )
    await _verify_workspace_role(
        db, str(team.workspace_id), developer_id, required_role
    )
    return team


async def _resolve_adopter_metadata(
    db: AsyncSession, workspace_id: str, wrs: list
) -> dict[str, dict]:
    """Bulk-fetch adopter names + active-status for a list of workspace repos.

    Returns map of workspace_repository.id → {name, active}.
    """
    from aexy.models.developer import Developer

    adopter_ids = {
        str(wr.adopted_by_developer_id) for wr in wrs if wr.adopted_by_developer_id
    }
    if not adopter_ids:
        return {}

    devs_stmt = select(Developer.id, Developer.name).where(
        Developer.id.in_(adopter_ids)
    )
    name_map = {
        str(row.id): row.name for row in (await db.execute(devs_stmt)).all()
    }

    member_stmt = select(WorkspaceMember.developer_id, WorkspaceMember.status).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.developer_id.in_(adopter_ids),
    )
    active_map = {
        str(row.developer_id): row.status == "active"
        for row in (await db.execute(member_stmt)).all()
    }

    return {
        str(wr.id): {
            "name": name_map.get(str(wr.adopted_by_developer_id)),
            "active": active_map.get(str(wr.adopted_by_developer_id), False),
        }
        for wr in wrs
        if wr.adopted_by_developer_id
    }


async def _resolve_sync_metadata(db: AsyncSession, wrs: list) -> dict[str, dict]:
    """Resolve effective sync state for workspace repos.

    The sync now stamps the WorkspaceRepository row itself, but rows adopted
    before that only carry their adoption defaults — `pending`, no timestamp —
    while the adopter's DeveloperRepository row holds the real history. Keep
    reading the adopter row so those repos don't read as never-synced until
    their next sync; the two agree from that point on.
    """
    pairs = [
        (str(wr.id), str(wr.adopted_by_developer_id), str(wr.repository_id))
        for wr in wrs
        if wr.adopted_by_developer_id and wr.repository_id
    ]
    if not pairs:
        return {}

    developer_ids = {developer_id for _, developer_id, _ in pairs}
    repository_ids = {repository_id for _, _, repository_id in pairs}
    stmt = select(DeveloperRepository).where(
        DeveloperRepository.developer_id.in_(developer_ids),
        DeveloperRepository.repository_id.in_(repository_ids),
    )
    result = await db.execute(stmt)
    by_pair = {
        (str(dr.developer_id), str(dr.repository_id)): dr
        for dr in result.scalars().all()
    }

    resolved: dict[str, dict] = {}
    for wr_id, developer_id, repository_id in pairs:
        dr = by_pair.get((developer_id, repository_id))
        if not dr:
            continue
        resolved[wr_id] = {
            "sync_status": dr.sync_status,
            "last_sync_at": dr.last_sync_at,
            "sync_error": dr.sync_error,
            "commits_synced": dr.commits_synced,
            "prs_synced": dr.prs_synced,
            "reviews_synced": dr.reviews_synced,
        }
    return resolved


# ─── Workspace catalog ──────────────────────────────────────────────────
@router.get(
    "/workspaces/{workspace_id}/repositories",
    response_model=list[WorkspaceRepositoryResponse],
)
async def list_workspace_repositories(
    workspace_id: str,
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
    include_inactive: bool = False,
):
    """List repos adopted into the workspace catalog."""
    await _verify_workspace_role(db, workspace_id, developer_id, "viewer")
    service = WorkspaceRepositoryService(db)
    wrs = await service.list_workspace_repositories(
        workspace_id, include_inactive=include_inactive
    )
    adopter_meta = await _resolve_adopter_metadata(db, workspace_id, wrs)
    sync_meta = await _resolve_sync_metadata(db, wrs)
    return [
        _wr_to_response(
            wr,
            adopter_name=adopter_meta.get(str(wr.id), {}).get("name"),
            adopter_active=adopter_meta.get(str(wr.id), {}).get("active", True),
            sync_override=sync_meta.get(str(wr.id)),
        )
        for wr in wrs
    ]


@router.post(
    "/workspaces/{workspace_id}/repositories",
    response_model=WorkspaceRepositoryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def adopt_repository(
    workspace_id: str,
    data: AdoptRepositoryRequest,
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Adopt a repo into the workspace catalog. Admin-only.

    The caller's developer_id is recorded as the adopter (their
    installation token will drive sync). If they don't have reach,
    we pick any active workspace member who does.
    """
    await _verify_workspace_role(db, workspace_id, developer_id, "admin")

    repo = await db.get(Repository, data.repository_id)
    if not repo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Repository not found"
        )

    # Workspace-scoped repo-cap gate. Skips when the workspace is already
    # adopting this repo (idempotent re-adopt should never fail on cap).
    from aexy.services.limits_service import LimitsService

    service = WorkspaceRepositoryService(db)
    existing = await service.get_workspace_repository(workspace_id, data.repository_id)
    if not existing:
        limits = LimitsService(db)
        can_adopt, error = await limits.can_adopt_repository(workspace_id, developer_id)
        if not can_adopt:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=error or "Workspace repository limit reached",
            )
    # Prefer the caller when GitHub has actually shown them this repo, and
    # only borrow somebody else's reach when it hasn't. The old version took
    # the fallback whenever it named a different person — so adopting a repo
    # you could see handed the sync to an arbitrary colleague, which is the
    # opposite of what its own comment claimed. Asked before adoption creates
    # the caller's row, or the answer would always be yes.
    adopter = developer_id
    if not await service.has_installation_reach(developer_id, data.repository_id):
        fallback = await service.pick_installation_developer(
            workspace_id, data.repository_id
        )
        if fallback:
            adopter = fallback

    wr = await service.adopt_repository(
        workspace_id=workspace_id,
        repository_id=data.repository_id,
        adopted_by_developer_id=adopter,
    )
    await db.commit()
    await db.refresh(wr)
    wr.repository = repo
    adopter_meta = await _resolve_adopter_metadata(db, workspace_id, [wr])
    sync_meta = await _resolve_sync_metadata(db, [wr])
    return _wr_to_response(
        wr,
        adopter_name=adopter_meta.get(str(wr.id), {}).get("name"),
        adopter_active=adopter_meta.get(str(wr.id), {}).get("active", True),
        sync_override=sync_meta.get(str(wr.id)),
    )


@router.delete(
    "/workspaces/{workspace_id}/repositories/{repository_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def unadopt_repository(
    workspace_id: str,
    repository_id: str,
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Remove a repo from the workspace catalog. Cascades to team links."""
    await _verify_workspace_role(db, workspace_id, developer_id, "admin")
    service = WorkspaceRepositoryService(db)
    removed = await service.unadopt_repository(workspace_id, repository_id)
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not adopted in this workspace",
        )
    await db.commit()


@router.post(
    "/workspaces/{workspace_id}/repositories/{workspace_repository_id}/reclaim",
    response_model=WorkspaceRepositoryResponse,
)
async def reclaim_repository(
    workspace_id: str,
    workspace_repository_id: str,
    data: ReclaimRepositoryRequest,
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Re-bind a workspace_repository's adopter.

    Used when the original adopter became inactive. Caller can pass an
    explicit `new_adopter_id` (must be an active workspace member with
    GitHub reach to the repo) or omit it to let the server pick any
    active member with reach. Self-reclaim is the common case — the
    member opens the workspace catalog, sees the "Reclaim" banner, and
    clicks it; the request defaults `new_adopter_id` to themselves.
    """
    await _verify_workspace_role(db, workspace_id, developer_id, "member")

    service = WorkspaceRepositoryService(db)
    from aexy.models.repository import WorkspaceRepository

    wr = await db.get(WorkspaceRepository, workspace_repository_id)
    if not wr or str(wr.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace repository not found",
        )

    # Pick adopter — explicit > caller-with-reach > any-active-member-with-reach
    candidate_id = data.new_adopter_id or developer_id
    if not await service.pick_installation_developer(
        workspace_id, str(wr.repository_id)
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No active workspace member has GitHub reach to this repo",
        )

    # Validate the candidate is an active workspace member.
    candidate_stmt = select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.developer_id == candidate_id,
        WorkspaceMember.status == "active",
    )
    if not (await db.execute(candidate_stmt)).scalar_one_or_none():
        # Caller specified a non-member — fall back to any active
        # member who can reach.
        fallback = await service.pick_installation_developer(
            workspace_id, str(wr.repository_id)
        )
        if not fallback:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No active workspace member can reclaim this repository",
            )
        candidate_id = fallback

    wr = await service.reclaim_repository(workspace_repository_id, candidate_id)
    if not wr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace repository not found",
        )
    await db.commit()

    repo = await db.get(Repository, wr.repository_id)
    wr.repository = repo
    adopter_meta = await _resolve_adopter_metadata(db, workspace_id, [wr])
    sync_meta = await _resolve_sync_metadata(db, [wr])
    return _wr_to_response(
        wr,
        adopter_name=adopter_meta.get(str(wr.id), {}).get("name"),
        adopter_active=adopter_meta.get(str(wr.id), {}).get("active", True),
        sync_override=sync_meta.get(str(wr.id)),
    )


# ─── Team subset ────────────────────────────────────────────────────────
@router.get(
    "/teams/{team_id}/repositories",
    response_model=list[WorkspaceRepositoryResponse],
)
async def list_team_repositories(
    team_id: str,
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Repos selected for this project (team)."""
    team = await _verify_team_role(db, team_id, developer_id, "viewer")
    service = WorkspaceRepositoryService(db)
    wrs = await service.list_team_repositories(team_id)
    adopter_meta = await _resolve_adopter_metadata(
        db, str(team.workspace_id), wrs
    )
    sync_meta = await _resolve_sync_metadata(db, wrs)
    return [
        _wr_to_response(
            wr,
            adopter_name=adopter_meta.get(str(wr.id), {}).get("name"),
            adopter_active=adopter_meta.get(str(wr.id), {}).get("active", True),
            sync_override=sync_meta.get(str(wr.id)),
        )
        for wr in wrs
    ]


@router.post(
    "/teams/{team_id}/repositories",
    status_code=status.HTTP_201_CREATED,
)
async def link_team_repository(
    team_id: str,
    data: TeamRepositoryLinkRequest,
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Add a workspace repo to this team's selection."""
    await _verify_team_role(db, team_id, developer_id, "member")
    service = WorkspaceRepositoryService(db)
    link = await service.link_team_repository(
        team_id=team_id,
        workspace_repository_id=data.workspace_repository_id,
    )
    if not link:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Workspace repository does not belong to this team's workspace",
        )
    await db.commit()
    return {"id": str(link.id), "team_id": str(link.team_id)}


@router.delete(
    "/teams/{team_id}/repositories/{workspace_repository_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def unlink_team_repository(
    team_id: str,
    workspace_repository_id: str,
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _verify_team_role(db, team_id, developer_id, "member")
    service = WorkspaceRepositoryService(db)
    removed = await service.unlink_team_repository(team_id, workspace_repository_id)
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Repository not linked to this team",
        )
    await db.commit()
