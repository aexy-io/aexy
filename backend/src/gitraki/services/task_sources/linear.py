"""Linear integration."""

import logging
from datetime import datetime

import httpx

from gitraki.services.task_sources.base import (
    TaskItem,
    TaskPriority,
    TaskSource,
    TaskSourceConfig,
    TaskStatus,
)

logger = logging.getLogger(__name__)


class LinearSource(TaskSource):
    """Linear task source integration using GraphQL API."""

    API_URL = "https://api.linear.app/graphql"

    def __init__(self, config: TaskSourceConfig) -> None:
        """Initialize Linear source.

        Args:
            config: Configuration with api_key and optional team_id.
        """
        super().__init__(config)

        if not config.api_key:
            raise ValueError("Linear requires api_key")

        self._client = httpx.AsyncClient(
            headers={
                "Authorization": config.api_key,
                "Content-Type": "application/json",
            },
            timeout=30,
        )

    @property
    def source_name(self) -> str:
        return "linear"

    async def fetch_tasks(
        self,
        limit: int = 50,
        status: TaskStatus | None = None,
        labels: list[str] | None = None,
    ) -> list[TaskItem]:
        """Fetch issues from Linear."""
        # Build filter
        filter_parts = []

        if self.config.team_id:
            filter_parts.append(f'team: {{ id: {{ eq: "{self.config.team_id}" }} }}')

        if status:
            # Map to Linear workflow states
            state_filter = self._get_state_filter(status)
            if state_filter:
                filter_parts.append(state_filter)

        if labels:
            label_filter = ", ".join([f'"{label}"' for label in labels])
            filter_parts.append(f"labels: {{ name: {{ in: [{label_filter}] }} }}")

        filter_str = ", ".join(filter_parts)
        filter_clause = f"filter: {{ {filter_str} }}" if filter_str else ""

        query = f"""
        query {{
          issues(first: {limit}, {filter_clause}, orderBy: updatedAt) {{
            nodes {{
              id
              identifier
              title
              description
              state {{
                name
                type
              }}
              priority
              labels {{
                nodes {{
                  name
                }}
              }}
              assignee {{
                id
                name
              }}
              creator {{
                id
                name
              }}
              createdAt
              updatedAt
              dueDate
              estimate
              url
              team {{
                key
              }}
            }}
          }}
        }}
        """

        try:
            response = await self._client.post(
                self.API_URL,
                json={"query": query},
            )
            response.raise_for_status()
            data = response.json()

            if errors := data.get("errors"):
                logger.error(f"Linear GraphQL errors: {errors}")
                return []

            issues = data.get("data", {}).get("issues", {}).get("nodes", [])
            return [self._parse_issue(issue) for issue in issues]

        except Exception as e:
            logger.error(f"Failed to fetch Linear issues: {e}")
            return []

    async def fetch_task(self, task_id: str) -> TaskItem | None:
        """Fetch a single issue by ID or identifier."""
        query = """
        query($id: String!) {
          issue(id: $id) {
            id
            identifier
            title
            description
            state {
              name
              type
            }
            priority
            labels {
              nodes {
                name
              }
            }
            assignee {
              id
              name
            }
            creator {
              id
              name
            }
            createdAt
            updatedAt
            dueDate
            estimate
            url
            team {
              key
            }
          }
        }
        """

        try:
            response = await self._client.post(
                self.API_URL,
                json={"query": query, "variables": {"id": task_id}},
            )
            response.raise_for_status()
            data = response.json()

            if errors := data.get("errors"):
                logger.error(f"Linear GraphQL errors: {errors}")
                return None

            issue = data.get("data", {}).get("issue")
            if not issue:
                return None

            return self._parse_issue(issue)

        except Exception as e:
            logger.error(f"Failed to fetch Linear issue {task_id}: {e}")
            return None

    async def health_check(self) -> bool:
        """Check Linear API access."""
        query = """
        query {
          viewer {
            id
          }
        }
        """

        try:
            response = await self._client.post(
                self.API_URL,
                json={"query": query},
            )
            data = response.json()
            return "data" in data and "viewer" in data["data"]
        except Exception:
            return False

    def _get_state_filter(self, status: TaskStatus) -> str | None:
        """Map TaskStatus to Linear state type filter."""
        state_type_map = {
            TaskStatus.OPEN: "backlog",
            TaskStatus.IN_PROGRESS: "started",
            TaskStatus.IN_REVIEW: "started",  # Linear uses 'started' for in-progress
            TaskStatus.DONE: "completed",
            TaskStatus.CANCELLED: "canceled",
        }

        state_type = state_type_map.get(status)
        if state_type:
            return f'state: {{ type: {{ eq: "{state_type}" }} }}'
        return None

    def _parse_issue(self, issue: dict) -> TaskItem:
        """Parse Linear issue into TaskItem."""
        # Extract labels
        labels = [
            label.get("name", "")
            for label in issue.get("labels", {}).get("nodes", [])
        ]

        # Map priority (Linear uses 0-4, 0 = no priority)
        priority = None
        linear_priority = issue.get("priority")
        if linear_priority is not None:
            priority_map = {
                0: None,
                1: TaskPriority.HIGHEST,
                2: TaskPriority.HIGH,
                3: TaskPriority.MEDIUM,
                4: TaskPriority.LOW,
            }
            priority = priority_map.get(linear_priority)

        # Parse dates
        created_at = None
        if issue.get("createdAt"):
            created_at = datetime.fromisoformat(issue["createdAt"].replace("Z", "+00:00"))

        updated_at = None
        if issue.get("updatedAt"):
            updated_at = datetime.fromisoformat(issue["updatedAt"].replace("Z", "+00:00"))

        due_date = None
        if issue.get("dueDate"):
            due_date = datetime.fromisoformat(issue["dueDate"])

        # Map state to status
        state = issue.get("state", {})
        state_type = state.get("type", "")
        status = TaskStatus.OPEN
        if state_type == "started":
            status = TaskStatus.IN_PROGRESS
        elif state_type == "completed":
            status = TaskStatus.DONE
        elif state_type == "canceled":
            status = TaskStatus.CANCELLED

        # Assignee
        assignee = issue.get("assignee") or {}
        creator = issue.get("creator") or {}

        return TaskItem(
            id=issue.get("id", ""),
            external_id=issue.get("identifier", ""),
            source="linear",
            title=issue.get("title", ""),
            description=issue.get("description"),
            status=status,
            priority=priority,
            labels=labels,
            assignee_id=assignee.get("id"),
            assignee_name=assignee.get("name"),
            reporter_id=creator.get("id"),
            reporter_name=creator.get("name"),
            created_at=created_at,
            updated_at=updated_at,
            due_date=due_date,
            story_points=issue.get("estimate"),
            url=issue.get("url"),
            metadata={
                "identifier": issue.get("identifier"),
                "team_key": issue.get("team", {}).get("key"),
                "state_name": state.get("name"),
            },
        )

    async def close(self) -> None:
        """Close the HTTP client."""
        await self._client.aclose()
