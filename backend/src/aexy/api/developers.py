"""Developer profile endpoints."""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError, jwt
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from pydantic import BaseModel
from sqlalchemy import select

from aexy.core.config import get_settings
from aexy.core.database import get_db
from aexy.core.workspace_auth import assert_active_member
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


# Claim value marking a token minted for an agent acting on somebody's behalf.
# See `create_access_token`.
AGENT_ACTOR = "agent"


async def get_current_developer_id(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> str:
    """Extract and validate developer ID from JWT or API token.

    Also records the token's `actor` claim on the request, so an endpoint can
    tell an agent's write from a person's without trusting a header the caller
    sets. Absent for an API token and for every human session, which is what
    `is_agent_request` treats as "a person".
    """
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
        # Only ever from the verified payload. Assigning from a header here would
        # hand the decision straight back to the caller.
        request.state.token_actor = payload.get("actor")
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
    """Response for a work item assigned to the current user."""
    id: str
    item_type: str = "task"  # "task" | "bug" | "story"
    sprint_id: str | None
    project_id: str | None = None
    sprint_name: str | None
    # Which workspace the item belongs to. Without it the personal work list
    # could only ever be "everything, everywhere" — it had no way to tell one
    # workspace's tasks from another's, so it showed them all mixed together.
    workspace_id: str | None = None
    workspace_name: str | None = None
    # The epic a story hangs off; a story has no project of its own, and the
    # epic page is the only place it can be opened from.
    epic_id: str | None = None
    # Human-readable id — "[slug:12]" for tasks, "BUG-4"/"STORY-7" for the rest.
    reference: str | None = None
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
    workspace_id: str | None = None,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> list[MyTaskResponse]:
    """Get all work items (tasks, bugs, stories) assigned to the current developer.

    Aggregates across the three work-item types into one "my work" list.
    Stories use `owner_id` as the assignee (a story's owner is who's responsible).

    `workspace_id` scopes the list to a single workspace. Omitting it keeps the
    every-workspace behaviour, which is what "All workspaces" in the UI asks for
    — but it is no longer the only thing on offer: someone in several workspaces
    was getting all of them at once with no way to say which one they meant.
    """
    from aexy.models.bug import Bug
    from aexy.models.story import UserStory
    from aexy.models.workspace import Workspace
    from aexy.schemas.bug import TERMINAL_BUG_STATUSES

    # Cap each work-item type so one prolific assignee can't make this
    # endpoint return an unbounded payload.
    MAX_ITEMS_PER_TYPE = 200

    if workspace_id:
        # A workspace the caller isn't in must not act as a filter that quietly
        # returns nothing; it is a bad request, and saying so beats an empty list
        # that looks like "you have no work".
        await assert_active_member(db, workspace_id, developer_id)

    task_service = SprintTaskService(db)
    tasks = await task_service.get_tasks_by_assignee(
        assignee_id=developer_id,
        status=status_filter,
        include_done=include_done,
        limit=MAX_ITEMS_PER_TYPE,
        workspace_id=workspace_id,
    )

    # Resolve each task's project (team -> first project) so the frontend can
    # build /sprints/{project_id}/{sprint_id} board links.
    from aexy.models.project import ProjectTeam

    def _task_team_id(task) -> str | None:
        team_id = task.sprint.team_id if task.sprint else task.team_id
        return str(team_id) if team_id else None

    team_ids = {tid for task in tasks if (tid := _task_team_id(task))}
    project_by_team: dict[str, str] = {}
    if team_ids:
        rows = await db.execute(
            select(ProjectTeam.team_id, ProjectTeam.project_id)
            .where(ProjectTeam.team_id.in_(team_ids))
            .order_by(ProjectTeam.created_at)
        )
        for team_id, project_id in rows.all():
            project_by_team.setdefault(str(team_id), str(project_id))

    def _task_workspace_id(task) -> str | None:
        # Tasks created before the column existed only know their workspace
        # through the sprint they sit in.
        wid = task.workspace_id or (task.sprint.workspace_id if task.sprint else None)
        return str(wid) if wid else None

    results: list[MyTaskResponse] = [
        MyTaskResponse(
            id=str(task.id),
            item_type="task",
            sprint_id=str(task.sprint_id) if task.sprint_id else None,
            project_id=project_by_team.get(_task_team_id(task) or ""),
            sprint_name=task.sprint.name if task.sprint else None,
            workspace_id=_task_workspace_id(task),
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
    # Parallel to `results` so the workspace slug can be folded into each task's
    # reference once the slugs are known, without re-walking the ORM objects.
    task_keys = [task.task_key for task in tasks]

    def _iso(dt) -> str:
        return dt.isoformat() if dt else ""

    # (model, assignee column, terminal statuses excluded from the default
    # non-done view, item_type)
    STORY_DONE = frozenset({"accepted", "rejected"})
    specs = [
        (Bug, Bug.assignee_id, TERMINAL_BUG_STATUSES, "bug"),
        (UserStory, UserStory.owner_id, STORY_DONE, "story"),
    ]
    for model, assignee_col, done_statuses, item_type in specs:
        stmt = select(model).where(assignee_col == developer_id)
        if workspace_id:
            stmt = stmt.where(model.workspace_id == workspace_id)
        if status_filter:
            stmt = stmt.where(model.status == status_filter)
        elif not include_done:
            stmt = stmt.where(model.status.notin_(done_statuses))
        stmt = stmt.order_by(model.created_at.desc()).limit(MAX_ITEMS_PER_TYPE)
        for item in (await db.execute(stmt)).scalars().all():
            results.append(
                MyTaskResponse(
                    id=str(item.id),
                    item_type=item_type,
                    sprint_id=None,
                    sprint_name=None,
                    # A bug is opened from its project's bug board; a story from
                    # its epic. Without these two ids the rows had nowhere to go,
                    # which is why they were the ones that never clicked through.
                    project_id=str(item.project_id) if item_type == "bug" and item.project_id else None,
                    epic_id=str(item.epic_id) if item_type == "story" and item.epic_id else None,
                    workspace_id=str(item.workspace_id) if item.workspace_id else None,
                    reference=item.key,
                    title=item.title,
                    description=item.description,
                    status=item.status,
                    priority=item.priority,
                    story_points=item.story_points if item_type == "story" else None,
                    labels=[],
                    created_at=_iso(item.created_at),
                    updated_at=_iso(item.updated_at),
                )
            )

    # One lookup for every workspace on the page — the list can span workspaces,
    # and a row that doesn't say which one it came from is unreadable in that mode.
    ws_ids = {r.workspace_id for r in results if r.workspace_id}
    if ws_ids:
        ws_rows = await db.execute(
            select(Workspace.id, Workspace.name, Workspace.slug).where(
                Workspace.id.in_(ws_ids)
            )
        )
        ws_by_id = {str(wid): (name, slug) for wid, name, slug in ws_rows.all()}
        for index, item in enumerate(results):
            meta = ws_by_id.get(item.workspace_id or "")
            if not meta:
                continue
            item.workspace_name = meta[0]
            if (
                item.item_type == "task"
                and meta[1]
                and index < len(task_keys)
                and task_keys[index] is not None
            ):
                item.reference = f"[{meta[1]}:{task_keys[index]}]"

    return results


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
    # The id column is a Postgres UUID; a malformed value would raise an
    # asyncpg DataError (500). Validate up front and treat it as not-found.
    try:
        uuid.UUID(str(developer_id))
    except (ValueError, TypeError) as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer not found",
        ) from e

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
