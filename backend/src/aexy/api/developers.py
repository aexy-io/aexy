"""Developer profile endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError, jwt
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from pydantic import BaseModel
from sqlalchemy import select

from aexy.core.config import get_settings
from aexy.core.database import get_db
from aexy.models.developer import Developer, GoogleConnection
from aexy.schemas.developer import DeveloperResponse, DeveloperUpdate
from aexy.services.api_token_service import ApiTokenService
from aexy.services.developer_service import DeveloperNotFoundError, DeveloperService
from aexy.services.sprint_task_service import SprintTaskService


class GoogleConnectionStatus(BaseModel):
    """Response for Google connection status."""
    is_connected: bool
    google_email: str | None = None

router = APIRouter()
settings = get_settings()
security = HTTPBearer()


async def get_current_developer_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> str:
    """Extract and validate developer ID from JWT or API token."""
    token = credentials.credentials

    # API token auth (aexy_ prefix)
    if token.startswith("aexy_"):
        service = ApiTokenService(db)
        api_token = await service.validate(token)
        if api_token is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired API token",
            )
        return api_token.developer_id

    # JWT auth
    try:
        payload = jwt.decode(
            token,
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


async def get_current_developer(
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> Developer:
    """Get the current authenticated developer (dependency)."""
    service = DeveloperService(db)
    try:
        developer = await service.get_by_id(developer_id)
        return developer
    except DeveloperNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer not found",
        ) from e


# Optional security - returns None if no token provided
optional_security = HTTPBearer(auto_error=False)


async def get_optional_current_developer(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
    db: AsyncSession = Depends(get_db),
) -> Developer | None:
    """Get the current developer if authenticated, otherwise None."""
    if not credentials:
        return None

    token = credentials.credentials

    # API token auth (aexy_ prefix)
    if token.startswith("aexy_"):
        token_service = ApiTokenService(db)
        api_token = await token_service.validate(token)
        if api_token is None:
            return None
        dev_service = DeveloperService(db)
        try:
            return await dev_service.get_by_id(api_token.developer_id)
        except DeveloperNotFoundError:
            return None

    # JWT auth
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
        )
        developer_id = payload.get("sub")
        if developer_id is None:
            return None

        service = DeveloperService(db)
        try:
            return await service.get_by_id(developer_id)
        except DeveloperNotFoundError:
            return None
    except JWTError:
        return None


@router.get("/me", response_model=DeveloperResponse)
async def get_current_developer_profile(
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> DeveloperResponse:
    """Get the current authenticated developer's profile."""
    service = DeveloperService(db)
    try:
        developer = await service.get_by_id(developer_id)
    except DeveloperNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer not found",
        ) from e

    return DeveloperResponse.model_validate(developer)


@router.get("/me/claim-commits/preview")
async def preview_claim_my_commits(
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Preview how many commits/PRs/reviews would be merged if the caller
    clicks the claim button. Read-only; safe to call repeatedly.

    Returns `{ ghost_id, commits, prs, reviews, github_username }`.
    `ghost_id` is null when there's nothing to claim.
    """
    from aexy.models.developer import GitHubConnection

    service = DeveloperService(db)
    conn = (
        await db.execute(
            select(GitHubConnection).where(
                GitHubConnection.developer_id == developer_id
            )
        )
    ).scalar_one_or_none()
    if not conn or not conn.github_username:
        return {
            "ghost_id": None,
            "commits": 0,
            "prs": 0,
            "reviews": 0,
            "github_username": None,
        }

    preview = await service.preview_ghost_match(
        canonical_developer_id=developer_id,
        github_username=conn.github_username,
    )
    preview["github_username"] = conn.github_username
    return preview


@router.post("/me/claim-commits")
async def claim_my_commits(
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Merge any orphaned 'ghost developer' rows that match my GitHub login.

    Self-serve recovery for the case where a contributor's commits were
    synced (e.g. by an admin's pre-existing connection) before they signed
    in themselves. Their `Commit.developer_id` rows still point at a ghost
    row whose `name == my_github_login AND email IS NULL`; this endpoint
    physically reassigns them to the current logged-in developer.
    """
    from aexy.models.developer import GitHubConnection

    service = DeveloperService(db)
    # Look up the caller's GitHub username from their stored connection.
    conn = (
        await db.execute(
            select(GitHubConnection).where(
                GitHubConnection.developer_id == developer_id
            )
        )
    ).scalar_one_or_none()
    if not conn or not conn.github_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No GitHub connection found — connect GitHub first.",
        )

    result = await service.merge_ghost_into_developer(
        canonical_developer_id=developer_id,
        github_username=conn.github_username,
    )
    await db.commit()
    return result


class EmailAliasResponse(BaseModel):
    id: str
    email: str
    verified: bool
    created_at: str


class EmailAliasAddRequest(BaseModel):
    email: str


class EmailAliasPreviewResponse(BaseModel):
    commits: int


class EmailAliasAddResponse(BaseModel):
    alias: EmailAliasResponse
    backfill: dict[str, int]


