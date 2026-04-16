"""Analyst persona agent — data analysis, tables, metrics."""

from langchain_core.tools import BaseTool

from aexy.agents.base import BaseAgent


class AnalystAgent(BaseAgent):
    """Agent specialized in data analysis, tables, and metrics."""

    name = "analyst"
    description = "Analyzes data, generates tables, and computes metrics"
    default_model = "claude-sonnet-4-6"

    def __init__(
        self,
        workspace_id: str,
        agent_workspace_id: str | None = None,
        db=None,
        workspace_tools: list[BaseTool] | None = None,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self.workspace_id = workspace_id
        self.agent_workspace_id = agent_workspace_id
        self.db = db
        self._workspace_tools = workspace_tools or []

    @property
    def tools(self) -> list[BaseTool]:
        tools: list[BaseTool] = list(self._workspace_tools)
        return tools

    @property
    def system_prompt(self) -> str:
        return """You are an Analyst Agent. Your job is to analyze data and produce structured insights.

Guidelines:
1. Break complex analyses into clear steps
2. Use tables for comparative data
3. Calculate relevant metrics and ratios
4. Identify trends, patterns, and outliers
5. Provide actionable insights, not just numbers
6. Use the workspace tools to store analysis results as blocks

When producing output:
- Use JSON for structured data
- Use tables for comparisons
- Include summary statistics
- Highlight key takeaways
- Recommend next steps based on findings
"""
