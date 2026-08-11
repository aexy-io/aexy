"""Schemas for the MCP tool-discovery endpoint."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class McpAction(BaseModel):
    """One operation reachable through a capability's tool."""

    action: str
    method: str
    path: str
    summary: str
    mutating: bool = Field(description="True when the operation changes data.")


class McpTool(BaseModel):
    """A tool as an MCP client should register it."""

    name: str
    capability: str | None = Field(
        default=None,
        description="Capability governing this tool. None for the generic discover/call tools.",
    )
    description: str
    input_schema: dict[str, Any]
    actions: list[McpAction] = Field(
        default_factory=list,
        description=(
            "Operations this tool can perform. Empty for the generic tools, which "
            "reach every operation the caller may reach."
        ),
    )


class McpDeniedCapability(BaseModel):
    capability: str
    operation_count: int
    reason: str


class McpToolsResponse(BaseModel):
    """The tool surface for one caller in one workspace.

    Only granted tools are present. A tool the caller cannot use is omitted
    rather than disabled, because carrying it would still cost selection
    accuracy on every call they do make.
    """

    workspace_id: str
    catalog_version: int
    granted_capabilities: list[str]
    denied_capabilities: list[McpDeniedCapability]
    reachable_operation_count: int
    total_operation_count: int
    tools: list[McpTool]
