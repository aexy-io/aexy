"""Agent service for managing and executing AI agents."""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, AsyncIterator
from uuid import uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from aexy.models.agent import (
    CRMAgent,
    CRMAgentExecution,
    AgentConversation,
    AgentMessage,
    AgentType,
    AgentExecutionStatus,
)
from aexy.agents.builder import AgentBuilder

logger = logging.getLogger(__name__)


class AgentService:
    """Service for CRM AI agent management and execution."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # AGENT CRUD
    # =========================================================================

    async def create_agent(
        self,
        workspace_id: str,
        name: str,
        agent_type: str,
        description: str | None = None,
        mention_handle: str | None = None,
        goal: str | None = None,
        system_prompt: str | None = None,
        custom_instructions: str | None = None,
        tools: list[str] | None = None,
        llm_provider: str = "claude",
        model: str = "claude-3-sonnet-20240229",
        temperature: float = 0.7,
        max_tokens: int = 4096,
        max_iterations: int = 10,
        timeout_seconds: int = 300,
        confidence_threshold: float = 0.7,
        require_approval_below: float = 0.5,
        max_daily_responses: int | None = None,
        response_delay_minutes: int = 0,
        working_hours: dict | None = None,
        escalation_email: str | None = None,
        escalation_slack_channel: str | None = None,
        created_by_id: str | None = None,
        principal_id: str | None = None,
    ) -> CRMAgent:
        """Create a new agent."""
        agent = CRMAgent(
            id=str(uuid4()),
            workspace_id=workspace_id,
            principal_id=principal_id,
            name=name,
            description=description,
            agent_type=agent_type,
            mention_handle=mention_handle,
            is_system=False,
            goal=goal,
            system_prompt=system_prompt,
            custom_instructions=custom_instructions,
            tools=tools or [],
            llm_provider=llm_provider,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            max_iterations=max_iterations,
            timeout_seconds=timeout_seconds,
            confidence_threshold=confidence_threshold,
            require_approval_below=require_approval_below,
            max_daily_responses=max_daily_responses,
            response_delay_minutes=response_delay_minutes,
            working_hours=working_hours,
            escalation_email=escalation_email,
            escalation_slack_channel=escalation_slack_channel,
            created_by_id=created_by_id,
        )
        self.db.add(agent)
        await self.db.flush()
        await self.db.refresh(agent)
        return agent

    async def get_agent(self, agent_id: str) -> CRMAgent | None:
        """Get an agent by ID."""
        stmt = select(CRMAgent).where(CRMAgent.id == agent_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_agents(
        self,
        workspace_id: str,
        agent_type: str | None = None,
        is_active: bool | None = None,
        include_system: bool = True,
        skip: int = 0,
        limit: int = 50,
    ) -> list[CRMAgent]:
        """List agents in a workspace."""
        stmt = select(CRMAgent).where(CRMAgent.workspace_id == workspace_id)

        if agent_type:
            stmt = stmt.where(CRMAgent.agent_type == agent_type)
        if is_active is not None:
            stmt = stmt.where(CRMAgent.is_active == is_active)
        if not include_system:
            stmt = stmt.where(CRMAgent.is_system == False)

        stmt = stmt.order_by(CRMAgent.is_system.desc(), CRMAgent.name)
        stmt = stmt.offset(skip).limit(limit)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_agent(
        self,
        agent_id: str,
        changed_by_id: str | None = None,
        **kwargs,
    ) -> CRMAgent | None:
        """Update an agent."""
        agent = await self.get_agent(agent_id)
        if not agent:
            return None

        # System agents can only have certain fields modified
        allowed_system_fields = {"is_active", "llm_provider", "llm_model", "model", "temperature"}
        if agent.is_system and any(k not in allowed_system_fields for k in kwargs.keys()):
            return None

        # Compute field changes for audit
        field_changes = {}
        for key, value in kwargs.items():
            if value is not None and hasattr(agent, key):
                old_value = getattr(agent, key)
                if old_value != value:
                    field_changes[key] = {"old": old_value, "new": value}

        for key, value in kwargs.items():
            if value is not None and hasattr(agent, key):
                setattr(agent, key, value)
        # `None` means "leave alone" for every field but this one: detaching
        # an agent from its principal is an explicit null, and the API only
        # passes fields the caller set.
        if "principal_id" in kwargs and kwargs["principal_id"] is None:
            if agent.principal_id is not None:
                field_changes["principal_id"] = {"old": agent.principal_id, "new": None}
            agent.principal_id = None

        await self.db.flush()
        await self.db.refresh(agent)

        # Record config audit
        if field_changes and changed_by_id:
            try:
                from aexy.services.agent_policy_engine import AgentPolicyEngine
                engine = AgentPolicyEngine(self.db)
                await engine.record_config_change(
                    agent_id=agent_id,
                    changed_by_id=changed_by_id,
                    change_type="update",
                    field_changes=field_changes,
                )
            except Exception as e:
                logger.warning("Failed to record config audit: %s", e)

        return agent

    async def delete_agent(
        self, agent_id: str, changed_by_id: str | None = None
    ) -> bool:
        """Delete an agent."""
        agent = await self.get_agent(agent_id)
        if not agent or agent.is_system:
            return False

        # Record config audit before deletion
        if changed_by_id:
            try:
                from aexy.services.agent_policy_engine import AgentPolicyEngine
                engine = AgentPolicyEngine(self.db)
                await engine.record_config_change(
                    agent_id=agent_id,
                    changed_by_id=changed_by_id,
                    change_type="delete",
                    field_changes={"name": {"old": agent.name, "new": None}},
                )
            except Exception as e:
                logger.warning("Failed to record config audit: %s", e)

        await self.db.delete(agent)
        await self.db.flush()
        return True

    async def toggle_agent(
        self, agent_id: str, changed_by_id: str | None = None
    ) -> CRMAgent | None:
        """Toggle agent active status."""
        agent = await self.get_agent(agent_id)
        if not agent:
            return None

        old_value = agent.is_active
        agent.is_active = not agent.is_active
        await self.db.flush()
        await self.db.refresh(agent)

        # Record config audit
        if changed_by_id:
            try:
                from aexy.services.agent_policy_engine import AgentPolicyEngine
                engine = AgentPolicyEngine(self.db)
                await engine.record_config_change(
                    agent_id=agent_id,
                    changed_by_id=changed_by_id,
                    change_type="toggle",
                    field_changes={"is_active": {"old": old_value, "new": agent.is_active}},
                )
            except Exception as e:
                logger.warning("Failed to record config audit: %s", e)

        return agent

    async def check_handle_available(
        self,
        workspace_id: str,
        handle: str,
        exclude_agent_id: str | None = None,
    ) -> bool:
        """Check if a mention handle is available within the workspace."""
        # Normalize handle (remove @ prefix if present)
        handle = handle.lstrip("@").lower()

        stmt = select(CRMAgent).where(
            CRMAgent.workspace_id == workspace_id,
            func.lower(CRMAgent.mention_handle) == handle,
        )

        if exclude_agent_id:
            stmt = stmt.where(CRMAgent.id != exclude_agent_id)

        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()
        return existing is None

    # =========================================================================
    # SYSTEM AGENTS
    # =========================================================================

    async def ensure_system_agents(self, workspace_id: str) -> list[CRMAgent]:
        """Ensure system agents exist for a workspace."""
        # Tool names are the prebuilt classes' own catalogue names, so the
        # seeded configuration and the agent that runs it cannot disagree.
        from aexy.agents.prebuilt import (
            DataEnrichmentAgent,
            EmailDrafterAgent,
            LeadScoringAgent,
            SalesOutreachAgent,
        )

        system_agents = [
            {
                "name": "Sales Outreach",
                "description": "Research prospects and craft personalized outreach emails",
                "agent_type": "sales_outreach",
                "tools": list(SalesOutreachAgent.catalog_tool_names),
            },
            {
                "name": "Lead Scoring",
                "description": "Score leads 0-100 based on fit and engagement",
                "agent_type": "lead_scoring",
                "tools": list(LeadScoringAgent.catalog_tool_names),
            },
            {
                "name": "Email Drafter",
                "description": "Generate emails matching your personal writing style",
                "agent_type": "email_drafter",
                "tools": list(EmailDrafterAgent.catalog_tool_names),
            },
            {
                "name": "Data Enrichment",
                "description": "Fill missing CRM fields from what the CRM already knows",
                "agent_type": "data_enrichment",
                "tools": list(DataEnrichmentAgent.catalog_tool_names),
            },
        ]

        created = []
        for agent_config in system_agents:
            # Check if exists
            stmt = select(CRMAgent).where(
                CRMAgent.workspace_id == workspace_id,
                CRMAgent.agent_type == agent_config["agent_type"],
                CRMAgent.is_system == True,
            )
            result = await self.db.execute(stmt)
            existing = result.scalar_one_or_none()

            if not existing:
                agent = CRMAgent(
                    id=str(uuid4()),
                    workspace_id=workspace_id,
                    name=agent_config["name"],
                    description=agent_config["description"],
                    agent_type=agent_config["agent_type"],
                    is_system=True,
                    tools=agent_config["tools"],
                )
                self.db.add(agent)
                created.append(agent)

        if created:
            await self.db.flush()
            for agent in created:
                await self.db.refresh(agent)

        return created

    # =========================================================================
    # AGENT EXECUTION
    # =========================================================================

    async def preview_prompt(
        self,
        agent_id: str,
        sample_input: str,
        user_id: str | None = None,
    ) -> dict:
        """Run the agent's prompt against a sample input WITHOUT
        persisting an execution.

        UX-EDT-018: Test-this affordance for the Prompts + LLM tabs.
        Lets users preview what the agent would say to a given input
        before committing system prompt / model changes. Read-only —
        no inbox messages, no execution rows, no tool calls (tools
        could have side effects).

        Returns:
            {"content": str, "duration_ms": int, "input_tokens": int|None,
             "output_tokens": int|None, "cost_usd": float|None}
        """
        from datetime import datetime, timezone

        agent = await self.get_agent(agent_id)
        if not agent:
            raise ValueError(f"Agent {agent_id} not found")

        # System agents have non-editable prompts but their LLM config
        # can be tweaked, so the preview is still useful. We don't
        # gate on is_active — operators want to preview before un-
        # pausing an agent.

        builder = AgentBuilder(
            workspace_id=agent.workspace_id,
            user_id=user_id,
            db=self.db,
        )
        agent_instance = builder.build_from_config(
            name=agent.name,
            agent_type=agent.agent_type,
            goal=agent.goal,
            system_prompt=agent.system_prompt,
            # NO tools for the preview — they may have side effects.
            tools=[],
            model=agent.model,
            llm_provider=agent.llm_provider,
            max_iterations=1,
            timeout_seconds=30,
        )

        # Run via the streaming pipeline so we capture usage_metadata
        # cheaply, but accumulate to a single response.
        start = datetime.now(timezone.utc)
        content = ""
        usage: dict | None = None
        async for event in agent_instance.astream(
            context={"preview": True, "input": sample_input},
            conversation_history=[
                __import__("langchain_core.messages", fromlist=["HumanMessage"]).HumanMessage(content=sample_input),
            ],
        ):
            if event.get("type") == "text_delta":
                content += event.get("text", "")
            elif event.get("type") == "assistant_end":
                content = event.get("content", content)
                usage = event.get("usage_metadata")
            elif event.get("type") == "error":
                raise RuntimeError(event.get("message", "preview failed"))

        duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)

        input_tokens = usage.get("input_tokens") if usage else None
        output_tokens = usage.get("output_tokens") if usage else None
        cost_usd: float | None = None
        if input_tokens is not None and output_tokens is not None:
            cost_usd = self._estimate_cost_usd(
                agent.llm_provider, agent.model, input_tokens, output_tokens
            )

        return {
            "content": content,
            "duration_ms": duration_ms,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": cost_usd,
        }

    async def execute_agent(
        self,
        agent_id: str,
        record_id: str | None = None,
        context: dict | None = None,
        user_id: str | None = None,
        triggered_by: str = "manual",
        trigger_id: str | None = None,
    ) -> CRMAgentExecution:
        """Execute an agent and return the execution record."""
        agent = await self.get_agent(agent_id)
        if not agent:
            raise ValueError(f"Agent {agent_id} not found")

        if not agent.is_active:
            raise ValueError(f"Agent {agent.name} is not active")

        context = context or {}

        # Create execution record
        execution = CRMAgentExecution(
            id=str(uuid4()),
            agent_id=agent_id,
            record_id=record_id,
            triggered_by=triggered_by,
            trigger_id=trigger_id,
            input_context=context,
            status="running",
            started_at=datetime.now(timezone.utc),
        )
        self.db.add(execution)
        await self.db.flush()

        if triggered_by == "schedule" and trigger_id:
            # The schedule remembers its latest run so the settings page can
            # link straight to it.
            from aexy.models.agent_schedule import AgentSchedule

            schedule = await self.db.get(AgentSchedule, trigger_id)
            if schedule is not None:
                schedule.last_execution_id = execution.id
                await self.db.flush()

        # Load record data if record_id provided
        record_data = {}
        if record_id:
            from aexy.services.crm_service import CRMRecordService
            record_service = CRMRecordService(self.db)
            record = await record_service.get_record(record_id)
            if record:
                record_data = {
                    "id": record.id,
                    "object_id": record.object_id,
                    "values": record.values,
                    "owner_id": record.owner_id,
                }

        # Build and run the agent
        builder = AgentBuilder(
            workspace_id=agent.workspace_id,
            user_id=user_id,
            db=self.db,
        )

        agent_instance = builder.build_from_config(
            name=agent.name,
            agent_type=agent.agent_type,
            goal=agent.goal,
            system_prompt=agent.system_prompt,
            tools=agent.tools,
            model=agent.model,
            llm_provider=agent.llm_provider,
            max_iterations=agent.max_iterations,
            timeout_seconds=agent.timeout_seconds,
        )

        # Every tool an agent holds is a catalogue tool, run through the
        # governed executor as the agent's principal, or as the person who
        # triggered the run.
        try:
            from aexy.agents.tools.mcp_tools import attach_to_agent

            attached = await attach_to_agent(
                agent_instance,
                self.db,
                workspace_id=agent.workspace_id,
                developer_id=user_id,
                principal_id=agent.principal_id,
            )
            if attached:
                logger.info("Agent %s runs with catalogue tools %s", agent.id, attached)
        except Exception as e:
            logger.warning("Could not attach catalogue tools to agent %s: %s", agent.id, e)

        # Inject policy engine for governance
        try:
            from aexy.services.agent_policy_engine import AgentPolicyEngine
            policy_engine = AgentPolicyEngine(self.db)
            await policy_engine.load_policies(agent.workspace_id, agent.id)
            agent_instance.policy_engine = policy_engine
            agent_instance.agent_config = agent
            agent_instance.execution_id = execution.id
        except Exception as e:
            logger.warning("Failed to load policy engine: %s", e)

        try:
            result = await agent_instance.run(
                record_id=record_id,
                record_data=record_data,
                context=context,
            )

            # Update execution record
            execution.status = result.get("status", "completed")
            execution.output_result = result.get("output")
            execution.steps = result.get("steps", [])
            execution.error_message = result.get("error")
            execution.completed_at = datetime.now(timezone.utc)
            execution.duration_ms = int(
                (execution.completed_at - execution.started_at).total_seconds() * 1000
            )

            # Record token usage for billing
            try:
                from aexy.services.usage_service import UsageService
                usage_service = UsageService(self.db)
                total_input = sum(
                    s.get("input_tokens", 0)
                    for s in execution.steps
                    if s.get("type") == "llm_call"
                )
                total_output = sum(
                    s.get("output_tokens", 0)
                    for s in execution.steps
                    if s.get("type") == "llm_call"
                )
                if total_input > 0 or total_output > 0:
                    billing_dev_id = user_id or str(agent.created_by_id)
                    await usage_service.record_usage(
                        developer_id=billing_dev_id,
                        provider=agent.llm_provider,
                        model=agent.model,
                        input_tokens=total_input,
                        output_tokens=total_output,
                        analysis_type="agent_execution",
                        request_id=execution.id,
                    )
            except Exception as e:
                logger.warning("Failed to record agent usage: %s", e)

            # Update agent stats
            agent.total_executions += 1
            if execution.status == "completed":
                agent.successful_executions += 1
            else:
                agent.failed_executions += 1

            # Update average duration
            if agent.avg_duration_ms > 0:
                agent.avg_duration_ms = int(
                    (agent.avg_duration_ms + execution.duration_ms) / 2
                )
            else:
                agent.avg_duration_ms = execution.duration_ms

            await self.db.flush()
            await self.db.refresh(execution)

        except Exception as e:
            execution.status = "failed"
            execution.error_message = str(e)
            execution.completed_at = datetime.now(timezone.utc)
            execution.duration_ms = int(
                (execution.completed_at - execution.started_at).total_seconds() * 1000
            )

            agent.total_executions += 1
            agent.failed_executions += 1

            await self.db.flush()
            await self.db.refresh(execution)

        return execution

    async def get_execution(self, execution_id: str) -> CRMAgentExecution | None:
        """Get an execution by ID."""
        stmt = select(CRMAgentExecution).where(CRMAgentExecution.id == execution_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    # =========================================================================
    # CONVERSATION MANAGEMENT
    # =========================================================================

    async def create_conversation(
        self,
        agent_id: str,
        workspace_id: str,
        initial_message: str,
        record_id: str | None = None,
        title: str | None = None,
        user_id: str | None = None,
    ) -> tuple[AgentConversation, AgentMessage, CRMAgentExecution]:
        """Create a new conversation and send the first message.

        Returns:
            Tuple of (conversation, user_message, execution)
        """
        agent = await self.get_agent(agent_id)
        if not agent:
            raise ValueError(f"Agent {agent_id} not found")
        if not agent.is_active:
            raise ValueError(f"Agent {agent.name} is not active")

        # Generate title if not provided
        if not title:
            # Use first 50 chars of message as title
            title = initial_message[:50] + ("..." if len(initial_message) > 50 else "")

        # Create conversation
        conversation = AgentConversation(
            id=str(uuid4()),
            workspace_id=workspace_id,
            agent_id=agent_id,
            record_id=record_id,
            title=title,
            status="active",
            conversation_metadata={},
        )
        self.db.add(conversation)
        await self.db.flush()

        # Add user message
        user_message = AgentMessage(
            id=str(uuid4()),
            conversation_id=conversation.id,
            role="user",
            content=initial_message,
            message_index=0,
        )
        self.db.add(user_message)
        await self.db.flush()

        # Execute agent with the message
        execution = await self._execute_conversation_message(
            conversation=conversation,
            agent=agent,
            user_message=initial_message,
            message_index=1,
            record_id=record_id,
            user_id=user_id,
        )

        await self.db.refresh(conversation)
        return conversation, user_message, execution

    async def get_conversation(self, conversation_id: str) -> AgentConversation | None:
        """Get a conversation by ID with messages."""
        stmt = select(AgentConversation).where(AgentConversation.id == conversation_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_conversations(
        self,
        agent_id: str,
        status: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> list[AgentConversation]:
        """List conversations for an agent."""
        stmt = select(AgentConversation).where(AgentConversation.agent_id == agent_id)

        if status:
            stmt = stmt.where(AgentConversation.status == status)

        stmt = stmt.order_by(AgentConversation.updated_at.desc())
        stmt = stmt.offset(skip).limit(limit)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_conversation(
        self,
        conversation_id: str,
        title: str | None = None,
        status: str | None = None,
    ) -> AgentConversation | None:
        """Update a conversation."""
        conversation = await self.get_conversation(conversation_id)
        if not conversation:
            return None

        if title is not None:
            conversation.title = title
        if status is not None:
            conversation.status = status
            if status in ("completed", "archived"):
                conversation.ended_at = datetime.now(timezone.utc)

        await self.db.flush()
        await self.db.refresh(conversation)
        return conversation

    async def delete_conversation(self, conversation_id: str) -> bool:
        """Delete (archive) a conversation."""
        conversation = await self.get_conversation(conversation_id)
        if not conversation:
            return False

        conversation.status = "archived"
        conversation.ended_at = datetime.now(timezone.utc)
        await self.db.flush()
        return True

    @staticmethod
    def _sse(data: dict) -> str:
        """Format a dict payload as an SSE 'data:' line."""
        return f"data: {json.dumps(data)}\n\n"

    @staticmethod
    def _estimate_cost_usd(
        provider: str | None,
        model: str | None,
        input_tokens: int,
        output_tokens: int,
    ) -> float:
        """Best-effort per-message cost in USD.

        Rate cards here are static defaults so the chat UI can render a
        cost meter today without a billing service. They're intentionally
        rounded up — accuracy at the per-message level matters less than
        signaling order-of-magnitude.
        Values are USD per 1M tokens. Unknown models fall back to a
        conservative mid-range so the meter never reads $0.
        """
        rates = {
            ("anthropic", "claude-3-5-sonnet"): (3.0, 15.0),
            ("anthropic", "claude-3-opus"): (15.0, 75.0),
            ("anthropic", "claude-3-haiku"): (0.25, 1.25),
            ("gemini", "gemini-1.5-pro"): (1.25, 5.0),
            ("gemini", "gemini-1.5-flash"): (0.075, 0.3),
            ("gemini", "gemini-2.0-flash"): (0.10, 0.40),
            ("openai", "gpt-4o"): (5.0, 15.0),
            ("openai", "gpt-4o-mini"): (0.15, 0.6),
        }
        prov = (provider or "").lower()
        mdl = (model or "").lower()
        # Match by prefix so "claude-3-5-sonnet-20241022" resolves to
        # "claude-3-5-sonnet". Sort by descending model-id length so a
        # more specific prefix wins — without this, "gpt-4o" matches
        # "gpt-4o-mini" first and the user gets billed at gpt-4o
        # rates. (Caught by test_openai_gpt4o_mini_matches_rate_card.)
        ordered = sorted(rates.items(), key=lambda kv: -len(kv[0][1]))
        for (rp, rm), (rin, rout) in ordered:
            if prov == rp and mdl.startswith(rm):
                return round((input_tokens * rin + output_tokens * rout) / 1_000_000, 6)
        return round((input_tokens * 1.0 + output_tokens * 3.0) / 1_000_000, 6)

    async def stream_message(
        self,
        conversation_id: str,
        content: str,
        user_id: str | None = None,
    ) -> AsyncIterator[str]:
        """Send a user message and stream the agent response as SSE.

        Yields SSE-formatted lines. Event types:
            user_message:    confirms the user message was persisted
                             (so the frontend optimistic insert can swap
                             in the real id without dedupe races)
            text_delta:      token chunks for the assistant message
            tool_use_start:  tool call begins
            tool_result:     tool call returns
            usage:           per-message input/output tokens + USD cost
            done:            stream finished cleanly
            error:           fatal error; stream ends
        """
        conversation = await self.get_conversation(conversation_id)
        if not conversation:
            yield self._sse({"type": "error", "message": "Conversation not found"})
            return
        if conversation.status != "active":
            yield self._sse({"type": "error", "message": "Conversation is not active"})
            return

        agent = await self.get_agent(conversation.agent_id)
        if not agent:
            yield self._sse({"type": "error", "message": "Agent not found"})
            return
        if not agent.is_active:
            yield self._sse({"type": "error", "message": f"Agent {agent.name} is paused"})
            return

        # Persist the user message + record the execution shell up front
        # so the frontend can swap its optimistic placeholder for the
        # real id immediately. Token counts + cost fill in at the end.
        stmt = select(func.count()).select_from(AgentMessage).where(
            AgentMessage.conversation_id == conversation_id
        )
        result = await self.db.execute(stmt)
        message_count = result.scalar() or 0

        user_message = AgentMessage(
            id=str(uuid4()),
            conversation_id=conversation_id,
            role="user",
            content=content,
            message_index=message_count,
        )
        execution = CRMAgentExecution(
            id=str(uuid4()),
            agent_id=agent.id,
            conversation_id=conversation.id,
            triggered_by="chat",
            input_context={"message": content},
            status="running",
            started_at=datetime.now(timezone.utc),
        )
        # Persist both rows in one transaction so a failure here cannot
        # leave a user message without a matching execution shell.
        self.db.add(user_message)
        self.db.add(execution)
        await self.db.flush()
        await self.db.commit()
        yield self._sse({
            "type": "user_message",
            "id": user_message.id,
            "content": content,
            "created_at": user_message.created_at.isoformat() if user_message.created_at else None,
        })

        # Rebuild conversation history for the LLM
        from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
        messages = await self.get_conversation_messages(conversation_id)
        conversation_history = []
        for msg in messages:
            if msg.role == "user":
                conversation_history.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
                conversation_history.append(AIMessage(content=msg.content))
            elif msg.role == "tool":
                tool_call_id = msg.tool_output.get("tool_call_id", "") if msg.tool_output else ""
                conversation_history.append(
                    ToolMessage(content=msg.content, tool_call_id=tool_call_id)
                )

        builder = AgentBuilder(
            workspace_id=agent.workspace_id,
            user_id=user_id,
            db=self.db,
        )
        agent_instance = builder.build_from_config(
            name=agent.name,
            agent_type=agent.agent_type,
            goal=agent.goal,
            system_prompt=agent.system_prompt,
            tools=agent.tools,
            model=agent.model,
            llm_provider=agent.llm_provider,
            max_iterations=agent.max_iterations,
            timeout_seconds=agent.timeout_seconds,
        )

        start = datetime.now(timezone.utc)
        final_assistant_content = ""
        final_tool_calls: list = []
        final_usage: dict | None = None
        tool_steps: list[dict] = []

        try:
            async for event in agent_instance.astream(
                record_id=conversation.record_id,
                context={"conversation_id": conversation.id},
                conversation_history=conversation_history,
            ):
                event_type = event.get("type")
                if event_type == "text_delta":
                    # Token-level streaming. Accumulate so we can
                    # persist the full content at end-of-stream.
                    final_assistant_content += event.get("text", "")
                    yield self._sse(event)
                elif event_type == "tool_use_start":
                    tool_steps.append({
                        "type": "tool_call",
                        "id": event.get("id"),
                        "tool": event.get("tool"),
                        "input": event.get("input"),
                    })
                    yield self._sse(event)
                elif event_type == "tool_result":
                    # Match back to the step we appended earlier so the
                    # output lands on the right entry.
                    for step in reversed(tool_steps):
                        if step.get("id") == event.get("id") and "output" not in step:
                            step["output"] = event.get("output")
                            break
                    yield self._sse(event)
                elif event_type == "assistant_end":
                    final_assistant_content = event.get("content", final_assistant_content)
                    final_tool_calls = event.get("tool_calls", []) or []
                    final_usage = event.get("usage_metadata")
                elif event_type == "error":
                    raise RuntimeError(event.get("message", "agent error"))

            # Persist the assistant message + tool messages now that
            # the stream completed cleanly.
            assistant_message = AgentMessage(
                id=str(uuid4()),
                conversation_id=conversation.id,
                execution_id=execution.id,
                role="assistant",
                content=final_assistant_content,
                tool_calls=final_tool_calls if final_tool_calls else None,
                message_index=message_count + 1,
            )
            if final_usage:
                # usage_metadata shape: {input_tokens, output_tokens, total_tokens}
                assistant_message.input_tokens = final_usage.get("input_tokens")
                assistant_message.output_tokens = final_usage.get("output_tokens")
                if assistant_message.input_tokens is not None and assistant_message.output_tokens is not None:
                    assistant_message.cost_usd = self._estimate_cost_usd(
                        agent.llm_provider,
                        agent.model,
                        assistant_message.input_tokens,
                        assistant_message.output_tokens,
                    )
            self.db.add(assistant_message)

            # Tool messages — append in stream order so message_index
            # matches the order the user saw them appear.
            for i, step in enumerate(tool_steps):
                tool_message = AgentMessage(
                    id=str(uuid4()),
                    conversation_id=conversation.id,
                    execution_id=execution.id,
                    role="tool",
                    content=str(step.get("output", "")),
                    tool_name=step.get("tool"),
                    tool_output={
                        "input": step.get("input", {}),
                        "output": step.get("output"),
                        "tool_call_id": step.get("id", ""),
                    },
                    message_index=message_count + 2 + i,
                )
                self.db.add(tool_message)

            # Finalize execution
            execution.status = "completed"
            execution.output_result = {
                "content": final_assistant_content,
                "tool_calls": final_tool_calls,
            }
            execution.steps = tool_steps
            execution.completed_at = datetime.now(timezone.utc)
            execution.duration_ms = int(
                (execution.completed_at - start).total_seconds() * 1000
            )

            # Agent stats
            agent.total_executions += 1
            agent.successful_executions += 1

            await self.db.flush()
            await self.db.commit()

            if final_usage:
                yield self._sse({
                    "type": "usage",
                    "input_tokens": final_usage.get("input_tokens"),
                    "output_tokens": final_usage.get("output_tokens"),
                    "cost_usd": float(assistant_message.cost_usd) if assistant_message.cost_usd else None,
                })

            yield self._sse({
                "type": "done",
                "assistant_message_id": assistant_message.id,
                "execution_id": execution.id,
                "duration_ms": execution.duration_ms,
            })
        except asyncio.CancelledError:
            # Client disconnected mid-stream (Stop button). Persist
            # whatever we collected so far + mark the execution as
            # cancelled so it's distinguishable in the runs list.
            execution.status = "cancelled"
            execution.completed_at = datetime.now(timezone.utc)
            execution.duration_ms = int(
                (execution.completed_at - start).total_seconds() * 1000
            )
            execution.error_message = "cancelled by client"

            if final_assistant_content:
                partial = AgentMessage(
                    id=str(uuid4()),
                    conversation_id=conversation.id,
                    execution_id=execution.id,
                    role="assistant",
                    content=final_assistant_content + " [cancelled]",
                    message_index=message_count + 1,
                )
                self.db.add(partial)

            agent.total_executions += 1
            agent.failed_executions += 1
            await self.db.flush()
            await self.db.commit()
            raise
        except Exception as e:
            logger.exception("Streaming agent execution failed: %s", e)
            execution.status = "failed"
            execution.error_message = str(e)
            execution.completed_at = datetime.now(timezone.utc)
            execution.duration_ms = int(
                (execution.completed_at - start).total_seconds() * 1000
            )

            error_message = AgentMessage(
                id=str(uuid4()),
                conversation_id=conversation.id,
                execution_id=execution.id,
                role="assistant",
                content=f"I encountered an error: {e}",
                message_index=message_count + 1,
            )
            self.db.add(error_message)

            agent.total_executions += 1
            agent.failed_executions += 1
            await self.db.flush()
            await self.db.commit()

            yield self._sse({"type": "error", "message": str(e)})

    async def send_message(
        self,
        conversation_id: str,
        content: str,
        user_id: str | None = None,
    ) -> tuple[AgentMessage, CRMAgentExecution]:
        """Send a user message and get agent response.

        Returns:
            Tuple of (user_message, execution)
        """
        conversation = await self.get_conversation(conversation_id)
        if not conversation:
            raise ValueError(f"Conversation {conversation_id} not found")

        if conversation.status != "active":
            raise ValueError("Cannot send message to inactive conversation")

        agent = await self.get_agent(conversation.agent_id)
        if not agent:
            raise ValueError("Agent not found")
        if not agent.is_active:
            raise ValueError(f"Agent {agent.name} is not active")

        # Get current message count for index
        stmt = select(func.count()).select_from(AgentMessage).where(
            AgentMessage.conversation_id == conversation_id
        )
        result = await self.db.execute(stmt)
        message_count = result.scalar() or 0

        # Add user message
        user_message = AgentMessage(
            id=str(uuid4()),
            conversation_id=conversation_id,
            role="user",
            content=content,
            message_index=message_count,
        )
        self.db.add(user_message)
        await self.db.flush()

        # Execute agent with conversation history
        execution = await self._execute_conversation_message(
            conversation=conversation,
            agent=agent,
            user_message=content,
            message_index=message_count + 1,
            record_id=conversation.record_id,
            user_id=user_id,
        )

        return user_message, execution

    async def get_conversation_messages(
        self,
        conversation_id: str,
        skip: int = 0,
        limit: int = 100,
    ) -> list[AgentMessage]:
        """Get messages for a conversation."""
        stmt = (
            select(AgentMessage)
            .where(AgentMessage.conversation_id == conversation_id)
            .order_by(AgentMessage.message_index)
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def _execute_conversation_message(
        self,
        conversation: AgentConversation,
        agent: CRMAgent,
        user_message: str,
        message_index: int,
        record_id: str | None = None,
        user_id: str | None = None,
    ) -> CRMAgentExecution:
        """Execute agent for a conversation message and store response."""
        from langchain_core.messages import HumanMessage, AIMessage, ToolMessage

        # Get conversation history
        messages = await self.get_conversation_messages(conversation.id)

        # Convert to LangChain messages
        conversation_history = []
        for msg in messages:
            if msg.role == "user":
                conversation_history.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
                conversation_history.append(AIMessage(content=msg.content))
            elif msg.role == "tool":
                # Reconstruct tool message with proper ID
                tool_call_id = msg.tool_output.get("tool_call_id", "") if msg.tool_output else ""
                conversation_history.append(
                    ToolMessage(
                        content=msg.content,
                        tool_call_id=tool_call_id,
                    )
                )

        # Add the new user message
        conversation_history.append(HumanMessage(content=user_message))

        # Load record data if needed
        record_data = {}
        if record_id:
            from aexy.services.crm_service import CRMRecordService
            record_service = CRMRecordService(self.db)
            record = await record_service.get_record(record_id)
            if record:
                record_data = {
                    "id": record.id,
                    "object_id": record.object_id,
                    "values": record.values,
                    "owner_id": record.owner_id,
                }

        # Create execution record
        execution = CRMAgentExecution(
            id=str(uuid4()),
            agent_id=agent.id,
            conversation_id=conversation.id,
            record_id=record_id,
            triggered_by="chat",
            input_context={"message": user_message},
            status="running",
            started_at=datetime.now(timezone.utc),
        )
        self.db.add(execution)
        await self.db.flush()

        # Build and run agent
        builder = AgentBuilder(
            workspace_id=agent.workspace_id,
            user_id=user_id,
            db=self.db,
        )

        agent_instance = builder.build_from_config(
            name=agent.name,
            agent_type=agent.agent_type,
            goal=agent.goal,
            system_prompt=agent.system_prompt,
            tools=agent.tools,
            model=agent.model,
            llm_provider=agent.llm_provider,
            max_iterations=agent.max_iterations,
            timeout_seconds=agent.timeout_seconds,
        )

        try:
            result = await agent_instance.run(
                record_id=record_id,
                record_data=record_data,
                context={"conversation_id": conversation.id},
                conversation_history=conversation_history,
            )

            # Update execution record
            execution.status = result.get("status", "completed")
            execution.output_result = result.get("output")
            execution.steps = result.get("steps", [])
            execution.error_message = result.get("error")
            execution.completed_at = datetime.now(timezone.utc)
            execution.duration_ms = int(
                (execution.completed_at - execution.started_at).total_seconds() * 1000
            )

            # Extract assistant response and add as message
            output = result.get("output", {})
            assistant_content = output.get("content", "") if output else ""
            tool_calls = output.get("tool_calls", []) if output else []

            # Add assistant message
            assistant_message = AgentMessage(
                id=str(uuid4()),
                conversation_id=conversation.id,
                execution_id=execution.id,
                role="assistant",
                content=assistant_content,
                tool_calls=tool_calls if tool_calls else None,
                message_index=message_index,
            )
            self.db.add(assistant_message)

            # Add tool messages for each tool call
            for i, step in enumerate(result.get("steps", [])):
                if step.get("type") == "tool_call":
                    tool_message = AgentMessage(
                        id=str(uuid4()),
                        conversation_id=conversation.id,
                        execution_id=execution.id,
                        role="tool",
                        content=str(step.get("output", "")),
                        tool_name=step.get("tool"),
                        tool_output={
                            "input": step.get("input", {}),
                            "output": step.get("output"),
                            "tool_call_id": step.get("id", ""),
                        },
                        message_index=message_index + i + 1,
                    )
                    self.db.add(tool_message)

            # Update agent stats
            agent.total_executions += 1
            if execution.status == "completed":
                agent.successful_executions += 1
            else:
                agent.failed_executions += 1

            if agent.avg_duration_ms > 0:
                agent.avg_duration_ms = int(
                    (agent.avg_duration_ms + execution.duration_ms) / 2
                )
            else:
                agent.avg_duration_ms = execution.duration_ms

        except Exception as e:
            execution.status = "failed"
            execution.error_message = str(e)
            execution.completed_at = datetime.now(timezone.utc)
            execution.duration_ms = int(
                (execution.completed_at - execution.started_at).total_seconds() * 1000
            )

            # Add error message
            error_message = AgentMessage(
                id=str(uuid4()),
                conversation_id=conversation.id,
                execution_id=execution.id,
                role="assistant",
                content=f"I encountered an error: {str(e)}",
                message_index=message_index,
            )
            self.db.add(error_message)

            agent.total_executions += 1
            agent.failed_executions += 1

        await self.db.flush()
        await self.db.refresh(execution)
        return execution

    async def list_executions(
        self,
        agent_id: str | None = None,
        record_id: str | None = None,
        status: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> list[CRMAgentExecution]:
        """List agent executions."""
        stmt = select(CRMAgentExecution)

        if agent_id:
            stmt = stmt.where(CRMAgentExecution.agent_id == agent_id)
        if record_id:
            stmt = stmt.where(CRMAgentExecution.record_id == record_id)
        if status:
            stmt = stmt.where(CRMAgentExecution.status == status)

        stmt = stmt.order_by(CRMAgentExecution.created_at.desc())
        stmt = stmt.offset(skip).limit(limit)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_agent_metrics(self, agent_id: str) -> dict:
        """Get metrics for an agent."""
        from datetime import timedelta

        agent = await self.get_agent(agent_id)
        if not agent:
            return {}

        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=today_start.weekday())

        # Get runs today
        stmt_today = select(func.count()).select_from(CRMAgentExecution).where(
            CRMAgentExecution.agent_id == agent_id,
            CRMAgentExecution.created_at >= today_start,
        )
        result_today = await self.db.execute(stmt_today)
        runs_today = result_today.scalar() or 0

        # Get runs this week
        stmt_week = select(func.count()).select_from(CRMAgentExecution).where(
            CRMAgentExecution.agent_id == agent_id,
            CRMAgentExecution.created_at >= week_start,
        )
        result_week = await self.db.execute(stmt_week)
        runs_this_week = result_week.scalar() or 0

        # Get recent executions (last 10)
        recent_executions = await self.list_executions(agent_id=agent_id, limit=10)

        # Calculate success rate
        total = agent.total_executions
        success_rate = (agent.successful_executions / total * 100) if total > 0 else 0.0

        return {
            "total_runs": agent.total_executions,
            "successful_runs": agent.successful_executions,
            "failed_runs": agent.failed_executions,
            "success_rate": round(success_rate, 1),
            "avg_duration_ms": agent.avg_duration_ms,
            "avg_confidence": 0.0,  # TODO: Track confidence in executions
            "runs_today": runs_today,
            "runs_this_week": runs_this_week,
            "recent_executions": recent_executions,
        }

    # =========================================================================
    # AVAILABLE TOOLS
    # =========================================================================

    @staticmethod
    def get_available_tools() -> list[dict]:
        """Get list of available tools for agent configuration."""
        return AgentBuilder.get_available_tools()

    # =========================================================================
    # SYNC EXECUTION (for Temporal workers)
    # =========================================================================

    def run_agent_sync(
        self,
        agent_type: str | None = None,
        agent_id: str | None = None,
        input_data: dict | None = None,
        workspace_id: str | None = None,
        record_id: str | None = None,
    ) -> dict:
        """
        Synchronous wrapper for agent execution - for use in Temporal workers.

        Args:
            agent_type: Type of prebuilt agent (sales_outreach, lead_scoring, etc.)
            agent_id: ID of a custom agent to execute
            input_data: Input context for the agent
            workspace_id: Workspace ID for the execution
            record_id: Optional record ID to operate on

        Returns:
            Dict with execution result
        """
        # Run the async method in a new event loop
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                return loop.run_until_complete(
                    self._execute_agent_internal(
                        agent_type=agent_type,
                        agent_id=agent_id,
                        input_data=input_data,
                        workspace_id=workspace_id,
                        record_id=record_id,
                    )
                )
            finally:
                loop.close()
        except Exception as e:
            logger.exception(f"Sync agent execution failed: {e}")
            return {
                "status": "failed",
                "error": str(e),
                "output": None,
            }

    async def _execute_agent_internal(
        self,
        agent_type: str | None = None,
        agent_id: str | None = None,
        input_data: dict | None = None,
        workspace_id: str | None = None,
        record_id: str | None = None,
    ) -> dict:
        """Internal async agent execution."""
        input_data = input_data or {}

        # If agent_id provided, look up the agent
        if agent_id:
            agent = await self.get_agent(agent_id)
            if not agent:
                return {"status": "failed", "error": f"Agent {agent_id} not found", "output": None}
            if not agent.is_active:
                return {"status": "failed", "error": f"Agent {agent.name} is not active", "output": None}

            workspace_id = agent.workspace_id
            agent_type = agent.agent_type
            execution = await self.execute_agent(
                agent_id=agent_id,
                record_id=record_id,
                context=input_data,
                triggered_by="workflow",
            )
            return {
                "status": execution.status,
                "output": execution.output_result,
                "steps": execution.steps,
                "error": execution.error_message,
                "execution_id": execution.id,
            }

        # Otherwise, build agent from type
        if not agent_type:
            return {"status": "failed", "error": "No agent_type or agent_id provided", "output": None}

        if not workspace_id:
            return {"status": "failed", "error": "workspace_id required for prebuilt agents", "output": None}

        # Build the agent directly
        builder = AgentBuilder(
            workspace_id=workspace_id,
            user_id=input_data.get("user_id"),
            db=self.db,
        )

        agent_instance = builder.build_from_config(
            name=agent_type,
            agent_type=agent_type,
        )
        from aexy.agents.tools.mcp_tools import attach_to_agent

        await attach_to_agent(
            agent_instance,
            self.db,
            workspace_id=workspace_id,
            developer_id=input_data.get("user_id"),
        )

        # Load record data if needed
        record_data = input_data.get("record_data", {})
        if record_id and not record_data:
            from aexy.services.crm_service import CRMRecordService
            record_service = CRMRecordService(self.db)
            record = await record_service.get_record(record_id)
            if record:
                record_data = {
                    "id": record.id,
                    "object_id": record.object_id,
                    "values": record.values,
                    "owner_id": record.owner_id,
                }

        try:
            result = await agent_instance.run(
                record_id=record_id,
                record_data=record_data,
                context=input_data,
            )
            return {
                "status": result.get("status", "completed"),
                "output": result.get("output"),
                "steps": result.get("steps", []),
                "error": result.get("error"),
            }
        except Exception as e:
            logger.exception(f"Agent execution failed: {e}")
            return {
                "status": "failed",
                "error": str(e),
                "output": None,
            }


class SyncAgentService:
    """Synchronous agent service for Temporal workers."""

    def __init__(self, db: Session):
        self.db = db

    def run_agent(
        self,
        agent_type: str | None = None,
        agent_id: str | None = None,
        input_data: dict | None = None,
        workspace_id: str | None = None,
        record_id: str | None = None,
    ) -> dict:
        """
        Execute an agent synchronously.

        Args:
            agent_type: Type of prebuilt agent
            agent_id: ID of a custom agent
            input_data: Input context for the agent
            workspace_id: Workspace ID
            record_id: Optional record ID

        Returns:
            Dict with execution result
        """
        input_data = input_data or {}

        # If agent_id provided, look up the agent
        if agent_id:
            agent = self.db.execute(
                select(CRMAgent).where(CRMAgent.id == agent_id)
            ).scalar_one_or_none()

            if not agent:
                return {"status": "failed", "error": f"Agent {agent_id} not found", "output": None}
            if not agent.is_active:
                return {"status": "failed", "error": f"Agent {agent.name} is not active", "output": None}

            workspace_id = agent.workspace_id
            agent_type = agent.agent_type

            # Create execution record
            execution = CRMAgentExecution(
                id=str(uuid4()),
                agent_id=agent_id,
                record_id=record_id,
                triggered_by="workflow",
                input_context=input_data,
                status="running",
                started_at=datetime.now(timezone.utc),
            )
            self.db.add(execution)
            self.db.commit()
        else:
            agent = None
            execution = None

        if not agent_type:
            return {"status": "failed", "error": "No agent_type or agent_id provided", "output": None}

        if not workspace_id:
            return {"status": "failed", "error": "workspace_id required for prebuilt agents", "output": None}

        # Load record data
        record_data = input_data.get("record_data", {})
        if record_id and not record_data:
            from aexy.models.crm import CRMRecord
            record = self.db.execute(
                select(CRMRecord).where(CRMRecord.id == record_id)
            ).scalar_one_or_none()
            if record:
                record_data = {
                    "id": record.id,
                    "object_id": record.object_id,
                    "values": record.values,
                    "owner_id": record.owner_id,
                }

        # Build and run the agent using asyncio
        builder = AgentBuilder(
            workspace_id=workspace_id,
            user_id=input_data.get("user_id"),
            db=self.db,
        )

        if agent:
            agent_instance = builder.build_from_config(
                name=agent.name,
                agent_type=agent.agent_type,
                goal=agent.goal,
                system_prompt=agent.system_prompt,
                tools=agent.tools,
                model=agent.model,
                llm_provider=agent.llm_provider,
                max_iterations=agent.max_iterations,
                timeout_seconds=agent.timeout_seconds,
            )
        else:
            agent_instance = builder.build_from_config(
                name=agent_type,
                agent_type=agent_type,
            )

        try:
            # Run async agent in sync context
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                from aexy.agents.tools.mcp_tools import attach_to_agent

                async def _attach_and_run():
                    await attach_to_agent(
                        agent_instance,
                        self.db,
                        workspace_id=workspace_id,
                        developer_id=input_data.get("user_id"),
                        principal_id=getattr(agent, "principal_id", None) if agent else None,
                    )
                    return await agent_instance.run(
                        record_id=record_id,
                        record_data=record_data,
                        context=input_data,
                    )

                result = loop.run_until_complete(_attach_and_run())
            finally:
                loop.close()

            # Update execution record if we have one
            if execution:
                execution.status = result.get("status", "completed")
                execution.output_result = result.get("output")
                execution.steps = result.get("steps", [])
                execution.error_message = result.get("error")
                execution.completed_at = datetime.now(timezone.utc)
                execution.duration_ms = int(
                    (execution.completed_at - execution.started_at).total_seconds() * 1000
                )

                if agent:
                    agent.total_executions += 1
                    if execution.status == "completed":
                        agent.successful_executions += 1
                    else:
                        agent.failed_executions += 1

                self.db.commit()

            return {
                "status": result.get("status", "completed"),
                "output": result.get("output"),
                "steps": result.get("steps", []),
                "error": result.get("error"),
                "execution_id": execution.id if execution else None,
            }

        except Exception as e:
            logger.exception(f"Agent execution failed: {e}")

            if execution:
                execution.status = "failed"
                execution.error_message = str(e)
                execution.completed_at = datetime.now(timezone.utc)
                execution.duration_ms = int(
                    (execution.completed_at - execution.started_at).total_seconds() * 1000
                )

                if agent:
                    agent.total_executions += 1
                    agent.failed_executions += 1

                self.db.commit()

            return {
                "status": "failed",
                "error": str(e),
                "output": None,
            }
