"""API endpoints for managing dependencies between stories and tasks."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, or_, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.core.database import get_db
from aexy.models.dependency import StoryDependency, TaskDependency
from aexy.models.story import UserStory
from aexy.models.sprint import SprintTask
from aexy.schemas.dependency import (
    StoryDependencyCreate,
    StoryDependencyUpdate,
    StoryDependencyResponse,
    StoryDependencyListResponse,
    TaskDependencyCreate,
    TaskDependencyUpdate,
    TaskDependencyResponse,
    TaskDependencyListResponse,
    DependencyGraphResponse,
    BlockedItemsResponse,
)
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer

router = APIRouter(prefix="/dependencies")


# ============================================================================
# Story Dependencies
# ============================================================================


@router.post(
    "/stories/{story_id}",
    response_model=StoryDependencyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_story_dependency(
    story_id: str,
    data: StoryDependencyCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a dependency between two stories."""
    # Validate dependent story exists
    dependent_story = await db.get(UserStory, story_id)
    if not dependent_story:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dependent story not found",
        )

    # Validate blocking story exists
    blocking_story = await db.get(UserStory, data.blocking_story_id)
    if not blocking_story:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Blocking story not found",
        )

    # Prevent self-dependency
    if story_id == data.blocking_story_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A story cannot depend on itself",
        )

    # Check for duplicate dependency
    existing = await db.execute(
        select(StoryDependency).where(
            StoryDependency.dependent_story_id == story_id,
            StoryDependency.blocking_story_id == data.blocking_story_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This dependency already exists",
        )

    # Check for circular dependency
    if await _has_circular_story_dependency(
        db, data.blocking_story_id, story_id
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This would create a circular dependency",
        )

    # Determine if cross-project
    is_cross_project = dependent_story.workspace_id != blocking_story.workspace_id

    dependency = StoryDependency(
        id=str(uuid.uuid4()),
        dependent_story_id=story_id,
        blocking_story_id=data.blocking_story_id,
        dependency_type=data.dependency_type,
        description=data.description,
        is_cross_project=is_cross_project,
        status="active",
        created_by=current_user.id,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    session.add(dependency)
    await db.commit()
    await db.refresh(dependency)

    return dependency


@router.get("/stories/{story_id}", response_model=StoryDependencyListResponse)
async def list_story_dependencies(
    story_id: str,
    direction: str = Query("all", pattern="^(all|blocking|blocked_by)$"),
    include_resolved: bool = Query(False),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all dependencies for a story."""
    # Validate story exists
    story = await db.get(UserStory, story_id)
    if not story:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found",
        )

    # Build query based on direction
    conditions = []
    if direction in ("all", "blocking"):
        conditions.append(StoryDependency.dependent_story_id == story_id)
    if direction in ("all", "blocked_by"):
        conditions.append(StoryDependency.blocking_story_id == story_id)

    query = select(StoryDependency).where(or_(*conditions))

    if not include_resolved:
        query = query.where(StoryDependency.status == "active")

    query = query.order_by(StoryDependency.created_at.desc())

    result = await db.execute(query)
    dependencies = result.scalars().all()

    return StoryDependencyListResponse(
        items=list(dependencies),
        total=len(dependencies),
    )


@router.patch(
    "/stories/dependency/{dependency_id}",
    response_model=StoryDependencyResponse,
)
async def update_story_dependency(
    dependency_id: str,
    data: StoryDependencyUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a story dependency."""
    dependency = await db.get(StoryDependency, dependency_id)
    if not dependency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dependency not found",
        )

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(dependency, field, value)

    dependency.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(dependency)

    return dependency


@router.delete(
    "/stories/dependency/{dependency_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_story_dependency(
    dependency_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a story dependency."""
    dependency = await db.get(StoryDependency, dependency_id)
    if not dependency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dependency not found",
        )

    await db.delete(dependency)
    await db.commit()


@router.post(
    "/stories/dependency/{dependency_id}/resolve",
    response_model=StoryDependencyResponse,
)
async def resolve_story_dependency(
    dependency_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Mark a story dependency as resolved."""
    dependency = await db.get(StoryDependency, dependency_id)
    if not dependency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dependency not found",
        )

    if dependency.status == "resolved":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dependency is already resolved",
        )

    dependency.status = "resolved"
    dependency.resolved_at = datetime.now(timezone.utc)
    dependency.resolved_by = current_user.id
    dependency.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(dependency)

    return dependency


# ============================================================================
# Task Dependencies
# ============================================================================


@router.post(
    "/tasks/{task_id}",
    response_model=TaskDependencyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_task_dependency(
    task_id: str,
    data: TaskDependencyCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a dependency between two tasks."""
    # Validate dependent task exists
    dependent_task = await db.get(SprintTask, task_id)
    if not dependent_task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dependent task not found",
        )

    # Validate blocking task exists
    blocking_task = await db.get(SprintTask, data.blocking_task_id)
    if not blocking_task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Blocking task not found",
        )

    # Prevent self-dependency
    if task_id == data.blocking_task_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A task cannot depend on itself",
        )

    # Check for duplicate dependency
    existing = await db.execute(
        select(TaskDependency).where(
            TaskDependency.dependent_task_id == task_id,
            TaskDependency.blocking_task_id == data.blocking_task_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This dependency already exists",
        )

    # Check for circular dependency
    if await _has_circular_task_dependency(db, data.blocking_task_id, task_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This would create a circular dependency",
        )

    # Determine if cross-sprint
    is_cross_sprint = dependent_task.sprint_id != blocking_task.sprint_id

    dependency = TaskDependency(
        id=str(uuid.uuid4()),
        dependent_task_id=task_id,
        blocking_task_id=data.blocking_task_id,
        dependency_type=data.dependency_type,
        description=data.description,
        is_cross_sprint=is_cross_sprint,
        status="active",
        created_by=current_user.id,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    session.add(dependency)
    await db.commit()
    await db.refresh(dependency)

    return dependency


@router.get("/tasks/{task_id}", response_model=TaskDependencyListResponse)
async def list_task_dependencies(
    task_id: str,
    direction: str = Query("all", pattern="^(all|blocking|blocked_by)$"),
    include_resolved: bool = Query(False),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all dependencies for a task."""
    # Validate task exists
    task = await db.get(SprintTask, task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Build query based on direction
    conditions = []
    if direction in ("all", "blocking"):
        conditions.append(TaskDependency.dependent_task_id == task_id)
    if direction in ("all", "blocked_by"):
        conditions.append(TaskDependency.blocking_task_id == task_id)

    query = select(TaskDependency).where(or_(*conditions))

    if not include_resolved:
        query = query.where(TaskDependency.status == "active")

    query = query.order_by(TaskDependency.created_at.desc())

    result = await db.execute(query)
    dependencies = result.scalars().all()

    return TaskDependencyListResponse(
        items=list(dependencies),
        total=len(dependencies),
    )


@router.patch(
    "/tasks/dependency/{dependency_id}",
    response_model=TaskDependencyResponse,
)
async def update_task_dependency(
    dependency_id: str,
    data: TaskDependencyUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a task dependency."""
    dependency = await db.get(TaskDependency, dependency_id)
    if not dependency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dependency not found",
        )

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(dependency, field, value)

    dependency.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(dependency)

    return dependency


@router.delete(
    "/tasks/dependency/{dependency_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_task_dependency(
    dependency_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a task dependency."""
    dependency = await db.get(TaskDependency, dependency_id)
    if not dependency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dependency not found",
        )

    await db.delete(dependency)
    await db.commit()


@router.post(
    "/tasks/dependency/{dependency_id}/resolve",
    response_model=TaskDependencyResponse,
)
async def resolve_task_dependency(
    dependency_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Mark a task dependency as resolved."""
    dependency = await db.get(TaskDependency, dependency_id)
    if not dependency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dependency not found",
        )

    if dependency.status == "resolved":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dependency is already resolved",
        )

    dependency.status = "resolved"
    dependency.resolved_at = datetime.now(timezone.utc)
    dependency.resolved_by = current_user.id
    dependency.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(dependency)

    return dependency


# ============================================================================
# Dependency Graph & Blocked Items
# ============================================================================


@router.get(
    "/workspaces/{workspace_id}/graph",
    response_model=DependencyGraphResponse,
)
async def get_dependency_graph(
    workspace_id: str,
    entity_type: str = Query("stories", pattern="^(stories|tasks|all)$"),
    include_resolved: bool = Query(False),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get the dependency graph for visualization."""
    nodes = []
    edges = []

    if entity_type in ("stories", "all"):
        # Get all stories in workspace
        stories_result = await db.execute(
            select(UserStory).where(UserStory.workspace_id == workspace_id)
        )
        stories = stories_result.scalars().all()

        for story in stories:
            nodes.append({
                "id": story.id,
                "type": "story",
                "key": story.key,
                "title": story.title,
                "status": story.status,
            })

        # Get story dependencies
        story_ids = [s.id for s in stories]
        if story_ids:
            deps_query = select(StoryDependency).where(
                or_(
                    StoryDependency.dependent_story_id.in_(story_ids),
                    StoryDependency.blocking_story_id.in_(story_ids),
                )
            )
            if not include_resolved:
                deps_query = deps_query.where(StoryDependency.status == "active")

            deps_result = await db.execute(deps_query)
            for dep in deps_result.scalars().all():
                edges.append({
                    "id": dep.id,
                    "source": dep.blocking_story_id,
                    "target": dep.dependent_story_id,
                    "type": dep.dependency_type,
                    "status": dep.status,
                })

    if entity_type in ("tasks", "all"):
        # Get all tasks in workspace sprints
        from aexy.models.sprint import Sprint

        sprints_result = await db.execute(
            select(Sprint).where(Sprint.workspace_id == workspace_id)
        )
        sprint_ids = [s.id for s in sprints_result.scalars().all()]

        if sprint_ids:
            tasks_result = await db.execute(
                select(SprintTask).where(SprintTask.sprint_id.in_(sprint_ids))
            )
            tasks = tasks_result.scalars().all()

            for task in tasks:
                nodes.append({
                    "id": task.id,
                    "type": "task",
                    "key": task.key,
                    "title": task.title,
                    "status": task.status,
                })

            # Get task dependencies
            task_ids = [t.id for t in tasks]
            if task_ids:
                deps_query = select(TaskDependency).where(
                    or_(
                        TaskDependency.dependent_task_id.in_(task_ids),
                        TaskDependency.blocking_task_id.in_(task_ids),
                    )
                )
                if not include_resolved:
                    deps_query = deps_query.where(TaskDependency.status == "active")

                deps_result = await db.execute(deps_query)
                for dep in deps_result.scalars().all():
                    edges.append({
                        "id": dep.id,
                        "source": dep.blocking_task_id,
                        "target": dep.dependent_task_id,
                        "type": dep.dependency_type,
                        "status": dep.status,
                    })

    return DependencyGraphResponse(
        nodes=nodes,
        edges=edges,
    )


@router.get(
    "/workspaces/{workspace_id}/blocked",
    response_model=BlockedItemsResponse,
)
async def get_blocked_items(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get all currently blocked items (stories and tasks)."""
    blocked_stories = []
    blocked_tasks = []

    # Get stories that have active blocking dependencies
    # where the blocking story is not yet completed
    stories_result = await db.execute(
        select(UserStory).where(UserStory.workspace_id == workspace_id)
    )
    stories = {s.id: s for s in stories_result.scalars().all()}

    deps_result = await db.execute(
        select(StoryDependency).where(
            StoryDependency.dependent_story_id.in_(stories.keys()),
            StoryDependency.status == "active",
            StoryDependency.dependency_type == "blocks",
        )
    )

    for dep in deps_result.scalars().all():
        blocking_story = stories.get(dep.blocking_story_id)
        if blocking_story and blocking_story.status not in ("accepted", "rejected"):
            dependent_story = stories.get(dep.dependent_story_id)
            if dependent_story:
                blocked_stories.append({
                    "id": dependent_story.id,
                    "key": dependent_story.key,
                    "title": dependent_story.title,
                    "status": dependent_story.status,
                    "blocked_by": {
                        "id": blocking_story.id,
                        "key": blocking_story.key,
                        "title": blocking_story.title,
                        "status": blocking_story.status,
                    },
                })

    # Get tasks that have active blocking dependencies
    from aexy.models.sprint import Sprint

    sprints_result = await db.execute(
        select(Sprint).where(Sprint.workspace_id == workspace_id)
    )
    sprint_ids = [s.id for s in sprints_result.scalars().all()]

    if sprint_ids:
        tasks_result = await db.execute(
            select(SprintTask).where(SprintTask.sprint_id.in_(sprint_ids))
        )
        tasks = {t.id: t for t in tasks_result.scalars().all()}

        task_deps_result = await db.execute(
            select(TaskDependency).where(
                TaskDependency.dependent_task_id.in_(tasks.keys()),
                TaskDependency.status == "active",
                TaskDependency.dependency_type == "blocks",
            )
        )

        for dep in task_deps_result.scalars().all():
            blocking_task = tasks.get(dep.blocking_task_id)
            if blocking_task and blocking_task.status not in ("done", "cancelled"):
                dependent_task = tasks.get(dep.dependent_task_id)
                if dependent_task:
                    blocked_tasks.append({
                        "id": dependent_task.id,
                        "key": dependent_task.key,
                        "title": dependent_task.title,
                        "status": dependent_task.status,
                        "blocked_by": {
                            "id": blocking_task.id,
                            "key": blocking_task.key,
                            "title": blocking_task.title,
                            "status": blocking_task.status,
                        },
                    })

    return BlockedItemsResponse(
        blocked_stories=blocked_stories,
        blocked_tasks=blocked_tasks,
        total_blocked=len(blocked_stories) + len(blocked_tasks),
    )


# ============================================================================
# Helper Functions
# ============================================================================


async def _has_circular_story_dependency(
    db: AsyncSession,
    start_id: str,
    target_id: str,
    visited: set | None = None,
) -> bool:
    """Check if adding a dependency would create a circular reference."""
    if visited is None:
        visited = set()

    if start_id in visited:
        return False

    visited.add(start_id)

    if start_id == target_id:
        return True

    # Get all stories that this story blocks
    result = await db.execute(
        select(StoryDependency.dependent_story_id).where(
            StoryDependency.blocking_story_id == start_id,
            StoryDependency.status == "active",
        )
    )

    for (dependent_id,) in result.all():
        if await _has_circular_story_dependency(
            db, dependent_id, target_id, visited
        ):
            return True

    return False


async def _has_circular_task_dependency(
    db: AsyncSession,
    start_id: str,
    target_id: str,
    visited: set | None = None,
) -> bool:
    """Check if adding a dependency would create a circular reference."""
    if visited is None:
        visited = set()

    if start_id in visited:
        return False

    visited.add(start_id)

    if start_id == target_id:
        return True

    # Get all tasks that this task blocks
    result = await db.execute(
        select(TaskDependency.dependent_task_id).where(
            TaskDependency.blocking_task_id == start_id,
            TaskDependency.status == "active",
        )
    )

    for (dependent_id,) in result.all():
        if await _has_circular_task_dependency(
            db, dependent_id, target_id, visited
        ):
            return True

    return False
