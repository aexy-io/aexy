"""Linear Integration Service for managing Linear connections and syncing issues."""

import logging
import secrets
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import httpx
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.models.integrations import LinearIntegration
from devograph.models.sprint import Sprint, SprintTask
from devograph.schemas.integrations import (
    ConnectionTestResponse,
    RemoteTeam,
    RemoteStatus,
    RemoteField,
    SyncResult,
)

logger = logging.getLogger(__name__)


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

    async def sync_issues(
        self,
        workspace_id: str,
        team_id: str | None = None,
        sprint_id: str | None = None,
    ) -> SyncResult:
        """Sync issues from Linear to sprint tasks.

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

                    # Find active sprint for this team
                    target_sprint_id = sprint_id
                    if not target_sprint_id:
                        target_sprint_id = await self._get_active_sprint_id(mapped_team_id)
                        if not target_sprint_id:
                            errors.append(f"No active sprint found for team {mapped_team_id}")
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
                                    updatedAt
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
                            errors.append(f"Failed to sync issue {issue.get('identifier')}: {str(e)}")
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
        integration: LinearIntegration,
    ) -> str:
        """Sync a single Linear issue to a SprintTask.

        Returns:
            "created" or "updated"
        """
        issue_id = issue.get("id")
        identifier = issue.get("identifier")  # e.g., "TEAM-123"

        # Check if task already exists
        stmt = select(SprintTask).where(
            and_(
                SprintTask.sprint_id == sprint_id,
                SprintTask.source_type == "linear",
                SprintTask.source_id == identifier,
            )
        )
        result = await self.db.execute(stmt)
        existing_task = result.scalar_one_or_none()

        # Extract data from issue
        title = issue.get("title", "Untitled")
        description = issue.get("description")
        state = issue.get("state", {})
        state_id = state.get("id", "")
        state_type = state.get("type", "")
        priority_num = issue.get("priority", 0)
        story_points = issue.get("estimate")
        labels = [l["name"] for l in issue.get("labels", {}).get("nodes", [])]
        source_url = issue.get("url")

        # Map status using state_id
        mapped_status = self.map_status(state_id, integration)
        if mapped_status == "backlog":
            # Try mapping by state type
            type_map = {
                "backlog": "backlog",
                "unstarted": "todo",
                "started": "in_progress",
                "completed": "done",
                "canceled": "done",
            }
            mapped_status = type_map.get(state_type, "backlog")

        # Map priority (Linear uses 0-4 scale, 0 = no priority, 1 = urgent, 4 = low)
        priority_map = {
            0: "medium",
            1: "critical",
            2: "high",
            3: "medium",
            4: "low",
        }
        priority = priority_map.get(priority_num, "medium")

        # Parse updated timestamp
        updated_str = issue.get("updatedAt")
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
            existing_task.story_points = story_points
            existing_task.labels = labels
            existing_task.external_updated_at = external_updated_at
            existing_task.last_synced_at = datetime.now(timezone.utc)
            existing_task.sync_status = "synced"
            await self.db.flush()
            logger.info(f"Updated task from Linear issue {identifier}")
            return "updated"
        else:
            # Create new task
            task = SprintTask(
                id=str(uuid4()),
                sprint_id=sprint_id,
                source_type="linear",
                source_id=identifier,
                source_url=source_url,
                title=title,
                description=description,
                priority=priority,
                story_points=story_points,
                labels=labels,
                status=mapped_status,
                external_updated_at=external_updated_at,
                last_synced_at=datetime.now(timezone.utc),
                sync_status="synced",
            )
            self.db.add(task)
            await self.db.flush()
            logger.info(f"Created task from Linear issue {identifier}")
            return "created"

    async def handle_webhook(
        self,
        workspace_id: str,
        payload: dict,
    ) -> dict[str, Any]:
        """Handle incoming Linear webhook.

        Args:
            workspace_id: Workspace ID for context
            payload: Webhook payload from Linear

        Returns:
            Dict with processing result
        """
        action = payload.get("action", "")
        data_type = payload.get("type", "")
        result = {"event": f"{data_type}:{action}", "processed": False}

        integration = await self.get_integration(workspace_id)
        if not integration:
            result["error"] = "Integration not found"
            return result

        if data_type == "Issue":
            issue_data = payload.get("data", {})
            if not issue_data:
                result["error"] = "No issue data in payload"
                return result

            identifier = issue_data.get("identifier")
            team_data = issue_data.get("team", {})
            linear_team_id = team_data.get("id")

            # Find workspace team for this Linear team
            workspace_team_id = None
            for tid, config in integration.team_mappings.items():
                if config.get("linear_team_id") == linear_team_id:
                    workspace_team_id = tid
                    break

            if not workspace_team_id:
                result["error"] = f"No team mapping for Linear team {linear_team_id}"
                return result

            if action in ("create", "update"):
                # Find active sprint
                sprint_id = await self._get_active_sprint_id(workspace_team_id)
                if not sprint_id:
                    result["error"] = f"No active sprint for team {workspace_team_id}"
                    return result

                # Build issue dict matching the sync format
                issue = {
                    "id": issue_data.get("id"),
                    "identifier": identifier,
                    "title": issue_data.get("title"),
                    "description": issue_data.get("description"),
                    "state": issue_data.get("state", {}),
                    "priority": issue_data.get("priority", 0),
                    "estimate": issue_data.get("estimate"),
                    "labels": {"nodes": issue_data.get("labels", [])},
                    "url": issue_data.get("url"),
                    "updatedAt": issue_data.get("updatedAt"),
                }

                try:
                    sync_action = await self._sync_issue_to_task(issue, sprint_id, integration)
                    result["processed"] = True
                    result["action"] = sync_action
                    result["issue_identifier"] = identifier
                    logger.info(f"Webhook processed: {sync_action} task for {identifier}")
                except Exception as e:
                    result["error"] = str(e)
                    logger.error(f"Webhook error for {identifier}: {e}")

            elif action == "remove":
                # Find and mark task as cancelled
                stmt = select(SprintTask).where(
                    and_(
                        SprintTask.source_type == "linear",
                        SprintTask.source_id == identifier,
                    )
                )
                task_result = await self.db.execute(stmt)
                task = task_result.scalar_one_or_none()

                if task:
                    task.status = "done"
                    task.sync_status = "synced"
                    await self.db.flush()
                    result["processed"] = True
                    result["action"] = "deleted"
                    result["issue_identifier"] = identifier
                    logger.info(f"Marked task as done for deleted issue {identifier}")

        return result

    async def push_task_update(
        self,
        task: SprintTask,
    ) -> bool:
        """Push task updates back to Linear (bidirectional sync).

        Args:
            task: The SprintTask to sync to Linear

        Returns:
            True if successful
        """
        if task.source_type != "linear":
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

        # Linear doesn't have a sync_direction field, so we check team config
        # For now, always allow push if integration exists
        # Find the target state ID by reverse mapping
        target_state_id = None
        for state_id, workspace_status in integration.status_mappings.items():
            if workspace_status == task.status:
                target_state_id = state_id
                break

        if not target_state_id:
            # Try to map by default state types
            status_to_type = {
                "backlog": "backlog",
                "todo": "unstarted",
                "in_progress": "started",
                "review": "started",
                "done": "completed",
            }
            target_type = status_to_type.get(task.status)

            if target_type:
                # We'd need to fetch states to find the right one
                # For now, skip if no direct mapping exists
                logger.warning(f"No Linear state mapping for {task.status}")
                return False

        try:
            async with httpx.AsyncClient() as client:
                # Update issue state using GraphQL mutation
                mutation = """
                    mutation($issueId: String!, $stateId: String!) {
                        issueUpdate(id: $issueId, input: { stateId: $stateId }) {
                            success
                            issue {
                                id
                                identifier
                                state {
                                    name
                                }
                            }
                        }
                    }
                """

                # We need to get the Linear issue ID from identifier
                # First fetch the issue
                query = """
                    query($identifier: String!) {
                        issue(id: $identifier) {
                            id
                        }
                    }
                """

                # Actually, Linear uses identifier differently
                # We need to search by identifier
                search_query = """
                    query($filter: IssueFilter!) {
                        issues(filter: $filter, first: 1) {
                            nodes {
                                id
                            }
                        }
                    }
                """

                response = await client.post(
                    LINEAR_API_URL,
                    json={
                        "query": search_query,
                        "variables": {
                            "filter": {"identifier": {"eq": task.source_id}},
                        },
                    },
                    headers={
                        "Authorization": integration.api_key,
                        "Content-Type": "application/json",
                    },
                    timeout=10.0,
                )

                if response.status_code != 200:
                    logger.error(f"Failed to find Linear issue: {response.status_code}")
                    return False

                data = response.json()
                issues = data.get("data", {}).get("issues", {}).get("nodes", [])
                if not issues:
                    logger.error(f"Linear issue {task.source_id} not found")
                    return False

                linear_issue_id = issues[0]["id"]

                # Now update the issue
                update_response = await client.post(
                    LINEAR_API_URL,
                    json={
                        "query": mutation,
                        "variables": {
                            "issueId": linear_issue_id,
                            "stateId": target_state_id,
                        },
                    },
                    headers={
                        "Authorization": integration.api_key,
                        "Content-Type": "application/json",
                    },
                    timeout=10.0,
                )

                if update_response.status_code == 200:
                    update_data = update_response.json()
                    if update_data.get("data", {}).get("issueUpdate", {}).get("success"):
                        task.last_synced_at = datetime.now(timezone.utc)
                        task.sync_status = "synced"
                        await self.db.flush()
                        logger.info(f"Pushed status update to Linear for {task.source_id}")
                        return True

                logger.error(f"Failed to update Linear issue: {update_response.text}")

        except Exception as e:
            logger.error(f"Failed to push update to Linear: {e}")

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
