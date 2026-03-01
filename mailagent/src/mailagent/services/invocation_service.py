"""Agent invocation service for handling @mentions and direct agent calls from Aexy."""

import re
from datetime import datetime, timezone, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy import select, update, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from mailagent.models import Agent, AgentInvocation, AgentAction
from mailagent.llm import get_llm_provider, LLMProvider, LLMMessage, LLMConfig


# Pattern to match @agent-name mentions
MENTION_PATTERN = re.compile(r'@([a-zA-Z0-9_-]+)', re.IGNORECASE)


class InvocationService:
    """Service for handling agent invocations from Aexy."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def parse_mentions(self, text: str, workspace_id: UUID) -> list[Agent]:
        """Parse @mentions from text and return matching agents.

        Args:
            text: Text containing potential @mentions
            workspace_id: Workspace to search for agents in

        Returns:
            List of Agent objects matching the mentions
        """
        mentions = MENTION_PATTERN.findall(text)
        if not mentions:
            return []

        # Normalize mention handles
        handles = [m.lower().replace('_', '-') for m in mentions]

        # Find matching agents
        result = await self.db.execute(
            select(Agent).where(
                and_(
                    Agent.workspace_id == workspace_id,
                    Agent.is_active == True,
                    Agent.mention_handle.in_(handles)
                )
            )
        )
        return list(result.scalars().all())

    async def create_invocation(
        self,
        agent_id: UUID,
        workspace_id: UUID,
        source_type: str,
        invoked_by: UUID,
        invoked_by_name: Optional[str] = None,
        entity_type: Optional[str] = None,
        entity_id: Optional[UUID] = None,
        activity_id: Optional[UUID] = None,
        instruction: Optional[str] = None,
        context: Optional[dict] = None,
    ) -> AgentInvocation:
        """Create a new agent invocation record.

        Args:
            agent_id: ID of the agent being invoked
            workspace_id: Workspace ID
            source_type: How the agent was invoked (comment, direct, scheduled)
            invoked_by: User ID who invoked the agent
            invoked_by_name: User's display name
            entity_type: Type of entity the agent is working on
            entity_id: ID of the entity
            activity_id: ID of the entity activity (comment) that triggered this
            instruction: The instruction/prompt given to the agent
            context: Additional context for the agent

        Returns:
            Created AgentInvocation
        """
        invocation = AgentInvocation(
            agent_id=agent_id,
            workspace_id=workspace_id,
            source_type=source_type,
            invoked_by=invoked_by,
            invoked_by_name=invoked_by_name,
            entity_type=entity_type,
            entity_id=entity_id,
            activity_id=activity_id,
            instruction=instruction,
            context=context or {},
            status="pending",
        )
        self.db.add(invocation)
        await self.db.commit()
        await self.db.refresh(invocation)
        return invocation

    async def process_invocation(
        self,
        invocation_id: UUID,
    ) -> list[AgentAction]:
        """Process an agent invocation and generate actions.

        This is the main entry point for agent processing.

        Args:
            invocation_id: ID of the invocation to process

        Returns:
            List of generated AgentAction objects
        """
        # Get the invocation
        result = await self.db.execute(
            select(AgentInvocation).where(AgentInvocation.id == invocation_id)
        )
        invocation = result.scalar_one_or_none()
        if not invocation:
            raise ValueError(f"Invocation {invocation_id} not found")

        # Get the agent
        agent_result = await self.db.execute(
            select(Agent).where(Agent.id == invocation.agent_id)
        )
        agent = agent_result.scalar_one_or_none()
        if not agent:
            raise ValueError(f"Agent {invocation.agent_id} not found")

        # Update status to processing
        invocation.status = "processing"
        invocation.started_at = datetime.now(timezone.utc)
        await self.db.commit()

        try:
            # Build context for the agent
            agent_context = await self._build_agent_context(invocation, agent)

            # Get the agent's response
            response = await self._execute_agent(agent, invocation, agent_context)

            # Parse response into actions
            actions = await self._parse_agent_response(
                response, invocation, agent
            )

            # Save actions
            for action in actions:
                self.db.add(action)

            # Update invocation status
            if not actions:
                invocation.status = "completed"
                invocation.completed_at = datetime.now(timezone.utc)
            else:
                # Check if any actions require review
                needs_review = any(a.requires_review for a in actions)
                if not needs_review:
                    invocation.status = "completed"
                    invocation.completed_at = datetime.now(timezone.utc)
                else:
                    invocation.status = "awaiting_review"

            await self.db.commit()
            return actions

        except Exception as e:
            invocation.status = "failed"
            invocation.error = str(e)
            invocation.completed_at = datetime.now(timezone.utc)
            await self.db.commit()
            raise

    async def _build_agent_context(
        self, invocation: AgentInvocation, agent: Agent
    ) -> dict:
        """Build context dictionary for agent processing."""
        context = {
            "workspace_id": str(invocation.workspace_id),
            "entity_type": invocation.entity_type,
            "entity_id": str(invocation.entity_id) if invocation.entity_id else None,
            "invoked_by": str(invocation.invoked_by),
            "invoked_by_name": invocation.invoked_by_name,
            "instruction": invocation.instruction,
            "source_type": invocation.source_type,
            **invocation.context,
        }

        # Add agent-specific context
        if agent.custom_instructions:
            context["custom_instructions"] = agent.custom_instructions

        return context

    async def _execute_agent(
        self,
        agent: Agent,
        invocation: AgentInvocation,
        context: dict,
    ) -> dict:
        """Execute the agent and get its response."""
        # Build the system prompt
        system_prompt = self._build_system_prompt(agent, context)

        # Build the user message
        user_message = self._build_user_message(invocation, context)

        # Get LLM provider
        llm = get_llm_provider(provider=agent.llm_provider)

        # Configure LLM
        config = LLMConfig(
            model=agent.llm_model,
            temperature=agent.temperature or 0.7,
            max_tokens=agent.max_tokens or 2000,
            response_format="json",
        )

        # Call the LLM using the generate_json method
        try:
            return await llm.generate_json(
                prompt=user_message,
                system_prompt=system_prompt,
                config=config,
            )
        except Exception:
            # Fallback to simple generation if JSON parsing fails
            content = await llm.generate_simple(
                prompt=user_message,
                system_prompt=system_prompt,
                config=config,
            )
            return {"actions": [], "response": content}

    def _build_system_prompt(self, agent: Agent, context: dict) -> str:
        """Build the system prompt for the agent."""
        base_prompt = agent.system_prompt or f"""You are {agent.name}, an AI assistant specialized in {agent.agent_type} tasks.

