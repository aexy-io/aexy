"""Sprint Retrospective API endpoints."""

from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from devograph.core.database import get_db
from devograph.api.developers import get_current_developer
from devograph.models.developer import Developer
from devograph.models.sprint import Sprint, SprintRetrospective
from devograph.schemas.sprint import (
    SprintRetrospectiveCreate,
    SprintRetrospectiveResponse,
    RetroItem,
    RetroActionItem,
)
from devograph.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/sprints/{sprint_id}/retrospective", tags=["Retrospective"])


async def get_sprint_and_check_permission(
    sprint_id: str,
    current_user: Developer,
    db: AsyncSession,
    required_role: str = "member",
):
    """Get sprint and check workspace permission."""
    workspace_service = WorkspaceService(db)

    stmt = select(Sprint).where(Sprint.id == sprint_id)
    result = await db.execute(stmt)
    sprint = result.scalar_one_or_none()

    if not sprint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sprint not found",
        )

    if not await workspace_service.check_permission(
        sprint.workspace_id, str(current_user.id), required_role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    return sprint


@router.get("", response_model=SprintRetrospectiveResponse | None)
async def get_retrospective(
    sprint_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get retrospective for a sprint."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "viewer")

    stmt = select(SprintRetrospective).where(SprintRetrospective.sprint_id == sprint_id)
    result = await db.execute(stmt)
    retro = result.scalar_one_or_none()

    if not retro:
        return None

    return SprintRetrospectiveResponse(
        id=str(retro.id),
        sprint_id=str(retro.sprint_id),
        went_well=retro.went_well or [],
        to_improve=retro.to_improve or [],
        action_items=retro.action_items or [],
        team_mood_score=retro.team_mood_score,
        notes=retro.notes,
        created_at=retro.created_at,
        updated_at=retro.updated_at,
    )


@router.post("", response_model=SprintRetrospectiveResponse)
async def create_or_update_retrospective(
    sprint_id: str,
    data: SprintRetrospectiveCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create or update retrospective for a sprint."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    # Check if retro already exists
    stmt = select(SprintRetrospective).where(SprintRetrospective.sprint_id == sprint_id)
    result = await db.execute(stmt)
    retro = result.scalar_one_or_none()

    # Process items to ensure they have IDs
    went_well = [
        {**item.model_dump(), "id": item.id or str(uuid4())}
        for item in data.went_well
    ]
    to_improve = [
        {**item.model_dump(), "id": item.id or str(uuid4())}
        for item in data.to_improve
    ]
    action_items = [
        {**item.model_dump(), "id": item.id or str(uuid4())}
        for item in data.action_items
    ]

    if retro:
        # Update existing
        retro.went_well = went_well
        retro.to_improve = to_improve
        retro.action_items = action_items
        retro.team_mood_score = data.team_mood_score
        retro.notes = data.notes
    else:
        # Create new
        retro = SprintRetrospective(
            sprint_id=sprint_id,
            went_well=went_well,
            to_improve=to_improve,
            action_items=action_items,
            team_mood_score=data.team_mood_score,
            notes=data.notes,
        )
        db.add(retro)

    await db.commit()
    await db.refresh(retro)

    return SprintRetrospectiveResponse(
        id=str(retro.id),
        sprint_id=str(retro.sprint_id),
        went_well=retro.went_well or [],
        to_improve=retro.to_improve or [],
        action_items=retro.action_items or [],
        team_mood_score=retro.team_mood_score,
        notes=retro.notes,
        created_at=retro.created_at,
        updated_at=retro.updated_at,
    )


@router.post("/items", response_model=SprintRetrospectiveResponse)
async def add_retro_item(
    sprint_id: str,
    data: dict,  # {category: "went_well" | "to_improve" | "action_item", content: str}
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add an item to retrospective."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    # Get or create retro
    stmt = select(SprintRetrospective).where(SprintRetrospective.sprint_id == sprint_id)
    result = await db.execute(stmt)
    retro = result.scalar_one_or_none()

    if not retro:
        retro = SprintRetrospective(
            sprint_id=sprint_id,
            went_well=[],
            to_improve=[],
            action_items=[],
        )
        db.add(retro)

    category = data.get("category")
    content = data.get("content")

    if not category or not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="category and content are required",
        )

    item_id = str(uuid4())

    if category == "went_well":
        items = list(retro.went_well or [])
        items.append({
            "id": item_id,
            "content": content,
            "author_id": str(current_user.id),
            "votes": 0,
        })
        retro.went_well = items
    elif category == "to_improve":
        items = list(retro.to_improve or [])
        items.append({
            "id": item_id,
            "content": content,
            "author_id": str(current_user.id),
            "votes": 0,
        })
        retro.to_improve = items
    elif category == "action_item":
        items = list(retro.action_items or [])
        items.append({
            "id": item_id,
            "item": content,
            "assignee_id": data.get("assignee_id"),
            "status": "pending",
            "due_date": data.get("due_date"),
        })
        retro.action_items = items
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid category",
        )

    await db.commit()
    await db.refresh(retro)

    return SprintRetrospectiveResponse(
        id=str(retro.id),
        sprint_id=str(retro.sprint_id),
        went_well=retro.went_well or [],
        to_improve=retro.to_improve or [],
        action_items=retro.action_items or [],
        team_mood_score=retro.team_mood_score,
        notes=retro.notes,
        created_at=retro.created_at,
        updated_at=retro.updated_at,
    )


@router.patch("/items/{item_id}", response_model=SprintRetrospectiveResponse)
async def update_retro_item(
    sprint_id: str,
    item_id: str,
    data: dict,  # Partial update data
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a retrospective item."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    stmt = select(SprintRetrospective).where(SprintRetrospective.sprint_id == sprint_id)
    result = await db.execute(stmt)
    retro = result.scalar_one_or_none()

    if not retro:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Retrospective not found",
        )

    # Find and update the item in the appropriate list
    found = False

    # Check went_well
    items = list(retro.went_well or [])
    for i, item in enumerate(items):
        if item.get("id") == item_id:
            items[i] = {**item, **data}
            retro.went_well = items
            found = True
            break

    # Check to_improve
    if not found:
        items = list(retro.to_improve or [])
        for i, item in enumerate(items):
            if item.get("id") == item_id:
                items[i] = {**item, **data}
                retro.to_improve = items
                found = True
                break

    # Check action_items
    if not found:
        items = list(retro.action_items or [])
        for i, item in enumerate(items):
            if item.get("id") == item_id:
                items[i] = {**item, **data}
                retro.action_items = items
                found = True
                break

    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found",
        )

    await db.commit()
    await db.refresh(retro)

    return SprintRetrospectiveResponse(
        id=str(retro.id),
        sprint_id=str(retro.sprint_id),
        went_well=retro.went_well or [],
        to_improve=retro.to_improve or [],
        action_items=retro.action_items or [],
        team_mood_score=retro.team_mood_score,
        notes=retro.notes,
        created_at=retro.created_at,
        updated_at=retro.updated_at,
    )


@router.delete("/items/{item_id}", response_model=SprintRetrospectiveResponse)
async def delete_retro_item(
    sprint_id: str,
    item_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a retrospective item."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    stmt = select(SprintRetrospective).where(SprintRetrospective.sprint_id == sprint_id)
    result = await db.execute(stmt)
    retro = result.scalar_one_or_none()

    if not retro:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Retrospective not found",
        )

    # Remove from went_well
    items = [item for item in (retro.went_well or []) if item.get("id") != item_id]
    retro.went_well = items

    # Remove from to_improve
    items = [item for item in (retro.to_improve or []) if item.get("id") != item_id]
    retro.to_improve = items

    # Remove from action_items
    items = [item for item in (retro.action_items or []) if item.get("id") != item_id]
    retro.action_items = items

    await db.commit()
    await db.refresh(retro)

    return SprintRetrospectiveResponse(
        id=str(retro.id),
        sprint_id=str(retro.sprint_id),
        went_well=retro.went_well or [],
        to_improve=retro.to_improve or [],
        action_items=retro.action_items or [],
        team_mood_score=retro.team_mood_score,
        notes=retro.notes,
        created_at=retro.created_at,
        updated_at=retro.updated_at,
    )


@router.post("/items/{item_id}/vote", response_model=SprintRetrospectiveResponse)
async def vote_retro_item(
    sprint_id: str,
    item_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Vote for a retrospective item."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    stmt = select(SprintRetrospective).where(SprintRetrospective.sprint_id == sprint_id)
    result = await db.execute(stmt)
    retro = result.scalar_one_or_none()

    if not retro:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Retrospective not found",
        )

    # Find and increment votes
    found = False

    # Check went_well
    items = list(retro.went_well or [])
    for i, item in enumerate(items):
        if item.get("id") == item_id:
            items[i]["votes"] = item.get("votes", 0) + 1
            retro.went_well = items
            found = True
            break

    # Check to_improve
    if not found:
        items = list(retro.to_improve or [])
        for i, item in enumerate(items):
            if item.get("id") == item_id:
                items[i]["votes"] = item.get("votes", 0) + 1
                retro.to_improve = items
                found = True
                break

    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found",
        )

    await db.commit()
    await db.refresh(retro)

    return SprintRetrospectiveResponse(
        id=str(retro.id),
        sprint_id=str(retro.sprint_id),
        went_well=retro.went_well or [],
        to_improve=retro.to_improve or [],
        action_items=retro.action_items or [],
        team_mood_score=retro.team_mood_score,
        notes=retro.notes,
        created_at=retro.created_at,
        updated_at=retro.updated_at,
    )
