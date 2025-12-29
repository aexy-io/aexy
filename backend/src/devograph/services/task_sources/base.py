"""Base classes for task source integrations."""

from abc import ABC, abstractmethod
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class TaskPriority(str, Enum):
    """Task priority levels."""

    HIGHEST = "highest"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    LOWEST = "lowest"


class TaskStatus(str, Enum):
    """Task status values."""

    OPEN = "open"
    IN_PROGRESS = "in_progress"
    IN_REVIEW = "in_review"
    DONE = "done"
    CANCELLED = "cancelled"


class TaskSourceConfig(BaseModel):
    """Configuration for a task source."""

    source_type: str  # jira, linear, github
    api_url: str | None = None
    api_key: str | None = None
    api_token: str | None = None
    project_key: str | None = None
    team_id: str | None = None
    owner: str | None = None
    repo: str | None = None


class TaskItem(BaseModel):
    """Normalized task item from any source."""

    id: str
    external_id: str
    source: str  # jira, linear, github
    title: str
    description: str | None = None
    status: TaskStatus = TaskStatus.OPEN
    priority: TaskPriority | None = None
    labels: list[str] = Field(default_factory=list)
    assignee_id: str | None = None
    assignee_name: str | None = None
    reporter_id: str | None = None
    reporter_name: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    due_date: datetime | None = None
    story_points: int | None = None
    url: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class TaskSource(ABC):
    """Abstract base class for task source integrations."""

    def __init__(self, config: TaskSourceConfig) -> None:
        """Initialize the task source.

        Args:
            config: Task source configuration.
        """
        self.config = config

    @property
    @abstractmethod
    def source_name(self) -> str:
        """Get the source name."""
        pass

    @abstractmethod
    async def fetch_tasks(
        self,
        limit: int = 50,
        status: TaskStatus | None = None,
        labels: list[str] | None = None,
    ) -> list[TaskItem]:
        """Fetch tasks from the source.

        Args:
            limit: Maximum number of tasks to fetch.
            status: Optional status filter.
            labels: Optional label filter.

        Returns:
            List of normalized task items.
        """
        pass

    @abstractmethod
    async def fetch_task(self, task_id: str) -> TaskItem | None:
        """Fetch a single task by ID.

        Args:
            task_id: The task ID.

        Returns:
            Task item if found, None otherwise.
        """
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """Check if the source is accessible.

        Returns:
            True if healthy, False otherwise.
        """
        pass

    def _normalize_priority(self, priority: str | None) -> TaskPriority | None:
        """Normalize priority from source-specific values."""
        if not priority:
            return None

        priority_lower = priority.lower()

        if priority_lower in ("highest", "blocker", "critical", "urgent", "1"):
            return TaskPriority.HIGHEST
        elif priority_lower in ("high", "major", "2"):
            return TaskPriority.HIGH
        elif priority_lower in ("medium", "normal", "3"):
            return TaskPriority.MEDIUM
        elif priority_lower in ("low", "minor", "4"):
            return TaskPriority.LOW
        elif priority_lower in ("lowest", "trivial", "5"):
            return TaskPriority.LOWEST

        return TaskPriority.MEDIUM

    def _normalize_status(self, status: str | None) -> TaskStatus:
        """Normalize status from source-specific values."""
        if not status:
            return TaskStatus.OPEN

        status_lower = status.lower().replace(" ", "_").replace("-", "_")

        if status_lower in ("open", "todo", "to_do", "backlog", "new"):
            return TaskStatus.OPEN
        elif status_lower in ("in_progress", "doing", "started", "active"):
            return TaskStatus.IN_PROGRESS
        elif status_lower in ("in_review", "review", "testing", "qa"):
            return TaskStatus.IN_REVIEW
        elif status_lower in ("done", "closed", "resolved", "complete", "completed"):
            return TaskStatus.DONE
        elif status_lower in ("cancelled", "wont_do", "wontfix", "invalid"):
            return TaskStatus.CANCELLED

        return TaskStatus.OPEN
