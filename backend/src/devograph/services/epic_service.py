"""Epic Service for managing workspace-level epics.

This service handles:
- CRUD operations for epics
- Task-epic associations
- Progress metrics calculation
- Timeline views
"""

import logging
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import select, func, and_, or_, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from devograph.models.epic import Epic
from devograph.models.sprint import SprintTask, Sprint
from devograph.models.developer import Developer

logger = logging.getLogger(__name__)


class EpicService:
    """Service for managing epics."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_next_key(self, workspace_id: str) -> str:
        """Generate the next epic key for a workspace."""
        stmt = (
            select(func.count(Epic.id))
            .where(Epic.workspace_id == workspace_id)
        )
        result = await self.db.execute(stmt)
        count = result.scalar() or 0
        return f"EPIC-{count + 1:03d}"

    async def create_epic(
        self,
        workspace_id: str,
        title: str,
        description: str | None = None,
        status: str = "open",
        color: str = "#6366F1",
        owner_id: str | None = None,
        start_date: date | None = None,
        target_date: date | None = None,
        priority: str = "medium",
        labels: list[str] | None = None,
        source_type: str | None = None,
        source_id: str | None = None,
        source_url: str | None = None,
    ) -> Epic:
        """Create a new epic."""
        key = await self.get_next_key(workspace_id)

        epic = Epic(
            workspace_id=workspace_id,
            key=key,
            title=title,
            description=description,
            status=status,
            color=color,
            owner_id=owner_id,
            start_date=start_date,
            target_date=target_date,
            priority=priority,
            labels=labels or [],
            source_type=source_type,
            source_id=source_id,
            source_url=source_url,
        )
        self.db.add(epic)
        await self.db.flush()

        logger.info(f"Created epic {key}: {title}")
        return epic

    async def get_epic(self, epic_id: str) -> Epic | None:
        """Get an epic by ID."""
        stmt = (
            select(Epic)
            .where(Epic.id == epic_id)
            .options(
                selectinload(Epic.owner),
                selectinload(Epic.tasks),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_epic_by_key(
        self,
        workspace_id: str,
        key: str,
    ) -> Epic | None:
        """Get an epic by key."""
        stmt = (
            select(Epic)
            .where(
                Epic.workspace_id == workspace_id,
                Epic.key == key,
            )
            .options(selectinload(Epic.owner))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_epics(
        self,
        workspace_id: str,
        status: str | None = None,
        owner_id: str | None = None,
        priority: str | None = None,
        include_archived: bool = False,
        search: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Epic]:
        """List epics for a workspace with filters."""
        stmt = (
            select(Epic)
            .where(Epic.workspace_id == workspace_id)
            .options(selectinload(Epic.owner))
        )

        if not include_archived:
            stmt = stmt.where(Epic.is_archived == False)

        if status:
            stmt = stmt.where(Epic.status == status)

        if owner_id:
            stmt = stmt.where(Epic.owner_id == owner_id)

        if priority:
            stmt = stmt.where(Epic.priority == priority)

        if search:
            search_pattern = f"%{search}%"
            stmt = stmt.where(
                or_(
                    Epic.title.ilike(search_pattern),
                    Epic.key.ilike(search_pattern),
                    Epic.description.ilike(search_pattern),
                )
            )

        stmt = stmt.order_by(
            Epic.priority.desc(),
            Epic.created_at.desc(),
        ).limit(limit).offset(offset)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_epic(
        self,
        epic_id: str,
        **kwargs,
    ) -> Epic | None:
        """Update an epic."""
        epic = await self.get_epic(epic_id)
        if not epic:
            return None

        # Update fields
        for key, value in kwargs.items():
            if value is not None and hasattr(epic, key):
                setattr(epic, key, value)

        # Update status-related fields
        if kwargs.get("status") == "done" and not epic.completed_date:
            epic.completed_date = date.today()
        elif kwargs.get("status") == "in_progress" and not epic.start_date:
            epic.start_date = date.today()

        epic.updated_at = datetime.now()
        await self.db.flush()

        logger.info(f"Updated epic {epic.key}")
        return epic

    async def delete_epic(self, epic_id: str) -> bool:
        """Delete an epic (removes task associations but not tasks)."""
        epic = await self.get_epic(epic_id)
        if not epic:
            return False

        # Remove epic association from all tasks
        for task in epic.tasks:
            task.epic_id = None

        await self.db.delete(epic)
        await self.db.flush()

        logger.info(f"Deleted epic {epic.key}")
        return True

    async def archive_epic(self, epic_id: str) -> Epic | None:
        """Archive an epic."""
        return await self.update_epic(epic_id, is_archived=True)

    async def unarchive_epic(self, epic_id: str) -> Epic | None:
        """Unarchive an epic."""
        return await self.update_epic(epic_id, is_archived=False)

    # ==================== Task Management ====================

    async def add_tasks_to_epic(
        self,
        epic_id: str,
        task_ids: list[str],
    ) -> dict[str, Any]:
        """Add tasks to an epic."""
        epic = await self.get_epic(epic_id)
        if not epic:
            return {"error": "Epic not found"}

        added = 0
        already_in_epic = 0

        for task_id in task_ids:
            task = await self.db.get(SprintTask, task_id)
            if not task:
                continue

            if task.epic_id == epic_id:
                already_in_epic += 1
            else:
                task.epic_id = epic_id
                added += 1

        await self.db.flush()

        # Recalculate metrics
        await self.recalculate_epic_metrics(epic_id)

        return {
            "added_count": added,
            "already_in_epic": already_in_epic,
            "task_ids": task_ids,
        }

    async def remove_task_from_epic(
        self,
        epic_id: str,
        task_id: str,
    ) -> bool:
        """Remove a task from an epic."""
        task = await self.db.get(SprintTask, task_id)
        if not task or task.epic_id != epic_id:
            return False

        task.epic_id = None
        await self.db.flush()

        # Recalculate metrics
        await self.recalculate_epic_metrics(epic_id)

        return True

    async def bulk_add_tasks(
        self,
        epic_id: str,
        task_ids: list[str],
    ) -> dict[str, Any]:
        """Bulk add tasks to epic."""
        return await self.add_tasks_to_epic(epic_id, task_ids)

    # ==================== Metrics ====================

    async def recalculate_epic_metrics(self, epic_id: str) -> None:
        """Recalculate cached metrics for an epic.

        Should be called whenever tasks are added/removed or task status changes.
        """
        epic = await self.db.get(Epic, epic_id)
        if not epic:
            return

        # Count tasks and points
        stmt = select(
            func.count(SprintTask.id).label("total_tasks"),
            func.sum(
                case(
                    (SprintTask.status == "done", 1),
                    else_=0
                )
            ).label("completed_tasks"),
            func.coalesce(func.sum(SprintTask.story_points), 0).label("total_points"),
            func.coalesce(
                func.sum(
                    case(
                        (SprintTask.status == "done", SprintTask.story_points),
                        else_=0
                    )
                ),
                0
            ).label("completed_points"),
        ).where(SprintTask.epic_id == epic_id)

        result = await self.db.execute(stmt)
        row = result.one()

        epic.total_tasks = row.total_tasks or 0
        epic.completed_tasks = row.completed_tasks or 0
        epic.total_story_points = row.total_points or 0
        epic.completed_story_points = row.completed_points or 0

        # Calculate progress percentage
        if epic.total_tasks > 0:
            epic.progress_percentage = (epic.completed_tasks / epic.total_tasks) * 100
        else:
            epic.progress_percentage = 0.0

        # Auto-update status based on progress
        if epic.completed_tasks > 0 and epic.completed_tasks == epic.total_tasks:
            if epic.status != "done":
                epic.status = "done"
                epic.completed_date = date.today()
        elif epic.completed_tasks > 0 or any(
            task.status == "in_progress" for task in await self._get_epic_tasks(epic_id)
        ):
            if epic.status == "open":
                epic.status = "in_progress"
                if not epic.start_date:
                    epic.start_date = date.today()

        epic.updated_at = datetime.now()
        await self.db.flush()

    async def _get_epic_tasks(self, epic_id: str) -> list[SprintTask]:
        """Get all tasks for an epic."""
        stmt = select(SprintTask).where(SprintTask.epic_id == epic_id)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_epic_progress(self, epic_id: str) -> dict[str, Any]:
        """Get detailed progress metrics for an epic."""
        epic = await self.get_epic(epic_id)
        if not epic:
            return {}

        # Get task counts by status
        stmt = select(
            SprintTask.status,
            func.count(SprintTask.id).label("count"),
        ).where(
            SprintTask.epic_id == epic_id
        ).group_by(SprintTask.status)

        result = await self.db.execute(stmt)
        status_counts = {row.status: row.count for row in result}

        # Get recent completions (last 7 days)
        week_ago = datetime.now() - timedelta(days=7)
        stmt = select(func.count(SprintTask.id)).where(
            SprintTask.epic_id == epic_id,
            SprintTask.status == "done",
            SprintTask.completed_at >= week_ago,
        )
        result = await self.db.execute(stmt)
        recent_completions = result.scalar() or 0

        # Calculate weekly points
        stmt = select(
            func.coalesce(func.sum(SprintTask.story_points), 0)
        ).where(
            SprintTask.epic_id == epic_id,
            SprintTask.status == "done",
            SprintTask.completed_at >= week_ago,
        )
        result = await self.db.execute(stmt)
        points_this_week = result.scalar() or 0

        # Estimate completion date based on velocity
        estimated_completion = None
        remaining_points = epic.total_story_points - epic.completed_story_points
        if points_this_week > 0 and remaining_points > 0:
            weeks_remaining = remaining_points / points_this_week
            estimated_completion = date.today() + timedelta(weeks=weeks_remaining)

        return {
            "epic_id": epic_id,
            "total_tasks": epic.total_tasks,
            "completed_tasks": epic.completed_tasks,
            "in_progress_tasks": status_counts.get("in_progress", 0),
            "blocked_tasks": status_counts.get("blocked", 0),
            "total_story_points": epic.total_story_points,
            "completed_story_points": epic.completed_story_points,
            "remaining_story_points": remaining_points,
            "task_completion_percentage": epic.progress_percentage,
            "points_completion_percentage": (
                (epic.completed_story_points / epic.total_story_points * 100)
                if epic.total_story_points > 0 else 0
            ),
            "tasks_completed_this_week": recent_completions,
            "points_completed_this_week": points_this_week,
            "estimated_completion_date": estimated_completion,
        }

    async def get_epic_detail(self, epic_id: str) -> dict[str, Any]:
        """Get epic with detailed breakdown."""
        epic = await self.get_epic(epic_id)
        if not epic:
            return {}

        # Get task counts by status
        stmt = select(
            SprintTask.status,
            func.count(SprintTask.id).label("count"),
        ).where(
            SprintTask.epic_id == epic_id
        ).group_by(SprintTask.status)

        result = await self.db.execute(stmt)
        tasks_by_status = {row.status: row.count for row in result}

        # Get task counts by team
        stmt = (
            select(
                Sprint.team_id,
                func.count(SprintTask.id).label("count"),
            )
            .join(Sprint, SprintTask.sprint_id == Sprint.id)
            .where(SprintTask.epic_id == epic_id)
            .group_by(Sprint.team_id)
        )
        result = await self.db.execute(stmt)
        tasks_by_team = {str(row.team_id): row.count for row in result}

        # Get recent completions
        week_ago = datetime.now() - timedelta(days=7)
        stmt = select(func.count(SprintTask.id)).where(
            SprintTask.epic_id == epic_id,
            SprintTask.status == "done",
            SprintTask.completed_at >= week_ago,
        )
        result = await self.db.execute(stmt)
        recent_completions = result.scalar() or 0

        return {
            "epic": epic,
            "tasks_by_status": tasks_by_status,
            "tasks_by_team": tasks_by_team,
            "recent_completions": recent_completions,
        }

    # ==================== Timeline ====================

    async def get_epic_timeline(self, epic_id: str) -> dict[str, Any]:
        """Get timeline view of epic tasks grouped by sprint."""
        epic = await self.get_epic(epic_id)
        if not epic:
            return {}

        # Get sprints with task counts
        stmt = (
            select(
                Sprint.id,
                Sprint.name,
                Sprint.team_id,
                Sprint.status,
                Sprint.start_date,
                Sprint.end_date,
                func.count(SprintTask.id).label("task_count"),
                func.sum(
                    case(
                        (SprintTask.status == "done", 1),
                        else_=0
                    )
                ).label("completed_count"),
                func.coalesce(func.sum(SprintTask.story_points), 0).label("story_points"),
                func.coalesce(
                    func.sum(
                        case(
                            (SprintTask.status == "done", SprintTask.story_points),
                            else_=0
                        )
                    ),
                    0
                ).label("completed_points"),
            )
            .join(SprintTask, Sprint.id == SprintTask.sprint_id)
            .where(SprintTask.epic_id == epic_id)
            .group_by(Sprint.id)
            .order_by(Sprint.start_date)
        )

        result = await self.db.execute(stmt)
        sprints = []

        for row in result:
            # Get team name
            from devograph.models.workspace import Team
            team = await self.db.get(Team, row.team_id)

            sprints.append({
                "sprint_id": str(row.id),
                "sprint_name": row.name,
                "team_id": str(row.team_id),
                "team_name": team.name if team else "Unknown",
                "status": row.status,
                "start_date": row.start_date.isoformat() if row.start_date else None,
                "end_date": row.end_date.isoformat() if row.end_date else None,
                "task_count": row.task_count,
                "completed_count": row.completed_count or 0,
                "story_points": row.story_points or 0,
                "completed_points": row.completed_points or 0,
            })

        # Categorize sprints
        completed_sprints = sum(1 for s in sprints if s["status"] == "completed")
        current_sprints = sum(1 for s in sprints if s["status"] == "active")
        planned_sprints = sum(1 for s in sprints if s["status"] == "planning")

        return {
            "epic_id": epic_id,
            "epic_title": epic.title,
            "sprints": sprints,
            "total_sprints": len(sprints),
            "completed_sprints": completed_sprints,
            "current_sprints": current_sprints,
            "planned_sprints": planned_sprints,
        }

    # ==================== Burndown ====================

    async def get_epic_burndown(
        self,
        epic_id: str,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict[str, Any]:
        """Get burndown chart data for an epic."""
        epic = await self.get_epic(epic_id)
        if not epic:
            return {}

        # Use epic dates or default to last 30 days
        if not start_date:
            start_date = epic.start_date or (date.today() - timedelta(days=30))
        if not end_date:
            end_date = epic.target_date or date.today()

        # For now, return current state as we don't have historical snapshots
        # In a full implementation, you'd query a metrics snapshot table
        data_points = [{
            "date": date.today().isoformat(),
            "remaining_points": epic.total_story_points - epic.completed_story_points,
            "remaining_tasks": epic.total_tasks - epic.completed_tasks,
            "scope_total": epic.total_story_points,
        }]

        # Calculate ideal burndown
        if epic.start_date and epic.target_date:
            total_days = (epic.target_date - epic.start_date).days
            if total_days > 0:
                daily_rate = epic.total_story_points / total_days
                ideal_burndown = [
                    epic.total_story_points - (daily_rate * i)
                    for i in range(total_days + 1)
                ]
            else:
                ideal_burndown = [epic.total_story_points]
        else:
            ideal_burndown = []

        return {
            "epic_id": epic_id,
            "data_points": data_points,
            "start_date": start_date.isoformat(),
            "target_date": end_date.isoformat() if end_date else None,
            "ideal_burndown": ideal_burndown,
        }

    # ==================== Search ====================

    async def find_epic_by_source(
        self,
        workspace_id: str,
        source_type: str,
        source_id: str,
    ) -> Epic | None:
        """Find an epic by its external source ID."""
        stmt = select(Epic).where(
            Epic.workspace_id == workspace_id,
            Epic.source_type == source_type,
            Epic.source_id == source_id,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
