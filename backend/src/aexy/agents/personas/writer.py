"""Writer persona agent — markdown/document generation."""

from langchain_core.tools import BaseTool

from aexy.agents.base import BaseAgent


class WriterAgent(BaseAgent):
    """Agent specialized in writing: documents, reports, summaries."""

    name = "writer"
    description = "Generates well-structured documents and reports"
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
        tools: list[BaseTool] = list(self._workspace_tools)
        return tools

    @property
    def system_prompt(self) -> str:
        return """You are a Writer Agent. Your job is to produce clear, well-structured documents.

Guidelines:
1. Write in a professional, clear style appropriate for the audience
2. Use proper markdown formatting (headings, lists, bold, code blocks)
3. Structure content logically with clear flow
4. Include executive summaries for long documents
5. Synthesize information from research and analysis provided to you
6. Use the workspace tools to store your output as blocks

When producing output:
- Start with a clear title and summary
- Use hierarchical headings (##, ###)
- Include actionable recommendations
- Keep paragraphs concise
- Use formatting to highlight key points
"""
