"""Service for handling @agent mentions in comments and activities."""

import re
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.integrations import get_mailagent_client, MailagentError
from aexy.models.entity_activity import EntityActivity
from aexy.models.notification import NotificationEventType
from aexy.services.notification_service import NotificationService


# Pattern to match @agent-name mentions
AGENT_MENTION_PATTERN = re.compile(r'@([a-zA-Z0-9_-]+)', re.IGNORECASE)


class AgentMentionService:
    """Service for handling AI agent mentions in comments."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.client = get_mailagent_client()

    async def process_comment_for_mentions(
        self,
        workspace_id: UUID,
        entity_type: str,
        entity_id: UUID,
        activity_id: UUID,
        comment_content: str,
        author_id: UUID,
        author_name: Optional[str] = None,
        entity_data: Optional[dict] = None,
    ) -> list[dict]:
        """Process a comment for @agent mentions and invoke agents.

        This should be called after a comment is created to check for
        agent mentions and trigger agent processing.

        Args:
            workspace_id: Workspace ID
            entity_type: Type of entity (task, ticket, etc.)
            entity_id: ID of the entity
            activity_id: ID of the created activity
            comment_content: The comment text
            author_id: ID of the user who wrote the comment
            author_name: Name of the user
            entity_data: Optional entity data for context

        Returns:
            List of invocation results
        """
        # First, check if there are any mentions
        mentions = AGENT_MENTION_PATTERN.findall(comment_content)
        if not mentions:
            return []

        try:
            # Parse mentions to find matching agents
            agents = await self.client.parse_mentions(comment_content, workspace_id)
            if not agents:
                return []

            invocations = []
            for agent in agents:
                # Extract the instruction for this agent
                instruction = self._extract_instruction_for_agent(
                    comment_content, agent.mention_handle or agent.name
                )

                # Build context
                context = {
                    "entity_data": entity_data or {},
                    "comment_content": comment_content,
                }

                # Invoke the agent
                try:
                    result = await self.client.invoke_agent(
                        workspace_id=workspace_id,
                        invoked_by=author_id,
                        agent_id=agent.id,
                        source_type="comment",
                        entity_type=entity_type,
                        entity_id=entity_id,
                        activity_id=activity_id,
                        invoked_by_name=author_name,
                        instruction=instruction,
                        context=context,
                    )

                    invocations.append({
                        "agent_id": str(agent.id),
                        "agent_name": agent.name,
                        "invocation_id": str(result.id),
                        "status": result.status,
                    })

                    # Create a notification about the agent being invoked
                    await self._create_agent_invoked_notification(
                        workspace_id=workspace_id,
                        recipient_id=author_id,
                        agent_name=agent.name,
                        entity_type=entity_type,
                        entity_id=entity_id,
                    )

                except MailagentError as e:
                    invocations.append({
                        "agent_id": str(agent.id),
                        "agent_name": agent.name,
                        "error": str(e),
                    })

            return invocations

        except MailagentError:
            # If mailagent is unavailable, silently skip agent processing
            return []

    def _extract_instruction_for_agent(
        self, content: str, agent_handle: str
    ) -> str:
        """Extract the instruction meant for a specific agent.

        This parses the comment to find text after the @mention that
        appears to be directed at the agent.
        """
        # Simple approach: get everything after the mention until another mention or end
        pattern = rf'@{re.escape(agent_handle)}\s*(.+?)(?=@[a-zA-Z0-9_-]+|$)'
        match = re.search(pattern, content, re.IGNORECASE | re.DOTALL)
        if match:
            return match.group(1).strip()
        return content  # Fall back to full content

    async def _create_agent_invoked_notification(
        self,
        workspace_id: UUID,
        recipient_id: UUID,
        agent_name: str,
        entity_type: str,
        entity_id: UUID,
    ) -> None:
        """Create a notification that an agent was invoked."""
        try:
            notif_service = NotificationService(self.db)
            await notif_service.create_notification(
                recipient_id=str(recipient_id),
                event_type=NotificationEventType.AGENT_INVOKED,
                title=f"{agent_name} is working on your request",
                body=f"The {agent_name} agent has been invoked and is processing your request. You'll be notified when there are actions to review.",
                context={
                    "workspace_id": str(workspace_id),
                    "agent_name": agent_name,
                    "entity_type": entity_type,
                    "entity_id": str(entity_id),
                },
            )
        except Exception:
            pass  # Non-critical, don't fail the agent invocation

    async def get_available_agents(
        self, workspace_id: UUID
    ) -> list[dict]:
        """Get available agents for @mention autocomplete.

        Args:
            workspace_id: Workspace ID

        Returns:
            List of agents with mention handles
        """
        try:
            agents = await self.client.get_workspace_agents(workspace_id)
            return [
                {
                    "id": str(a.id),
                    "name": a.name,
                    "handle": a.mention_handle or a.name.lower().replace(" ", "-"),
                    "type": a.agent_type,
                    "description": a.description,
                }
                for a in agents
            ]
        except MailagentError:
            return []

    async def get_pending_reviews_for_user(
        self,
        workspace_id: UUID,
        user_id: UUID,
        entity_type: Optional[str] = None,
        entity_id: Optional[UUID] = None,
    ) -> list[dict]:
        """Get pending agent actions that need review.

        Args:
            workspace_id: Workspace ID
            user_id: User ID (for filtering relevant actions)
            entity_type: Optional filter by entity type
            entity_id: Optional filter by entity ID

        Returns:
            List of pending actions
        """
        try:
            actions = await self.client.get_pending_actions(
                workspace_id=workspace_id,
                entity_type=entity_type,
                entity_id=entity_id,
            )
            return [
                {
                    "id": str(a.id),
                    "agent_id": str(a.agent_id),
                    "action_type": a.action_type,
                    "target_entity_type": a.target_entity_type,
                    "target_entity_id": str(a.target_entity_id) if a.target_entity_id else None,
                    "payload": a.action_payload,
                    "confidence": a.confidence,
                    "reasoning": a.reasoning,
                    "preview": a.preview_summary,
                }
                for a in actions
            ]
        except MailagentError:
            return []

    async def approve_action(
        self,
        action_id: UUID,
        user_id: UUID,
        user_name: Optional[str] = None,
        notes: Optional[str] = None,
        modified_payload: Optional[dict] = None,
    ) -> dict:
        """Approve an agent action.

        Args:
            action_id: Action ID
            user_id: User approving
            user_name: User's name
            notes: Optional notes
            modified_payload: Optional modified payload

        Returns:
            Updated action
        """
        result = await self.client.approve_action(
            action_id=action_id,
            reviewed_by=user_id,
            reviewed_by_name=user_name,
            notes=notes,
            modified_payload=modified_payload,
        )
        return {
            "id": str(result.id),
            "status": result.review_status,
            "executed": result.executed,
        }

    async def reject_action(
        self,
        action_id: UUID,
        user_id: UUID,
        user_name: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> dict:
        """Reject an agent action.

        Args:
            action_id: Action ID
            user_id: User rejecting
            user_name: User's name
            notes: Rejection reason

        Returns:
            Updated action
        """
        result = await self.client.reject_action(
            action_id=action_id,
            reviewed_by=user_id,
            reviewed_by_name=user_name,
            notes=notes,
        )
        return {
            "id": str(result.id),
            "status": result.review_status,
        }


def get_agent_mention_service(db: AsyncSession) -> AgentMentionService:
    """Get the agent mention service."""
    return AgentMentionService(db)
