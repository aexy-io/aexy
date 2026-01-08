"""Jira integration."""

import base64
import logging
from datetime import datetime

import httpx

from aexy.services.task_sources.base import (
    TaskItem,
    TaskPriority,
    TaskSource,
    TaskSourceConfig,
    TaskStatus,
)

logger = logging.getLogger(__name__)


class JiraSource(TaskSource):
    """Jira task source integration."""

    def __init__(self, config: TaskSourceConfig) -> None:
        """Initialize Jira source.

        Args:
            config: Configuration with api_url, api_key (email), api_token, and project_key.
        """
        super().__init__(config)

        if not config.api_url:
            raise ValueError("Jira requires api_url (e.g., https://yourcompany.atlassian.net)")

        if not config.api_key or not config.api_token:
            raise ValueError("Jira requires api_key (email) and api_token")

        # Basic auth with email:api_token
        auth_string = f"{config.api_key}:{config.api_token}"
        auth_bytes = base64.b64encode(auth_string.encode()).decode()

        self._client = httpx.AsyncClient(
            base_url=config.api_url.rstrip("/"),
            headers={
                "Authorization": f"Basic {auth_bytes}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            timeout=30,
        )

    @property
    def source_name(self) -> str:
        return "jira"

    async def fetch_tasks(
        self,
        limit: int = 50,
        status: TaskStatus | None = None,
        labels: list[str] | None = None,
    ) -> list[TaskItem]:
        """Fetch issues from Jira using JQL."""
        # Build JQL query
        jql_parts = []

        if self.config.project_key:
            jql_parts.append(f"project = {self.config.project_key}")

        if status:
            status_mapping = {
                TaskStatus.OPEN: "Open",
                TaskStatus.IN_PROGRESS: '"In Progress"',
                TaskStatus.IN_REVIEW: '"In Review"',
                TaskStatus.DONE: "Done",
                TaskStatus.CANCELLED: "Cancelled",
            }
            if status in status_mapping:
                jql_parts.append(f"status = {status_mapping[status]}")

        if labels:
            label_conditions = " AND ".join([f'labels = "{label}"' for label in labels])
            jql_parts.append(f"({label_conditions})")

        jql = " AND ".join(jql_parts) if jql_parts else "ORDER BY updated DESC"
        if jql_parts:
            jql += " ORDER BY updated DESC"

        try:
            response = await self._client.get(
                "/rest/api/3/search",
                params={
                    "jql": jql,
                    "maxResults": min(limit, 100),
                    "fields": "summary,description,status,priority,labels,assignee,reporter,created,updated,duedate,customfield_10016",
                },
            )
            response.raise_for_status()
            data = response.json()

            return [self._parse_issue(issue) for issue in data.get("issues", [])]

        except Exception as e:
            logger.error(f"Failed to fetch Jira issues: {e}")
            return []

    async def fetch_task(self, task_id: str) -> TaskItem | None:
        """Fetch a single issue by key."""
        try:
            response = await self._client.get(
                f"/rest/api/3/issue/{task_id}",
                params={
                    "fields": "summary,description,status,priority,labels,assignee,reporter,created,updated,duedate,customfield_10016",
                },
            )
            response.raise_for_status()
            issue = response.json()

            return self._parse_issue(issue)

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise
        except Exception as e:
            logger.error(f"Failed to fetch Jira issue {task_id}: {e}")
            return None

    async def health_check(self) -> bool:
        """Check Jira API access."""
        try:
            response = await self._client.get("/rest/api/3/myself")
            return response.status_code == 200
        except Exception:
            return False

    def _parse_issue(self, issue: dict) -> TaskItem:
        """Parse Jira issue into TaskItem."""
        fields = issue.get("fields", {})

        # Extract description text from Atlassian Document Format
        description = None
        desc_content = fields.get("description")
        if desc_content and isinstance(desc_content, dict):
            description = self._extract_text_from_adf(desc_content)
        elif isinstance(desc_content, str):
            description = desc_content

        # Parse priority
        priority = None
        if priority_field := fields.get("priority"):
            priority = self._normalize_priority(priority_field.get("name"))

        # Parse dates
        created_at = None
        if fields.get("created"):
            created_at = datetime.fromisoformat(fields["created"].replace("Z", "+00:00"))

        updated_at = None
        if fields.get("updated"):
            updated_at = datetime.fromisoformat(fields["updated"].replace("Z", "+00:00"))

        due_date = None
        if fields.get("duedate"):
            due_date = datetime.fromisoformat(fields["duedate"])

        # Story points (customfield_10016 is common but may vary)
        story_points = None
        if sp := fields.get("customfield_10016"):
            try:
                story_points = int(sp)
            except (ValueError, TypeError):
                pass

        # Assignee
        assignee = fields.get("assignee") or {}
        reporter = fields.get("reporter") or {}

        return TaskItem(
            id=issue.get("id", ""),
            external_id=issue.get("key", ""),
            source="jira",
            title=fields.get("summary", ""),
            description=description,
            status=self._normalize_status(fields.get("status", {}).get("name")),
            priority=priority,
            labels=fields.get("labels", []),
            assignee_id=assignee.get("accountId"),
            assignee_name=assignee.get("displayName"),
            reporter_id=reporter.get("accountId"),
            reporter_name=reporter.get("displayName"),
            created_at=created_at,
            updated_at=updated_at,
            due_date=due_date,
            story_points=story_points,
            url=f"{self.config.api_url}/browse/{issue.get('key', '')}",
            metadata={
                "key": issue.get("key"),
                "project": fields.get("project", {}).get("key"),
                "issuetype": fields.get("issuetype", {}).get("name"),
            },
        )

    def _extract_text_from_adf(self, adf: dict) -> str:
        """Extract plain text from Atlassian Document Format."""
        text_parts = []

        def extract_content(node: dict) -> None:
            if node.get("type") == "text":
                text_parts.append(node.get("text", ""))
            for child in node.get("content", []):
                extract_content(child)

        extract_content(adf)
        return " ".join(text_parts)

    async def close(self) -> None:
        """Close the HTTP client."""
        await self._client.aclose()
