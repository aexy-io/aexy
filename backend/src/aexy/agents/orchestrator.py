"""Orchestrator agent — decomposes tasks into block DAGs for multi-agent execution."""

import json
import logging
from dataclasses import dataclass
from typing import Any

from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field

from aexy.agents.base import BaseAgent
from aexy.agents.model_selector import select_model

logger = logging.getLogger(__name__)


@dataclass
class PlannedBlock:
    """A planned block in the orchestration DAG."""
    title: str
    block_type: str  # markdown, json, table, etc.
    persona: str  # researcher, analyst, writer
    model: str  # model name
    provider: str  # claude or gemini
    prompt: str  # what to produce
    depends_on: list[str]  # titles of parent blocks
    parallel_group: int  # same group = can run in parallel


# ── Tools for the orchestrator ─────────────────────────────────────


class CreateBlockPlanInput(BaseModel):
    blocks: str = Field(
        description=(
            "JSON array of planned blocks. Each block: "
            '{"title": str, "block_type": str, "persona": str, '
            '"prompt": str, "depends_on": [str], "parallel_group": int}'
        )
    )


class CreateBlockPlanTool(BaseTool):
    """Create a block plan for task decomposition."""

    name: str = "create_block_plan"
    description: str = (
        "Create a plan of blocks to execute. Each block has a title, type, "
        "persona (researcher/analyst/writer), prompt, dependencies, and parallel group."
    )
    args_schema: type[BaseModel] = CreateBlockPlanInput

    config: dict = {}

    def _run(self, blocks: str) -> str:
        return self._parse_plan(blocks)

    async def _arun(self, blocks: str) -> str:
        return self._parse_plan(blocks)

    def _parse_plan(self, blocks: str) -> str:
        try:
            block_list = json.loads(blocks)
        except json.JSONDecodeError:
            return "Error: blocks must be valid JSON array"

        if not isinstance(block_list, list) or len(block_list) == 0:
            return "Error: blocks must be a non-empty array"

        planned = []
        for b in block_list:
            model, provider = select_model(
                persona=b.get("persona", "writer"),
                config=self.config,
            )
            planned.append({
                "title": b["title"],
                "block_type": b.get("block_type", "markdown"),
                "persona": b.get("persona", "writer"),
                "model": model,
                "provider": provider,
                "prompt": b.get("prompt", ""),
                "depends_on": b.get("depends_on", []),
                "parallel_group": b.get("parallel_group", 0),
            })

        return json.dumps({"status": "plan_created", "blocks": planned})


class OrchestratorAgent(BaseAgent):
    """Orchestrator agent that decomposes tasks into block DAGs."""

    name = "orchestrator"
    description = "Decomposes complex tasks into a DAG of specialized agent blocks"
    default_model = "claude-opus-4-6"

    def __init__(self, config: dict | None = None, **kwargs):
        super().__init__(**kwargs)
        self._config = config or {}

    @property
    def tools(self) -> list[BaseTool]:
        return [CreateBlockPlanTool(config=self._config)]

    @property
    def system_prompt(self) -> str:
        return """You are an Orchestrator Agent. Your job is to decompose a complex task into a structured plan of blocks that specialized agents will execute.

Available personas:
- **researcher**: Web search, data gathering, source tracking. Good for: finding information, market research, competitive analysis.
- **analyst**: Data analysis, tables, metrics. Good for: crunching numbers, comparisons, trend analysis.
- **writer**: Document generation, summaries, reports. Good for: producing final documents, executive summaries, recommendations.

Block types: markdown, json, table, code, text, handoff, human_input

Guidelines:
1. Decompose the task into 3-10 focused blocks
2. Assign the most appropriate persona to each block
3. Use parallel_group to indicate which blocks can run simultaneously (same group number = parallel)
4. Lower parallel_group numbers execute first
5. Use depends_on to specify which blocks must complete before this one starts
6. Include a handoff block between major stages to summarize findings
7. Add a final synthesis/summary block at the end
8. Use human_input blocks when user clarification is needed (sparingly)

You MUST call the create_block_plan tool with your plan. Output a well-structured JSON plan.

Example plan structure:
- Group 0: Research blocks (parallel)
- Group 1: Handoff summarizing research
- Group 2: Analysis blocks (parallel)
- Group 3: Final synthesis/writing block
"""

    async def plan(self, task: str, context: dict | None = None) -> list[PlannedBlock]:
        """Run the orchestrator to produce a block plan.

        Returns:
            List of PlannedBlock dataclasses.
        """
        result = await self.run(
            record_data={"values": {"task": task}},
            context=context or {},
        )

        # Parse the plan from tool output
        blocks = []
        for step in result.get("steps", []):
            if step.get("type") == "tool_call" and step.get("tool") == "create_block_plan":
                output = step.get("output", "")
                try:
                    parsed = json.loads(output)
                    for b in parsed.get("blocks", []):
                        blocks.append(
                            PlannedBlock(
                                title=b["title"],
                                block_type=b.get("block_type", "markdown"),
                                persona=b.get("persona", "writer"),
                                model=b.get("model", self.default_model),
                                provider=b.get("provider", "claude"),
                                prompt=b.get("prompt", ""),
                                depends_on=b.get("depends_on", []),
                                parallel_group=b.get("parallel_group", 0),
                            )
                        )
                except (json.JSONDecodeError, KeyError):
                    logger.error("Failed to parse orchestrator plan output")

        return blocks
