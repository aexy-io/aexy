"""Tools for reading and generating documents."""

from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field


class GenerateMarkdownInput(BaseModel):
    title: str = Field(description="Document title")
    sections: list[dict] = Field(
        description="List of sections, each with 'heading' and 'content' keys"
    )


class GenerateMarkdownTool(BaseTool):
    """Generate formatted markdown document."""

    name: str = "generate_markdown"
    description: str = "Generate a formatted markdown document from structured sections"
    args_schema: type[BaseModel] = GenerateMarkdownInput

    def _run(self, title: str, sections: list[dict]) -> str:
        lines = [f"# {title}", ""]
        for section in sections:
            heading = section.get("heading", "Section")
            content = section.get("content", "")
            lines.append(f"## {heading}")
            lines.append("")
            lines.append(content)
            lines.append("")
        return "\n".join(lines)

    async def _arun(self, title: str, sections: list[dict]) -> str:
        return self._run(title=title, sections=sections)


class GenerateTableInput(BaseModel):
    headers: list[str] = Field(description="Column headers")
    rows: list[list[str]] = Field(description="Table rows")


class GenerateTableTool(BaseTool):
    """Generate a structured markdown table."""

    name: str = "generate_table"
    description: str = "Generate a markdown table from headers and rows"
    args_schema: type[BaseModel] = GenerateTableInput

    def _run(self, headers: list[str], rows: list[list[str]]) -> str:
        if not headers:
            return "No headers provided"
        header_line = "| " + " | ".join(headers) + " |"
        separator = "| " + " | ".join("---" for _ in headers) + " |"
        row_lines = []
        for row in rows:
            # Pad row to match headers length
            padded = row + [""] * (len(headers) - len(row))
            row_lines.append("| " + " | ".join(str(c) for c in padded[:len(headers)]) + " |")
        return "\n".join([header_line, separator] + row_lines)

    async def _arun(self, headers: list[str], rows: list[list[str]]) -> str:
        return self._run(headers=headers, rows=rows)
