"""Assignee-set operations shared by the sprint-scoped and project-scoped task
routers.

The two routers authorize differently (`get_sprint_and_check_permission` vs
`get_team_and_check_permission`) and scope the task differently, so each keeps
its own thin endpoints. Everything after that — validation mapping, the service
call, the response — lives here so the two cannot drift. The project-scoped
router previously had no assignment endpoints at all, which is part of why the
tech team hit assignment problems from the project board specifically.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.schemas.sprint import (
    SprintTaskResponse,
    TaskAssigneeAdd,
    TaskAssigneesUpdate,
    TaskPrimaryAssigneeUpdate,
)
from aexy.services.sprint_task_response import task_to_response
from aexy.services.sprint_task_service import SprintTaskService, TaskValidationError


def _require(task, scope_ok: bool) -> None:
    """404 for both "no such task" and "not in this sprint/project".

    Deliberately the same response: telling a caller a task exists but belongs
    to a scope they can't see is itself a leak.
    """
    if not task or not scope_ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Task not found"
        )


async def set_assignees(
    db: AsyncSession,
    task_id: str,
    payload: TaskAssigneesUpdate,
    actor_id: str,
    in_scope,
) -> SprintTaskResponse:
    try:
        task = await SprintTaskService(db).set_assignees(
            task_id=task_id,
            developer_ids=payload.developer_ids,
            primary_id=payload.primary_id,
            actor_id=actor_id,
        )
    except TaskValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=exc.code
        ) from exc
    _require(task, in_scope(task) if task else False)
    await db.commit()
    return task_to_response(task)


async def add_assignee(
    db: AsyncSession,
    task_id: str,
    payload: TaskAssigneeAdd,
    actor_id: str,
    in_scope,
) -> SprintTaskResponse:
    try:
        task = await SprintTaskService(db).add_assignee(
            task_id=task_id,
            developer_id=payload.developer_id,
            make_primary=payload.make_primary,
            actor_id=actor_id,
        )
    except TaskValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=exc.code
        ) from exc
    _require(task, in_scope(task) if task else False)
    await db.commit()
    return task_to_response(task)


async def remove_assignee(
    db: AsyncSession,
    task_id: str,
    developer_id: str,
    actor_id: str,
    in_scope,
) -> SprintTaskResponse:
    task = await SprintTaskService(db).remove_assignee(
        task_id=task_id, developer_id=developer_id, actor_id=actor_id
    )
    _require(task, in_scope(task) if task else False)
    await db.commit()
    return task_to_response(task)


async def set_primary_assignee(
    db: AsyncSession,
    task_id: str,
    payload: TaskPrimaryAssigneeUpdate,
    actor_id: str,
    in_scope,
) -> SprintTaskResponse:
    try:
        task = await SprintTaskService(db).set_primary_assignee(
            task_id=task_id, developer_id=payload.developer_id, actor_id=actor_id
        )
    except TaskValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=exc.code
        ) from exc
    _require(task, in_scope(task) if task else False)
    await db.commit()
    return task_to_response(task)
