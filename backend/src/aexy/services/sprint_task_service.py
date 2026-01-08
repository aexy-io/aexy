"""Sprint task service for managing tasks within sprints."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.sprint import Sprint, SprintTask, TaskActivity
from aexy.services.task_sources.base import TaskItem, TaskSourceConfig, TaskStatus
from aexy.services.task_sources.github_issues import GitHubIssuesSource
from aexy.services.task_sources.jira import JiraSource
from aexy.services.task_sources.linear import LinearSource


class SprintTaskService:
    """Service for managing tasks within sprints."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # Task CRUD
    async def add_task(
        self,
        sprint_id: str,
        title: str,
        source_type: str = "manual",
        source_id: str | None = None,
        source_url: str | None = None,
        description: str | None = None,
        story_points: int | None = None,
        priority: str = "medium",
        labels: list[str] | None = None,
        assignee_id: str | None = None,
        status: str = "backlog",
        epic_id: str | None = None,
        parent_task_id: str | None = None,
    ) -> SprintTask:
        """Add a task to a sprint.

        Args:
            sprint_id: Sprint ID.
            title: Task title.
            source_type: Task source ("manual", "github_issue", "jira", "linear").
            source_id: External source ID.
            source_url: URL to external task.
            description: Task description.
            story_points: Story points estimate.
            priority: Priority level.
            labels: List of labels.
            assignee_id: Developer ID to assign.
            status: Initial task status.
            epic_id: Optional epic ID.
            parent_task_id: Optional parent task ID for subtasks.

        Returns:
            Created SprintTask.
        """
        # Generate source_id if not provided for manual tasks
        if source_type == "manual" and not source_id:
            source_id = str(uuid4())

        task = SprintTask(
            id=str(uuid4()),
            sprint_id=sprint_id,
            source_type=source_type,
            source_id=source_id,
            source_url=source_url,
            title=title,
            description=description,
            story_points=story_points,
            priority=priority,
            labels=labels or [],
            assignee_id=assignee_id,
            status=status,
            epic_id=epic_id,
            parent_task_id=parent_task_id,
        )
        self.db.add(task)
        await self.db.flush()
        await self.db.refresh(task)
        return task

    async def get_task(self, task_id: str) -> SprintTask | None:
        """Get a task by ID."""
        stmt = (
            select(SprintTask)
            .where(SprintTask.id == task_id)
            .options(selectinload(SprintTask.assignee))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_sprint_tasks(
        self,
        sprint_id: str,
        status: str | None = None,
        assignee_id: str | None = None,
    ) -> list[SprintTask]:
        """Get all tasks for a sprint.

        Args:
            sprint_id: Sprint ID.
            status: Optional status filter.
            assignee_id: Optional assignee filter.

        Returns:
            List of SprintTasks.
        """
        stmt = (
            select(SprintTask)
            .where(SprintTask.sprint_id == sprint_id)
            .options(selectinload(SprintTask.assignee))
        )

        if status:
            stmt = stmt.where(SprintTask.status == status)
        if assignee_id:
            stmt = stmt.where(SprintTask.assignee_id == assignee_id)

        stmt = stmt.order_by(SprintTask.priority.desc(), SprintTask.created_at)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_task(
        self,
        task_id: str,
        title: str | None = None,
        description: str | None = None,
        story_points: int | None = None,
        priority: str | None = None,
        status: str | None = None,
        labels: list[str] | None = None,
        epic_id: str | None = ...,  # Use sentinel to distinguish from None
    ) -> SprintTask | None:
        """Update task details."""
        task = await self.get_task(task_id)
        if not task:
            return None

        if title is not None:
            task.title = title
        if description is not None:
            task.description = description
        if story_points is not None:
            task.story_points = story_points
        if priority is not None:
            task.priority = priority
        if status is not None:
            old_status = task.status
            task.status = status
            # Track status change timestamps
            if status == "in_progress" and old_status != "in_progress" and not task.started_at:
                task.started_at = datetime.now(timezone.utc)
            elif status == "done" and old_status != "done":
                task.completed_at = datetime.now(timezone.utc)
        if labels is not None:
            task.labels = labels
        if epic_id is not ...:  # Only update if explicitly passed (including None)
            task.epic_id = epic_id

        await self.db.flush()
        await self.db.refresh(task)
        return task

    async def remove_task(self, task_id: str) -> bool:
        """Remove a task from a sprint."""
        task = await self.get_task(task_id)
        if not task:
            return False

        await self.db.delete(task)
        await self.db.flush()
        return True

    # Assignment
    async def assign_task(
        self,
        task_id: str,
        developer_id: str,
        reason: str | None = None,
        confidence: float | None = None,
    ) -> SprintTask | None:
        """Assign a task to a developer.

        Args:
            task_id: Task ID.
            developer_id: Developer ID to assign.
            reason: Optional reason for assignment (e.g., AI explanation).
            confidence: Optional confidence score (0-1).

        Returns:
            Updated SprintTask.
        """
        task = await self.get_task(task_id)
        if not task:
            return None

        task.assignee_id = developer_id
        task.assignment_reason = reason
        task.assignment_confidence = confidence

        await self.db.flush()
        await self.db.refresh(task)
        return task

    async def unassign_task(self, task_id: str) -> SprintTask | None:
        """Remove assignment from a task."""
        task = await self.get_task(task_id)
        if not task:
            return None

        task.assignee_id = None
        task.assignment_reason = None
        task.assignment_confidence = None

        await self.db.flush()
        await self.db.refresh(task)
        return task

    async def bulk_assign_tasks(
        self,
        assignments: list[dict],
    ) -> list[SprintTask]:
        """Bulk assign multiple tasks.

        Args:
            assignments: List of dicts with {task_id, developer_id, reason?, confidence?}.

        Returns:
            List of updated SprintTasks.
        """
        updated_tasks = []

        for assignment in assignments:
            task = await self.assign_task(
                task_id=assignment["task_id"],
                developer_id=assignment["developer_id"],
                reason=assignment.get("reason"),
                confidence=assignment.get("confidence"),
            )
            if task:
                updated_tasks.append(task)

        return updated_tasks

    # Status management
    async def update_task_status(
        self,
        task_id: str,
        new_status: str,
    ) -> SprintTask | None:
        """Update a task's status.

        Args:
            task_id: Task ID.
            new_status: New status value.

        Returns:
            Updated SprintTask.
        """
        task = await self.get_task(task_id)
        if not task:
            return None

        old_status = task.status
        task.status = new_status

        # Track timing
        now = datetime.now(timezone.utc)
        if new_status == "in_progress" and old_status == "todo":
            task.started_at = now
        elif new_status == "done":
            task.completed_at = now

        await self.db.flush()
        await self.db.refresh(task)
        return task

    # Activity Logging
    async def log_activity(
        self,
        task_id: str,
        action: str,
        actor_id: str | None = None,
        field_name: str | None = None,
        old_value: str | None = None,
        new_value: str | None = None,
        comment: str | None = None,
        metadata: dict | None = None,
    ) -> TaskActivity:
        """Log an activity for a task.

        Args:
            task_id: Task ID.
            action: Activity action type.
            actor_id: ID of the user who performed the action.
            field_name: Name of the field that changed.
            old_value: Previous value (as string).
            new_value: New value (as string).
            comment: Optional comment text.
            metadata: Optional additional metadata.

        Returns:
            Created TaskActivity.
        """
        activity = TaskActivity(
            id=str(uuid4()),
            task_id=task_id,
            action=action,
            actor_id=actor_id,
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
            comment=comment,
            metadata=metadata or {},
        )
        self.db.add(activity)
        await self.db.flush()
        await self.db.refresh(activity)
        return activity

    async def get_task_activities(
        self,
        task_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[TaskActivity], int]:
        """Get activities for a task.

        Args:
            task_id: Task ID.
            limit: Maximum number of activities to return.
            offset: Number of activities to skip.

        Returns:
            Tuple of (list of activities, total count).
        """
        # Get total count
        count_stmt = select(func.count(TaskActivity.id)).where(
            TaskActivity.task_id == task_id
        )
        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar_one()

        # Get activities
        stmt = (
            select(TaskActivity)
            .where(TaskActivity.task_id == task_id)
            .options(selectinload(TaskActivity.actor))
            .order_by(TaskActivity.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        activities = list(result.scalars().all())

        return activities, total

    async def add_comment(
        self,
        task_id: str,
        comment: str,
        actor_id: str | None = None,
    ) -> TaskActivity:
        """Add a comment to a task.

        Args:
            task_id: Task ID.
            comment: Comment text.
            actor_id: ID of the user adding the comment.

        Returns:
            Created TaskActivity.
        """
        return await self.log_activity(
            task_id=task_id,
            action="comment",
            actor_id=actor_id,
            comment=comment,
        )

    # Import from sources
    async def import_github_issues(
        self,
        sprint_id: str,
        owner: str,
        repo: str,
        api_token: str | None = None,
        labels: list[str] | None = None,
        limit: int = 50,
    ) -> list[SprintTask]:
        """Import issues from GitHub.

        Args:
            sprint_id: Sprint ID.
            owner: GitHub owner/organization.
            repo: Repository name.
            api_token: Optional GitHub token.
            labels: Optional label filter.
            limit: Max issues to import.

        Returns:
            List of created SprintTasks.
        """
        config = TaskSourceConfig(
            source_type="github",
            owner=owner,
            repo=repo,
            api_token=api_token,
        )

        source = GitHubIssuesSource(config)

        try:
            tasks = await source.fetch_tasks(limit=limit, labels=labels, status=TaskStatus.OPEN)
            return await self._import_task_items(sprint_id, tasks, "github_issue")
        finally:
            await source.close()

    async def import_jira_issues(
        self,
        sprint_id: str,
        api_url: str,
        api_key: str,
        project_key: str,
        jql_filter: str | None = None,
        limit: int = 50,
    ) -> list[SprintTask]:
        """Import issues from Jira.

        Args:
            sprint_id: Sprint ID.
            api_url: Jira API URL.
            api_key: Jira API key.
            project_key: Project key.
            jql_filter: Optional JQL query.
            limit: Max issues to import.

        Returns:
            List of created SprintTasks.
        """
        config = TaskSourceConfig(
            source_type="jira",
            api_url=api_url,
            api_key=api_key,
            project_key=project_key,
        )

        source = JiraSource(config)

        try:
            tasks = await source.fetch_tasks(limit=limit, status=TaskStatus.OPEN)
            return await self._import_task_items(sprint_id, tasks, "jira")
        finally:
            await source.close()

    async def import_linear_issues(
        self,
        sprint_id: str,
        api_key: str,
        team_id: str | None = None,
        labels: list[str] | None = None,
        limit: int = 50,
    ) -> list[SprintTask]:
        """Import issues from Linear.

        Args:
            sprint_id: Sprint ID.
            api_key: Linear API key.
            team_id: Optional Linear team ID.
            labels: Optional label filter.
            limit: Max issues to import.

        Returns:
            List of created SprintTasks.
        """
        config = TaskSourceConfig(
            source_type="linear",
            api_key=api_key,
            team_id=team_id,
        )

        source = LinearSource(config)

        try:
            tasks = await source.fetch_tasks(limit=limit, labels=labels, status=TaskStatus.OPEN)
            return await self._import_task_items(sprint_id, tasks, "linear")
        finally:
            await source.close()

    async def _import_task_items(
        self,
        sprint_id: str,
        task_items: list[TaskItem],
        source_type: str,
    ) -> list[SprintTask]:
        """Import TaskItem objects into sprint tasks.

        Args:
            sprint_id: Sprint ID.
            task_items: List of TaskItem objects.
            source_type: Source type identifier.

        Returns:
            List of created SprintTasks.
        """
        created_tasks = []

        for item in task_items:
            # Check if task already exists in sprint
            existing = await self._get_task_by_source(
                sprint_id, source_type, item.external_id
            )
            if existing:
                continue

            # Map priority
            priority = "medium"
            if item.priority:
                priority_map = {
                    "highest": "critical",
                    "high": "high",
                    "medium": "medium",
                    "low": "low",
                    "lowest": "low",
                }
                priority = priority_map.get(item.priority.value, "medium")

            task = await self.add_task(
                sprint_id=sprint_id,
                title=item.title,
                source_type=source_type,
                source_id=item.external_id,
                source_url=item.url,
                description=item.description,
                story_points=item.story_points,
                priority=priority,
                labels=item.labels,
                status="backlog",
            )
            created_tasks.append(task)

        return created_tasks

    async def _get_task_by_source(
        self,
        sprint_id: str,
        source_type: str,
        source_id: str,
    ) -> SprintTask | None:
        """Get a task by its source identifier."""
        stmt = select(SprintTask).where(
            SprintTask.sprint_id == sprint_id,
            SprintTask.source_type == source_type,
            SprintTask.source_id == source_id,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    # Sync from source
    async def sync_task_from_source(
        self,
        task_id: str,
        api_token: str | None = None,
        api_key: str | None = None,
        api_url: str | None = None,
    ) -> SprintTask | None:
        """Sync a task's data from its external source.

        Args:
            task_id: Task ID.
            api_token: Optional API token for authentication.
            api_key: Optional API key for authentication.
            api_url: Optional API URL for Jira.

        Returns:
            Updated SprintTask.
        """
        task = await self.get_task(task_id)
        if not task:
            return None

        if task.source_type == "manual":
            # Manual tasks don't sync
            return task

        try:
            task_item = await self._fetch_task_from_source(
                task.source_type,
                task.source_id,
                api_token=api_token,
                api_key=api_key,
                api_url=api_url,
            )

            if task_item:
                task.title = task_item.title
                task.description = task_item.description
                task.labels = task_item.labels
                if task_item.story_points:
                    task.story_points = task_item.story_points

                await self.db.flush()
                await self.db.refresh(task)

        except Exception:
            # Log but don't fail
            pass

        return task

    async def _fetch_task_from_source(
        self,
        source_type: str,
        source_id: str,
        api_token: str | None = None,
        api_key: str | None = None,
        api_url: str | None = None,
    ) -> TaskItem | None:
        """Fetch a single task from its external source."""
        # This would need more context (owner/repo for GitHub, etc.)
        # For now, return None - full implementation would require
        # storing source config with the sprint/workspace
        return None
