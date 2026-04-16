"""Temporal activities for the Agent Orchestration workflow."""

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from temporalio import activity

logger = logging.getLogger(__name__)


@dataclass
class PlanTaskInput:
    workspace_id: str
    agent_workspace_id: str
    task: str
    model: str | None = None
    config: dict[str, Any] = field(default_factory=dict)
    user_id: str | None = None


@dataclass
class PlanTaskOutput:
    blocks: list[dict[str, Any]]
    error: str | None = None


@activity.defn
async def plan_task(input: PlanTaskInput) -> PlanTaskOutput:
    """Orchestrator plans the task into a block DAG."""
    from aexy.agents.orchestrator import OrchestratorAgent

    try:
        orchestrator = OrchestratorAgent(
            config=input.config,
            model=input.model,
        )
        planned_blocks = await orchestrator.plan(
            task=input.task,
            context={"workspace_id": input.workspace_id},
        )

        blocks = []
        for pb in planned_blocks:
            blocks.append({
                "title": pb.title,
                "block_type": pb.block_type,
                "persona": pb.persona,
                "model": pb.model,
                "provider": pb.provider,
                "prompt": pb.prompt,
                "depends_on": pb.depends_on,
                "parallel_group": pb.parallel_group,
            })

        return PlanTaskOutput(blocks=blocks)
    except Exception as e:
        logger.exception("plan_task failed")
        return PlanTaskOutput(blocks=[], error=str(e))


@dataclass
class ExecuteBlockInput:
    workspace_id: str
    agent_workspace_id: str
    block_id: str
    block_type: str
    persona: str
    model: str
    provider: str
    prompt: str
    parent_content: str | None = None
    config: dict[str, Any] = field(default_factory=dict)


@dataclass
class ExecuteBlockOutput:
    block_id: str
    status: str  # completed or failed
    content: dict[str, Any] = field(default_factory=dict)
    handoff_data: dict[str, Any] | None = None
    token_usage: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


@activity.defn
async def execute_block(input: ExecuteBlockInput) -> ExecuteBlockOutput:
    """Execute a single block using the assigned persona agent."""
    from aexy.core.database import get_async_session
    from aexy.agents.persona_registry import get_persona_agent
    from aexy.agents.tools.workspace_tools import get_workspace_tools
    from aexy.services.agent_workspace_service import AgentWorkspaceService
    from aexy.schemas.agent_workspace import BlockUpdate

    try:
        async with get_async_session() as db:
            # Mark block as running
            service = AgentWorkspaceService(db)
            await service.update_block(
                input.agent_workspace_id,
                input.block_id,
                BlockUpdate(status="running"),
            )
            await db.commit()

        async with get_async_session() as db:
            workspace_tools = get_workspace_tools(input.agent_workspace_id, db)

            agent = get_persona_agent(
                persona=input.persona,
                workspace_id=input.workspace_id,
                agent_workspace_id=input.agent_workspace_id,
                db=db,
                workspace_tools=workspace_tools,
                model=input.model,
                llm_provider=input.provider,
            )

            # Build prompt with parent context
            full_prompt = input.prompt
            if input.parent_content:
                full_prompt = (
                    f"Previous stage output:\n{input.parent_content}\n\n"
                    f"Your task:\n{input.prompt}"
                )

            result = await agent.run(
                record_data={"values": {"task": full_prompt}},
                context={"block_id": input.block_id},
            )

            # Extract content from result
            output_content = {}
            if result.get("output") and result["output"].get("content"):
                content_text = result["output"]["content"]
                output_content = {"text": content_text}

            # Calculate token usage
            total_input = sum(
                s.get("input_tokens", 0) for s in result.get("steps", [])
            )
            total_output = sum(
                s.get("output_tokens", 0) for s in result.get("steps", [])
            )
            token_usage = {
                "input_tokens": total_input,
                "output_tokens": total_output,
                "model": input.model,
                "provider": input.provider,
            }

            # Build handoff data for downstream blocks
            handoff = None
            if input.block_type == "handoff" or result.get("status") == "completed":
                handoff = {
                    "what_was_done": input.prompt,
                    "findings": output_content.get("text", "")[:500],
                    "confidence": "high" if result.get("status") == "completed" else "low",
                }

            # Update block in DB
            status = "completed" if result.get("status") == "completed" else "failed"
            await service.update_block(
                input.agent_workspace_id,
                input.block_id,
                BlockUpdate(
                    status=status,
                    content=output_content,
                    handoff_data=handoff,
                    token_usage=token_usage,
                    error_message=result.get("error"),
                ),
            )
            await db.commit()

            return ExecuteBlockOutput(
                block_id=input.block_id,
                status=status,
                content=output_content,
                handoff_data=handoff,
                token_usage=token_usage,
                error=result.get("error"),
            )

    except Exception as e:
        logger.exception("execute_block failed for %s", input.block_id)
        # Try to mark block as failed
        try:
            async with get_async_session() as db:
                service = AgentWorkspaceService(db)
                await service.update_block(
                    input.agent_workspace_id,
                    input.block_id,
                    BlockUpdate(status="failed", error_message=str(e)),
                )
                await db.commit()
        except Exception:
            logger.exception(
                "Failed to record failure for block %s", input.block_id
            )

        return ExecuteBlockOutput(
            block_id=input.block_id,
            status="failed",
            error=str(e),
        )


