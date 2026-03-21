"""Agent email service for managing agent email addresses and inbox routing."""

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.agent import CRMAgent
from aexy.models.agent_inbox import AgentInboxMessage, AgentEmailRoutingRule
from aexy.models.workspace import Workspace
from aexy.services.postmark_account_service import PostmarkAccountService

logger = logging.getLogger(__name__)


class AgentEmailService:
    """Manages agent email addresses and inbox routing."""

    # Email domain for agent emails
    AGENT_EMAIL_DOMAIN = "aexy.email"

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # EMAIL ADDRESS ALLOCATION
    # =========================================================================

    async def allocate_email_address(
        self,
        workspace_id: str,
        agent_id: str,
        preferred_handle: str | None = None,
    ) -> str:
        """
        Allocate an email address for an agent.
        Format: {handle}@{workspace-slug}.aexy.email
        """
        agent = await self._get_agent(agent_id)
        if not agent:
            raise ValueError(f"Agent {agent_id} not found")

        if agent.workspace_id != workspace_id:
            raise ValueError("Agent does not belong to this workspace")

        # If agent already has an email, return it
        if agent.email_address:
            return agent.email_address

        workspace = await self._get_workspace(workspace_id)
        if not workspace:
            raise ValueError(f"Workspace {workspace_id} not found")

        # Determine handle: use preferred, then agent's mention_handle, then slugified name
        handle = preferred_handle or agent.mention_handle or self._slugify(agent.name)

        # Build email address
        base_email = f"{handle}@{workspace.slug}.{self.AGENT_EMAIL_DOMAIN}"
        email = base_email
        counter = 1

        # Ensure uniqueness
        while await self._email_exists(email):
            email = f"{handle}{counter}@{workspace.slug}.{self.AGENT_EMAIL_DOMAIN}"
            counter += 1

        # Update agent
        agent.email_address = email
        agent.email_enabled = True
        await self.db.flush()
        await self.db.refresh(agent)

        # Register sender signature with Postmark if configured
        postmark = PostmarkAccountService()
        if postmark.is_configured:
            try:
                await postmark.create_sender_signature(
                    from_email=email,
                    from_name=agent.name,
                )
            except Exception as e:
                logger.warning(f"Failed to create Postmark sender signature for {email}: {e}")

        logger.info(f"Allocated email {email} for agent {agent_id}")
        return email

    async def disable_email(self, agent_id: str) -> None:
        """Disable email for an agent."""
        agent = await self._get_agent(agent_id)
        if not agent:
            raise ValueError(f"Agent {agent_id} not found")

        # Remove sender signature from Postmark if configured
        if agent.email_address:
            postmark = PostmarkAccountService()
            if postmark.is_configured:
                try:
                    sigs = await postmark.list_sender_signatures()
                    for sig in sigs.get("SenderSignatures", []):
                        if sig.get("EmailAddress") == agent.email_address:
                            await postmark.delete_sender_signature(sig["ID"])
                            break
                except Exception as e:
                    logger.warning(f"Failed to delete Postmark sender signature for {agent.email_address}: {e}")

        agent.email_enabled = False
        await self.db.flush()
        logger.info(f"Disabled email for agent {agent_id}")

    async def enable_email(self, agent_id: str) -> str:
        """Enable email for an agent. Allocates address if needed."""
        agent = await self._get_agent(agent_id)
        if not agent:
            raise ValueError(f"Agent {agent_id} not found")

        if not agent.email_address:
            # Allocate a new email address
            email = await self.allocate_email_address(agent.workspace_id, agent_id)
            return email

        agent.email_enabled = True
        await self.db.flush()
        return agent.email_address

    # =========================================================================
    # EMAIL ROUTING
    # =========================================================================

    async def route_incoming_email(
        self,
        to_email: str,
        from_email: str,
        subject: str,
        body: str,
        raw_payload: dict,
    ) -> AgentInboxMessage | None:
        """
        Route an incoming email to the appropriate agent.
        Returns the created inbox message or None if no agent found.
        """
        # First, try direct email address match
        agent = await self._find_agent_by_email(to_email)

        if not agent or not agent.email_enabled:
            # Try routing rules
            agent = await self._find_agent_by_rules(from_email, subject, body)

        if not agent:
            logger.warning(f"No agent found for email to {to_email}")
            return None

        # Create inbox message
        message = AgentInboxMessage(
            id=str(uuid4()),
            agent_id=agent.id,
            workspace_id=agent.workspace_id,
            message_id=raw_payload.get("message_id", str(uuid4())),
            thread_id=raw_payload.get("thread_id"),
            from_email=from_email,
            from_name=raw_payload.get("from_name"),
            to_email=to_email,
            subject=subject,
            body_text=body,
            body_html=raw_payload.get("body_html"),
            status="pending",
            priority="normal",
            headers=raw_payload.get("headers"),
            attachments=raw_payload.get("attachments"),
            raw_payload=raw_payload,
        )
        self.db.add(message)
        await self.db.flush()
        await self.db.refresh(message)

        logger.info(f"Routed email to agent {agent.id}, inbox message {message.id}")
        return message

    async def _find_agent_by_email(self, email: str) -> CRMAgent | None:
        """Find agent by exact email address match."""
        stmt = select(CRMAgent).where(
            CRMAgent.email_address == email,
            CRMAgent.email_enabled == True,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _find_agent_by_rules(
        self,
        from_email: str,
        subject: str,
        body: str,
    ) -> CRMAgent | None:
        """Find agent using routing rules."""
        # Get all active routing rules ordered by priority
        stmt = (
            select(AgentEmailRoutingRule)
            .where(AgentEmailRoutingRule.is_active == True)
            .order_by(AgentEmailRoutingRule.priority.desc())
        )
        result = await self.db.execute(stmt)
        rules = result.scalars().all()

        for rule in rules:
            matched = False

            if rule.rule_type == "sender":
                matched = from_email.lower() == rule.rule_value.lower()
            elif rule.rule_type == "domain":
                domain = from_email.split("@")[-1].lower()
                matched = domain == rule.rule_value.lower()
            elif rule.rule_type == "subject_contains":
                matched = rule.rule_value.lower() in (subject or "").lower()
            elif rule.rule_type == "keyword":
                keyword = rule.rule_value.lower()
                matched = (
                    keyword in (subject or "").lower() or
                    keyword in (body or "").lower()
                )

            if matched:
                agent = await self._get_agent(rule.agent_id)
                if agent and agent.email_enabled:
                    return agent

        return None

    # =========================================================================
    # INBOX MANAGEMENT
    # =========================================================================

    async def list_inbox_messages(
        self,
        agent_id: str,
        status: str | None = None,
        priority: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> list[AgentInboxMessage]:
        """List inbox messages for an agent."""
        stmt = (
            select(AgentInboxMessage)
            .where(AgentInboxMessage.agent_id == agent_id)
            .order_by(AgentInboxMessage.created_at.desc())
            .offset(skip)
            .limit(limit)
        )

        if status:
            stmt = stmt.where(AgentInboxMessage.status == status)
        if priority:
            stmt = stmt.where(AgentInboxMessage.priority == priority)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_inbox_message(self, message_id: str) -> AgentInboxMessage | None:
        """Get a specific inbox message."""
        stmt = select(AgentInboxMessage).where(AgentInboxMessage.id == message_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def update_inbox_message(
        self,
        message_id: str,
        **updates,
    ) -> AgentInboxMessage | None:
        """Update an inbox message."""
        message = await self.get_inbox_message(message_id)
        if not message:
            return None

        for key, value in updates.items():
            if hasattr(message, key):
                setattr(message, key, value)

        await self.db.flush()
        await self.db.refresh(message)
        return message

    async def mark_as_responded(
        self,
        message_id: str,
        response_id: str | None = None,
    ) -> AgentInboxMessage | None:
        """Mark an inbox message as responded."""
        return await self.update_inbox_message(
            message_id,
            status="responded",
            response_id=response_id,
            responded_at=datetime.now(timezone.utc),
        )

    async def escalate_message(
        self,
        message_id: str,
        escalate_to: str,
        note: str | None = None,
    ) -> AgentInboxMessage | None:
        """Escalate an inbox message to a team member."""
        message = await self.get_inbox_message(message_id)
        if not message:
            return None

        message.status = "escalated"
        message.escalated_to = escalate_to
        message.escalated_at = datetime.now(timezone.utc)

        await self.db.flush()
        await self.db.refresh(message)

        logger.info(f"Escalated message {message_id} to {escalate_to}")
        return message

    async def archive_message(self, message_id: str) -> AgentInboxMessage | None:
        """Archive an inbox message."""
        return await self.update_inbox_message(
            message_id,
            status="archived",
        )

    # =========================================================================
    # AI PROCESSING
    # =========================================================================

    async def process_inbox_message(
        self,
        message_id: str,
    ) -> dict[str, Any]:
        """
        Process an inbox message using the agent's AI capabilities.
        This classifies, summarizes, and generates a suggested response.
        """
        message = await self.get_inbox_message(message_id)
        if not message:
            raise ValueError(f"Message {message_id} not found")

        agent = await self._get_agent(message.agent_id)
        if not agent:
            raise ValueError(f"Agent {message.agent_id} not found")

        # Update status to processing
        message.status = "processing"
        await self.db.flush()

        try:
            # Import here to avoid circular dependencies
            from aexy.agents.builder import AgentBuilder

            # Build and run the agent for email processing
            builder = AgentBuilder(agent)
            result = await builder.process_email(
                from_email=message.from_email,
                from_name=message.from_name,
                subject=message.subject,
                body=message.body_text,
                thread_context=await self._get_thread_context(message.thread_id),
            )

            # Update message with AI results
            message.classification = result.get("classification")
            message.summary = result.get("summary")
            message.suggested_response = result.get("suggested_response")
            message.confidence_score = result.get("confidence")

            # Determine priority based on classification
            urgency = result.get("classification", {}).get("urgency", "normal")
            message.priority = urgency if urgency in ["low", "normal", "high", "urgent"] else "normal"

            # Auto-reply if enabled and confidence is high enough
            if (
                agent.auto_reply_enabled and
                result.get("confidence", 0) >= agent.confidence_threshold and
                result.get("suggested_response")
            ):
                response_id = await self._send_auto_reply(message, result["suggested_response"])
                message.status = "responded"
                message.response_id = response_id
                message.responded_at = datetime.now(timezone.utc)
            else:
                message.status = "pending"  # Needs human review

            await self.db.flush()
            await self.db.refresh(message)

            logger.info(f"Processed inbox message {message_id}, confidence: {result.get('confidence')}")
            return result

        except Exception as e:
            logger.error(f"Failed to process message {message_id}: {e}")
            message.status = "pending"  # Reset to pending on error
            await self.db.flush()
            raise

    async def _get_thread_context(self, thread_id: str | None) -> list[dict]:
        """Get previous messages in a thread for context."""
        if not thread_id:
            return []

        stmt = (
            select(AgentInboxMessage)
            .where(AgentInboxMessage.thread_id == thread_id)
            .order_by(AgentInboxMessage.created_at.asc())
            .limit(10)  # Last 10 messages for context
        )
        result = await self.db.execute(stmt)
        messages = result.scalars().all()

        return [
            {
                "from": msg.from_email,
                "subject": msg.subject,
                "body": msg.body_text,
                "timestamp": msg.created_at.isoformat(),
            }
            for msg in messages
        ]

    async def _send_auto_reply(
        self,
        message: AgentInboxMessage,
        response_body: str,
    ) -> str | None:
        """Send an auto-reply email."""
        try:
            # Import email service
            from aexy.services.email_service import EmailService

            agent = await self._get_agent(message.agent_id)
            if not agent:
                return None

            # Build reply subject
            subject = message.subject or ""
            if not subject.lower().startswith("re:"):
                subject = f"Re: {subject}"

            # Append signature if configured
            body = response_body
            if agent.email_signature:
                body = f"{body}\n\n{agent.email_signature}"

            # Send the email
            # Note: This assumes EmailService has a send method
            # The actual implementation may need adjustment based on the email service interface
            email_service = EmailService(self.db)
            response_id = await email_service.send_email(
                workspace_id=message.workspace_id,
                from_email=agent.email_address,
                from_name=agent.name,
                to_email=message.from_email,
                subject=subject,
                body_html=body.replace("\n", "<br>"),
                body_text=body,
                reply_to_message_id=message.message_id,
            )

            logger.info(f"Sent auto-reply for message {message.id}")
            return response_id

        except Exception as e:
            logger.error(f"Failed to send auto-reply for message {message.id}: {e}")
            return None

    # =========================================================================
    # ROUTING RULES
    # =========================================================================

    async def create_routing_rule(
        self,
        workspace_id: str,
        agent_id: str,
        rule_type: str,
        rule_value: str,
        priority: int = 0,
    ) -> AgentEmailRoutingRule:
        """Create a new email routing rule."""
        rule = AgentEmailRoutingRule(
            id=str(uuid4()),
            workspace_id=workspace_id,
            agent_id=agent_id,
            rule_type=rule_type,
            rule_value=rule_value,
            priority=priority,
            is_active=True,
        )
        self.db.add(rule)
        await self.db.flush()
        await self.db.refresh(rule)
        return rule

    async def list_routing_rules(
        self,
        agent_id: str,
    ) -> list[AgentEmailRoutingRule]:
        """List routing rules for an agent."""
        stmt = (
            select(AgentEmailRoutingRule)
            .where(AgentEmailRoutingRule.agent_id == agent_id)
            .order_by(AgentEmailRoutingRule.priority.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def delete_routing_rule(self, rule_id: str) -> bool:
        """Delete a routing rule."""
        stmt = select(AgentEmailRoutingRule).where(AgentEmailRoutingRule.id == rule_id)
        result = await self.db.execute(stmt)
        rule = result.scalar_one_or_none()

        if not rule:
            return False

        await self.db.delete(rule)
        await self.db.flush()
        return True

    # =========================================================================
    # HELPERS
    # =========================================================================

    async def _get_agent(self, agent_id: str) -> CRMAgent | None:
        """Get an agent by ID."""
        stmt = select(CRMAgent).where(CRMAgent.id == agent_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _get_workspace(self, workspace_id: str) -> Workspace | None:
        """Get a workspace by ID."""
        stmt = select(Workspace).where(Workspace.id == workspace_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _email_exists(self, email: str) -> bool:
        """Check if an email address is already in use."""
        stmt = select(func.count(CRMAgent.id)).where(CRMAgent.email_address == email)
        result = await self.db.execute(stmt)
        count = result.scalar_one()
        return count > 0

    def _slugify(self, text: str) -> str:
        """Convert text to a URL-safe slug."""
        import re
        # Lowercase and replace spaces with hyphens
        slug = text.lower().strip()
        slug = re.sub(r"[^\w\s-]", "", slug)
        slug = re.sub(r"[-\s]+", "-", slug)
        return slug[:50]  # Limit length
