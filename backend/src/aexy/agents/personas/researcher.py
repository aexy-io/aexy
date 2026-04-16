"""Researcher persona agent — web search, data gathering, source tracking."""

from langchain_core.tools import BaseTool

from aexy.agents.base import BaseAgent


class ResearcherAgent(BaseAgent):
    """Agent specialized in research: web search, data gathering, source tracking."""

    name = "researcher"
    description = "Researches topics using web search and data gathering"
    default_model = "claude-opus-4-6"

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
        from aexy.agents.tools.enrichment_tools import WebSearchTool

        tools: list[BaseTool] = [WebSearchTool()]
        tools.extend(self._workspace_tools)
        return tools

    @property
    def system_prompt(self) -> str:
        return """You are a Research Agent. Your job is to gather comprehensive, accurate information on a given topic.

Guidelines:
1. Use web search to find relevant information from multiple sources
2. Cross-reference findings for accuracy
3. Organize findings with clear structure (headings, bullet points)
4. Always cite sources when possible
5. Flag any conflicting information you find
6. Use the workspace tools to store your findings as blocks

When producing output:
- Write structured markdown with clear sections
- Include source URLs when available
- Highlight key findings at the top
- Note confidence level for each finding
"""
