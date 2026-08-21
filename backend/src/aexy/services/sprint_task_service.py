"""Sprint task service for managing tasks within sprints."""

import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.sprint import (
    Sprint,
    SprintTask,
    TaskActivity,
    TaskAssignee,
    TaskAttachment,
    WorkspaceTaskStatus,
)
from aexy.services.task_sources.base import TaskItem, TaskSourceConfig, TaskStatus
from aexy.services.task_sources.github_issues import GitHubIssuesSource
from aexy.services.task_sources.jira import JiraSource
from aexy.services.task_sources.linear import LinearSource
from aexy.services.automation_service import dispatch_automation_event
from aexy.services.activity_logger import log_activity
from aexy.services.notification_service import (
    extract_mentioned_user_ids,
    notify_mention,
    notify_work_item_assigned,
    notify_work_item_commented,
    notify_work_item_status_changed,
    notify_work_item_unassigned,
    _get_text_snippet,
)
from aexy.services.github_task_sync_service import GitHubTaskSyncService


logger = logging.getLogger(__name__)

# Interchangeable spellings of the same status. The seeded status row for the
# review state is ``in_review``, but the legacy ``SprintTask.status`` values and
# the shared UI status map say ``review``. Whichever a caller sends, we store the
# one the task's own board actually has a column for — see
# ``canonical_status_slug``.
_STATUS_ALIASES: dict[str, tuple[str, ...]] = {
    "review": ("in_review",),
    "in_review": ("review",),
}


def _as_utc(value: datetime | None) -> datetime | None:
    """Treat a naive timestamp as UTC.

    Every timestamp here is stored in a `DateTime(timezone=True)` column, but a
    driver may still hand one back without a tzinfo — SQLite has no timezone
    type, so it always does. Subtracting that from an aware `now()` raises, which
    made completing a task blow up on any non-Postgres connection: the cycle- and
    lead-time arithmetic below is on the done path.
    """
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _assigned_to(developer_id: str):
    """Tasks where this developer is the primary *or* a collaborator.

    Every assignee filter goes through this. Matching only
    ``SprintTask.assignee_id`` would answer "nothing assigned to them" for
    someone genuinely working on a task as a collaborator, which is a worse
    failure than having no filter at all.
    """
    return or_(
        SprintTask.assignee_id == developer_id,
        SprintTask.id.in_(
            select(TaskAssignee.task_id).where(
                TaskAssignee.developer_id == developer_id
            )
        ),
    )


def _assigned_to_any(developer_ids: list[str]):
    """Multi-developer form of :func:`_assigned_to`."""
    return or_(
        SprintTask.assignee_id.in_(developer_ids),
        SprintTask.id.in_(
            select(TaskAssignee.task_id).where(
                TaskAssignee.developer_id.in_(developer_ids)
            )
        ),
    )


class TaskValidationError(Exception):
    """Raised when task-create/update inputs reference invalid relationships
    (sprint outside project, status from a sibling project, project without
    a team, …). Carries a stable ``code`` the API layer maps to a 400 detail
    so the frontend can branch on the code without parsing prose.
    """

    def __init__(self, code: str, message: str | None = None) -> None:
        self.code = code
        super().__init__(message or code)


