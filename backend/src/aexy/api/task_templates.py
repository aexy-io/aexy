"""Task Templates API endpoints."""

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.models.sprint import TaskTemplate, SprintTask, Sprint
from aexy.schemas.sprint import (
    TaskTemplateCreate,
    TaskTemplateUpdate,
    TaskTemplateResponse,
    TaskTemplateListResponse,
    TaskFromTemplateCreate,
    SprintTaskResponse,
)
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/workspaces/{workspace_id}/task-templates", tags=["Task Templates"])


async def check_workspace_permission(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
    required_role: str = "member",
) -> None:
    """Check if user has permission to access workspace."""
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(workspace_id, str(current_user.id), required_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this workspace",
        )


def template_to_response(template: TaskTemplate) -> TaskTemplateResponse:
    """Convert TaskTemplate model to response schema."""
    return TaskTemplateResponse(
        id=str(template.id),
        workspace_id=str(template.workspace_id),
        name=template.name,
        description=template.description,
        category=template.category,
        is_active=template.is_active,
        title_template=template.title_template,
        description_template=template.description_template,
        default_priority=template.default_priority,
        default_story_points=template.default_story_points,
        default_labels=template.default_labels or [],
        subtasks=template.subtasks or [],
        checklist=template.checklist or [],
        usage_count=template.usage_count,
        created_by_id=str(template.created_by_id) if template.created_by_id else None,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


@router.get("", response_model=TaskTemplateListResponse)
async def list_templates(
    workspace_id: str,
    category: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List task templates for a workspace."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    query = select(TaskTemplate).where(TaskTemplate.workspace_id == workspace_id)

    if category:
        query = query.where(TaskTemplate.category == category)
    if is_active is not None:
        query = query.where(TaskTemplate.is_active == is_active)
    if search:
        query = query.where(TaskTemplate.name.ilike(f"%{search}%"))

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply ordering and pagination
    query = query.order_by(desc(TaskTemplate.usage_count), desc(TaskTemplate.updated_at))
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    templates = result.scalars().all()

    return TaskTemplateListResponse(
        items=[template_to_response(t) for t in templates],
        total=total,
    )


@router.post("", response_model=TaskTemplateResponse, status_code=201)
async def create_template(
    workspace_id: str,
    data: TaskTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Create a new task template."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    template = TaskTemplate(
        id=str(uuid4()),
        workspace_id=workspace_id,
        name=data.name,
        description=data.description,
        category=data.category,
        title_template=data.title_template,
        description_template=data.description_template,
        default_priority=data.default_priority,
        default_story_points=data.default_story_points,
        default_labels=data.default_labels,
        subtasks=data.subtasks,
        checklist=data.checklist,
        created_by_id=str(current_user.id),
    )

    db.add(template)
    await db.commit()
    await db.refresh(template)

    return template_to_response(template)


@router.get("/{template_id}", response_model=TaskTemplateResponse)
async def get_template(
    workspace_id: str,
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get a specific task template."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    result = await db.execute(
        select(TaskTemplate).where(
            TaskTemplate.id == template_id,
            TaskTemplate.workspace_id == workspace_id,
        )
    )
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    return template_to_response(template)


@router.patch("/{template_id}", response_model=TaskTemplateResponse)
async def update_template(
    workspace_id: str,
    template_id: str,
    data: TaskTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Update a task template."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(
        select(TaskTemplate).where(
            TaskTemplate.id == template_id,
            TaskTemplate.workspace_id == workspace_id,
        )
    )
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(template, field, value)

    await db.commit()
    await db.refresh(template)

    return template_to_response(template)


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    workspace_id: str,
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Delete a task template."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(
        select(TaskTemplate).where(
            TaskTemplate.id == template_id,
            TaskTemplate.workspace_id == workspace_id,
        )
    )
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    await db.delete(template)
    await db.commit()


@router.post("/{template_id}/use", response_model=SprintTaskResponse)
async def create_task_from_template(
    workspace_id: str,
    template_id: str,
    data: TaskFromTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Create a task from a template."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    # Get template
    result = await db.execute(
        select(TaskTemplate).where(
            TaskTemplate.id == template_id,
            TaskTemplate.workspace_id == workspace_id,
        )
    )
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # Process title with variables
    title = template.title_template
    for var_name, var_value in data.title_variables.items():
        title = title.replace(f"{{{{{var_name}}}}}", var_value)

    # Create the main task
    task = SprintTask(
        id=str(uuid4()),
        sprint_id=data.sprint_id,
        workspace_id=workspace_id,
        source_type="manual",
        source_id=str(uuid4()),
        title=title,
        description=template.description_template,
        priority=data.override_priority or template.default_priority,
        story_points=data.override_story_points if data.override_story_points is not None else template.default_story_points,
        labels=list(set(template.default_labels + data.additional_labels)),
        assignee_id=data.assignee_id,
        status="backlog",
    )

    db.add(task)
    await db.flush()

    # Create subtasks if requested
    if data.create_subtasks and template.subtasks:
        for subtask_title in template.subtasks:
            subtask = SprintTask(
                id=str(uuid4()),
                sprint_id=data.sprint_id,
                workspace_id=workspace_id,
                source_type="manual",
                source_id=str(uuid4()),
                title=subtask_title,
                priority="medium",
                status="backlog",
                parent_task_id=task.id,
            )
            db.add(subtask)

    # Increment usage count
    template.usage_count += 1

    await db.commit()

    # Refetch task with relationships
    from sqlalchemy.orm import selectinload
    stmt = (
        select(SprintTask)
        .where(SprintTask.id == task.id)
        .options(
            selectinload(SprintTask.assignee),
            selectinload(SprintTask.subtasks),
        )
    )
    result = await db.execute(stmt)
    task = result.scalar_one()

    # Build response
    from aexy.api.sprint_tasks import task_to_response
    return task_to_response(task)


@router.get("/categories/list", response_model=list[str])
async def list_categories(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List unique template categories in a workspace."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    result = await db.execute(
        select(TaskTemplate.category)
        .where(
            TaskTemplate.workspace_id == workspace_id,
            TaskTemplate.category.isnot(None),
        )
        .distinct()
    )
    categories = [row[0] for row in result.fetchall() if row[0]]
    return sorted(categories)
