"""Agent Orchestration Workflow — Temporal workflow for multi-agent block execution.

Decomposes tasks via orchestrator, executes blocks in parallel groups,
supports HITL via signals, and produces a final synthesis.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from aexy.temporal.dispatch import LLM_RETRY

logger = logging.getLogger(__name__)

AGENT_RETRY = RetryPolicy(
    initial_interval=timedelta(seconds=30),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(minutes=10),
    maximum_attempts=3,
    non_retryable_error_types=["ValueError", "KeyError"],
)


@dataclass
class AgentOrchestrationInput:
    workspace_id: str
    agent_workspace_id: str
    task: str
    user_id: str | None = None
    model: str | None = None
    config: dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentOrchestrationResult:
    status: str  # completed, failed, cancelled
    total_blocks: int = 0
    completed_blocks: int = 0
    summary: str = ""
    error: str | None = None


@workflow.defn
class AgentOrchestrationWorkflow:
    """Temporal workflow for orchestrated multi-agent block execution."""

    def __init__(self):
        self._paused = False
        self._cancelled = False
        self._human_responses: dict[str, str] = {}
        self._retry_blocks: list[str] = []
        self._status: dict[str, Any] = {
            "phase": "initializing",
            "completed_blocks": 0,
            "total_blocks": 0,
            "current_agents": [],
        }

    # ── Signals ────────────────────────────────────────────────────

    @workflow.signal
    async def on_human_response(self, block_id: str, response: str):
        """Receive human response for a waiting_human block."""
        self._human_responses[block_id] = response

    @workflow.signal
    async def pause(self):
        """Pause workflow execution."""
        self._paused = True

    @workflow.signal
    async def resume(self):
        """Resume paused workflow."""
        self._paused = False

    @workflow.signal
    async def cancel(self):
        """Cancel workflow."""
        self._cancelled = True

    @workflow.signal
    async def retry_block(self, block_id: str):
        """Retry a failed block."""
        self._retry_blocks.append(block_id)

    # ── Queries ────────────────────────────────────────────────────

    @workflow.query
    def get_status(self) -> dict:
        return self._status

    # ── Main run ───────────────────────────────────────────────────

    @workflow.run
    async def run(self, input: AgentOrchestrationInput) -> AgentOrchestrationResult:
        from aexy.temporal.activities.agent_orchestration import (
            ExecuteBlockInput,
            ExecuteBlockOutput,
            PlanTaskInput,
            PlanTaskOutput,
            SynthesizeResultsInput,
            SynthesizeResultsOutput,
        )

        # ── Phase 1: Plan ──────────────────────────────────────────

        self._status["phase"] = "planning"

        plan_result: PlanTaskOutput = await workflow.execute_activity(
            "plan_task",
            PlanTaskInput(
                workspace_id=input.workspace_id,
                agent_workspace_id=input.agent_workspace_id,
                task=input.task,
                model=input.model,
                config=input.config,
                user_id=input.user_id,
            ),
            start_to_close_timeout=timedelta(minutes=10),
            retry_policy=LLM_RETRY,
            task_queue="agents",
        )

        if plan_result.error or not plan_result.blocks:
            return AgentOrchestrationResult(
                status="failed",
                error=plan_result.error or "No blocks planned",
            )

        planned_blocks = plan_result.blocks
        self._status["total_blocks"] = len(planned_blocks)

        # ── Phase 2: Create blocks in DB ───────────────────────────

        self._status["phase"] = "creating_blocks"

        # Create all blocks via a lightweight activity
        block_ids: dict[str, str] = {}  # title -> block_id
        create_result: dict = await workflow.execute_activity(
            "create_planned_blocks",
            {
                "agent_workspace_id": input.agent_workspace_id,
                "blocks": planned_blocks,
            },
            start_to_close_timeout=timedelta(minutes=2),
            retry_policy=AGENT_RETRY,
            task_queue="agents",
        )
        block_ids = create_result.get("block_ids", {})

        # ── Phase 3: Execute by parallel group ─────────────────────

        self._status["phase"] = "executing"

        # Group blocks by parallel_group
        groups: dict[int, list[dict]] = {}
        for pb in planned_blocks:
            group = pb.get("parallel_group", 0)
            groups.setdefault(group, []).append(pb)

        block_outputs: dict[str, ExecuteBlockOutput] = {}

        for group_num in sorted(groups.keys()):
            if self._cancelled:
                return AgentOrchestrationResult(
                    status="cancelled",
                    total_blocks=len(planned_blocks),
                    completed_blocks=self._status["completed_blocks"],
                )

            # Wait if paused
            await workflow.wait_condition(lambda: not self._paused)

            group_blocks = groups[group_num]
            self._status["current_agents"] = [b["persona"] for b in group_blocks]

            # Fan out activities for this group
            handles = []
            for pb in group_blocks:
                block_id = block_ids.get(pb["title"], "")
                if not block_id:
                    continue

                # Check if it's a human_input block
                if pb.get("block_type") == "human_input":
                    # Wait for human response
                    await workflow.wait_condition(
                        lambda bid=block_id: bid in self._human_responses,
                        timeout=timedelta(hours=24),
                    )
                    response = self._human_responses.get(block_id, "No response (timed out)")
                    block_outputs[block_id] = ExecuteBlockOutput(
                        block_id=block_id,
                        status="completed",
                        content={"text": response},
                    )
                    self._status["completed_blocks"] += 1
                    continue

                # Get parent content if dependencies exist
                parent_content = None
                for dep_title in pb.get("depends_on", []):
                    dep_id = block_ids.get(dep_title)
                    if dep_id and dep_id in block_outputs:
                        dep_output = block_outputs[dep_id]
                        parent_content = dep_output.content.get("text", "")
                        break

                handle = workflow.start_activity(
                    "execute_block",
                    ExecuteBlockInput(
                        workspace_id=input.workspace_id,
                        agent_workspace_id=input.agent_workspace_id,
                        block_id=block_id,
                        block_type=pb.get("block_type", "markdown"),
                        persona=pb.get("persona", "writer"),
                        model=pb.get("model", "claude-sonnet-4-6"),
                        provider=pb.get("provider", "claude"),
                        prompt=pb.get("prompt", ""),
                        parent_content=parent_content,
                        config=input.config,
                    ),
                    start_to_close_timeout=timedelta(minutes=30),
                    heartbeat_timeout=timedelta(minutes=5),
                    retry_policy=AGENT_RETRY,
                    task_queue="agents",
                )
                handles.append((block_id, handle))

            # Wait for all activities in this group
            for block_id, handle in handles:
                try:
                    result: ExecuteBlockOutput = await handle
                    block_outputs[block_id] = result
                    self._status["completed_blocks"] += 1
                except Exception as e:
                    logger.warning(f"Block {block_id} failed: {e}")
                    block_outputs[block_id] = ExecuteBlockOutput(
                        block_id=block_id,
                        status="failed",
                        error=str(e),
                    )
                    self._status["completed_blocks"] += 1

        # ── Phase 4: Synthesize ────────────────────────────────────

        self._status["phase"] = "synthesizing"
        self._status["current_agents"] = ["writer"]

        block_summaries = []
        for pb in planned_blocks:
            bid = block_ids.get(pb["title"], "")
            output = block_outputs.get(bid)
            if output and output.status == "completed":
                block_summaries.append({
                    "title": pb["title"],
                    "content": output.content,
                })

        synth_result: SynthesizeResultsOutput = await workflow.execute_activity(
            "synthesize_results",
            SynthesizeResultsInput(
                workspace_id=input.workspace_id,
                agent_workspace_id=input.agent_workspace_id,
                block_summaries=block_summaries,
                task=input.task,
                config=input.config,
            ),
            start_to_close_timeout=timedelta(minutes=15),
            retry_policy=LLM_RETRY,
            task_queue="agents",
        )

        self._status["phase"] = "completed"
        self._status["current_agents"] = []

        failed_count = sum(
            1 for o in block_outputs.values() if o.status == "failed"
        )
        final_status = "completed" if failed_count == 0 else "completed_with_errors"

        return AgentOrchestrationResult(
            status=final_status,
            total_blocks=len(planned_blocks),
            completed_blocks=self._status["completed_blocks"],
            summary=synth_result.summary,
            error=synth_result.error,
        )