@dataclass
class SynthesizeResultsInput:
    workspace_id: str
    agent_workspace_id: str
    block_summaries: list[dict[str, Any]]
    task: str
    config: dict[str, Any] = field(default_factory=dict)


@dataclass
class SynthesizeResultsOutput:
    summary: str
    status: str = "completed"
    error: str | None = None


@activity.defn
async def create_planned_blocks(input: dict[str, Any]) -> dict[str, Any]:
    """Create blocks in the DB from the orchestrator's plan."""
    from aexy.core.database import get_async_session
    from aexy.schemas.agent_workspace import BlockCreate
    from aexy.services.agent_workspace_service import AgentWorkspaceService

    agent_workspace_id = input["agent_workspace_id"]
    blocks = input["blocks"]
    block_ids: dict[str, str] = {}

    try:
        async with get_async_session() as db:
            service = AgentWorkspaceService(db)

            # Create blocks in order, resolving parent references
            for i, pb in enumerate(blocks):
                parent_id = None
                for dep_title in pb.get("depends_on", []):
                    if dep_title in block_ids:
                        parent_id = block_ids[dep_title]
                        break

                block = await service.create_block(
                    agent_workspace_id,
                    BlockCreate(
                        parent_id=parent_id,
                        block_type=pb.get("block_type", "markdown"),
                        title=pb["title"],
                        status="pending",
                        content={},
                        dependencies=[
                            block_ids[d]
                            for d in pb.get("depends_on", [])
                            if d in block_ids
                        ],
                        sort_order=i,
                    ),
                )
                block_ids[pb["title"]] = block.id

            await db.commit()

        return {"block_ids": block_ids}
    except Exception as e:
        logger.exception("create_planned_blocks failed")
        return {"block_ids": block_ids, "error": str(e)}


@activity.defn
async def synthesize_results(input: SynthesizeResultsInput) -> SynthesizeResultsOutput:
    """Synthesize all block results into a final summary."""
    from aexy.agents.personas.writer import WriterAgent
    from aexy.core.database import get_async_session
    from aexy.agents.tools.workspace_tools import get_workspace_tools
    from aexy.schemas.agent_workspace import BlockCreate
    from aexy.services.agent_workspace_service import AgentWorkspaceService

    try:
        async with get_async_session() as db:
            workspace_tools = get_workspace_tools(input.agent_workspace_id, db)

            writer = WriterAgent(
                workspace_id=input.workspace_id,
                agent_workspace_id=input.agent_workspace_id,
                db=db,
                workspace_tools=workspace_tools,
            )

            # Build synthesis prompt
            summaries_text = ""
            for bs in input.block_summaries:
                summaries_text += f"\n### {bs.get('title', 'Block')}\n"
                content = bs.get("content", {})
                summaries_text += content.get("text", json.dumps(content))[:1000]
                summaries_text += "\n"

            prompt = (
                f"Original task: {input.task}\n\n"
                f"Block results:\n{summaries_text}\n\n"
                "Synthesize all the above into a clear, well-structured final summary. "
                "Include key findings, insights, and recommendations."
            )

            result = await writer.run(
                record_data={"values": {"task": prompt}},
            )

            summary = ""
            if result.get("output") and result["output"].get("content"):
                summary = result["output"]["content"]

            # Create the summary block
            service = AgentWorkspaceService(db)
            await service.create_block(
                input.agent_workspace_id,
                BlockCreate(
                    block_type="markdown",
                    title="Final Summary",
                    content={"text": summary},
                    status="completed",
                    sort_order=9999,
                ),
            )
            await db.commit()

            return SynthesizeResultsOutput(summary=summary)

    except Exception as e:
        logger.exception("synthesize_results failed")
        return SynthesizeResultsOutput(
            summary="", status="failed", error=str(e)
        )
