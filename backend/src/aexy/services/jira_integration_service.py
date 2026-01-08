"""Jira Integration Service for managing Jira connections and syncing issues."""

import logging
import secrets
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import httpx
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.integrations import JiraIntegration
from aexy.models.sprint import Sprint, SprintTask
from aexy.schemas.integrations import (
    ConnectionTestResponse,
    RemoteProject,
    RemoteStatus,
    RemoteField,
    SyncResult,
)

logger = logging.getLogger(__name__)


class JiraIntegrationService:
    """Service for Jira integration management."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_integration(self, workspace_id: str) -> JiraIntegration | None:
        """Get Jira integration for a workspace."""
        stmt = select(JiraIntegration).where(
            JiraIntegration.workspace_id == workspace_id,
            JiraIntegration.is_active == True,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create_integration(
        self,
        workspace_id: str,
        site_url: str,
        user_email: str,
        api_token: str,
        connected_by_id: str,
    ) -> JiraIntegration:
        """Create a new Jira integration.

        Args:
            workspace_id: The workspace to connect
            site_url: Jira site URL (e.g., https://company.atlassian.net)
            user_email: User email for authentication
            api_token: Jira API token
            connected_by_id: ID of the developer who connected

        Returns:
            Created JiraIntegration
        """
        # Remove trailing slash from site_url
        site_url = site_url.rstrip("/")

        # Check if integration already exists
        existing = await self.get_integration(workspace_id)
        if existing:
            raise ValueError("Jira integration already exists for this workspace")

        # Test connection before creating
        test_result = await self._test_connection(site_url, user_email, api_token)
        if not test_result["success"]:
            raise ValueError(f"Connection test failed: {test_result['message']}")

        # Generate webhook secret
        webhook_secret = secrets.token_urlsafe(32)

        integration = JiraIntegration(
            id=str(uuid4()),
            workspace_id=workspace_id,
            site_url=site_url,
            user_email=user_email,
            api_token=api_token,  # TODO: Encrypt at rest
            project_mappings={},
            status_mappings={},
            field_mappings={},
            webhook_secret=webhook_secret,
            sync_enabled=True,
            sync_direction="import",
            is_active=True,
            connected_by_id=connected_by_id,
        )
        self.db.add(integration)
        await self.db.flush()
        await self.db.refresh(integration)
        return integration

    async def update_integration(
        self,
        workspace_id: str,
        project_mappings: dict | None = None,
        status_mappings: list[dict] | None = None,
        field_mappings: list[dict] | None = None,
        sync_enabled: bool | None = None,
        sync_direction: str | None = None,
    ) -> JiraIntegration | None:
        """Update Jira integration settings."""
        integration = await self.get_integration(workspace_id)
        if not integration:
            return None

        if project_mappings is not None:
            integration.project_mappings = project_mappings
        if status_mappings is not None:
            # Convert list to dict for storage
            integration.status_mappings = {
                m["remote_status"]: m["workspace_status_slug"]
                for m in status_mappings
            }
        if field_mappings is not None:
            integration.field_mappings = {
                m["remote_field"]: m["workspace_field_slug"]
                for m in field_mappings
            }
        if sync_enabled is not None:
            integration.sync_enabled = sync_enabled
        if sync_direction is not None:
            integration.sync_direction = sync_direction

        await self.db.flush()
        await self.db.refresh(integration)
        return integration

    async def delete_integration(self, workspace_id: str) -> bool:
        """Delete Jira integration (soft delete)."""
        integration = await self.get_integration(workspace_id)
        if not integration:
            return False

        integration.is_active = False
        await self.db.flush()
        return True

    async def test_connection(self, workspace_id: str) -> ConnectionTestResponse:
        """Test existing Jira integration connection."""
        integration = await self.get_integration(workspace_id)
        if not integration:
            return ConnectionTestResponse(
                success=False,
                message="Jira integration not found",
            )

        result = await self._test_connection(
            integration.site_url,
            integration.user_email,
            integration.api_token,
        )

        return ConnectionTestResponse(
            success=result["success"],
            message=result["message"],
            available_projects=result.get("projects"),
            available_statuses=result.get("statuses"),
            available_fields=result.get("fields"),
        )

    async def test_new_connection(
        self,
        site_url: str,
        user_email: str,
        api_token: str,
    ) -> ConnectionTestResponse:
        """Test new Jira credentials before creating integration."""
        result = await self._test_connection(site_url, user_email, api_token)

        return ConnectionTestResponse(
            success=result["success"],
            message=result["message"],
            available_projects=result.get("projects"),
            available_statuses=result.get("statuses"),
            available_fields=result.get("fields"),
        )

    async def _test_connection(
        self,
        site_url: str,
        user_email: str,
        api_token: str,
    ) -> dict[str, Any]:
        """Internal method to test Jira connection."""
        try:
            async with httpx.AsyncClient() as client:
                # Test basic auth by getting user info
                auth = httpx.BasicAuth(user_email, api_token)
                response = await client.get(
                    f"{site_url}/rest/api/3/myself",
                    auth=auth,
                    timeout=10.0,
                )

                if response.status_code == 401:
                    return {
                        "success": False,
                        "message": "Invalid credentials. Please check your email and API token.",
                    }
                elif response.status_code != 200:
                    return {
                        "success": False,
                        "message": f"Connection failed with status {response.status_code}",
                    }

                # Fetch available projects
                projects_response = await client.get(
                    f"{site_url}/rest/api/3/project",
                    auth=auth,
                    timeout=10.0,
                )
                projects = []
                if projects_response.status_code == 200:
                    projects_data = projects_response.json()
                    projects = [
                        RemoteProject(key=p["key"], name=p["name"])
                        for p in projects_data
                    ]

                # Fetch available statuses
                statuses_response = await client.get(
                    f"{site_url}/rest/api/3/status",
                    auth=auth,
                    timeout=10.0,
                )
                statuses = []
                if statuses_response.status_code == 200:
                    statuses_data = statuses_response.json()
                    statuses = [
                        RemoteStatus(
                            id=s["id"],
                            name=s["name"],
                            category=s.get("statusCategory", {}).get("name"),
                        )
                        for s in statuses_data
                    ]

                # Fetch custom fields
                fields_response = await client.get(
                    f"{site_url}/rest/api/3/field",
                    auth=auth,
                    timeout=10.0,
                )
                fields = []
                if fields_response.status_code == 200:
                    fields_data = fields_response.json()
                    # Only include custom fields
                    fields = [
                        RemoteField(
                            id=f["id"],
                            name=f["name"],
                            field_type=f.get("schema", {}).get("type", "unknown"),
                        )
                        for f in fields_data
                        if f.get("custom", False)
                    ]

                return {
                    "success": True,
                    "message": "Connection successful",
                    "projects": projects,
                    "statuses": statuses,
                    "fields": fields,
                }

        except httpx.TimeoutException:
            return {
                "success": False,
                "message": "Connection timed out. Please check the site URL.",
            }
        except httpx.ConnectError:
            return {
                "success": False,
                "message": "Could not connect to Jira. Please check the site URL.",
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Connection failed: {str(e)}",
            }

    async def get_remote_statuses(self, workspace_id: str) -> list[RemoteStatus]:
        """Get available statuses from Jira."""
        integration = await self.get_integration(workspace_id)
        if not integration:
            return []

        try:
            async with httpx.AsyncClient() as client:
                auth = httpx.BasicAuth(integration.user_email, integration.api_token)
                response = await client.get(
                    f"{integration.site_url}/rest/api/3/status",
                    auth=auth,
                    timeout=10.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    return [
                        RemoteStatus(
                            id=s["id"],
                            name=s["name"],
                            category=s.get("statusCategory", {}).get("name"),
                        )
                        for s in data
                    ]
        except Exception:
            pass

        return []

    async def get_remote_fields(self, workspace_id: str) -> list[RemoteField]:
        """Get available custom fields from Jira."""
        integration = await self.get_integration(workspace_id)
        if not integration:
            return []

        try:
            async with httpx.AsyncClient() as client:
                auth = httpx.BasicAuth(integration.user_email, integration.api_token)
                response = await client.get(
                    f"{integration.site_url}/rest/api/3/field",
                    auth=auth,
                    timeout=10.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    return [
                        RemoteField(
                            id=f["id"],
                            name=f["name"],
                            field_type=f.get("schema", {}).get("type", "unknown"),
                        )
                        for f in data
                        if f.get("custom", False)
                    ]
        except Exception:
            pass

        return []

    async def sync_issues(
        self,
        workspace_id: str,
        team_id: str | None = None,
        sprint_id: str | None = None,
    ) -> SyncResult:
        """Sync issues from Jira to sprint tasks.

        Args:
            workspace_id: The workspace to sync for
            team_id: Optional team ID to sync only specific team's issues
            sprint_id: Optional sprint ID to sync into (uses active sprint if not provided)

        Returns:
            SyncResult with counts of synced/created/updated issues
        """
        integration = await self.get_integration(workspace_id)
        if not integration:
            return SyncResult(
                success=False,
                message="Jira integration not found",
            )

        if not integration.sync_enabled:
            return SyncResult(
                success=False,
                message="Sync is disabled for this integration",
            )

        # Get project mappings to sync
        mappings = integration.project_mappings
        if team_id and team_id in mappings:
            mappings = {team_id: mappings[team_id]}

        if not mappings:
            return SyncResult(
                success=False,
                message="No project mappings configured",
            )

        synced_count = 0
        created_count = 0
        updated_count = 0
        error_count = 0
        errors: list[str] = []

        try:
            async with httpx.AsyncClient() as client:
                auth = httpx.BasicAuth(integration.user_email, integration.api_token)

                for mapped_team_id, project_config in mappings.items():
                    project_key = project_config.get("project_key")
                    jql_filter = project_config.get("jql_filter", "")

                    if not project_key:
                        continue

                    # Find active sprint for this team
                    target_sprint_id = sprint_id
                    if not target_sprint_id:
                        target_sprint_id = await self._get_active_sprint_id(mapped_team_id)
                        if not target_sprint_id:
                            errors.append(f"No active sprint found for team {mapped_team_id}")
                            continue

                    # Build JQL query
                    jql = f"project = {project_key}"
                    if jql_filter:
                        jql = f"{jql} AND ({jql_filter})"

                    # Fetch issues
                    response = await client.get(
                        f"{integration.site_url}/rest/api/3/search",
                        params={
                            "jql": jql,
                            "maxResults": 100,
                            "fields": "summary,description,status,priority,labels,updated,created",
                        },
                        auth=auth,
                        timeout=30.0,
                    )

                    if response.status_code != 200:
                        errors.append(f"Failed to fetch issues for {project_key}: {response.status_code}")
                        error_count += 1
                        continue

                    issues = response.json().get("issues", [])

                    for issue in issues:
                        try:
                            result = await self._sync_issue_to_task(
                                issue, target_sprint_id, integration
                            )
                            if result == "created":
                                created_count += 1
                            elif result == "updated":
                                updated_count += 1
                            synced_count += 1
                        except Exception as e:
                            errors.append(f"Failed to sync issue {issue.get('key')}: {str(e)}")
                            error_count += 1

            # Update last sync time
            integration.last_sync_at = datetime.now(timezone.utc)
            await self.db.flush()

            return SyncResult(
                success=True,
                message=f"Synced {synced_count} issues ({created_count} created, {updated_count} updated)",
                synced_count=synced_count,
                created_count=created_count,
                updated_count=updated_count,
                error_count=error_count,
                errors=errors,
            )

        except Exception as e:
            return SyncResult(
                success=False,
                message=f"Sync failed: {str(e)}",
                error_count=1,
                errors=[str(e)],
            )

    async def _get_active_sprint_id(self, team_id: str) -> str | None:
        """Get the active sprint for a team."""
        stmt = select(Sprint).where(
            and_(
                Sprint.team_id == team_id,
                Sprint.status.in_(["planning", "active"]),
            )
        ).order_by(Sprint.start_date.desc()).limit(1)
        result = await self.db.execute(stmt)
        sprint = result.scalar_one_or_none()
        return sprint.id if sprint else None

    async def _sync_issue_to_task(
        self,
        issue: dict,
        sprint_id: str,
        integration: JiraIntegration,
    ) -> str:
        """Sync a single Jira issue to a SprintTask.

        Returns:
            "created" or "updated"
        """
        issue_id = issue.get("id")
        issue_key = issue.get("key")
        fields = issue.get("fields", {})

        # Check if task already exists
        stmt = select(SprintTask).where(
            and_(
                SprintTask.sprint_id == sprint_id,
                SprintTask.source_type == "jira",
                SprintTask.source_id == issue_key,
            )
        )
        result = await self.db.execute(stmt)
        existing_task = result.scalar_one_or_none()

        # Extract data from issue
        title = fields.get("summary", "Untitled")
        description = self._extract_description(fields.get("description"))
        status_name = fields.get("status", {}).get("name", "")
        priority_name = fields.get("priority", {}).get("name", "Medium")
        labels = [label.get("name", "") for label in fields.get("labels", [])]
        source_url = f"{integration.site_url}/browse/{issue_key}"

        # Map status
        mapped_status = self.map_status(status_name, integration)

        # Map priority
        priority_map = {
            "Highest": "critical",
            "High": "high",
            "Medium": "medium",
            "Low": "low",
            "Lowest": "low",
        }
        priority = priority_map.get(priority_name, "medium")

        # Parse updated timestamp
        updated_str = fields.get("updated")
        external_updated_at = None
        if updated_str:
            try:
                external_updated_at = datetime.fromisoformat(updated_str.replace("Z", "+00:00"))
            except ValueError:
                pass

        if existing_task:
            # Update existing task
            existing_task.title = title
            existing_task.description = description
            existing_task.status = mapped_status
            existing_task.priority = priority
            existing_task.labels = labels
            existing_task.external_updated_at = external_updated_at
            existing_task.last_synced_at = datetime.now(timezone.utc)
            existing_task.sync_status = "synced"
            await self.db.flush()
            logger.info(f"Updated task from Jira issue {issue_key}")
            return "updated"
        else:
            # Create new task
            task = SprintTask(
                id=str(uuid4()),
                sprint_id=sprint_id,
                source_type="jira",
                source_id=issue_key,
                source_url=source_url,
                title=title,
                description=description,
                priority=priority,
                labels=labels,
                status=mapped_status,
                external_updated_at=external_updated_at,
                last_synced_at=datetime.now(timezone.utc),
                sync_status="synced",
            )
            self.db.add(task)
            await self.db.flush()
            logger.info(f"Created task from Jira issue {issue_key}")
            return "created"

    def _extract_description(self, description: Any) -> str | None:
        """Extract text from Jira ADF description format."""
        if not description:
            return None

        if isinstance(description, str):
            return description

        # Handle Atlassian Document Format (ADF)
        if isinstance(description, dict):
            content = description.get("content", [])
            text_parts = []
            for block in content:
                if block.get("type") == "paragraph":
                    for item in block.get("content", []):
                        if item.get("type") == "text":
                            text_parts.append(item.get("text", ""))
            return "\n".join(text_parts) if text_parts else None

        return None

    async def handle_webhook(
        self,
        workspace_id: str,
        payload: dict,
    ) -> dict[str, Any]:
        """Handle incoming Jira webhook.

        Args:
            workspace_id: Workspace ID for context
            payload: Webhook payload from Jira

        Returns:
            Dict with processing result
        """
        event_type = payload.get("webhookEvent", "")
        result = {"event": event_type, "processed": False}

        integration = await self.get_integration(workspace_id)
        if not integration:
            result["error"] = "Integration not found"
            return result

        # Handle different event types
        if event_type in ["jira:issue_created", "jira:issue_updated"]:
            issue = payload.get("issue", {})
            if not issue:
                result["error"] = "No issue data in payload"
                return result

            issue_key = issue.get("key")
            project_key = issue.get("fields", {}).get("project", {}).get("key")

            # Find team for this project
            team_id = None
            for tid, config in integration.project_mappings.items():
                if config.get("project_key") == project_key:
                    team_id = tid
                    break

            if not team_id:
                result["error"] = f"No team mapping for project {project_key}"
                return result

            # Find active sprint
            sprint_id = await self._get_active_sprint_id(team_id)
            if not sprint_id:
                result["error"] = f"No active sprint for team {team_id}"
                return result

            # Sync the issue
            try:
                action = await self._sync_issue_to_task(issue, sprint_id, integration)
                result["processed"] = True
                result["action"] = action
                result["issue_key"] = issue_key
                logger.info(f"Webhook processed: {action} task for {issue_key}")
            except Exception as e:
                result["error"] = str(e)
                logger.error(f"Webhook error for {issue_key}: {e}")

        elif event_type == "jira:issue_deleted":
            issue = payload.get("issue", {})
            issue_key = issue.get("key")

            if issue_key:
                # Find and mark task as cancelled
                stmt = select(SprintTask).where(
                    and_(
                        SprintTask.source_type == "jira",
                        SprintTask.source_id == issue_key,
                    )
                )
                task_result = await self.db.execute(stmt)
                task = task_result.scalar_one_or_none()

                if task:
                    task.status = "done"  # Or could add "cancelled" status
                    task.sync_status = "synced"
                    await self.db.flush()
                    result["processed"] = True
                    result["action"] = "deleted"
                    result["issue_key"] = issue_key
                    logger.info(f"Marked task as done for deleted issue {issue_key}")

        return result

    async def push_task_update(
        self,
        task: SprintTask,
    ) -> bool:
        """Push task updates back to Jira (bidirectional sync).

        Args:
            task: The SprintTask to sync to Jira

        Returns:
            True if successful
        """
        if task.source_type != "jira":
            return False

        # Get integration for the task's workspace
        stmt = select(Sprint).where(Sprint.id == task.sprint_id)
        result = await self.db.execute(stmt)
        sprint = result.scalar_one_or_none()
        if not sprint:
            return False

        integration = await self.get_integration(sprint.workspace_id)
        if not integration:
            return False

        # Check if bidirectional sync is enabled
        if integration.sync_direction != "bidirectional":
            return False

        # Reverse map status
        jira_status = None
        for jira_s, workspace_s in integration.status_mappings.items():
            if workspace_s == task.status:
                jira_status = jira_s
                break

        if not jira_status:
            logger.warning(f"No Jira status mapping for {task.status}")
            return False

        try:
            async with httpx.AsyncClient() as client:
                auth = httpx.BasicAuth(integration.user_email, integration.api_token)

                # Get available transitions for the issue
                transitions_response = await client.get(
                    f"{integration.site_url}/rest/api/3/issue/{task.source_id}/transitions",
                    auth=auth,
                    timeout=10.0,
                )

                if transitions_response.status_code != 200:
                    logger.error(f"Failed to get transitions: {transitions_response.status_code}")
                    return False

                transitions = transitions_response.json().get("transitions", [])
                target_transition = None

                for t in transitions:
                    if t.get("to", {}).get("name") == jira_status:
                        target_transition = t.get("id")
                        break

                if target_transition:
                    # Execute transition
                    transition_response = await client.post(
                        f"{integration.site_url}/rest/api/3/issue/{task.source_id}/transitions",
                        auth=auth,
                        json={"transition": {"id": target_transition}},
                        timeout=10.0,
                    )

                    if transition_response.status_code in (200, 204):
                        task.last_synced_at = datetime.now(timezone.utc)
                        task.sync_status = "synced"
                        await self.db.flush()
                        logger.info(f"Pushed status update to Jira for {task.source_id}")
                        return True
                    else:
                        logger.error(f"Failed to transition: {transition_response.status_code}")

        except Exception as e:
            logger.error(f"Failed to push update to Jira: {e}")

        return False

    def map_status(self, jira_status: str, integration: JiraIntegration) -> str:
        """Map Jira status to workspace status slug.

        Args:
            jira_status: Status name from Jira
            integration: The Jira integration with status mappings

        Returns:
            Workspace status slug, or "backlog" as default
        """
        return integration.status_mappings.get(jira_status, "backlog")

    def map_fields(
        self,
        jira_fields: dict,
        integration: JiraIntegration,
    ) -> dict:
        """Map Jira custom fields to workspace custom field values.

        Args:
            jira_fields: Custom field values from Jira issue
            integration: The Jira integration with field mappings

        Returns:
            Dictionary of {workspace_field_slug: value}
        """
        result = {}
        for jira_field_id, workspace_slug in integration.field_mappings.items():
            if jira_field_id in jira_fields:
                result[workspace_slug] = jira_fields[jira_field_id]
        return result
