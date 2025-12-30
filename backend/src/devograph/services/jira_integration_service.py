"""Jira Integration Service for managing Jira connections and syncing issues."""

import secrets
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.models.integrations import JiraIntegration
from devograph.schemas.integrations import (
    ConnectionTestResponse,
    RemoteProject,
    RemoteStatus,
    RemoteField,
    SyncResult,
)


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

    async def sync_issues(self, workspace_id: str, team_id: str | None = None) -> SyncResult:
        """Sync issues from Jira to sprint tasks.

        Args:
            workspace_id: The workspace to sync for
            team_id: Optional team ID to sync only specific team's issues

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
                            "fields": "summary,description,status,priority,labels,customfield_*",
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
                        # TODO: Create/update SprintTask for each issue
                        # This requires the sprint_task_service and proper task mapping
                        synced_count += 1

            # Update last sync time
            integration.last_sync_at = datetime.now(timezone.utc)
            await self.db.flush()

            return SyncResult(
                success=True,
                message=f"Synced {synced_count} issues",
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

    async def handle_webhook(self, payload: dict) -> bool:
        """Handle incoming Jira webhook.

        Args:
            payload: Webhook payload from Jira

        Returns:
            True if handled successfully
        """
        event_type = payload.get("webhookEvent", "")

        # Handle different event types
        if event_type in ["jira:issue_created", "jira:issue_updated"]:
            issue = payload.get("issue", {})
            # TODO: Map Jira issue to SprintTask and create/update
            return True
        elif event_type == "jira:issue_deleted":
            issue = payload.get("issue", {})
            # TODO: Handle issue deletion
            return True

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
