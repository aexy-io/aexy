"""Sprint service for managing sprints and their lifecycle."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.sprint import (
    Sprint,
    SprintTask,
    SprintMetrics,
    TeamVelocity,
    SprintPlanningSession,
    SprintRetrospective,
)
from aexy.models.team import Team, TeamMember


class SprintService:
    """Service for sprint CRUD and lifecycle management."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # Sprint CRUD
    async def create_sprint(
        self,
        team_id: str,
        workspace_id: str,
        name: str,
        start_date: datetime,
        end_date: datetime,
        goal: str | None = None,
        capacity_hours: int | None = None,
        velocity_commitment: int | None = None,
        created_by_id: str | None = None,
        settings: dict | None = None,
    ) -> Sprint:
        """Create a new sprint for a team.

        Args:
            team_id: The team this sprint belongs to.
            workspace_id: The workspace context.
            name: Sprint name (e.g., "Sprint 23").
            start_date: Sprint start date.
            end_date: Sprint end date.
            goal: Optional sprint goal.
            capacity_hours: Optional team capacity in hours.
            velocity_commitment: Optional committed story points.
            created_by_id: Developer who created the sprint.
            settings: Optional sprint settings.

        Returns:
            Created Sprint.
        """
        sprint = Sprint(
            id=str(uuid4()),
            team_id=team_id,
            workspace_id=workspace_id,
            name=name,
            goal=goal,
            status="planning",
            start_date=start_date,
            end_date=end_date,
            capacity_hours=capacity_hours,
            velocity_commitment=velocity_commitment,
            settings=settings or {},
            created_by_id=created_by_id,
        )
        self.db.add(sprint)
        await self.db.flush()
        await self.db.refresh(sprint)
        return sprint

    async def get_sprint(self, sprint_id: str) -> Sprint | None:
        """Get a sprint by ID."""
        stmt = (
            select(Sprint)
            .where(Sprint.id == sprint_id)
            .options(
                selectinload(Sprint.tasks),
                selectinload(Sprint.team),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_team_sprints(
        self,
        team_id: str,
        status: str | None = None,
        limit: int | None = None,
    ) -> list[Sprint]:
        """List all sprints for a team.

        Args:
            team_id: Team ID.
            status: Optional status filter.
            limit: Optional limit on results.

        Returns:
            List of sprints ordered by start date descending.
        """
        stmt = (
            select(Sprint)
            .where(Sprint.team_id == team_id)
            .options(selectinload(Sprint.tasks))
        )

        if status:
            stmt = stmt.where(Sprint.status == status)

        stmt = stmt.order_by(Sprint.start_date.desc())

        if limit:
            stmt = stmt.limit(limit)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_active_sprint(self, team_id: str) -> Sprint | None:
        """Get the currently active sprint for a team."""
        stmt = (
            select(Sprint)
            .where(
                Sprint.team_id == team_id,
                Sprint.status == "active",
            )
            .options(selectinload(Sprint.tasks))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def update_sprint(
        self,
        sprint_id: str,
        name: str | None = None,
        goal: str | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        capacity_hours: int | None = None,
        velocity_commitment: int | None = None,
        settings: dict | None = None,
    ) -> Sprint | None:
        """Update a sprint."""
        sprint = await self.get_sprint(sprint_id)
        if not sprint:
            return None

        if name is not None:
            sprint.name = name
        if goal is not None:
            sprint.goal = goal
        if start_date is not None:
            sprint.start_date = start_date
        if end_date is not None:
            sprint.end_date = end_date
        if capacity_hours is not None:
            sprint.capacity_hours = capacity_hours
        if velocity_commitment is not None:
            sprint.velocity_commitment = velocity_commitment
        if settings is not None:
            sprint.settings = settings

        await self.db.flush()
        await self.db.refresh(sprint)
        return sprint

    async def delete_sprint(self, sprint_id: str) -> bool:
        """Delete a sprint (only if in planning status)."""
        sprint = await self.get_sprint(sprint_id)
        if not sprint:
            return False

        if sprint.status != "planning":
            raise ValueError("Can only delete sprints in planning status")

        await self.db.delete(sprint)
        await self.db.flush()
        return True

    # Lifecycle management
    async def start_sprint(self, sprint_id: str) -> Sprint:
        """Transition sprint from planning to active.

        Args:
            sprint_id: Sprint ID.

        Returns:
            Updated Sprint.

        Raises:
            ValueError: If sprint is not in planning status.
        """
        sprint = await self.get_sprint(sprint_id)
        if not sprint:
            raise ValueError("Sprint not found")

        if sprint.status != "planning":
            raise ValueError(f"Cannot start sprint in '{sprint.status}' status")

        # Check if there's already an active sprint for this team
        existing_active = await self.get_active_sprint(sprint.team_id)
        if existing_active:
            raise ValueError("Team already has an active sprint")

        sprint.status = "active"
        await self.db.flush()
        await self.db.refresh(sprint)

        # Record initial metrics
        await self._record_metrics_snapshot(sprint)

        return sprint

    async def start_review(self, sprint_id: str) -> Sprint:
        """Transition sprint from active to review.

        Args:
            sprint_id: Sprint ID.

        Returns:
            Updated Sprint.

        Raises:
            ValueError: If sprint is not in active status.
        """
        sprint = await self.get_sprint(sprint_id)
        if not sprint:
            raise ValueError("Sprint not found")

        if sprint.status != "active":
            raise ValueError(f"Cannot start review for sprint in '{sprint.status}' status")

        sprint.status = "review"
        await self.db.flush()
        await self.db.refresh(sprint)
        return sprint

    async def start_retrospective(self, sprint_id: str) -> Sprint:
        """Transition sprint from review to retrospective.

        Args:
            sprint_id: Sprint ID.

        Returns:
            Updated Sprint.

        Raises:
            ValueError: If sprint is not in review status.
        """
        sprint = await self.get_sprint(sprint_id)
        if not sprint:
            raise ValueError("Sprint not found")

        if sprint.status != "review":
            raise ValueError(f"Cannot start retrospective for sprint in '{sprint.status}' status")

        sprint.status = "retrospective"

        # Create retrospective record if it doesn't exist
        if not sprint.retrospective:
            retro = SprintRetrospective(
                id=str(uuid4()),
                sprint_id=sprint_id,
                went_well=[],
                to_improve=[],
                action_items=[],
            )
            self.db.add(retro)

        await self.db.flush()
        await self.db.refresh(sprint)
        return sprint

    async def complete_sprint(self, sprint_id: str) -> Sprint:
        """Complete a sprint and calculate velocity.

        Args:
            sprint_id: Sprint ID.

        Returns:
            Updated Sprint.

        Raises:
            ValueError: If sprint is not in retrospective status.
        """
        sprint = await self.get_sprint(sprint_id)
        if not sprint:
            raise ValueError("Sprint not found")

        if sprint.status != "retrospective":
            raise ValueError(f"Cannot complete sprint in '{sprint.status}' status")

        sprint.status = "completed"
        await self.db.flush()

        # Calculate and store velocity
        await self._calculate_velocity(sprint)

        await self.db.refresh(sprint)
        return sprint

    # Carry-over handling
    async def get_incomplete_tasks(self, sprint_id: str) -> list[SprintTask]:
        """Get all incomplete tasks from a sprint."""
        stmt = (
            select(SprintTask)
            .where(
                SprintTask.sprint_id == sprint_id,
                SprintTask.status.notin_(["done"]),
            )
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def carry_over_tasks(
        self,
        from_sprint_id: str,
        to_sprint_id: str,
        task_ids: list[str],
    ) -> list[SprintTask]:
        """Carry over tasks from one sprint to another.

        Args:
            from_sprint_id: Source sprint ID.
            to_sprint_id: Target sprint ID.
            task_ids: List of task IDs to carry over.

        Returns:
            List of new tasks created in target sprint.
        """
        to_sprint = await self.get_sprint(to_sprint_id)
        if not to_sprint:
            raise ValueError("Target sprint not found")

        if to_sprint.status not in ["planning", "active"]:
            raise ValueError("Can only carry over to sprints in planning or active status")

        carried_tasks = []

        for task_id in task_ids:
            # Get original task
            stmt = select(SprintTask).where(SprintTask.id == task_id)
            result = await self.db.execute(stmt)
            original_task = result.scalar_one_or_none()

            if not original_task or original_task.sprint_id != from_sprint_id:
                continue

            # Create new task in target sprint
            new_task = SprintTask(
                id=str(uuid4()),
                sprint_id=to_sprint_id,
                source_type=original_task.source_type,
                source_id=original_task.source_id,
                source_url=original_task.source_url,
                title=original_task.title,
                description=original_task.description,
                story_points=original_task.story_points,
                priority=original_task.priority,
                labels=original_task.labels,
                assignee_id=original_task.assignee_id,
                status="backlog",
                carried_over_from_sprint_id=from_sprint_id,
            )
            self.db.add(new_task)
            carried_tasks.append(new_task)

        await self.db.flush()

        for task in carried_tasks:
            await self.db.refresh(task)

        return carried_tasks

    # Planning sessions
    async def create_planning_session(
        self,
        sprint_id: str,
        creator_id: str,
    ) -> SprintPlanningSession:
        """Create a new planning session for a sprint."""
        session = SprintPlanningSession(
            id=str(uuid4()),
            sprint_id=sprint_id,
            status="active",
            participants=[
                {
                    "developer_id": creator_id,
                    "joined_at": datetime.now(timezone.utc).isoformat(),
                    "role": "host",
                }
            ],
            decisions_log=[],
        )
        self.db.add(session)
        await self.db.flush()
        await self.db.refresh(session)
        return session

    async def get_active_planning_session(
        self, sprint_id: str
    ) -> SprintPlanningSession | None:
        """Get the active planning session for a sprint."""
        stmt = (
            select(SprintPlanningSession)
            .where(
                SprintPlanningSession.sprint_id == sprint_id,
                SprintPlanningSession.status == "active",
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def end_planning_session(
        self, session_id: str
    ) -> SprintPlanningSession | None:
        """End a planning session."""
        stmt = select(SprintPlanningSession).where(SprintPlanningSession.id == session_id)
        result = await self.db.execute(stmt)
        session = result.scalar_one_or_none()

        if not session:
            return None

        session.status = "completed"
        session.ended_at = datetime.now(timezone.utc)
        await self.db.flush()
        await self.db.refresh(session)
        return session

    # Statistics
    async def get_sprint_stats(self, sprint_id: str) -> dict:
        """Get statistics for a sprint."""
        sprint = await self.get_sprint(sprint_id)
        if not sprint:
            return {}

        tasks = sprint.tasks or []

        total_tasks = len(tasks)
        completed_tasks = len([t for t in tasks if t.status == "done"])
        in_progress_tasks = len([t for t in tasks if t.status == "in_progress"])

        total_points = sum(t.story_points or 0 for t in tasks)
        completed_points = sum(t.story_points or 0 for t in tasks if t.status == "done")

        return {
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "in_progress_tasks": in_progress_tasks,
            "todo_tasks": total_tasks - completed_tasks - in_progress_tasks,
            "total_points": total_points,
            "completed_points": completed_points,
            "remaining_points": total_points - completed_points,
            "completion_percentage": (
                round(completed_points / total_points * 100, 1)
                if total_points > 0
                else 0
            ),
        }

    # Private helpers
    async def _record_metrics_snapshot(self, sprint: Sprint) -> SprintMetrics:
        """Record a daily metrics snapshot for a sprint."""
        from datetime import date

        today = date.today()

        # Check if we already have metrics for today
        stmt = (
            select(SprintMetrics)
            .where(
                SprintMetrics.sprint_id == sprint.id,
                SprintMetrics.snapshot_date == today,
            )
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()

        stats = await self.get_sprint_stats(sprint.id)

        # Calculate ideal burndown
        if sprint.start_date and sprint.end_date:
            total_days = (sprint.end_date.date() - sprint.start_date.date()).days
            days_elapsed = (today - sprint.start_date.date()).days
            if total_days > 0:
                ideal_burndown = stats["total_points"] * (1 - days_elapsed / total_days)
            else:
                ideal_burndown = 0
        else:
            ideal_burndown = stats["remaining_points"]

        if existing:
            existing.total_points = stats["total_points"]
            existing.completed_points = stats["completed_points"]
            existing.remaining_points = stats["remaining_points"]
            existing.total_tasks = stats["total_tasks"]
            existing.completed_tasks = stats["completed_tasks"]
            existing.in_progress_tasks = stats["in_progress_tasks"]
            existing.ideal_burndown = ideal_burndown
            existing.actual_burndown = stats["remaining_points"]
            await self.db.flush()
            return existing

        metrics = SprintMetrics(
            id=str(uuid4()),
            sprint_id=sprint.id,
            snapshot_date=today,
            total_points=stats["total_points"],
            completed_points=stats["completed_points"],
            remaining_points=stats["remaining_points"],
            total_tasks=stats["total_tasks"],
            completed_tasks=stats["completed_tasks"],
            in_progress_tasks=stats["in_progress_tasks"],
            blocked_tasks=0,
            ideal_burndown=ideal_burndown,
            actual_burndown=stats["remaining_points"],
        )
        self.db.add(metrics)
        await self.db.flush()
        return metrics

    async def _calculate_velocity(self, sprint: Sprint) -> TeamVelocity:
        """Calculate and store velocity for a completed sprint."""
        stats = await self.get_sprint_stats(sprint.id)

        # Get carry-over points
        stmt = (
            select(func.sum(SprintTask.story_points))
            .where(
                SprintTask.sprint_id == sprint.id,
                SprintTask.status != "done",
                SprintTask.story_points.isnot(None),
            )
        )
        result = await self.db.execute(stmt)
        carry_over_points = result.scalar() or 0

        committed_points = sprint.velocity_commitment or stats["total_points"]
        completed_points = stats["completed_points"]

        completion_rate = (
            completed_points / committed_points if committed_points > 0 else 0
        )

        # Focus factor: ratio of completed to total planned
        focus_factor = (
            completed_points / stats["total_points"]
            if stats["total_points"] > 0
            else 1.0
        )

        velocity = TeamVelocity(
            id=str(uuid4()),
            team_id=sprint.team_id,
            sprint_id=sprint.id,
            committed_points=committed_points,
            completed_points=completed_points,
            carry_over_points=carry_over_points,
            completion_rate=completion_rate,
            focus_factor=focus_factor,
        )
        self.db.add(velocity)
        await self.db.flush()
        return velocity

    # Permission check
    async def check_team_membership(
        self, team_id: str, developer_id: str
    ) -> bool:
        """Check if a developer is a member of a team."""
        stmt = (
            select(TeamMember)
            .where(
                TeamMember.team_id == team_id,
                TeamMember.developer_id == developer_id,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none() is not None
