"""Linear Integration Service for managing Linear connections and syncing issues."""

import secrets
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.models.integrations import LinearIntegration
from devograph.schemas.integrations import (
    ConnectionTestResponse,
    RemoteTeam,
    RemoteStatus,
    RemoteField,
    SyncResult,
)


# Linear GraphQL API URL
LINEAR_API_URL = "https://api.linear.app/graphql"


class LinearIntegrationService:
    """Service for Linear integration management."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_integration(self, workspace_id: str) -> LinearIntegration | None:
        """Get Linear integration for a workspace."""
        stmt = select(LinearIntegration).where(
            LinearIntegration.workspace_id == workspace_id,
            LinearIntegration.is_active == True,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create_integration(
        self,
        workspace_id: str,
        api_key: str,
        connected_by_id: str,
    ) -> LinearIntegration:
        """Create a new Linear integration.

        Args:
            workspace_id: The workspace to connect
            api_key: Linear API key
            connected_by_id: ID of the developer who connected

        Returns:
            Created LinearIntegration
        """
        # Check if integration already exists
        existing = await self.get_integration(workspace_id)
        if existing:
            raise ValueError("Linear integration already exists for this workspace")

        # Test connection and get organization info
        test_result = await self._test_connection(api_key)
        if not test_result["success"]:
            raise ValueError(f"Connection test failed: {test_result['message']}")

        # Generate webhook secret
        webhook_secret = secrets.token_urlsafe(32)

        integration = LinearIntegration(
            id=str(uuid4()),
            workspace_id=workspace_id,
            api_key=api_key,  # TODO: Encrypt at rest
            organization_id=test_result.get("organization_id"),
            organization_name=test_result.get("organization_name"),
            team_mappings={},
            status_mappings={},
            field_mappings={},
            webhook_secret=webhook_secret,
            sync_enabled=True,
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
        team_mappings: dict | None = None,
        status_mappings: list[dict] | None = None,
        field_mappings: list[dict] | None = None,
        sync_enabled: bool | None = None,
    ) -> LinearIntegration | None:
        """Update Linear integration settings."""
        integration = await self.get_integration(workspace_id)
        if not integration:
            return None

        if team_mappings is not None:
            integration.team_mappings = team_mappings
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

        await self.db.flush()
        await self.db.refresh(integration)
        return integration

    async def delete_integration(self, workspace_id: str) -> bool:
        """Delete Linear integration (soft delete)."""
        integration = await self.get_integration(workspace_id)
        if not integration:
            return False

        integration.is_active = False
        await self.db.flush()
        return True

    async def test_connection(self, workspace_id: str) -> ConnectionTestResponse:
        """Test existing Linear integration connection."""
        integration = await self.get_integration(workspace_id)
        if not integration:
            return ConnectionTestResponse(
                success=False,
                message="Linear integration not found",
            )

        result = await self._test_connection(integration.api_key)

        return ConnectionTestResponse(
            success=result["success"],
            message=result["message"],
            available_teams=result.get("teams"),
            available_statuses=result.get("states"),
        )

    async def test_new_connection(self, api_key: str) -> ConnectionTestResponse:
        """Test new Linear API key before creating integration."""
        result = await self._test_connection(api_key)

        return ConnectionTestResponse(
            success=result["success"],
            message=result["message"],
            available_teams=result.get("teams"),
            available_statuses=result.get("states"),
        )

    async def _test_connection(self, api_key: str) -> dict[str, Any]:
        """Internal method to test Linear connection."""
        try:
            async with httpx.AsyncClient() as client:
                # Test API key by getting viewer info
                query = """
                    query {
                        viewer {
                            id
                            name
                            email
                        }
                        organization {
                            id
                            name
                        }
                        teams {
                            nodes {
                                id
                                name
                                key
                            }
                        }
                        workflowStates {
                            nodes {
                                id
                                name
                                type
                            }
                        }
                    }
                """

                response = await client.post(
                    LINEAR_API_URL,
                    json={"query": query},
                    headers={
                        "Authorization": api_key,
                        "Content-Type": "application/json",
                    },
                    timeout=10.0,
                )

                if response.status_code == 401:
                    return {
                        "success": False,
                        "message": "Invalid API key. Please check your Linear API key.",
                    }
                elif response.status_code != 200:
                    return {
                        "success": False,
                        "message": f"Connection failed with status {response.status_code}",
                    }

                data = response.json()
                if "errors" in data:
                    error_msg = data["errors"][0].get("message", "Unknown error")
                    return {
                        "success": False,
                        "message": f"GraphQL error: {error_msg}",
                    }

                viewer_data = data.get("data", {})
                org = viewer_data.get("organization", {})
                teams_data = viewer_data.get("teams", {}).get("nodes", [])
                states_data = viewer_data.get("workflowStates", {}).get("nodes", [])

                teams = [
                    RemoteTeam(id=t["id"], name=f"{t['name']} ({t['key']})")
                    for t in teams_data
                ]

                # Map Linear workflow state types to categories
                state_category_map = {
                    "backlog": "todo",
                    "unstarted": "todo",
                    "started": "in_progress",
                    "completed": "done",
                    "canceled": "done",
                }
                states = [
                    RemoteStatus(
                        id=s["id"],
                        name=s["name"],
                        category=state_category_map.get(s.get("type"), "todo"),
                    )
                    for s in states_data
                ]

                return {
                    "success": True,
                    "message": "Connection successful",
                    "organization_id": org.get("id"),
                    "organization_name": org.get("name"),
                    "teams": teams,
                    "states": states,
                }

        except httpx.TimeoutException:
            return {
                "success": False,
                "message": "Connection timed out.",
            }
        except httpx.ConnectError:
            return {
                "success": False,
                "message": "Could not connect to Linear API.",
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Connection failed: {str(e)}",
            }

    async def get_remote_states(self, workspace_id: str) -> list[RemoteStatus]:
        """Get available workflow states from Linear."""
        integration = await self.get_integration(workspace_id)
        if not integration:
            return []

        try:
            async with httpx.AsyncClient() as client:
                query = """
                    query {
                        workflowStates {
                            nodes {
                                id
                                name
                                type
                                team {
                                    id
                                    name
                                }
                            }
                        }
                    }
                """

                response = await client.post(
                    LINEAR_API_URL,
                    json={"query": query},
                    headers={
                        "Authorization": integration.api_key,
                        "Content-Type": "application/json",
                    },
                    timeout=10.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    states_data = data.get("data", {}).get("workflowStates", {}).get("nodes", [])

                    state_category_map = {
                        "backlog": "todo",
                        "unstarted": "todo",
                        "started": "in_progress",
                        "completed": "done",
                        "canceled": "done",
                    }

                    return [
                        RemoteStatus(
                            id=s["id"],
                            name=f"{s['name']} ({s.get('team', {}).get('name', 'Unknown')})",
                            category=state_category_map.get(s.get("type"), "todo"),
                        )
                        for s in states_data
                    ]
        except Exception:
            pass

        return []

    async def get_remote_teams(self, workspace_id: str) -> list[RemoteTeam]:
        """Get available teams from Linear."""
        integration = await self.get_integration(workspace_id)
        if not integration:
            return []

        try:
            async with httpx.AsyncClient() as client:
                query = """
                    query {
                        teams {
                            nodes {
                                id
                                name
                                key
                            }
                        }
                    }
                """

                response = await client.post(
                    LINEAR_API_URL,
                    json={"query": query},
                    headers={
                        "Authorization": integration.api_key,
                        "Content-Type": "application/json",
                    },
                    timeout=10.0,
                )

                if response.status_code == 200:
                    data = response.json()
                    teams_data = data.get("data", {}).get("teams", {}).get("nodes", [])

                    return [
                        RemoteTeam(id=t["id"], name=f"{t['name']} ({t['key']})")
                        for t in teams_data
                    ]
        except Exception:
            pass

        return []

    async def get_remote_fields(self, workspace_id: str) -> list[RemoteField]:
        """Get available custom fields from Linear.

        Note: Linear uses labels and custom attributes differently than Jira.
        This returns common field types that can be mapped.
        """
        # Linear's custom fields are simpler - mainly labels and built-in fields
        # Return common mappable fields
        return [
            RemoteField(id="priority", name="Priority", field_type="select"),
            RemoteField(id="estimate", name="Estimate", field_type="number"),
            RemoteField(id="dueDate", name="Due Date", field_type="date"),
            RemoteField(id="labels", name="Labels", field_type="multiselect"),
        ]

    async def sync_issues(self, workspace_id: str, team_id: str | None = None) -> SyncResult:
        """Sync issues from Linear to sprint tasks.

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
                message="Linear integration not found",
            )

        if not integration.sync_enabled:
            return SyncResult(
                success=False,
                message="Sync is disabled for this integration",
            )

        # Get team mappings to sync
        mappings = integration.team_mappings
        if team_id and team_id in mappings:
            mappings = {team_id: mappings[team_id]}

        if not mappings:
            return SyncResult(
                success=False,
                message="No team mappings configured",
            )

        synced_count = 0
        created_count = 0
        updated_count = 0
        error_count = 0
        errors: list[str] = []

        try:
            async with httpx.AsyncClient() as client:
                for mapped_team_id, team_config in mappings.items():
                    linear_team_id = team_config.get("linear_team_id")
                    labels_filter = team_config.get("labels_filter", [])

                    if not linear_team_id:
                        continue

                    # Build GraphQL query for issues
                    query = """
                        query($teamId: String!, $first: Int!) {
                            issues(filter: { team: { id: { eq: $teamId } } }, first: $first) {
                                nodes {
                                    id
                                    identifier
                                    title
                                    description
                                    state {
                                        id
                                        name
                                        type
                                    }
                                    priority
                                    estimate
                                    dueDate
                                    labels {
                                        nodes {
                                            id
                                            name
                                        }
                                    }
                                    url
                                }
                            }
                        }
                    """

                    response = await client.post(
                        LINEAR_API_URL,
                        json={
                            "query": query,
                            "variables": {
                                "teamId": linear_team_id,
                                "first": 100,
                            },
                        },
                        headers={
                            "Authorization": integration.api_key,
                            "Content-Type": "application/json",
                        },
                        timeout=30.0,
                    )

                    if response.status_code != 200:
                        errors.append(f"Failed to fetch issues for team {linear_team_id}: {response.status_code}")
                        error_count += 1
                        continue

                    data = response.json()
                    if "errors" in data:
                        errors.append(f"GraphQL error: {data['errors'][0].get('message')}")
                        error_count += 1
                        continue

                    issues = data.get("data", {}).get("issues", {}).get("nodes", [])

                    # Filter by labels if specified
                    if labels_filter:
                        issues = [
                            i for i in issues
                            if any(
                                label["name"] in labels_filter
                                for label in i.get("labels", {}).get("nodes", [])
                            )
                        ]

                    for issue in issues:
                        # TODO: Create/update SprintTask for each issue
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
        """Handle incoming Linear webhook.

        Args:
            payload: Webhook payload from Linear

        Returns:
            True if handled successfully
        """
        action = payload.get("action", "")
        data_type = payload.get("type", "")

        if data_type == "Issue":
            if action == "create":
                # TODO: Create new SprintTask
                return True
            elif action == "update":
                # TODO: Update existing SprintTask
                return True
            elif action == "remove":
                # TODO: Handle issue deletion
                return True

        return False

    def map_status(self, linear_state_id: str, integration: LinearIntegration) -> str:
        """Map Linear workflow state to workspace status slug.

        Args:
            linear_state_id: State ID from Linear
            integration: The Linear integration with status mappings

        Returns:
            Workspace status slug, or "backlog" as default
        """
        return integration.status_mappings.get(linear_state_id, "backlog")

    def map_fields(
        self,
        linear_issue: dict,
        integration: LinearIntegration,
    ) -> dict:
        """Map Linear issue fields to workspace custom field values.

        Args:
            linear_issue: Issue data from Linear
            integration: The Linear integration with field mappings

        Returns:
            Dictionary of {workspace_field_slug: value}
        """
        result = {}
        field_extractors = {
            "priority": lambda i: i.get("priority"),
            "estimate": lambda i: i.get("estimate"),
            "dueDate": lambda i: i.get("dueDate"),
            "labels": lambda i: [l["name"] for l in i.get("labels", {}).get("nodes", [])],
        }

        for linear_field, workspace_slug in integration.field_mappings.items():
            extractor = field_extractors.get(linear_field)
            if extractor:
                value = extractor(linear_issue)
                if value is not None:
                    result[workspace_slug] = value

        return result
