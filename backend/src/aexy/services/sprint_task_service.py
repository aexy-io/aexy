"""Sprint task service for managing tasks within sprints."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.sprint import Sprint, SprintTask, TaskActivity
from aexy.services.task_sources.base import TaskItem, TaskSourceConfig, TaskStatus
from aexy.services.task_sources.github_issues import GitHubIssuesSource
from aexy.services.task_sources.jira import JiraSource
from aexy.services.task_sources.linear import LinearSource
from aexy.services.automation_service import dispatch_automation_event
from aexy.services.activity_logger import log_activity
from aexy.services.notification_service import (
    extract_mentioned_user_ids,
    notify_mention,
    _get_text_snippet,
)


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

        # Get workspace_id from sprint
        sprint_stmt = select(Sprint).where(Sprint.id == sprint_id)
        sprint_result = await self.db.execute(sprint_stmt)
        sprint = sprint_result.scalar_one_or_none()
        workspace_id = sprint.workspace_id if sprint else None

        task = SprintTask(
            id=str(uuid4()),
            sprint_id=sprint_id,
            workspace_id=workspace_id,
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

        # Re-fetch with relationships loaded to avoid lazy loading issues
        stmt = (
            select(SprintTask)
            .where(SprintTask.id == task.id)
            .options(
                selectinload(SprintTask.assignee),
                selectinload(SprintTask.subtasks),
            )
        )
        result = await self.db.execute(stmt)
        created_task = result.scalar_one()

        # Log unified activity
        if workspace_id:
            await log_activity(
                self.db,
                workspace_id=workspace_id,
                entity_type="task",
                entity_id=str(created_task.id),
                activity_type="created",
                actor_id=assignee_id,
                title=f"Created task '{title}'",
                metadata={"sprint_id": sprint_id, "source_type": source_type},
            )

        # Dispatch task.created event for automations
        if workspace_id:
            await dispatch_automation_event(
                db=self.db,
                workspace_id=workspace_id,
                module="sprints",
                trigger_type="task.created",
                entity_id=created_task.id,
                trigger_data={
                    "task_id": created_task.id,
                    "task_title": created_task.title,
                    "sprint_id": sprint_id,
                    "status": created_task.status,
                    "priority": created_task.priority,
                    "assignee_id": created_task.assignee_id,
                    "assignee_email": created_task.assignee.email if created_task.assignee else None,
                    "epic_id": created_task.epic_id,
                    "story_points": created_task.story_points,
                    "workspace_id": workspace_id,
                },
            )

        return created_task

    async def get_task(self, task_id: str) -> SprintTask | None:
        """Get a task by ID."""
        stmt = (
            select(SprintTask)
            .where(SprintTask.id == task_id)
            .options(
                selectinload(SprintTask.assignee),
                selectinload(SprintTask.subtasks),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_sprint_tasks(
        self,
        sprint_id: str,
        status: str | None = None,
        assignee_id: str | None = None,
        include_archived: bool = False,
    ) -> list[SprintTask]:
        """Get all tasks for a sprint.

        Args:
            sprint_id: Sprint ID.
            status: Optional status filter.
            assignee_id: Optional assignee filter.
            include_archived: Whether to include archived tasks (default: False).

        Returns:
            List of SprintTasks.
        """
        stmt = (
            select(SprintTask)
            .where(SprintTask.sprint_id == sprint_id)
            .options(
                selectinload(SprintTask.assignee),
                selectinload(SprintTask.subtasks),
            )
        )

        if not include_archived:
            stmt = stmt.where(SprintTask.is_archived == False)
        if status:
            stmt = stmt.where(SprintTask.status == status)
        if assignee_id:
            stmt = stmt.where(SprintTask.assignee_id == assignee_id)

        stmt = stmt.order_by(SprintTask.priority.desc(), SprintTask.created_at)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_workspace_tasks(
        self,
        workspace_id: str,
        *,
        status: list[str] | None = None,
        status_id: list[str] | None = None,
        assignee_ids: list[str] | None = None,
        priorities: list[str] | None = None,
        team_ids: list[str] | None = None,
        sprint_ids: list[str] | None = None,
        epic_ids: list[str] | None = None,
        labels: list[str] | None = None,
        search: str | None = None,
        include_archived: bool = False,
        limit: int = 500,
        offset: int = 0,
    ) -> list[SprintTask]:
        """Get all tasks across every team/sprint in a workspace.

        SprintTask has a denormalized workspace_id column so this is a single
        indexed scan with no joins required. Filters are applied server-side;
        callers can layer additional client-side filtering on top.
        """
        stmt = (
            select(SprintTask)
            .where(SprintTask.workspace_id == workspace_id)
            .options(
                selectinload(SprintTask.assignee),
                selectinload(SprintTask.sprint),
                selectinload(SprintTask.team),
                selectinload(SprintTask.subtasks),
            )
        )

        if not include_archived:
            stmt = stmt.where(SprintTask.is_archived.is_(False))
        if status:
            stmt = stmt.where(SprintTask.status.in_(status))
        if status_id:
            stmt = stmt.where(SprintTask.status_id.in_(status_id))
        if assignee_ids:
            stmt = stmt.where(SprintTask.assignee_id.in_(assignee_ids))
        if priorities:
            stmt = stmt.where(SprintTask.priority.in_(priorities))
        if team_ids:
            stmt = stmt.where(SprintTask.team_id.in_(team_ids))
        if sprint_ids:
            stmt = stmt.where(SprintTask.sprint_id.in_(sprint_ids))
        if epic_ids:
            stmt = stmt.where(SprintTask.epic_id.in_(epic_ids))
        if search:
            like = f"%{search}%"
            stmt = stmt.where(
                or_(
                    SprintTask.title.ilike(like),
                    SprintTask.description.ilike(like),
                )
            )

        stmt = (
            stmt.order_by(SprintTask.priority.desc(), SprintTask.created_at)
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        tasks = list(result.scalars().all())

        # Label filtering: JSONB ?| operator is Postgres-only, so filter in
        # Python to stay compatible with SQLite tests.
        if labels:
            label_set = set(labels)
            tasks = [t for t in tasks if set(t.labels or []) & label_set]

        return tasks

    async def get_tasks_by_assignee(
        self,
        assignee_id: str,
        status: str | None = None,
        include_done: bool = False,
    ) -> list[SprintTask]:
        """Get all tasks assigned to a developer across all sprints.

        Args:
            assignee_id: Developer ID.
            status: Optional status filter.
            include_done: Whether to include completed tasks (default: False).

        Returns:
            List of SprintTasks assigned to the developer.
        """
        stmt = (
            select(SprintTask)
            .where(SprintTask.assignee_id == assignee_id)
            .where(SprintTask.is_archived == False)
            .options(
                selectinload(SprintTask.assignee),
                selectinload(SprintTask.subtasks),
                selectinload(SprintTask.sprint),
            )
        )

        if status:
            stmt = stmt.where(SprintTask.status == status)
        elif not include_done:
            # Exclude completed tasks by default
            stmt = stmt.where(SprintTask.status != "done")

        stmt = stmt.order_by(SprintTask.priority.desc(), SprintTask.created_at.desc())
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
        assignee_id: str | None = ...,  # Use sentinel to distinguish from None
        contributes_to_goal: bool | None = None,
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
            now = datetime.now(timezone.utc)
            # Track status change timestamps
            if status == "in_progress" and old_status != "in_progress" and not task.started_at:
                task.started_at = now
                if not task.work_started_at:
                    task.work_started_at = now
            elif status == "done" and old_status != "done":
                task.completed_at = now
                if task.work_started_at:
                    task.cycle_time_hours = (now - task.work_started_at).total_seconds() / 3600
                task.lead_time_hours = (now - task.created_at).total_seconds() / 3600
        if labels is not None:
            task.labels = labels
        if epic_id is not ...:  # Only update if explicitly passed (including None)
            task.epic_id = epic_id
        if assignee_id is not ...:  # Only update if explicitly passed (including None)
            task.assignee_id = assignee_id
        if contributes_to_goal is not None:
            task.contributes_to_goal = contributes_to_goal

        await self.db.flush()

        # Re-fetch with relationships loaded
        return await self.get_task(task_id)

    async def remove_task(self, task_id: str) -> bool:
        """Remove a task from a sprint (soft delete via archive)."""
        task = await self.get_task(task_id)
        if not task:
            return False

        # Log before hard delete since entity won't exist after
        if task.workspace_id:
            await log_activity(
                self.db,
                workspace_id=str(task.workspace_id),
                entity_type="task",
                entity_id=str(task.id),
                activity_type="deleted",
                title=f"Removed task '{task.title}'",
            )

        task.is_archived = True
        await self.db.flush()
        return True

    async def archive_task(self, task_id: str) -> SprintTask | None:
        """Archive a task (soft delete)."""
        task = await self.get_task(task_id)
        if not task:
            return None

        task.is_archived = True
        await self.db.flush()
        return await self.get_task(task_id)

    async def unarchive_task(self, task_id: str) -> SprintTask | None:
        """Unarchive a task (restore from soft delete)."""
        task = await self.get_task(task_id)
        if not task:
            return None

        task.is_archived = False
        await self.db.flush()
        return await self.get_task(task_id)

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

        # Re-fetch with relationships loaded
        updated_task = await self.get_task(task_id)

        # Log unified activity for assignment
        if updated_task and updated_task.workspace_id:
            await log_activity(
                self.db,
                workspace_id=updated_task.workspace_id,
                entity_type="task",
                entity_id=str(updated_task.id),
                activity_type="assigned",
                title=f"Assigned task '{updated_task.title}'",
                changes={"assignee_id": {"new": developer_id}},
                metadata={"assignment_reason": reason},
            )

        # Dispatch task.assigned event for automations
        if updated_task and updated_task.workspace_id:
            await dispatch_automation_event(
                db=self.db,
                workspace_id=updated_task.workspace_id,
                module="sprints",
                trigger_type="task.assigned",
                entity_id=updated_task.id,
                trigger_data={
                    "task_id": updated_task.id,
                    "task_title": updated_task.title,
                    "sprint_id": updated_task.sprint_id,
                    "assignee_id": developer_id,
                    "assignee_email": updated_task.assignee.email if updated_task.assignee else None,
                    "assignment_reason": reason,
                    "status": updated_task.status,
                    "workspace_id": updated_task.workspace_id,
                },
            )

        return updated_task

    async def unassign_task(self, task_id: str) -> SprintTask | None:
        """Remove assignment from a task."""
        task = await self.get_task(task_id)
        if not task:
            return None

        task.assignee_id = None
        task.assignment_reason = None
        task.assignment_confidence = None

        await self.db.flush()

        # Re-fetch with relationships loaded
        return await self.get_task(task_id)

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

    async def bulk_update_status(
        self,
        task_ids: list[str],
        new_status: str,
    ) -> list[SprintTask]:
        """Bulk update status for multiple tasks.

        Args:
            task_ids: List of task IDs to update.
            new_status: New status value for all tasks.

        Returns:
            List of updated SprintTasks.
        """
        updated_tasks = []

        for task_id in task_ids:
            task = await self.update_task_status(task_id, new_status)
            if task:
                updated_tasks.append(task)

        return updated_tasks

    async def bulk_move_to_sprint(
        self,
        task_ids: list[str],
        target_sprint_id: str,
    ) -> list[SprintTask]:
        """Bulk move tasks to another sprint.

        Args:
            task_ids: List of task IDs to move.
            target_sprint_id: Target sprint ID.

        Returns:
            List of updated SprintTasks.
        """
        # Get workspace_id from target sprint
        sprint_stmt = select(Sprint).where(Sprint.id == target_sprint_id)
        sprint_result = await self.db.execute(sprint_stmt)
        target_sprint = sprint_result.scalar_one_or_none()

        if not target_sprint:
            return []

        updated_tasks = []

        for task_id in task_ids:
            task = await self.get_task(task_id)
            if task:
                task.sprint_id = target_sprint_id
                task.workspace_id = target_sprint.workspace_id
                await self.db.flush()
                updated_task = await self.get_task(task_id)
                if updated_task:
                    updated_tasks.append(updated_task)

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
        if new_status == "in_progress" and old_status in ("backlog", "todo"):
            task.started_at = now
            if not task.work_started_at:
                task.work_started_at = now
        elif new_status == "done":
            task.completed_at = now
            # Calculate cycle time (work_started_at → completed)
            if task.work_started_at:
                task.cycle_time_hours = (now - task.work_started_at).total_seconds() / 3600
            # Calculate lead time (created_at → completed)
            task.lead_time_hours = (now - task.created_at).total_seconds() / 3600

        await self.db.flush()

        # Re-fetch with relationships loaded
        updated_task = await self.get_task(task_id)

        # Log unified activity for status changes
        if updated_task and updated_task.workspace_id and old_status != new_status:
            act_type = "status_changed"
            if new_status == "done":
                act_type = "resolved"
            await log_activity(
                self.db,
                workspace_id=updated_task.workspace_id,
                entity_type="task",
                entity_id=str(updated_task.id),
                activity_type=act_type,
                title=f"Task '{updated_task.title}' status changed",
                changes={"status": {"old": old_status, "new": new_status}},
            )

        # Dispatch automation events for status changes
        if updated_task and updated_task.workspace_id and old_status != new_status:
            trigger_data = {
                "task_id": updated_task.id,
                "task_title": updated_task.title,
                "sprint_id": updated_task.sprint_id,
                "old_status": old_status,
                "new_status": new_status,
                "assignee_id": updated_task.assignee_id,
                "assignee_email": updated_task.assignee.email if updated_task.assignee else None,
                "workspace_id": updated_task.workspace_id,
            }

            # Dispatch task.status_changed
            await dispatch_automation_event(
                db=self.db,
                workspace_id=updated_task.workspace_id,
                module="sprints",
                trigger_type="task.status_changed",
                entity_id=updated_task.id,
                trigger_data=trigger_data,
            )

            # Also dispatch task.completed if status is done
            if new_status == "done":
                await dispatch_automation_event(
                    db=self.db,
                    workspace_id=updated_task.workspace_id,
                    module="sprints",
                    trigger_type="task.completed",
                    entity_id=updated_task.id,
                    trigger_data=trigger_data,
                )

        return updated_task

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
        # Log to unified activity feed
        task = await self.get_task(task_id)
        if task and task.workspace_id:
            await log_activity(
                self.db,
                workspace_id=task.workspace_id,
                entity_type="task",
                entity_id=task_id,
                activity_type="comment",
                actor_id=actor_id,
                title=f"Commented on task '{task.title}'",
                content=comment,
            )

        activity = await self.log_activity(
            task_id=task_id,
            action="comment",
            actor_id=actor_id,
            comment=comment,
        )

        # Send mention notifications
        if actor_id and comment:
            mentioned_ids = extract_mentioned_user_ids(comment)
            if mentioned_ids:
                from aexy.models.developer import Developer

                author_result = await self.db.execute(
                    select(Developer).where(Developer.id == actor_id)
                )
                author = author_result.scalar_one_or_none()
                author_name = author.name or "Someone" if author else "Someone"
                snippet = _get_text_snippet(comment)

                # Get task for action URL context
                task = await self.get_task(task_id)
                if task and task.sprint_id:
                    # Get team_id from sprint for URL
                    sprint_result = await self.db.execute(
                        select(Sprint).where(Sprint.id == task.sprint_id)
                    )
                    sprint = sprint_result.scalar_one_or_none()
                    team_id = sprint.team_id if sprint and hasattr(sprint, 'team_id') else None
                    if team_id:
                        action_url = f"/sprints/{team_id}/board?task={task_id}"
                    else:
                        action_url = f"/sprints?task={task_id}"
                else:
                    action_url = f"/sprints?task={task_id}"

                for uid in mentioned_ids:
                    if uid != actor_id:
                        await notify_mention(
                            db=self.db,
                            mentioned_user_id=uid,
                            mentioner_name=author_name,
                            entity_type="task comment",
                            entity_id=task_id,
                            action_url=action_url,
                            snippet=snippet,
                        )

        return activity

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

    async def reorder_tasks(
        self,
        task_ids: list[str],
        sprint_id: str | None = None,
    ) -> list[SprintTask]:
        """Reorder tasks by updating their positions.

        Args:
            task_ids: List of task IDs in the desired order.
            sprint_id: Optional sprint ID to filter tasks.

        Returns:
            List of updated tasks.
        """
        updated_tasks = []

        for index, task_id in enumerate(task_ids):
            stmt = select(SprintTask).where(SprintTask.id == task_id)
            if sprint_id:
                stmt = stmt.where(SprintTask.sprint_id == sprint_id)
            stmt = stmt.options(selectinload(SprintTask.assignee))

            result = await self.db.execute(stmt)
            task = result.scalar_one_or_none()

            if task:
                task.position = index
                await self.db.flush()
                await self.db.refresh(task)
                updated_tasks.append(task)

        return updated_tasks