def _alias_to_response(alias) -> EmailAliasResponse:
    return EmailAliasResponse(
        id=str(alias.id),
        email=alias.email,
        verified=bool(alias.verified),
        created_at=alias.created_at.isoformat() if alias.created_at else "",
    )


@router.get("/me/email-aliases", response_model=list[EmailAliasResponse])
async def list_my_email_aliases(
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> list[EmailAliasResponse]:
    """List every alias attached to the caller's Developer row."""
    service = DeveloperService(db)
    aliases = await service.list_email_aliases(developer_id)
    return [_alias_to_response(a) for a in aliases]


@router.get(
    "/me/email-aliases/preview",
    response_model=EmailAliasPreviewResponse,
)
async def preview_my_email_alias(
    email: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> EmailAliasPreviewResponse:
    """Read-only count of commits that would move to the caller's row
    if they added `email` as an alias. Surfaced in the UI to show
    'this will claim N commits' before they click confirm.
    """
    service = DeveloperService(db)
    result = await service.preview_alias_backfill(developer_id, email)
    return EmailAliasPreviewResponse(commits=int(result.get("commits", 0)))


@router.post("/me/email-aliases", response_model=EmailAliasAddResponse, status_code=201)
async def add_my_email_alias(
    payload: EmailAliasAddRequest,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> EmailAliasAddResponse:
    """Attach `email` as a secondary email + reclaim every commit
    currently sitting on a pseudo-ghost with that email."""
    from aexy.services.developer_service import (
        DeveloperAlreadyExistsError,
        DeveloperServiceError,
    )

    service = DeveloperService(db)
    try:
        alias, backfill = await service.add_email_alias(
            developer_id, payload.email
        )
    except DeveloperAlreadyExistsError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except DeveloperServiceError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    await db.commit()
    return EmailAliasAddResponse(
        alias=_alias_to_response(alias),
        backfill={
            "commits": int(backfill.get("commits", 0)),
            "ghost_deleted": int(backfill.get("ghost_deleted", 0)),
        },
    )


@router.delete("/me/email-aliases/{alias_id}", status_code=204)
async def remove_my_email_alias(
    alias_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Detach an alias. Past commits stay on the canonical row;
    only future commits with that email stop auto-routing here."""
    service = DeveloperService(db)
    ok = await service.remove_email_alias(developer_id, alias_id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Alias not found"
        )
    await db.commit()


@router.get("/me/google-status", response_model=GoogleConnectionStatus)
async def get_google_connection_status(
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> GoogleConnectionStatus:
    """Check if the current developer has a Google connection."""
    result = await db.execute(
        select(GoogleConnection).where(GoogleConnection.developer_id == developer_id)
    )
    connection = result.scalar_one_or_none()

    if connection:
        return GoogleConnectionStatus(
            is_connected=True,
            google_email=connection.google_email,
        )

    return GoogleConnectionStatus(is_connected=False)


class MyTaskResponse(BaseModel):
    """Response for a task assigned to the current user."""
    id: str
    sprint_id: str | None
    sprint_name: str | None
    title: str
    description: str | None
    status: str
    priority: str
    story_points: int | None
    labels: list[str]
    created_at: str
    updated_at: str


@router.get("/me/assigned-tasks", response_model=list[MyTaskResponse])
async def get_my_assigned_tasks(
    status_filter: str | None = None,
    include_done: bool = False,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> list[MyTaskResponse]:
    """Get all sprint tasks assigned to the current developer."""
    task_service = SprintTaskService(db)
    tasks = await task_service.get_tasks_by_assignee(
        assignee_id=developer_id,
        status=status_filter,
        include_done=include_done,
    )

    return [
        MyTaskResponse(
            id=str(task.id),
            sprint_id=str(task.sprint_id) if task.sprint_id else None,
            sprint_name=task.sprint.name if task.sprint else None,
            title=task.title,
            description=task.description,
            status=task.status,
            priority=task.priority,
            story_points=task.story_points,
            labels=task.labels or [],
            created_at=task.created_at.isoformat() if task.created_at else "",
            updated_at=task.updated_at.isoformat() if task.updated_at else "",
        )
        for task in tasks
    ]


@router.patch("/me", response_model=DeveloperResponse)
async def update_current_developer(
    update_data: DeveloperUpdate,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> DeveloperResponse:
    """Update the current developer's profile."""
    service = DeveloperService(db)
    try:
        developer = await service.update(developer_id, update_data)
    except DeveloperNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer not found",
        ) from e

    return DeveloperResponse.model_validate(developer)


@router.get("/{developer_id}", response_model=DeveloperResponse)
async def get_developer(
    developer_id: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),  # Require auth
) -> DeveloperResponse:
    """Get a developer's profile by ID."""
    service = DeveloperService(db)
    try:
        developer = await service.get_by_id(developer_id)
    except DeveloperNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer not found",
        ) from e

    return DeveloperResponse.model_validate(developer)


@router.get("/", response_model=list[DeveloperResponse])
async def list_developers(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),  # Require auth
) -> list[DeveloperResponse]:
    """List all developers with pagination."""
    service = DeveloperService(db)
    developers = await service.list_all(skip=skip, limit=limit)
    return [DeveloperResponse.model_validate(d) for d in developers]
