"""Agent service for managing and executing AI agents."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from aexy.models.agent import CRMAgent, CRMAgentExecution, AgentType, AgentExecutionStatus
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
        goal: str | None = None,
        system_prompt: str | None = None,
        tools: list[str] | None = None,
        max_iterations: int = 10,
        timeout_seconds: int = 300,
        model: str = "claude-3-sonnet-20240229",
        description: str | None = None,
        created_by_id: str | None = None,
    ) -> CRMAgent:
        """Create a new agent."""
        agent = CRMAgent(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            description=description,
            agent_type=agent_type,
            is_system=False,
            goal=goal,
            system_prompt=system_prompt,
            tools=tools or [],
            max_iterations=max_iterations,
            timeout_seconds=timeout_seconds,
            model=model,
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
        **kwargs,
    ) -> CRMAgent | None:
        """Update an agent."""
        agent = await self.get_agent(agent_id)
        if not agent:
            return None

        # Don't allow modifying system agents
        if agent.is_system and any(k != "is_active" for k in kwargs.keys()):
            return None

        for key, value in kwargs.items():
            if value is not None and hasattr(agent, key):
                setattr(agent, key, value)

        await self.db.flush()
        await self.db.refresh(agent)
        return agent

    async def delete_agent(self, agent_id: str) -> bool:
        """Delete an agent."""
        agent = await self.get_agent(agent_id)
        if not agent or agent.is_system:
            return False

        await self.db.delete(agent)
        await self.db.flush()
        return True

    async def toggle_agent(self, agent_id: str) -> CRMAgent | None:
        """Toggle agent active status."""
        agent = await self.get_agent(agent_id)
        if not agent:
            return None

        agent.is_active = not agent.is_active
        await self.db.flush()
        await self.db.refresh(agent)
        return agent

    # =========================================================================
    # SYSTEM AGENTS
    # =========================================================================

    async def ensure_system_agents(self, workspace_id: str) -> list[CRMAgent]:
        """Ensure system agents exist for a workspace."""
        system_agents = [
            {
                "name": "Sales Outreach",
                "description": "Research prospects and craft personalized outreach emails",
                "agent_type": "sales_outreach",
                "tools": [
                    "search_contacts", "get_record", "update_record", "get_activities",
                    "send_email", "create_draft", "get_email_history", "get_writing_style",
                    "enrich_company", "enrich_person", "web_search",
                ],
            },
            {
                "name": "Lead Scoring",
                "description": "Score leads 0-100 based on fit and engagement",
                "agent_type": "lead_scoring",
                "tools": [
                    "get_record", "update_record", "get_activities",
                    "enrich_company", "enrich_person",
                ],
            },
            {
                "name": "Email Drafter",
                "description": "Generate emails matching your personal writing style",
                "agent_type": "email_drafter",
                "tools": [
                    "get_record", "get_activities",
                    "create_draft", "get_email_history", "get_writing_style",
                ],
            },
            {
                "name": "Data Enrichment",
                "description": "Fill missing CRM fields from external data sources",
                "agent_type": "data_enrichment",
                "tools": [
                    "get_record", "update_record",
                    "enrich_company", "enrich_person", "web_search",
                ],
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
            max_iterations=agent.max_iterations,
            timeout_seconds=agent.timeout_seconds,
        )

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

    # =========================================================================
    # AVAILABLE TOOLS
    # =========================================================================

    @staticmethod
    def get_available_tools() -> list[dict]:
        """Get list of available tools for agent configuration."""
        return AgentBuilder.get_available_tools()

    # =========================================================================
    # SYNC EXECUTION (for Celery workers)
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
        Synchronous wrapper for agent execution - for use in Celery workers.

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
    """Synchronous agent service for Celery workers."""

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
                result = loop.run_until_complete(
                    agent_instance.run(
                        record_id=record_id,
                        record_data=record_data,
                        context=input_data,
                    )
                )
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