Your role is to help users by analyzing their requests and proposing appropriate actions.
You work within a workspace and can interact with tasks, tickets, CRM records, calendar, and more.

When responding, you must return a JSON object with the following structure:
{{
    "reasoning": "Your analysis and reasoning for the proposed actions",
    "actions": [
        {{
            "action_type": "create_task|update_task|move_task|add_comment|schedule_meeting|send_email|update_ticket|update_crm|escalate|link_entities",
            "target_entity_type": "task|ticket|crm_record|booking|document",
            "target_entity_id": "uuid or null for create actions",
            "payload": {{
                // Action-specific payload
            }},
            "confidence": 0.0-1.0,
            "preview_summary": "Human-readable summary of this action"
        }}
    ],
    "response": "A friendly response to show the user about what you're planning to do"
}}

Guidelines:
- Be helpful and proactive but don't overreach
- If you're unsure, set a lower confidence score
- Actions with confidence below {agent.require_approval_below} will require human review
- Always explain your reasoning
"""

        if context.get("custom_instructions"):
            base_prompt += f"\n\nAdditional Instructions:\n{context['custom_instructions']}"

        return base_prompt

    def _build_user_message(
        self, invocation: AgentInvocation, context: dict
    ) -> str:
        """Build the user message for the agent."""
        parts = []

        if invocation.instruction:
            parts.append(f"User Request: {invocation.instruction}")

        if context.get("entity_type") and context.get("entity_id"):
            parts.append(f"\nContext: Working with {context['entity_type']} (ID: {context['entity_id']})")

        if context.get("entity_data"):
            import json
            parts.append(f"\nEntity Data:\n```json\n{json.dumps(context['entity_data'], indent=2)}\n```")

        if context.get("related_entities"):
            import json
            parts.append(f"\nRelated Entities:\n```json\n{json.dumps(context['related_entities'], indent=2)}\n```")

        return "\n".join(parts) or "Please analyze the context and propose appropriate actions."

    async def _parse_agent_response(
        self,
        response: dict,
        invocation: AgentInvocation,
        agent: Agent,
    ) -> list[AgentAction]:
        """Parse agent response into AgentAction objects."""
        actions = []
        raw_actions = response.get("actions", [])

        for raw_action in raw_actions:
            confidence = raw_action.get("confidence", 0.5)

            # Determine if review is required
            requires_review = confidence < agent.require_approval_below

            action = AgentAction(
                invocation_id=invocation.id,
                agent_id=agent.id,
                workspace_id=invocation.workspace_id,
                action_type=raw_action.get("action_type", "unknown"),
                target_entity_type=raw_action.get("target_entity_type"),
                target_entity_id=raw_action.get("target_entity_id"),
                action_payload=raw_action.get("payload", {}),
                confidence=confidence,
                reasoning=response.get("reasoning"),
                preview_summary=raw_action.get("preview_summary"),
                requires_review=requires_review,
                review_status="pending" if requires_review else "auto_approved",
                expires_at=datetime.now(timezone.utc) + timedelta(days=7),
            )
            actions.append(action)

        return actions

    async def get_pending_actions(
        self,
        workspace_id: UUID,
        agent_id: Optional[UUID] = None,
        entity_type: Optional[str] = None,
        entity_id: Optional[UUID] = None,
        limit: int = 50,
    ) -> list[AgentAction]:
        """Get pending actions requiring review.

        Args:
            workspace_id: Filter by workspace
            agent_id: Optional filter by agent
            entity_type: Optional filter by entity type
            entity_id: Optional filter by specific entity
            limit: Maximum number of actions to return

        Returns:
            List of AgentAction objects pending review
        """
        query = select(AgentAction).where(
            and_(
                AgentAction.workspace_id == workspace_id,
                AgentAction.requires_review == True,
                AgentAction.review_status == "pending",
                or_(
                    AgentAction.expires_at.is_(None),
                    AgentAction.expires_at > datetime.now(timezone.utc)
                )
            )
        )

        if agent_id:
            query = query.where(AgentAction.agent_id == agent_id)

        if entity_type:
            query = query.where(AgentAction.target_entity_type == entity_type)

        if entity_id:
            query = query.where(AgentAction.target_entity_id == entity_id)

        query = query.order_by(AgentAction.created_at.desc()).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def approve_action(
        self,
        action_id: UUID,
        reviewed_by: UUID,
        reviewed_by_name: Optional[str] = None,
        notes: Optional[str] = None,
        modified_payload: Optional[dict] = None,
    ) -> AgentAction:
        """Approve an action for execution.

        Args:
            action_id: ID of the action to approve
            reviewed_by: User ID approving the action
            reviewed_by_name: User's display name
            notes: Optional review notes
            modified_payload: Optional modified payload to use instead

        Returns:
            Updated AgentAction
        """
        result = await self.db.execute(
            select(AgentAction).where(AgentAction.id == action_id)
        )
        action = result.scalar_one_or_none()
        if not action:
            raise ValueError(f"Action {action_id} not found")

        if action.review_status != "pending":
            raise ValueError(f"Action is already {action.review_status}")

        action.review_status = "approved"
        action.reviewed_by = reviewed_by
        action.reviewed_by_name = reviewed_by_name
        action.reviewed_at = datetime.now(timezone.utc)
        action.review_notes = notes
        if modified_payload:
            action.modified_payload = modified_payload

        await self.db.commit()
        await self.db.refresh(action)
        return action

    async def reject_action(
        self,
        action_id: UUID,
        reviewed_by: UUID,
        reviewed_by_name: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> AgentAction:
        """Reject an action.

        Args:
            action_id: ID of the action to reject
            reviewed_by: User ID rejecting the action
            reviewed_by_name: User's display name
            notes: Optional rejection reason

        Returns:
            Updated AgentAction
        """
        result = await self.db.execute(
            select(AgentAction).where(AgentAction.id == action_id)
        )
        action = result.scalar_one_or_none()
        if not action:
            raise ValueError(f"Action {action_id} not found")

        if action.review_status != "pending":
            raise ValueError(f"Action is already {action.review_status}")

        action.review_status = "rejected"
        action.reviewed_by = reviewed_by
        action.reviewed_by_name = reviewed_by_name
        action.reviewed_at = datetime.now(timezone.utc)
        action.review_notes = notes

        await self.db.commit()
        await self.db.refresh(action)
        return action

    async def execute_action(
        self, action_id: UUID
    ) -> AgentAction:
        """Execute an approved action.

        This method calls out to Aexy's APIs to actually perform the action.

        Args:
            action_id: ID of the action to execute

        Returns:
            Updated AgentAction with execution result
        """
        result = await self.db.execute(
            select(AgentAction).where(AgentAction.id == action_id)
        )
        action = result.scalar_one_or_none()
        if not action:
            raise ValueError(f"Action {action_id} not found")

        if action.review_status not in ("approved", "auto_approved"):
            raise ValueError(f"Action must be approved before execution")

        if action.executed:
            raise ValueError(f"Action already executed")

        try:
            # Get the payload to use
            payload = action.modified_payload or action.action_payload

            # Execute based on action type
            execution_result = await self._execute_action_type(
                action.action_type,
                action.target_entity_type,
                action.target_entity_id,
                payload,
                action.workspace_id,
            )

            action.executed = True
            action.executed_at = datetime.now(timezone.utc)
            action.execution_result = execution_result

        except Exception as e:
            action.executed = True
            action.executed_at = datetime.now(timezone.utc)
            action.execution_error = str(e)

        await self.db.commit()
        await self.db.refresh(action)
        return action

    async def _execute_action_type(
        self,
        action_type: str,
        target_entity_type: Optional[str],
        target_entity_id: Optional[UUID],
        payload: dict,
        workspace_id: UUID,
    ) -> dict:
        """Execute a specific action type by calling Aexy's APIs.

        This is where we integrate with Aexy's backend.
        """
        import httpx

        # Get Aexy backend URL from config
        from mailagent.config import get_settings
        settings = get_settings()
        aexy_url = settings.backend_url

        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = {
                "Content-Type": "application/json",
                "X-Workspace-ID": str(workspace_id),
                "X-Agent-Action": "true",  # Flag that this is an agent action
            }

            if action_type == "create_task":
                response = await client.post(
                    f"{aexy_url}/api/v1/workspaces/{workspace_id}/sprint-tasks",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
                return {"task_id": response.json().get("id"), "status": "created"}

            elif action_type == "update_task":
                response = await client.patch(
                    f"{aexy_url}/api/v1/workspaces/{workspace_id}/sprint-tasks/{target_entity_id}",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
                return {"task_id": str(target_entity_id), "status": "updated"}

            elif action_type == "move_task":
                response = await client.patch(
                    f"{aexy_url}/api/v1/workspaces/{workspace_id}/sprint-tasks/{target_entity_id}",
                    json={"sprint_id": payload.get("sprint_id"), "status_id": payload.get("status_id")},
                    headers=headers,
                )
                response.raise_for_status()
                return {"task_id": str(target_entity_id), "status": "moved"}

            elif action_type == "add_comment":
                response = await client.post(
                    f"{aexy_url}/api/v1/workspaces/{workspace_id}/activities",
                    json={
                        "entity_type": target_entity_type,
                        "entity_id": str(target_entity_id),
                        "activity_type": "comment",
                        "content": payload.get("content"),
                    },
                    headers=headers,
                )
                response.raise_for_status()
                return {"activity_id": response.json().get("id"), "status": "commented"}

            elif action_type == "update_ticket":
                response = await client.patch(
                    f"{aexy_url}/api/v1/workspaces/{workspace_id}/tickets/{target_entity_id}",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
                return {"ticket_id": str(target_entity_id), "status": "updated"}

            elif action_type == "update_crm":
                response = await client.patch(
                    f"{aexy_url}/api/v1/workspaces/{workspace_id}/crm/records/{target_entity_id}",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
                return {"record_id": str(target_entity_id), "status": "updated"}

            elif action_type == "schedule_meeting":
                response = await client.post(
                    f"{aexy_url}/api/v1/workspaces/{workspace_id}/bookings",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
                return {"booking_id": response.json().get("id"), "status": "scheduled"}

            elif action_type == "send_email":
                # Use mailagent's own send service
                from mailagent.services import get_send_service
                send_service = get_send_service()
                result = await send_service.send_email(
                    from_address=payload.get("from_address"),
                    to_addresses=payload.get("to_addresses"),
                    subject=payload.get("subject"),
                    body_text=payload.get("body_text"),
                    body_html=payload.get("body_html"),
                )
                return {"message_id": result.message_id, "status": "sent"}

            elif action_type == "escalate":
                # Create an escalation notification
                return {"status": "escalated", "details": payload}

            else:
                return {"status": "unknown_action_type", "action_type": action_type}

    async def get_agents_for_workspace(
        self, workspace_id: UUID
    ) -> list[Agent]:
        """Get all agents available in a workspace.

        Args:
            workspace_id: Workspace ID

        Returns:
            List of active agents
        """
        result = await self.db.execute(
            select(Agent).where(
                and_(
                    Agent.workspace_id == workspace_id,
                    Agent.is_active == True
                )
            ).order_by(Agent.name)
        )
        return list(result.scalars().all())


# Singleton
_invocation_service: Optional[InvocationService] = None


async def get_invocation_service(db: AsyncSession) -> InvocationService:
    """Get invocation service instance."""
    return InvocationService(db)
