"""GitHub Issues integration."""

import logging
from datetime import datetime

import httpx

from gitraki.services.task_sources.base import (
    TaskItem,
    TaskSource,
    TaskSourceConfig,
    TaskStatus,
)

logger = logging.getLogger(__name__)


class GitHubIssuesSource(TaskSource):
    """GitHub Issues task source integration."""

    API_BASE = "https://api.github.com"

    def __init__(self, config: TaskSourceConfig) -> None:
        """Initialize GitHub Issues source.

        Args:
            config: Configuration with owner, repo, and api_token.
        """
        super().__init__(config)

        if not config.owner or not config.repo:
            raise ValueError("GitHub Issues requires owner and repo in config")

        self._client = httpx.AsyncClient(
            base_url=self.API_BASE,
            headers={
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                **({"Authorization": f"Bearer {config.api_token}"} if config.api_token else {}),
            },
            timeout=30,
        )

    @property
    def source_name(self) -> str:
        return "github"

    async def fetch_tasks(
        self,
        limit: int = 50,
        status: TaskStatus | None = None,
        labels: list[str] | None = None,
    ) -> list[TaskItem]:
        """Fetch issues from GitHub."""
        # Map status to GitHub state
        state = "open"
        if status == TaskStatus.DONE:
            state = "closed"
        elif status == TaskStatus.CANCELLED:
            state = "closed"

        params = {
            "state": state,
            "per_page": min(limit, 100),
            "sort": "updated",
            "direction": "desc",
        }

        if labels:
            params["labels"] = ",".join(labels)

        try:
            response = await self._client.get(
                f"/repos/{self.config.owner}/{self.config.repo}/issues",
                params=params,
            )
            response.raise_for_status()
            issues = response.json()

            return [self._parse_issue(issue) for issue in issues if "pull_request" not in issue]

        except Exception as e:
            logger.error(f"Failed to fetch GitHub issues: {e}")
            return []

    async def fetch_task(self, task_id: str) -> TaskItem | None:
        """Fetch a single issue by number."""
        try:
            response = await self._client.get(
                f"/repos/{self.config.owner}/{self.config.repo}/issues/{task_id}"
            )
            response.raise_for_status()
            issue = response.json()

            # Skip if it's a PR
            if "pull_request" in issue:
                return None

            return self._parse_issue(issue)

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise
        except Exception as e:
            logger.error(f"Failed to fetch GitHub issue {task_id}: {e}")
            return None

    async def health_check(self) -> bool:
        """Check GitHub API access."""
        try:
            response = await self._client.get(
                f"/repos/{self.config.owner}/{self.config.repo}"
            )
            return response.status_code == 200
        except Exception:
            return False

    def _parse_issue(self, issue: dict) -> TaskItem:
        """Parse GitHub issue into TaskItem."""
        # Extract labels
        labels = [label.get("name", "") for label in issue.get("labels", [])]

        # Determine priority from labels
        priority = None
        priority_labels = {"priority:high", "priority:medium", "priority:low", "urgent", "critical"}
        for label in labels:
            label_lower = label.lower()
            if label_lower in priority_labels or "priority" in label_lower:
                priority = self._normalize_priority(label_lower.replace("priority:", ""))
                break

        # Parse dates
        created_at = None
        if issue.get("created_at"):
            created_at = datetime.fromisoformat(issue["created_at"].replace("Z", "+00:00"))

        updated_at = None
        if issue.get("updated_at"):
            updated_at = datetime.fromisoformat(issue["updated_at"].replace("Z", "+00:00"))

        # Assignee
        assignee = issue.get("assignee") or {}

        return TaskItem(
            id=str(issue["id"]),
            external_id=str(issue["number"]),
            source="github",
            title=issue.get("title", ""),
            description=issue.get("body"),
            status=self._normalize_status(issue.get("state")),
            priority=priority,
            labels=labels,
            assignee_id=str(assignee.get("id")) if assignee else None,
            assignee_name=assignee.get("login"),
            reporter_id=str(issue.get("user", {}).get("id")),
            reporter_name=issue.get("user", {}).get("login"),
            created_at=created_at,
            updated_at=updated_at,
            url=issue.get("html_url"),
            metadata={
                "number": issue.get("number"),
                "comments": issue.get("comments", 0),
                "milestone": issue.get("milestone", {}).get("title") if issue.get("milestone") else None,
            },
        )

    async def close(self) -> None:
        """Close the HTTP client."""
        await self._client.aclose()