def _stringify_field(value: object) -> str | None:
    """Render a field value into TaskActivity.old_value / new_value text.

    Returns None for None inputs so the History tab can render "—" or "none"
    consistently instead of the literal string "None".
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return ", ".join(str(v) for v in value)
    return str(value)


def _move_breadcrumb(other_task: SprintTask, *, kind: str) -> tuple[str, dict]:
    """Build a one-line "Moved from/to <KEY> — <title>" breadcrumb.

    Returns (plain_text, prosemirror_paragraph_node). The text form is
    prefixed to the receiving task's ``description``; the node is
    prepended to its ``description_json`` so every surface that already
    renders descriptions also shows the breadcrumb without any extra UI.
    """
    verb = "Moved from" if kind == "from" else "Moved to"
    text = f"{verb} {other_task.task_key} — {other_task.title}"
    url = f"/sprints/{other_task.team_id}/board?task={other_task.id}"
    node = {
        "type": "paragraph",
        "content": [
            {
                "type": "text",
                "marks": [
                    {
                        "type": "link",
                        "attrs": {
                            "href": url,
                            "target": "_blank",
                            "rel": "noopener noreferrer",
                        },
                    }
                ],
                "text": text,
            }
        ],
    }
    return text, node


def _prepend_node_to_doc(doc: dict | None, node: dict) -> dict:
    """Return a ProseMirror doc with ``node`` inserted at the top."""
    if not doc or not isinstance(doc, dict) or "content" not in doc:
        return {"type": "doc", "content": [node]}
    return {**doc, "content": [node, *list(doc.get("content") or [])]}


def _prefix_description(existing: str | None, prefix: str) -> str:
    if not existing:
        return prefix
    return f"{prefix}\n\n{existing}"


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
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        estimated_hours: float | None = None,
        actor_id: str | None = None,
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
            start_date=start_date,
            end_date=end_date,
            estimated_hours=estimated_hours,
        )
        self.db.add(task)
        await self.db.flush()
        # A task created already assigned needs its primary row, or it would
        # show an assignee in the column and an empty assignee list.
        if task.assignee_id:
            await self.sync_assignee_rows_from_column(task, actor_id=actor_id)
        await GitHubTaskSyncService(self.db).auto_link_issue_references(task)

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
                actor_id=actor_id,
                title=f"Created task '{title}'",
                metadata={"sprint_id": sprint_id, "source_type": source_type},
            )

        # Per-task activity row so the History tab shows who created the task.
        await self.log_activity(
            task_id=str(created_task.id),
            action="created",
            actor_id=actor_id,
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

        # A task created straight onto somebody is the most common way work is
        # handed over — planning a sprint assigns as it goes, so this path
        # matters at least as much as the dedicated /assign endpoint.
        if created_task.assignee_id:
            await notify_work_item_assigned(
                db=self.db,
                recipient_ids=[str(created_task.assignee_id)],
                actor_id=actor_id,
                actor_name=await self._actor_name(actor_id),
                item_label=self._item_label(created_task),
                item_title=created_task.title,
                action_url=await self._task_action_url(created_task),
                workspace_id=workspace_id,
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
            stmt = stmt.where(_assigned_to(assignee_id))

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
        archived_only: bool = False,
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

        if archived_only:
            stmt = stmt.where(SprintTask.is_archived.is_(True))
        elif not include_archived:
            stmt = stmt.where(SprintTask.is_archived.is_(False))
        if status:
            stmt = stmt.where(SprintTask.status.in_(status))
        if status_id:
            stmt = stmt.where(SprintTask.status_id.in_(status_id))
        if assignee_ids:
            stmt = stmt.where(_assigned_to_any(assignee_ids))
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
        limit: int | None = None,
        workspace_id: str | None = None,
    ) -> list[SprintTask]:
        """Get all tasks assigned to a developer across all sprints.

        Args:
            assignee_id: Developer ID.
            status: Optional status filter.
            include_done: Whether to include completed tasks (default: False).
            limit: Optional cap on the number of tasks returned.
            workspace_id: Optional workspace to scope to. Tasks predating the
                ``workspace_id`` column carry it as NULL, so those are matched
                through their sprint instead — dropping them would silently hide
                somebody's older work from their own list.

        Returns:
            List of SprintTasks assigned to the developer.
        """
        stmt = (
            select(SprintTask)
            .where(_assigned_to(assignee_id))
            .where(SprintTask.is_archived == False)
            .options(
                selectinload(SprintTask.assignee),
                selectinload(SprintTask.subtasks),
                selectinload(SprintTask.sprint),
            )
        )

        if workspace_id:
            stmt = stmt.where(
                or_(
                    SprintTask.workspace_id == workspace_id,
                    SprintTask.sprint.has(Sprint.workspace_id == workspace_id),
                )
            )

        if status:
            stmt = stmt.where(SprintTask.status == status)
        elif not include_done:
            # Exclude completed tasks by default
            stmt = stmt.where(SprintTask.status != "done")

        stmt = stmt.order_by(SprintTask.priority.desc(), SprintTask.created_at.desc())
        if limit is not None:
            stmt = stmt.limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_task(
        self,
        task_id: str,
        title: str | None = None,
        description: str | None = None,
        description_json: dict | None = ...,  # Sentinel: distinct from explicit None
        story_points: int | None = None,
        priority: str | None = None,
        status: str | None = None,
        labels: list[str] | None = None,
        epic_id: str | None = ...,  # Use sentinel to distinguish from None
        assignee_id: str | None = ...,  # Use sentinel to distinguish from None
        contributes_to_goal: bool | None = None,
        start_date: datetime | None = ...,  # Sentinel: explicit None clears the date
        end_date: datetime | None = ...,
        estimated_hours: float | None = ...,
        actor_id: str | None = None,
    ) -> SprintTask | None:
        """Update task details."""
        task = await self.get_task(task_id)
        if not task:
            return None

        # Snapshot the fields we want to log before mutation, so each field that
        # actually changes produces a per-task activity row attributed to the
        # acting user. Without this, the History tab can't show "X changed
        # priority from medium to high" — only the assignment edge case was
        # logged before.
        field_changes: list[tuple[str, str, object, object]] = []

        def _record(action: str, field: str, old: object, new: object) -> None:
            if old != new:
                field_changes.append((action, field, old, new))

        if title is not None:
            _record("title_changed", "title", task.title, title)
            task.title = title
        if description is not None:
            _record("description_changed", "description", task.description, description)
            task.description = description
        if description_json is not ...:
            # Rich-text representation of description; not activity-logged
            # because `description_changed` already covers the change event.
            task.description_json = description_json
        if story_points is not None:
            _record("points_changed", "story_points", task.story_points, story_points)
            task.story_points = story_points
        if priority is not None:
            _record("priority_changed", "priority", task.priority, priority)
            task.priority = priority
        # Kept outside the `if status` block below so the notification at the end
        # of this method can see whether the status actually moved.
        prior_status: str | None = None
        if status is not None:
            # Store the spelling this task's board renders, so the card can't
            # end up in a bucket no column reads.
            status = await self.canonical_status_slug(task, status)
            old_status = task.status
            if old_status != status:
                prior_status = old_status
            _record("status_changed", "status", old_status, status)
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
                    task.cycle_time_hours = (now - _as_utc(task.work_started_at)).total_seconds() / 3600
                task.lead_time_hours = (now - _as_utc(task.created_at)).total_seconds() / 3600
                await self._resolve_linked_ticket_if_done(
                    task, status, old_status, actor_id
                )
        if labels is not None:
            _record("labels_changed", "labels", task.labels or [], labels)
            task.labels = labels
        if epic_id is not ...:  # Only update if explicitly passed (including None)
            _record("epic_changed", "epic_id", task.epic_id, epic_id)
            task.epic_id = epic_id

        prior_assignee_id: str | None = None
        assignee_changed = False
        if assignee_id is not ...:  # Only update if explicitly passed (including None)
            prior_assignee_id = task.assignee_id
            assignee_changed = prior_assignee_id != assignee_id
            task.assignee_id = assignee_id
        if contributes_to_goal is not None:
            task.contributes_to_goal = contributes_to_goal
        if start_date is not ...:
            _record("start_date_changed", "start_date", task.start_date, start_date)
            task.start_date = start_date
        if end_date is not ...:
            _record("end_date_changed", "end_date", task.end_date, end_date)
            task.end_date = end_date
        if estimated_hours is not ...:
            _record("estimated_hours_changed", "estimated_hours", task.estimated_hours, estimated_hours)
            task.estimated_hours = estimated_hours

        await self.db.flush()
        await GitHubTaskSyncService(self.db).auto_link_issue_references(task)

        # Persist a per-task activity row for every field that actually changed.
        # Description is intentionally not stringified into old/new — it's often
        # large rich text — only that it changed is recorded.
        for action, field, old_v, new_v in field_changes:
            log_old = None if action == "description_changed" else _stringify_field(old_v)
            log_new = None if action == "description_changed" else _stringify_field(new_v)
            await self.log_activity(
                task_id=task_id,
                action=action,
                actor_id=actor_id,
                field_name=field,
                old_value=log_old,
                new_value=log_new,
            )

        # Log assignment change made via the generic update path so the
        # assignment history shows the full chain even when reassignment
        # is performed through PATCH /sprint-tasks/{id} rather than the
        # dedicated /assign endpoint.
        if assignee_changed:
            # `assignee_id` was written directly above, so the join table is now
            # stale. Reconcile it here rather than at each of the many callers
            # that can reach this path — otherwise the primary badge and the
            # column disagree, and the assignee list silently omits whoever was
            # just assigned.
            await self.sync_assignee_rows_from_column(task, actor_id=actor_id)

            # Per-task activity stream (rendered by the History tab).
            await self.log_activity(
                task_id=task_id,
                action="assigned" if assignee_id else "unassigned",
                actor_id=actor_id,
                field_name="assignee_id",
                old_value=prior_assignee_id,
                new_value=assignee_id,
                metadata={
                    "from_assignee_id": prior_assignee_id,
                    "to_assignee_id": assignee_id,
                },
            )
            # Workspace-wide unified activity feed.
            if task.workspace_id:
                await log_activity(
                    self.db,
                    workspace_id=str(task.workspace_id),
                    entity_type="task",
                    entity_id=str(task.id),
                    activity_type="assigned" if assignee_id else "unassigned",
                    actor_id=actor_id,
                    title=(
                        f"Assigned task '{task.title}'"
                        if assignee_id
                        else f"Unassigned task '{task.title}'"
                    ),
                    changes={"assignee_id": {"old": prior_assignee_id, "new": assignee_id}},
                    metadata={
                        "from_assignee_id": prior_assignee_id,
                        "to_assignee_id": assignee_id,
                    },
                )

        # Re-fetch with relationships loaded (assignee may have changed).
        # `assignees` may have just been reconciled above, so reload it rather
        # than returning the collection this instance loaded earlier.
        refreshed = await self._reload_with_assignees(task_id)

        # Dispatch task.assigned automation trigger so PATCH-based reassignments
        # fire automations the same way the dedicated /assign endpoint does.
        # Mirrors the dispatch in `assign_task` — keep these in sync.
        if (
            assignee_changed
            and assignee_id
            and refreshed
            and refreshed.workspace_id
        ):
            await dispatch_automation_event(
                db=self.db,
                workspace_id=refreshed.workspace_id,
                module="sprints",
                trigger_type="task.assigned",
                entity_id=refreshed.id,
                trigger_data={
                    "task_id": refreshed.id,
                    "task_title": refreshed.title,
                    "sprint_id": refreshed.sprint_id,
                    "assignee_id": assignee_id,
                    "assignee_email": refreshed.assignee.email if refreshed.assignee else None,
                    "status": refreshed.status,
                    "workspace_id": refreshed.workspace_id,
                },
            )

        # Notify last, once every mutation and reconciliation above has happened.
        # This is the PATCH path, so a single call can both reassign and move the
        # card; both notifications are warranted, and each is addressed to a
        # different set of people.
        if refreshed and assignee_changed:
            actor_name = await self._actor_name(actor_id)
            if assignee_id:
                await notify_work_item_assigned(
                    db=self.db,
                    recipient_ids=[assignee_id],
                    actor_id=actor_id,
                    actor_name=actor_name,
                    item_label=self._item_label(refreshed),
                    item_title=refreshed.title,
                    action_url=await self._task_action_url(refreshed),
                    workspace_id=refreshed.workspace_id,
                )
            if prior_assignee_id:
                await notify_work_item_unassigned(
                    db=self.db,
                    recipient_ids=[prior_assignee_id],
                    actor_id=actor_id,
                    actor_name=actor_name,
                    item_label=self._item_label(refreshed),
                    item_title=refreshed.title,
                    action_url=await self._task_action_url(refreshed),
                    workspace_id=refreshed.workspace_id,
                )

        if refreshed and prior_status is not None:
            await notify_work_item_status_changed(
                db=self.db,
                recipient_ids=await self._interested_party_ids(task_id),
                actor_id=actor_id,
                actor_name=await self._actor_name(actor_id),
                item_title=refreshed.title,
                old_status=prior_status,
                new_status=refreshed.status,
                action_url=await self._task_action_url(refreshed),
                workspace_id=refreshed.workspace_id,
            )

        return refreshed

    async def remove_task(self, task_id: str, actor_id: str | None = None) -> bool:
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
                actor_id=actor_id,
                title=f"Removed task '{task.title}'",
            )
        # History tab event so the timeline shows the archive action.
        await self.log_activity(
            task_id=task_id,
            action="archived",
            actor_id=actor_id,
        )

        task.is_archived = True
        await self.db.flush()
        return True

    async def archive_task(
        self, task_id: str, actor_id: str | None = None
    ) -> SprintTask | None:
        """Archive a task (soft delete)."""
        task = await self.get_task(task_id)
        if not task:
            return None

        task.is_archived = True
        await self.db.flush()
        await self.log_activity(
            task_id=task_id,
            action="archived",
            actor_id=actor_id,
        )
        return await self.get_task(task_id)

    async def unarchive_task(
        self, task_id: str, actor_id: str | None = None
    ) -> SprintTask | None:
        """Unarchive a task (restore from soft delete)."""
        task = await self.get_task(task_id)
        if not task:
            return None

        task.is_archived = False
        await self.db.flush()
        await self.log_activity(
            task_id=task_id,
            action="unarchived",
            actor_id=actor_id,
        )
        return await self.get_task(task_id)

    # Assignment
    async def assign_task(
        self,
        task_id: str,
        developer_id: str,
        reason: str | None = None,
        confidence: float | None = None,
        actor_id: str | None = None,
    ) -> SprintTask | None:
        """Assign a task to a developer.

        Args:
            task_id: Task ID.
            developer_id: Developer ID to assign.
            reason: Optional reason for assignment (e.g., AI explanation).
            confidence: Optional confidence score (0-1).
            actor_id: Developer performing the assignment (for history).

        Returns:
            Updated SprintTask.
        """
        task = await self.get_task(task_id)
        if not task:
            return None

        prior_assignee_id = task.assignee_id
        task.assignee_id = developer_id
        task.assignment_reason = reason
        task.assignment_confidence = confidence

        await self.db.flush()
        # Keep the assignee rows in step with the column. The previous primary
        # stays on as a collaborator — reassigning rarely means the last person
        # is no longer involved.
        await self.sync_assignee_rows_from_column(task, actor_id=actor_id)

        # Re-fetch with relationships loaded, `assignees` included — the rows
        # just changed and the identity-mapped instance still holds the old
        # collection.
        updated_task = await self._reload_with_assignees(task_id)

        # Per-task activity stream consumed by the History tab.
        await self.log_activity(
            task_id=task_id,
            action="assigned",
            actor_id=actor_id,
            field_name="assignee_id",
            old_value=prior_assignee_id,
            new_value=developer_id,
            metadata={
                "assignment_reason": reason,
                "from_assignee_id": prior_assignee_id,
                "to_assignee_id": developer_id,
            },
        )

        # Log unified activity for assignment — capture both old and new
        # assignee in metadata so the history UI can render the full chain.
        if updated_task and updated_task.workspace_id:
            await log_activity(
                self.db,
                workspace_id=updated_task.workspace_id,
                entity_type="task",
                entity_id=str(updated_task.id),
                activity_type="assigned",
                actor_id=actor_id,
                title=f"Assigned task '{updated_task.title}'",
                changes={"assignee_id": {"old": prior_assignee_id, "new": developer_id}},
                metadata={
                    "assignment_reason": reason,
                    "from_assignee_id": prior_assignee_id,
                    "to_assignee_id": developer_id,
                },
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

        # Tell the new owner. Last, and after every mutation above, so a failure
        # here cannot leave the assignment half-applied — and skipped entirely
        # when the assignee did not actually change, because re-saving a card
        # with the same owner is not news.
        if updated_task and str(developer_id) != str(prior_assignee_id or ""):
            await notify_work_item_assigned(
                db=self.db,
                recipient_ids=[developer_id],
                actor_id=actor_id,
                actor_name=await self._actor_name(actor_id),
                item_label=self._item_label(updated_task),
                item_title=updated_task.title,
                action_url=await self._task_action_url(updated_task),
                workspace_id=updated_task.workspace_id,
            )

        return updated_task

    async def unassign_task(
        self, task_id: str, actor_id: str | None = None
    ) -> SprintTask | None:
        """Remove assignment from a task."""
        task = await self.get_task(task_id)
        if not task:
            return None

        prior_assignee_id = task.assignee_id
        task.assignee_id = None
        task.assignment_reason = None
        task.assignment_confidence = None

        await self.db.flush()
        # Takes the owner off the task, exactly as this endpoint always did.
        # Deliberately-added collaborators stay; `set_assignees(task_id, [])`
        # clears the task entirely.
        await self.sync_assignee_rows_from_column(task, actor_id=actor_id)

        if prior_assignee_id:
            await self.log_activity(
                task_id=task_id,
                action="unassigned",
                actor_id=actor_id,
                field_name="assignee_id",
                old_value=prior_assignee_id,
                new_value=None,
                metadata={
                    "from_assignee_id": prior_assignee_id,
                    "to_assignee_id": None,
                },
            )
            if task.workspace_id:
                await log_activity(
                    self.db,
                    workspace_id=str(task.workspace_id),
                    entity_type="task",
                    entity_id=str(task.id),
                    activity_type="unassigned",
                    actor_id=actor_id,
                    title=f"Unassigned task '{task.title}'",
                    changes={"assignee_id": {"old": prior_assignee_id, "new": None}},
                    metadata={
                        "from_assignee_id": prior_assignee_id,
                        "to_assignee_id": None,
                    },
                )
            await notify_work_item_unassigned(
                db=self.db,
                recipient_ids=[prior_assignee_id],
                actor_id=actor_id,
                actor_name=await self._actor_name(actor_id),
                item_label=self._item_label(task),
                item_title=task.title,
                action_url=await self._task_action_url(task),
                workspace_id=task.workspace_id,
            )

        # Re-fetch with relationships loaded
        return await self._reload_with_assignees(task_id)

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
        actor_id: str | None = None,
    ) -> list[SprintTask]:
        """Bulk update status for multiple tasks."""
        updated_tasks = []

        for task_id in task_ids:
            task = await self.update_task_status(task_id, new_status, actor_id=actor_id)
            if task:
                updated_tasks.append(task)

        return updated_tasks

    async def bulk_move_to_sprint(
        self,
        task_ids: list[str],
        target_sprint_id: str,
        actor_id: str | None = None,
    ) -> list[SprintTask]:
        """Bulk move tasks to another sprint.

        Args:
            task_ids: List of task IDs to move.
            target_sprint_id: Target sprint ID.
            actor_id: Developer performing the move (for History attribution).

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
                prior_sprint_id = str(task.sprint_id) if task.sprint_id else None
                task.sprint_id = target_sprint_id
                task.workspace_id = target_sprint.workspace_id
                await self.db.flush()
                # History tab event so sprint moves show up alongside other
                # task activity. The renderer uses sprint_changed.
                if prior_sprint_id != target_sprint_id:
                    await self.log_activity(
                        task_id=task_id,
                        action="sprint_changed",
                        actor_id=actor_id,
                        field_name="sprint_id",
                        old_value=prior_sprint_id,
                        new_value=target_sprint_id,
                    )
                updated_task = await self.get_task(task_id)
                if updated_task:
                    updated_tasks.append(updated_task)

        return updated_tasks

    # ---- Cross-project move (fork + link) ----
    #
    # "Move" here is fork-and-link, not a row update. A new SprintTask is
    # created in the target project, linked back to the source via a
    # `task_dependencies` row with `dependency_type="duplicates"`, and the
    # source is either archived or marked done — caller's choice. See
    # `move_to_project` for the full contract.

    async def _resolve_open_status_slug(
        self,
        workspace_id: str,
        project_id: str,
    ) -> str:
        """First active status whose category has semantics='open' in this
        project's scope (or workspace fallback). Falls back to canonical
        "todo" if the workspace has no categories table yet."""
        from aexy.models.sprint import WorkspaceStatusCategory

        cat_stmt = (
            select(WorkspaceStatusCategory.slug)
            .where(WorkspaceStatusCategory.workspace_id == workspace_id)
            .where(WorkspaceStatusCategory.semantics == "open")
        )
        cat_slugs = [row[0] for row in (await self.db.execute(cat_stmt)).all()]
        if not cat_slugs:
            return "todo"

        scope = or_(
            WorkspaceTaskStatus.project_id.is_(None),
            WorkspaceTaskStatus.project_id == project_id,
        )
        stmt = (
            select(WorkspaceTaskStatus.slug)
            .where(WorkspaceTaskStatus.workspace_id == workspace_id)
            .where(WorkspaceTaskStatus.is_active.is_(True))
            .where(WorkspaceTaskStatus.category.in_(cat_slugs))
            .where(scope)
            .order_by(
                # Prefer project-scoped rows over workspace defaults so the
                # project's customized open column wins.
                WorkspaceTaskStatus.project_id.is_(None),
                WorkspaceTaskStatus.position,
            )
            .limit(1)
        )
        row = (await self.db.execute(stmt)).first()
        return row[0] if row else "todo"

    async def _resolve_done_status_slug(
        self,
        workspace_id: str,
        project_id: str,
    ) -> str:
        """Mirror of `_resolve_open_status_slug` but for `semantics='done'`."""
        from aexy.models.sprint import WorkspaceStatusCategory

        cat_stmt = (
            select(WorkspaceStatusCategory.slug)
            .where(WorkspaceStatusCategory.workspace_id == workspace_id)
            .where(WorkspaceStatusCategory.semantics == "done")
        )
        cat_slugs = [row[0] for row in (await self.db.execute(cat_stmt)).all()]
        if not cat_slugs:
            return "done"

        scope = or_(
            WorkspaceTaskStatus.project_id.is_(None),
            WorkspaceTaskStatus.project_id == project_id,
        )
        stmt = (
            select(WorkspaceTaskStatus.slug)
            .where(WorkspaceTaskStatus.workspace_id == workspace_id)
            .where(WorkspaceTaskStatus.is_active.is_(True))
            .where(WorkspaceTaskStatus.category.in_(cat_slugs))
            .where(scope)
            .order_by(
                WorkspaceTaskStatus.project_id.is_(None),
                WorkspaceTaskStatus.position,
            )
            .limit(1)
        )
        row = (await self.db.execute(stmt)).first()
        return row[0] if row else "done"

    async def _is_project_member(
        self, project_id: str, developer_id: str
    ) -> bool:
        from aexy.models.project import ProjectMember

        stmt = (
            select(ProjectMember.id)
            .where(ProjectMember.project_id == project_id)
            .where(ProjectMember.developer_id == developer_id)
            .limit(1)
        )
        return (await self.db.execute(stmt)).first() is not None

    async def _clone_task_to_project(
        self,
        *,
        source: SprintTask,
        target_project_id: str,
        new_parent_id: str | None,
        actor_id: str | None,
        override_status_slug: str | None = None,
    ) -> SprintTask:
        """Create a new task in the target project copying the carry-over
        fields from `source`. Used by `move_to_project` for the parent task
        and (under `cascade`) recursively for each subtask.

        Fields explicitly NOT copied — see plan for rationale:
        - source_type/source_id/source_url (new task is fresh; the link is
          via task_dependencies)
        - started_at/completed_at, cycle_time_hours, lead_time_hours
        - epic_id/story_id (project-scoped, won't resolve in target)
        - sprint_id, carried_over_from_sprint_id (no target sprint)
        - parent_task_id — caller passes `new_parent_id` explicitly so the
          cascade case can wire the new subtree
        - attachments, comments — left on the source for history
        """
        assignee_id: str | None = None
        if source.assignee_id and await self._is_project_member(
            target_project_id, str(source.assignee_id)
        ):
            assignee_id = str(source.assignee_id)

        if override_status_slug:
            open_slug = override_status_slug
        else:
            open_slug = await self._resolve_open_status_slug(
                str(source.workspace_id), target_project_id
            )

        # Prepend a "Moved from <SOURCE-KEY>" breadcrumb so the new task
        # records its origin inline. Visible in every surface that already
        # renders the description — list previews, detail modal, mobile.
        breadcrumb_text, breadcrumb_node = _move_breadcrumb(source, kind="from")
        new_description = _prefix_description(source.description, breadcrumb_text)
        new_description_json = _prepend_node_to_doc(
            source.description_json, breadcrumb_node
        )

        new_task = SprintTask(
            id=str(uuid4()),
            workspace_id=source.workspace_id,
            team_id=target_project_id,
            sprint_id=None,
            source_type="manual",
            source_id=str(uuid4()),
            title=source.title,
            description=new_description,
            description_json=new_description_json,
            story_points=source.story_points,
            priority=source.priority,
            labels=list(source.labels or []),
            assignee_id=assignee_id,
            status=open_slug,
            custom_fields=dict(source.custom_fields or {}),
            task_type=source.task_type,
            start_date=source.start_date,
            end_date=source.end_date,
            estimated_hours=source.estimated_hours,
            parent_task_id=new_parent_id,
        )
        self.db.add(new_task)
        await self.db.flush()

        # Link back to source via task_dependencies. The convention used by
        # the rest of the codebase: `blocking_task_id` is the upstream task
        # (the original), `dependent_task_id` is the downstream (the new
        # task). With `dependency_type="duplicates"` this reads as
        # "new task duplicates source".
        from aexy.models.dependency import TaskDependency

        link = TaskDependency(
            id=str(uuid4()),
            workspace_id=source.workspace_id,
            dependent_task_id=new_task.id,
            blocking_task_id=source.id,
            dependency_type="duplicates",
            created_by_id=actor_id,
        )
        self.db.add(link)
        await self.db.flush()

        await self.log_activity(
            task_id=new_task.id,
            action="created_from_move",
            actor_id=actor_id,
            metadata={
                "source_task_id": str(source.id),
                "source_task_key": source.task_key,
                "source_project_id": str(source.team_id) if source.team_id else None,
            },
        )
        return new_task

    async def move_to_project(
        self,
        *,
        task_id: str,
        target_project_id: str,
        source_action: str,
        subtask_strategy: str = "block",
        actor_id: str | None = None,
        target_status_slug: str | None = None,
    ) -> SprintTask:
        """Fork a task into another project in the same workspace.

        Returns the newly created task. The source task is either archived
        or marked done depending on `source_action`. See the plan file
        `mutable-herding-flute.md` for full semantics.
        """
        if source_action not in ("archive", "mark_done"):
            raise TaskValidationError("invalid_source_action")
        if subtask_strategy not in ("block", "cascade", "orphan"):
            raise TaskValidationError("invalid_subtask_strategy")

        source = await self.get_task(task_id)
        if not source:
            raise TaskValidationError("source_task_not_found")
        if source.is_archived:
            raise TaskValidationError("task_already_archived")
        if str(source.team_id) == str(target_project_id):
            raise TaskValidationError("same_project_move")

        from aexy.models.project import Project

        target_stmt = select(Project).where(Project.id == target_project_id)
        target = (await self.db.execute(target_stmt)).scalar_one_or_none()
        if not target:
            raise TaskValidationError("target_project_not_found")
        if str(target.workspace_id) != str(source.workspace_id):
            raise TaskValidationError("cross_workspace_move")

        if target_status_slug is not None:
            from aexy.services.task_config_service import TaskConfigService

            target_statuses = await TaskConfigService(
                self.db
            ).get_statuses_for_project(
                str(source.workspace_id), target_project_id
            )
            if not any(s.slug == target_status_slug for s in target_statuses):
                raise TaskValidationError("invalid_target_status")

        # Detect live subtasks (one level — recursion deeper is deferred).
        sub_stmt = (
            select(SprintTask)
            .where(SprintTask.parent_task_id == source.id)
            .where(SprintTask.is_archived.is_(False))
        )
        subtasks = list((await self.db.execute(sub_stmt)).scalars().all())

        if subtasks and subtask_strategy == "block":
            raise TaskValidationError("task_has_subtasks")

        new_parent = await self._clone_task_to_project(
            source=source,
            target_project_id=target_project_id,
            new_parent_id=None,
            actor_id=actor_id,
            override_status_slug=target_status_slug,
        )

        if subtasks and subtask_strategy == "cascade":
            for sub in subtasks:
                # Recurse one level. Subtasks themselves having subtasks is
                # already an edge case in this codebase; we treat any
                # grand-children as orphans on the source side.
                new_sub = await self._clone_task_to_project(
                    source=sub,
                    target_project_id=target_project_id,
                    new_parent_id=new_parent.id,
                    actor_id=actor_id,
                )
                # Each source subtask gets its own "Moved to" pointer at
                # the corresponding clone — the parent breadcrumb alone
                # wouldn't reach them.
                sub_text, sub_node = _move_breadcrumb(new_sub, kind="to")
                sub.description = _prefix_description(sub.description, sub_text)
                sub.description_json = _prepend_node_to_doc(
                    sub.description_json, sub_node
                )
                sub.is_archived = True
        # `orphan` strategy leaves subtasks alone — parent_task_id still
        # points to the now-archived/done source. The UI surfaces this as
        # "parent archived" but the data stays consistent.

        # Prepend "Moved to <NEW-KEY>" on the source. Runs whether the
        # action is archive or mark_done — both close the source, and the
        # breadcrumb makes the close cause obvious to anyone who later
        # opens it.
        src_text, src_node = _move_breadcrumb(new_parent, kind="to")
        source.description = _prefix_description(source.description, src_text)
        source.description_json = _prepend_node_to_doc(
            source.description_json, src_node
        )

        if source_action == "archive":
            source.is_archived = True
        else:  # mark_done
            done_slug = await self._resolve_done_status_slug(
                str(source.workspace_id), str(source.team_id)
            )
            source.status = done_slug
            if source.completed_at is None:
                source.completed_at = datetime.now(timezone.utc)

        await self.log_activity(
            task_id=source.id,
            action="moved_to_project",
            actor_id=actor_id,
            field_name="project",
            old_value=str(source.team_id) if source.team_id else None,
            new_value=str(target_project_id),
            metadata={
                "new_task_id": str(new_parent.id),
                "new_task_key": new_parent.task_key,
                "source_action": source_action,
                "subtask_strategy": subtask_strategy,
                "subtask_count": len(subtasks),
            },
        )

        # A ticket raised from the source task pointed at a task that is now
        # archived (or done) on a board it has left. Re-point it and hand the
        # ticket to whoever owns the new board — moving the card onto the Tech
        # board is how work actually gets handed to Tech.
        #
        # Failure here must not undo the move: the task has already been forked
        # and the source closed, and a half-applied move is worse than a ticket
        # that needs nudging by hand.
        try:
            from aexy.services.service_desk_ticket_service import (
                ServiceDeskTicketService,
            )

            await ServiceDeskTicketService(self.db).follow_linked_task_to_board(
                workspace_id=str(source.workspace_id),
                old_task_id=str(source.id),
                new_task_id=str(new_parent.id),
                board_id=str(target_project_id),
                actor_id=actor_id,
            )
        except Exception:
            logger.exception(
                "Task %s moved to project %s but its linked ticket did not follow",
                source.id,
                target_project_id,
            )

        await self.db.flush()
        # Re-fetch so relationships are populated for the API response.
        fresh = await self.get_task(new_parent.id)
        return fresh or new_parent

    async def bulk_move_to_project(
        self,
        *,
        task_ids: list[str],
        target_project_id: str,
        source_action: str,
        subtask_strategy: str = "block",
        actor_id: str | None = None,
        target_status_slug: str | None = None,
    ) -> list[dict]:
        """Per-task move; never aborts the whole batch on one failure.

        Returns a list of result dicts shaped:
            {"task_id": ..., "status": "moved" | "skipped",
             "new_task_id": ..., "error_code": ...}
        Mirrors the lenient pattern in `bulk_move_to_sprint` — a partial
        batch is more useful to the operator than an all-or-nothing rollback
        when half the tasks have subtasks and the rest don't.
        """
        results: list[dict] = []
        for tid in task_ids:
            try:
                new_task = await self.move_to_project(
                    task_id=tid,
                    target_project_id=target_project_id,
                    source_action=source_action,
                    subtask_strategy=subtask_strategy,
                    actor_id=actor_id,
                    target_status_slug=target_status_slug,
                )
                results.append({
                    "task_id": tid,
                    "status": "moved",
                    "new_task_id": str(new_task.id),
                    "error_code": None,
                })
            except TaskValidationError as exc:
                # Roll back any partial mutations from this task so the next
                # iteration starts clean. `db.flush` has already pushed
                # earlier successes; we only need a savepoint-style guard
                # if a future failure mid-create leaves dangling rows. For
                # now `move_to_project` validates up-front before any write,
                # so a thrown error means nothing has been persisted for
                # *this* task.
                results.append({
                    "task_id": tid,
                    "status": "skipped",
                    "new_task_id": None,
                    "error_code": exc.code,
                })
        return results

    async def validate_status_slug(self, task: SprintTask, slug: str) -> None:
        """Reject a status update whose slug isn't defined for the task's scope.

        Status slugs live in ``workspace_task_statuses`` and may be either
        workspace-default (project_id IS NULL) or project-scoped. A task's
        valid slug set is the union: project rows for its project, plus
        workspace defaults as a fallback. Anything else is rejected with
        ``unknown_status`` so the operator gets a stable error code.
        """
        # The canonical seed slugs are accepted unconditionally so we don't
        # break workspaces that pre-date the status table (and whose tasks
        # carry a slug but no matching row yet).
        if slug in ("backlog", "todo", "in_progress", "review", "done"):
            return
        if not task.workspace_id:
            return  # Pre-table data — nothing to validate against.

        scope = (
            or_(
                WorkspaceTaskStatus.project_id.is_(None),
                WorkspaceTaskStatus.project_id == task.team_id,
            )
            if task.team_id
            else WorkspaceTaskStatus.project_id.is_(None)
        )
        stmt = (
            select(WorkspaceTaskStatus.id)
            .where(WorkspaceTaskStatus.workspace_id == task.workspace_id)
            .where(WorkspaceTaskStatus.slug == slug)
            .where(WorkspaceTaskStatus.is_active.is_(True))
            .where(scope)
        )
        if (await self.db.execute(stmt)).first() is None:
            raise TaskValidationError("unknown_status")

    async def _slugs_in_scope(self, task: SprintTask) -> set[str]:
        """Active status slugs valid for this task: project rows + workspace defaults."""
        if not task.workspace_id:
            return set()
        scope = (
            or_(
                WorkspaceTaskStatus.project_id.is_(None),
                WorkspaceTaskStatus.project_id == task.team_id,
            )
            if task.team_id
            else WorkspaceTaskStatus.project_id.is_(None)
        )
        rows = (
            await self.db.execute(
                select(WorkspaceTaskStatus.slug)
                .where(WorkspaceTaskStatus.workspace_id == task.workspace_id)
                .where(WorkspaceTaskStatus.is_active.is_(True))
                .where(scope)
            )
        ).scalars().all()
        return set(rows)

    async def canonical_status_slug(self, task: SprintTask, slug: str) -> str:
        """Validate a status slug and return the spelling this task's board uses.

        Two spellings of the review state exist in the codebase: the seeded
        status row is ``in_review`` (``task_config_service.DEFAULT_STATUSES``)
        while the legacy ``SprintTask.status`` values, the shared UI
        ``STATUS_CONFIG`` map and several hardcoded lists say ``review``. The
        kanban builds its columns from the seeded slugs and buckets tasks by
        ``task.status``, so storing the spelling the board doesn't have made the
        task vanish from every column rather than land in the wrong one.

        Canonicalising on write means it no longer matters which spelling a
        caller sends — a UI path we haven't found, an older client, or the Slack
        integration all end up stored as whatever this board actually renders.
        """
        await self.validate_status_slug(task, slug)
        in_scope = await self._slugs_in_scope(task)
        if slug in in_scope or not in_scope:
            return slug
        for alias in _STATUS_ALIASES.get(slug, ()):
            if alias in in_scope:
                logger.info(
                    "Task %s: status %r stored as %r, the slug this board renders",
                    task.id, slug, alias,
                )
                return alias
        return slug

    # Status management
    async def update_task_status(
        self,
        task_id: str,
        new_status: str,
        actor_id: str | None = None,
    ) -> SprintTask | None:
        """Update a task's status.

        Args:
            task_id: Task ID.
            new_status: New status value.
            actor_id: ID of the user making the change (for activity logging).

        Returns:
            Updated SprintTask.
        """
        task = await self.get_task(task_id)
        if not task:
            return None

        new_status = await self.canonical_status_slug(task, new_status)
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
                task.cycle_time_hours = (now - _as_utc(task.work_started_at)).total_seconds() / 3600
            # Calculate lead time (created_at → completed)
            task.lead_time_hours = (now - _as_utc(task.created_at)).total_seconds() / 3600

        await self.db.flush()

        # Re-fetch with relationships loaded
        updated_task = await self.get_task(task_id)

        # Per-task activity row so the History tab attributes the status change
        # to the user who dragged the card / clicked the status pill.
        if old_status != new_status:
            await self.log_activity(
                task_id=task_id,
                action="status_changed",
                actor_id=actor_id,
                field_name="status",
                old_value=old_status,
                new_value=new_status,
            )

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
                actor_id=actor_id,
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

            await self._resolve_linked_ticket_if_done(
                updated_task, new_status, old_status, actor_id
            )

        # Tell the people on the task that somebody else moved it. In-app only by
        # default (see DEFAULT_NOTIFICATION_PREFERENCES) — this fires on every
        # column drag, and `_notify_quietly` drops the actor, who is usually the
        # assignee dragging their own card and needs no telling.
        if updated_task and old_status != new_status:
            await notify_work_item_status_changed(
                db=self.db,
                recipient_ids=await self._interested_party_ids(task_id),
                actor_id=actor_id,
                actor_name=await self._actor_name(actor_id),
                item_title=updated_task.title,
                old_status=old_status,
                new_status=new_status,
                action_url=await self._task_action_url(updated_task),
                workspace_id=updated_task.workspace_id,
            )

        return updated_task

    # ==================== Assignees (primary + collaborators) ============
    #
    # `SprintTask.assignee_id` remains the primary and the single source of
    # truth for everything that must resolve to one developer. `task_assignees`
    # holds everyone. These two representations are kept equal here and nowhere
    # else — every path that can change either one funnels through
    # `_mirror_primary_to_task` / `set_assignees`.

    async def _assert_workspace_members(
        self, workspace_id: str | None, developer_ids: list[str]
    ) -> None:
        """Reject assignees who aren't members of the task's workspace.

        Without this an id from any workspace can be dropped onto a task: the
        person then shows in the assignee list, gets notified, and is counted in
        that team's workload, having no access to the task itself.
        """
        if not workspace_id or not developer_ids:
            return
        from aexy.models.workspace import WorkspaceMember

        rows = await self.db.execute(
            select(WorkspaceMember.developer_id).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.developer_id.in_(developer_ids),
            )
        )
        members = {str(r) for r in rows.scalars().all()}
        outsiders = [d for d in developer_ids if str(d) not in members]
        if outsiders:
            raise TaskValidationError(
                "assignee_not_member",
                f"Not members of this workspace: {', '.join(sorted(outsiders))}",
            )

    async def _reload_with_assignees(self, task_id: str) -> SprintTask | None:
        """Re-read a task with a fresh ``assignees`` collection.

        ``get_task`` issues a new SELECT but SQLAlchemy hands back the
        identity-mapped instance, and a re-query does not overwrite a collection
        that was already loaded on it. So immediately after a successful write
        the response would carry the assignee list as it was *before* the change
        — usually empty, which reads as "that didn't save".
        """
        task = await self.get_task(task_id)
        if task is not None:
            await self.db.refresh(task, ["assignees"])
        return task

    async def _load_assignee_rows(self, task_id: str) -> list[TaskAssignee]:
        rows = await self.db.execute(
            select(TaskAssignee)
            .where(TaskAssignee.task_id == task_id)
            .order_by(TaskAssignee.created_at)
        )
        return list(rows.scalars().all())

    # ------------------------------------------------- notification plumbing

    async def _actor_name(self, actor_id: str | None) -> str:
        """Display name for whoever performed an action, for notification copy."""
        if not actor_id:
            return "Someone"
        from aexy.models.developer import Developer

        result = await self.db.execute(
            select(Developer).where(Developer.id == actor_id)
        )
        actor = result.scalar_one_or_none()
        if not actor:
            return "Someone"
        return actor.name or actor.github_username or "Someone"

    async def _task_action_url(self, task: SprintTask) -> str:
        """Deep link to a task's card.

        A task reached through the board needs the team in the path; a
        project/backlog card carries ``team_id`` directly. Falling back to
        ``/sprints?task=`` keeps the link useful rather than broken when neither
        is resolvable.
        """
        team_id = task.team_id
        if not team_id and task.sprint_id:
            sprint = (
                await self.db.execute(select(Sprint).where(Sprint.id == task.sprint_id))
            ).scalar_one_or_none()
            team_id = getattr(sprint, "team_id", None)
        if team_id:
            return f"/sprints/{team_id}/board?task={task.id}"
        return f"/sprints?task={task.id}"

    async def _interested_party_ids(self, task_id: str) -> list[str]:
        """Everybody currently on a task — primary owner and collaborators.

        Reads the ``task_assignees`` rows rather than ``assignee_id`` alone: a
        task can legitimately have collaborators and no primary ("everyone
        equal"), and notifying only the mirrored column would miss all of them.
        """
        rows = await self._load_assignee_rows(task_id)
        ids = [str(row.developer_id) for row in rows]
        if not ids:
            task = await self.get_task(task_id)
            if task and task.assignee_id:
                ids = [str(task.assignee_id)]
        return ids

    def _item_label(self, task: SprintTask) -> str:
        """What the user calls this row — "task", "bug", "story", or "card"."""
        task_type = (getattr(task, "task_type", None) or "").lower()
        if task_type in ("bug", "story", "epic", "chore", "spike"):
            return task_type
        # A row with no sprint is a backlog/project card in every screen that
        # shows it, and calling it a "task" in the notification when the UI calls
        # it a card is the kind of mismatch that makes people distrust the link.
        return "task" if task.sprint_id else "card"

    async def _mirror_primary_to_task(self, task: SprintTask) -> None:
        """Make ``task.assignee_id`` equal the row flagged primary.

        Called after any change to the rows. A task with collaborators but no
        primary is legitimate — that is the "everyone equal" arrangement — and
        mirrors to a NULL ``assignee_id``.
        """
        rows = await self._load_assignee_rows(str(task.id))
        primary = next((r for r in rows if r.is_primary), None)
        task.assignee_id = str(primary.developer_id) if primary else None

    async def sync_assignee_rows_from_column(
        self, task: SprintTask, actor_id: str | None = None
    ) -> None:
        """Bring the rows in line with a directly-assigned ``assignee_id``.

        The dedicated `/assign` endpoint, the generic PATCH, automations and
        auto-assignment all write ``assignee_id`` straight onto the task. Rather
        than rewrite those, they stay authoritative for the *primary slot only*
        and this reconciles the join table afterwards.

        The old primary row is **removed**, not demoted, so these paths keep
        behaving exactly as they did before collaborators existed:

        * reassign A → B leaves B alone on the task, as it always did. Demoting
          A to collaborator instead would quietly accumulate everyone who had
          ever held the task, and tell A they were still on work they had
          handed over.
        * unassigning removes the owner outright. Leaving them as a collaborator
          would show the task as assigned in the new UI while ``assignee_id``
          said otherwise.

        Collaborators added deliberately are never touched by either case — they
        are additive to this slot, not part of it.
        """
        rows = await self._load_assignee_rows(str(task.id))
        target = str(task.assignee_id) if task.assignee_id else None

        for row in rows:
            if row.is_primary and str(row.developer_id) != target:
                await self.db.delete(row)

        # Flush the departing primary before writing the new one. A single
        # flush emits saves before deletes, so both rows would hold
        # `is_primary` at once and `uq_task_assignees_one_primary` — a partial
        # unique index, which Postgres checks per statement and cannot defer —
        # rejects the reassignment.
        await self.db.flush()

        if target is not None:
            existing = next(
                (r for r in rows if str(r.developer_id) == target), None
            )
            if existing is not None:
                # Already a collaborator — promote in place rather than adding a
                # second row, which the (task_id, developer_id) unique
                # constraint would reject anyway.
                existing.is_primary = True
            else:
                self.db.add(
                    TaskAssignee(
                        id=str(uuid4()),
                        task_id=str(task.id),
                        developer_id=target,
                        is_primary=True,
                        added_by_id=actor_id,
                    )
                )
        await self.db.flush()

    async def set_assignees(
        self,
        task_id: str,
        developer_ids: list[str],
        primary_id: str | None = None,
        actor_id: str | None = None,
    ) -> SprintTask | None:
        """Replace the whole assignee set in one call.

        ``primary_id`` names the accountable owner and must be one of
        ``developer_ids``. Passing ``None`` means nobody is designated — the
        "all assignees equal" arrangement — and leaves ``assignee_id`` NULL.
        """
        task = await self.get_task(task_id)
        if task is None:
            return None

        # De-duplicate while preserving the caller's order, which becomes the
        # display order.
        wanted: list[str] = []
        for dev_id in developer_ids:
            if str(dev_id) not in wanted:
                wanted.append(str(dev_id))

        if primary_id is not None and str(primary_id) not in wanted:
            raise TaskValidationError(
                "primary_not_assigned",
                "The primary assignee must also be one of the assignees",
            )

        await self._assert_workspace_members(
            str(task.workspace_id) if task.workspace_id else None, wanted
        )

        rows = await self._load_assignee_rows(task_id)
        by_dev = {str(r.developer_id): r for r in rows}
        before = sorted(by_dev)

        for dev_id, row in by_dev.items():
            if dev_id not in wanted:
                await self.db.delete(row)
            elif row.is_primary and str(primary_id or "") != dev_id:
                # Demote before anyone is promoted, for the same reason as
                # `_sync_primary_assignee`: two primaries in one flush is a
                # state the partial unique index refuses to hold, even briefly.
                row.is_primary = False
        await self.db.flush()

        for dev_id in wanted:
            is_primary = primary_id is not None and str(primary_id) == dev_id
            row = by_dev.get(dev_id)
            if row is None:
                self.db.add(
                    TaskAssignee(
                        id=str(uuid4()),
                        task_id=task_id,
                        developer_id=dev_id,
                        is_primary=is_primary,
                        added_by_id=actor_id,
                    )
                )
            else:
                row.is_primary = is_primary

        await self.db.flush()

        prior_primary = str(task.assignee_id) if task.assignee_id else None
        await self._mirror_primary_to_task(task)
        await self.db.flush()

        after = sorted(wanted)
        if before != after or prior_primary != (
            str(task.assignee_id) if task.assignee_id else None
        ):
            await self.log_activity(
                task_id=task_id,
                action="assignees_changed",
                actor_id=actor_id,
                field_name="assignees",
                old_value=",".join(before) or None,
                new_value=",".join(after) or None,
                metadata={
                    "assignee_ids": after,
                    "primary_id": str(primary_id) if primary_id else None,
                    "from_assignee_id": prior_primary,
                    "to_assignee_id": str(task.assignee_id) if task.assignee_id else None,
                },
            )

        return await self._reload_with_assignees(task_id)

    async def add_assignee(
        self,
        task_id: str,
        developer_id: str,
        make_primary: bool = False,
        actor_id: str | None = None,
    ) -> SprintTask | None:
        """Add one person without disturbing the others."""
        task = await self.get_task(task_id)
        if task is None:
            return None

        await self._assert_workspace_members(
            str(task.workspace_id) if task.workspace_id else None, [str(developer_id)]
        )

        rows = await self._load_assignee_rows(task_id)
        existing = next(
            (r for r in rows if str(r.developer_id) == str(developer_id)), None
        )
        newly_added = existing is None

        if existing is None:
            existing = TaskAssignee(
                id=str(uuid4()),
                task_id=task_id,
                developer_id=str(developer_id),
                is_primary=False,
                added_by_id=actor_id,
            )
            self.db.add(existing)
            await self.db.flush()
            await self.log_activity(
                task_id=task_id,
                action="assignee_added",
                actor_id=actor_id,
                field_name="assignees",
                new_value=str(developer_id),
                metadata={"developer_id": str(developer_id)},
            )

        if make_primary:
            for row in rows:
                if str(row.developer_id) != str(developer_id):
                    row.is_primary = False
            # Demoted and flushed before the promotion, so the task never holds
            # two primaries in one statement.
            await self.db.flush()
            existing.is_primary = True
            await self.db.flush()
            await self._mirror_primary_to_task(task)
            await self.db.flush()

        # Only a genuinely new name gets told. `add_assignee` is idempotent and
        # is also how `set_primary_assignee` promotes somebody already on the
        # task — neither of those is "you have been assigned something".
        if newly_added:
            await notify_work_item_assigned(
                db=self.db,
                recipient_ids=[developer_id],
                actor_id=actor_id,
                actor_name=await self._actor_name(actor_id),
                item_label=self._item_label(task),
                item_title=task.title,
                action_url=await self._task_action_url(task),
                workspace_id=task.workspace_id,
            )

        return await self._reload_with_assignees(task_id)

    async def remove_assignee(
        self, task_id: str, developer_id: str, actor_id: str | None = None
    ) -> SprintTask | None:
        """Take one person off, leaving the rest.

        Removing the primary leaves the task with no designated owner rather
        than silently promoting somebody — a promotion nobody asked for is how
        work ends up assigned to a person who never agreed to it.
        """
        task = await self.get_task(task_id)
        if task is None:
            return None

        rows = await self._load_assignee_rows(task_id)
        target = next((r for r in rows if str(r.developer_id) == str(developer_id)), None)
        if target is None:
            return await self._reload_with_assignees(task_id)

        await self.db.delete(target)
        await self.db.flush()
        await self._mirror_primary_to_task(task)
        await self.db.flush()

        await self.log_activity(
            task_id=task_id,
            action="assignee_removed",
            actor_id=actor_id,
            field_name="assignees",
            old_value=str(developer_id),
            metadata={"developer_id": str(developer_id)},
        )
        await notify_work_item_unassigned(
            db=self.db,
            recipient_ids=[developer_id],
            actor_id=actor_id,
            actor_name=await self._actor_name(actor_id),
            item_label=self._item_label(task),
            item_title=task.title,
            action_url=await self._task_action_url(task),
            workspace_id=task.workspace_id,
        )
        return await self._reload_with_assignees(task_id)

    async def set_primary_assignee(
        self, task_id: str, developer_id: str | None, actor_id: str | None = None
    ) -> SprintTask | None:
        """Move the badge, adding the person if they weren't on the task yet.

        ``None`` clears it, which is how a team says "we're all equally on
        this" without taking anyone off.
        """
        task = await self.get_task(task_id)
        if task is None:
            return None

        if developer_id is not None:
            return await self.add_assignee(
                task_id, str(developer_id), make_primary=True, actor_id=actor_id
            )

        rows = await self._load_assignee_rows(task_id)
        prior = next((r for r in rows if r.is_primary), None)
        for row in rows:
            row.is_primary = False
        await self.db.flush()
        await self._mirror_primary_to_task(task)
        await self.db.flush()

        if prior is not None:
            await self.log_activity(
                task_id=task_id,
                action="primary_assignee_cleared",
                actor_id=actor_id,
                field_name="assignee_id",
                old_value=str(prior.developer_id),
                metadata={"from_assignee_id": str(prior.developer_id)},
            )
        return await self._reload_with_assignees(task_id)

    async def _resolve_linked_ticket_if_done(
        self,
        task: SprintTask,
        new_status: str,
        old_status: str | None,
        actor_id: str | None,
    ) -> None:
        """Resolve the ticket this task was raised from, once it reaches done.

        Called from both status write paths — `update_task` and
        `update_task_status` — because a card can be moved from either, and a
        ticket that closes only when the developer happened to use one of them is
        worse than one that never closes: the behaviour looks random.

        Guarded on the *transition*, not the state, so re-saving a task that is
        already done does nothing. `TicketService.resolve_for_completed_task` is
        idempotent as well; this just avoids the query.
        """
        if new_status != "done" or old_status == "done":
            return
        try:
            from aexy.services.ticket_service import TicketService

            await TicketService(self.db).resolve_for_completed_task(
                task_id=str(task.id),
                task_title=task.title,
                actor_id=actor_id,
            )
        except Exception:
            # The task is done and that must stand. A ticket left open is a
            # visible, fixable state; a task that refuses to complete because
            # something downstream failed is not.
            logger.exception(
                "Task %s completed but resolving its linked ticket failed", task.id
            )

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
            # Column is `activity_metadata` — `metadata` is reserved on
            # SQLAlchemy declarative Base, so the kwarg gets silently
            # swallowed and every row's payload becomes `{}`. That's why
            # the History tab kept rendering "Unassigned to Unassigned"
            # even though callers passed from/to assignee IDs.
            activity_metadata=metadata or {},
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

        # Everyone assigned to the task hears about the comment too, minus anyone
        # already told by name above — being @mentioned and being on the task
        # should not produce two notifications for one comment.
        if comment:
            commented_task = await self.get_task(task_id)
            if commented_task:
                mentioned = set(extract_mentioned_user_ids(comment))
                await notify_work_item_commented(
                    db=self.db,
                    recipient_ids=[
                        uid
                        for uid in await self._interested_party_ids(task_id)
                        if uid not in mentioned
                    ],
                    actor_id=actor_id,
                    actor_name=await self._actor_name(actor_id),
                    item_title=commented_task.title,
                    comment=comment,
                    action_url=await self._task_action_url(commented_task),
                    workspace_id=commented_task.workspace_id,
                )

        return activity

    # Import from sources
    async def add_project_task(
        self,
        team_id: str,
        title: str,
        source_type: str = "manual",
        source_id: str | None = None,
        source_url: str | None = None,
        description: str | None = None,
        story_points: int | None = None,
        priority: str = "medium",
        labels: list[str] | None = None,
        status: str = "backlog",
    ) -> SprintTask:
        """Add a task at the team/project level (no sprint).

        Used by the project-level import path so backlog tasks can be
        seeded from GitHub without first creating a sprint.
        """
        from aexy.models.team import Team

        if source_type == "manual" and not source_id:
            source_id = str(uuid4())

        team_stmt = select(Team).where(Team.id == team_id)
        team_result = await self.db.execute(team_stmt)
        team = team_result.scalar_one_or_none()
        workspace_id = team.workspace_id if team else None

        task = SprintTask(
            id=str(uuid4()),
            team_id=team_id,
            workspace_id=workspace_id,
            sprint_id=None,
            source_type=source_type,
            source_id=source_id,
            source_url=source_url,
            title=title,
            description=description,
            story_points=story_points,
            priority=priority,
            labels=labels or [],
            status=status,
        )
        self.db.add(task)
        await self.db.flush()
        await GitHubTaskSyncService(self.db).auto_link_issue_references(task)
        return task

    async def add_workspace_task(
        self,
        workspace_id: str,
        project_id: str,
        title: str,
        sprint_id: str | None = None,
        description: str | None = None,
        description_json: dict | None = None,
        story_points: int | None = None,
        priority: str = "medium",
        labels: list[str] | None = None,
        assignee_id: str | None = None,
        status: str = "backlog",
        status_id: str | None = None,
        epic_id: str | None = None,
        parent_task_id: str | None = None,
        mentioned_user_ids: list[str] | None = None,
        mentioned_file_paths: list[str] | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        estimated_hours: float | None = None,
        actor_id: str | None = None,
    ) -> SprintTask:
        """Create a task from the workspace All-Tasks Kanban.

        Resolves team_id from project_id (via project_teams), validates that
        the sprint (if provided) belongs to that team, and validates that the
        custom status (if provided) is either a workspace default or scoped to
        this project. Mirrors `add_task`'s activity log + automation dispatch
        so the History tab and automations behave identically.
        """
        from aexy.models.project import ProjectTeam
        from aexy.models.sprint import WorkspaceTaskStatus

        # 1. Resolve team_id from project. A project can have multiple teams;
        # we pick the first one by created_at — the same fallback the import
        # path uses. Callers that want a specific team should drive task
        # creation from /sprints/{sprint_id}/tasks instead.
        pt_stmt = (
            select(ProjectTeam)
            .where(ProjectTeam.project_id == project_id)
            .order_by(ProjectTeam.created_at)
            .limit(1)
        )
        team_link = (await self.db.execute(pt_stmt)).scalar_one_or_none()
        if not team_link:
            raise TaskValidationError(
                "project_has_no_team",
                "Attach a team to the project before creating tasks.",
            )
        team_id = team_link.team_id

        # 2. If sprint_id is provided, ensure it belongs to that team.
        if sprint_id:
            s_stmt = select(Sprint).where(Sprint.id == sprint_id)
            sprint_row = (await self.db.execute(s_stmt)).scalar_one_or_none()
            if not sprint_row or str(sprint_row.team_id) != str(team_id):
                raise TaskValidationError("sprint_not_in_project")

        # 3. If a custom status_id is provided, ensure it's either a workspace
        # default (project_id IS NULL) or scoped to *this* project — never one
        # belonging to a sibling project.
        if status_id:
            st_stmt = select(WorkspaceTaskStatus).where(
                WorkspaceTaskStatus.id == status_id,
                WorkspaceTaskStatus.workspace_id == workspace_id,
            )
            status_row = (await self.db.execute(st_stmt)).scalar_one_or_none()
            if not status_row:
                raise TaskValidationError("status_not_found")
            if status_row.project_id and str(status_row.project_id) != str(project_id):
                raise TaskValidationError("status_belongs_to_other_project")

        task = SprintTask(
            id=str(uuid4()),
            sprint_id=sprint_id,
            team_id=team_id,
            workspace_id=workspace_id,
            source_type="manual",
            source_id=str(uuid4()),
            title=title,
            description=description,
            description_json=description_json,
            story_points=story_points,
            priority=priority,
            labels=labels or [],
            assignee_id=assignee_id,
            status=status,
            status_id=status_id,
            epic_id=epic_id,
            parent_task_id=parent_task_id,
            mentioned_user_ids=mentioned_user_ids or [],
            mentioned_file_paths=mentioned_file_paths or [],
            start_date=start_date,
            end_date=end_date,
            estimated_hours=estimated_hours,
        )
        self.db.add(task)
        await self.db.flush()
        await GitHubTaskSyncService(self.db).auto_link_issue_references(task)

        stmt = (
            select(SprintTask)
            .where(SprintTask.id == task.id)
            .options(
                selectinload(SprintTask.assignee),
                selectinload(SprintTask.subtasks),
            )
        )
        created_task = (await self.db.execute(stmt)).scalar_one()

        await log_activity(
            self.db,
            workspace_id=workspace_id,
            entity_type="task",
            entity_id=str(created_task.id),
            activity_type="created",
            actor_id=actor_id,
            title=f"Created task '{title}'",
            metadata={
                "sprint_id": sprint_id,
                "project_id": project_id,
                "source_type": "manual",
            },
        )
        await self.log_activity(
            task_id=str(created_task.id),
            action="created",
            actor_id=actor_id,
        )
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
                "project_id": project_id,
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

    async def _import_project_task_items(
        self,
        team_id: str,
        task_items: list[TaskItem],
        source_type: str,
    ) -> list[SprintTask]:
        """Import TaskItem objects into a team's backlog (no sprint).

        Mirrors `_import_task_items` but keys dedup on (team_id, source_type,
        source_id) so the same issue can't be imported twice into a project.
        """
        created_tasks: list[SprintTask] = []
        for item in task_items:
            existing_stmt = select(SprintTask).where(
                SprintTask.team_id == team_id,
                SprintTask.source_type == source_type,
                SprintTask.source_id == item.external_id,
            )
            existing = (await self.db.execute(existing_stmt)).scalar_one_or_none()
            if existing:
                continue

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

            task = await self.add_project_task(
                team_id=team_id,
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

    async def import_project_github_issues(
        self,
        team_id: str,
        owner: str,
        repo: str,
        api_token: str | None = None,
        labels: list[str] | None = None,
        limit: int = 50,
    ) -> list[SprintTask]:
        """Import GitHub issues into a team's backlog (no sprint required).

        The resulting `SprintTask` rows have `sprint_id IS NULL`,
        `team_id=team_id`, and `source_type='github_issue'` — exactly the
        rows the GitHub-issue dropdown surfaces, so importing here populates
        the dropdown for every task in the team.
        """
        config = TaskSourceConfig(
            source_type="github", owner=owner, repo=repo, api_token=api_token
        )
        source = GitHubIssuesSource(config)
        try:
            tasks = await source.fetch_tasks(limit=limit, labels=labels, status=TaskStatus.OPEN)
            return await self._import_project_task_items(team_id, tasks, "github_issue")
        finally:
            await source.close()

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

    # Attachments
    async def add_attachment(
        self,
        task_id: str,
        file_name: str,
        file_url: str,
        file_size: int | None = None,
        content_type: str | None = None,
        uploaded_by_id: str | None = None,
        storage_key: str | None = None,
    ) -> TaskAttachment:
        """Persist a file attachment row for a task and write a History entry."""
        attachment = TaskAttachment(
            id=str(uuid4()),
            task_id=task_id,
            file_name=file_name,
            file_url=file_url,
            storage_key=storage_key,
            file_size=file_size,
            content_type=content_type,
            uploaded_by_id=uploaded_by_id,
        )
        self.db.add(attachment)
        await self.db.flush()
        # History tab event so attachment uploads show up alongside other
        # task activity. uploaded_by_id is the actor (the user who uploaded).
        await self.log_activity(
            task_id=task_id,
            action="attachment_added",
            actor_id=uploaded_by_id,
            field_name="attachment",
            new_value=file_name,
        )
        return attachment

    async def list_attachments(self, task_id: str) -> list[TaskAttachment]:
        """List all attachments for a task, newest first."""
        stmt = (
            select(TaskAttachment)
            .where(TaskAttachment.task_id == task_id)
            .order_by(TaskAttachment.uploaded_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_attachment(self, attachment_id: str) -> TaskAttachment | None:
        """Get a single attachment by ID."""
        stmt = select(TaskAttachment).where(TaskAttachment.id == attachment_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def delete_attachment(
        self, attachment_id: str, actor_id: str | None = None
    ) -> bool:
        """Delete an attachment row. Returns True if removed."""
        attachment = await self.get_attachment(attachment_id)
        if not attachment:
            return False
        task_id = str(attachment.task_id)
        file_name = attachment.file_name
        await self.db.delete(attachment)
        await self.db.flush()
        # History tab event so deletes show up alongside other task activity.
        await self.log_activity(
            task_id=task_id,
            action="attachment_removed",
            actor_id=actor_id,
            field_name="attachment",
            old_value=file_name,
        )
        return True
