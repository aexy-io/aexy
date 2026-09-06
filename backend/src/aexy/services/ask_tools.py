"""Tool definitions and execution for the Ask AI agentic loop."""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession


logger = logging.getLogger(__name__)


# --- Tool definitions in Anthropic API format ---

# The one tool that is not an API operation. Everything else Ask can do comes
# from the MCP catalogue, filtered to what the asker holds.
TOOL_DEFINITIONS = [
    {
        "name": "current_time",
        "description": "Get the current date and time in UTC.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
]


ASK_ALLOW_WRITES = os.environ.get("ASK_ALLOW_WRITES", "false").lower() == "true"


async def build_tool_definitions(
    db: AsyncSession, workspace_id: str, developer_id: str
) -> list[dict[str, Any]]:
    """The tools Ask offers this person in this workspace.

    `current_time`, then the MCP surface: discovery, the generic call, the
    read-only routines and one tool per capability the person holds, listing
    only read operations unless writes are switched on. The catalogue is what
    makes "how many service desk tickets are pending with Finance" answerable
    without somebody writing a tool for it first.
    """
    definitions = list(TOOL_DEFINITIONS)
    try:
        from aexy.agents.tools.mcp_tools import resolve_context, tool_definitions

        context = await resolve_context(
            db,
            workspace_id=workspace_id,
            developer_id=developer_id,
            actor_kind="ask",
            allow_writes=ASK_ALLOW_WRITES,
        )
        legacy = {d["name"] for d in definitions}
        definitions.extend(
            d for d in tool_definitions(context, reads_only=not ASK_ALLOW_WRITES)
            if d["name"] not in legacy
        )
    except Exception:
        logger.exception("Could not build the MCP tool surface for Ask; using the built-in tools")
    return definitions


async def execute_tool(
    tool_name: str,
    tool_input: dict[str, Any],
    db: AsyncSession,
    workspace_id: str,
    developer_id: str,
) -> dict[str, Any]:
    """Execute a tool and return its result.

    Returns:
        Dict with 'result' key on success, or 'error' key on failure.
    """
    try:
        handler = TOOL_HANDLERS.get(tool_name)
        if handler:
            return await handler(tool_input, db, workspace_id, developer_id)
        return await _execute_catalog_tool(tool_name, tool_input, db, workspace_id, developer_id)
    except Exception as e:
        logger.error(f"Tool execution error ({tool_name}): {e}", exc_info=True)
        return {"error": f"Tool '{tool_name}' failed to execute"}


async def _execute_catalog_tool(
    tool_name: str,
    tool_input: dict[str, Any],
    db: AsyncSession,
    workspace_id: str,
    developer_id: str,
) -> dict[str, Any]:
    """Run an MCP surface tool through the governed executor, as this person."""
    from aexy.agents.tools.mcp_tools import resolve_context

    context = await resolve_context(
        db,
        workspace_id=workspace_id,
        developer_id=developer_id,
        actor_kind="ask",
        allow_writes=ASK_ALLOW_WRITES,
    )
    result = await context.call(tool_name, tool_input)
    if result.is_error:
        return {"error": result.content}
    try:
        return {"result": json.loads(result.content)}
    except (ValueError, TypeError):
        return {"result": result.content}


# --- Tool handler implementations ---


async def _current_time(
    tool_input: dict[str, Any],
    db: AsyncSession,
    workspace_id: str,
    developer_id: str,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    return {
        "result": {
            "utc": now.isoformat(),
            "date": now.strftime("%Y-%m-%d"),
            "time": now.strftime("%H:%M:%S"),
            "day_of_week": now.strftime("%A"),
        }
    }


TOOL_HANDLERS = {
    "current_time": _current_time,
}
