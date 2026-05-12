"""Canonical `SprintTask` → `SprintTaskResponse` builder.

Both the sprint-scoped router (`/sprints/{sprint_id}/tasks`) and the
project-scoped router (`/teams/{team_id}/tasks`) call this so they emit
the same response shape. Previously each router defined its own
`task_to_response` and the project-scoped one was missing eight fields
(notably `attachments`), which is what made uploaded files vanish from
backlog tasks even though the upload itself succeeded.

The `attachments` relationship is `lazy="selectin"` on the model, so
accessing `task.attachments` here doesn't trigger an extra round trip.
"""

from __future__ import annotations

from aexy.schemas.sprint import SprintTaskResponse, TaskAttachmentResponse


def task_to_response(task) -> SprintTaskResponse:
    """Convert a `SprintTask` ORM row into the response schema."""
    assignee = task.assignee
    subtasks_count = len(task.subtasks) if task.subtasks else 0
    attachments = [
        TaskAttachmentResponse(
            id=str(a.id),
            task_id=str(a.task_id),
            file_name=a.file_name,
            file_url=a.file_url,
            file_size=a.file_size,
            content_type=a.content_type,
            uploaded_by_id=str(a.uploaded_by_id) if a.uploaded_by_id else None,
            uploaded_at=a.uploaded_at,
        )
        for a in (task.attachments or [])
    ]
    return SprintTaskResponse(
        id=str(task.id),
        sprint_id=str(task.sprint_id) if task.sprint_id else None,
        team_id=str(task.team_id) if task.team_id else None,
        workspace_id=str(task.workspace_id) if task.workspace_id else None,
        source_type=task.source_type,
        source_id=task.source_id,
        source_url=task.source_url,
        title=task.title,
        description=task.description,
        description_json=task.description_json,
        story_points=task.story_points,
        priority=task.priority,
        labels=task.labels or [],
        assignee_id=str(task.assignee_id) if task.assignee_id else None,
        assignee_name=assignee.name if assignee else None,
        assignee_avatar_url=assignee.avatar_url if assignee else None,
        assignment_reason=task.assignment_reason,
        assignment_confidence=task.assignment_confidence,
        status=task.status,
        status_id=str(task.status_id) if task.status_id else None,
        custom_fields=task.custom_fields or {},
        epic_id=str(task.epic_id) if task.epic_id else None,
        parent_task_id=str(task.parent_task_id) if task.parent_task_id else None,
        subtasks_count=subtasks_count,
        started_at=task.started_at,
        completed_at=task.completed_at,
        work_started_at=task.work_started_at,
        cycle_time_hours=task.cycle_time_hours,
        lead_time_hours=task.lead_time_hours,
        contributes_to_goal=task.contributes_to_goal,
        carried_over_from_sprint_id=str(task.carried_over_from_sprint_id) if task.carried_over_from_sprint_id else None,
        mentioned_user_ids=task.mentioned_user_ids or [],
        mentioned_file_paths=task.mentioned_file_paths or [],
        is_archived=task.is_archived,
        start_date=task.start_date,
        end_date=task.end_date,
        estimated_hours=task.estimated_hours,
        attachments=attachments,
        created_at=task.created_at,
        updated_at=task.updated_at,
        task_key=task.task_key,
        workspace_slug=task.workspace_slug,
        identifier=task.identifier,
        public_url=task.public_url,
    )
