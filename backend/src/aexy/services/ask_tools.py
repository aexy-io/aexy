"""Tool definitions and execution for the Ask AI agentic loop."""

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.sprint import Sprint, SprintTask
from aexy.models.ticketing import Ticket

logger = logging.getLogger(__name__)


# --- Tool definitions in Anthropic API format ---

TOOL_DEFINITIONS = [
    {
        "name": "list_sprints",
        "description": "List sprints in the workspace. Can filter by status (planning, active, review, retrospective, completed).",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "description": "Filter by sprint status",
                    "enum": ["planning", "active", "review", "retrospective", "completed"],
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of sprints to return (default 10)",
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_sprint",
        "description": "Get detailed information about a specific sprint by its ID, including task counts and progress.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sprint_id": {
                    "type": "string",
                    "description": "The sprint UUID",
                },
            },
            "required": ["sprint_id"],
        },
    },
    {
        "name": "list_sprint_tasks",
        "description": "List all tasks in a specific sprint. Can filter by status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sprint_id": {
                    "type": "string",
                    "description": "The sprint UUID",
                },
                "status": {
                    "type": "string",
                    "description": "Filter tasks by status (e.g. todo, in_progress, done)",
                },
            },
            "required": ["sprint_id"],
        },
    },
    {
        "name": "list_tickets",
        "description": "List support tickets in the workspace. Can filter by status and priority.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "description": "Filter by ticket status (open, in_progress, resolved, closed)",
                },
                "priority": {
                    "type": "string",
                    "description": "Filter by priority (low, medium, high, critical)",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of tickets to return (default 20)",
                },
            },
            "required": [],
        },
    },
    {
        "name": "current_time",
        "description": "Get the current date and time in UTC.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
]


async def execute_tool(
    tool_name: str,
    tool_input: dict[str, Any],
    db: AsyncSession,
    workspace_id: str,
    developer_id: str,
) -> dict[str, Any]:
    """Execute a tool and return its result.

    Returns:
        Dict with 'result' key on success, or 'error' key on failure.
    """
    try:
        handler = TOOL_HANDLERS.get(tool_name)
        if not handler:
            return {"error": f"Unknown tool: {tool_name}"}
        return await handler(tool_input, db, workspace_id, developer_id)
    except Exception as e:
        logger.error(f"Tool execution error ({tool_name}): {e}", exc_info=True)
        return {"error": f"Tool '{tool_name}' failed to execute"}


# --- Tool handler implementations ---


async def _list_sprints(
    tool_input: dict[str, Any],
    db: AsyncSession,
    workspace_id: str,
    developer_id: str,
) -> dict[str, Any]:
    status = tool_input.get("status")
    limit = tool_input.get("limit", 10)

    stmt = (
        select(Sprint)
        .where(Sprint.workspace_id == workspace_id)
        .options(selectinload(Sprint.tasks))
        .order_by(Sprint.start_date.desc())
        .limit(limit)
    )
    if status:
        stmt = stmt.where(Sprint.status == status)

    result = await db.execute(stmt)
    sprints = result.scalars().all()

    return {
        "result": [
            {
                "id": str(s.id),
                "name": s.name,
                "status": s.status,
                "goal": s.goal,
                "start_date": str(s.start_date) if s.start_date else None,
                "end_date": str(s.end_date) if s.end_date else None,
                "task_count": len(s.tasks) if s.tasks else 0,
            }
            for s in sprints
        ]
    }


async def _get_sprint(
    tool_input: dict[str, Any],
    db: AsyncSession,
    workspace_id: str,
    developer_id: str,
) -> dict[str, Any]:
    sprint_id = tool_input.get("sprint_id")
    if not sprint_id:
        return {"error": "sprint_id is required"}

    stmt = (
        select(Sprint)
        .where(Sprint.id == sprint_id, Sprint.workspace_id == workspace_id)
        .options(selectinload(Sprint.tasks))
    )
    result = await db.execute(stmt)
    sprint = result.scalar_one_or_none()

    if not sprint:
        return {"error": f"Sprint {sprint_id} not found"}

    tasks = sprint.tasks or []
    status_counts: dict[str, int] = {}
    for t in tasks:
        s = t.status or "unknown"
        status_counts[s] = status_counts.get(s, 0) + 1

    return {
        "result": {
            "id": str(sprint.id),
            "name": sprint.name,
            "status": sprint.status,
            "goal": sprint.goal,
            "start_date": str(sprint.start_date) if sprint.start_date else None,
            "end_date": str(sprint.end_date) if sprint.end_date else None,
            "task_count": len(tasks),
            "status_breakdown": status_counts,
            "total_points": sum(t.story_points or 0 for t in tasks),
        }
    }


async def _list_sprint_tasks(
    tool_input: dict[str, Any],
    db: AsyncSession,
    workspace_id: str,
    developer_id: str,
) -> dict[str, Any]:
    sprint_id = tool_input.get("sprint_id")
    if not sprint_id:
        return {"error": "sprint_id is required"}

    # Validate sprint belongs to this workspace before listing tasks
    sprint_check = await db.execute(
        select(Sprint.id).where(
            Sprint.id == sprint_id, Sprint.workspace_id == workspace_id
        )
    )
    if not sprint_check.scalar_one_or_none():
        return {"error": f"Sprint {sprint_id} not found in this workspace"}

    status = tool_input.get("status")

    stmt = select(SprintTask).where(SprintTask.sprint_id == sprint_id)
    if status:
        stmt = stmt.where(SprintTask.status == status)
    stmt = stmt.order_by(SprintTask.created_at)

    result = await db.execute(stmt)
    tasks = result.scalars().all()

    return {
        "result": [
            {
                "id": str(t.id),
                "title": t.title,
                "status": t.status,
                "priority": t.priority,
                "story_points": t.story_points,
                "assignee_id": str(t.assignee_id) if t.assignee_id else None,
            }
            for t in tasks
        ]
    }


async def _list_tickets(
    tool_input: dict[str, Any],
    db: AsyncSession,
    workspace_id: str,
    developer_id: str,
) -> dict[str, Any]:
    status = tool_input.get("status")
    priority = tool_input.get("priority")
    limit = tool_input.get("limit", 20)

    stmt = (
        select(Ticket)
        .where(Ticket.workspace_id == workspace_id)
        .order_by(Ticket.created_at.desc())
        .limit(limit)
    )
    if status:
        stmt = stmt.where(Ticket.status == status)
    if priority:
        stmt = stmt.where(Ticket.priority == priority)

    result = await db.execute(stmt)
    tickets = result.scalars().all()

    return {
        "result": [
            {
                "id": str(t.id),
                "ticket_number": t.ticket_number,
                "submitter_name": t.submitter_name,
                "status": t.status,
                "priority": t.priority,
                "created_at": str(t.created_at),
                "field_values": t.field_values or {},
            }
            for t in tickets
        ]
    }


async def _current_time(
    tool_input: dict[str, Any],
    db: AsyncSession,
    workspace_id: str,
    developer_id: str,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    return {
        "result": {
            "utc": now.isoformat(),
            "date": now.strftime("%Y-%m-%d"),
            "time": now.strftime("%H:%M:%S"),
            "day_of_week": now.strftime("%A"),
        }
    }


TOOL_HANDLERS = {
    "list_sprints": _list_sprints,
    "get_sprint": _get_sprint,
    "list_sprint_tasks": _list_sprint_tasks,
    "list_tickets": _list_tickets,
    "current_time": _current_time,
}
