"""Resolve which MCP capabilities a caller holds.

The rule is deliberately boring: **an MCP grant is the app grant the workspace
already made.** Holding the ``sprints`` app is what grants ``mcp.sprints``. There
is no separate MCP permission model to configure, drift from, or forget to
revoke when someone changes teams.

Only the three surfaces that were never apps — platform administration, billing
and provider integrations — need somewhere of their own, and they live as
modules on the ``mcp`` app rather than inventing a parallel system for them.

This replaces a client-side environment variable. ``AEXY_ENABLE_TEMPORAL`` was
set by the caller on their own machine, so it gated nothing; anyone holding any
API token decided their own access. Resolution happens here now, server-side,
from the same :class:`AppAccessService` that governs the web app.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from aexy.services.app_access_service import AppAccessService
from aexy.services.mcp_catalog import PLATFORM_CAPABILITIES


class McpAccessService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self._access = AppAccessService(db)

    async def get_granted_capabilities(
        self,
        workspace_id: str,
        developer_id: str,
    ) -> set[str]:
        """Return the ``mcp.*`` capabilities this developer holds in this workspace.

        Uses ``can_access`` rather than ``enabled``: the former answers "let them
        through the API", which is what a tool call is, while the latter only
        answers "put it in their navigation". Admins can reach a
        workspace-enabled app to administer it even when their profile keeps it
        out of their sidebar, and the tool list should agree with the API that
        will actually serve the call.
        """
        status = await self._access.get_effective_access(workspace_id, developer_id)
        apps = status["apps"]

        granted: set[str] = set()

        # App-backed capabilities: the app grant IS the MCP grant.
        for app_id, access in apps.items():
            if app_id == "mcp":
                continue
            if access.get("can_access"):
                granted.add(f"mcp.{app_id}")

        # Platform capabilities: modules on the `mcp` app, since they are not
        # apps themselves. Reaching them requires the MCP app plus the module.
        mcp_app = apps.get("mcp")
        if mcp_app and mcp_app.get("can_access"):
            modules = mcp_app.get("modules") or {}
            for capability in PLATFORM_CAPABILITIES:
                if modules.get(capability):
                    granted.add(f"mcp.{capability}")

        return granted
