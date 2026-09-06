"""Named tools for the docs workflow.

The per-capability tool already reaches every operation, so these add no
reach. They add a *route*: `aexy_docs` offers an enum of dozens of actions,
and working out which of them keep a document honest — and in what order — is
work the tool list can do once instead of every agent doing it badly.
"""

from unittest.mock import MagicMock

import pytest

from aexy.services.mcp_catalog import WORKFLOW_TOOLS, build_tools, workflow_tool
from aexy.services.mcp_tool_executor import McpToolExecutor, ToolResult

pytestmark = pytest.mark.asyncio

DOCS_OPS = [
    {
        "action": "list_documents_needing_update",
        "method": "get",
        "path": "/api/v1/workspaces/{workspace_id}/documents/needs-update",
        "summary": "",
        "mutating": False,
    },
    {
        "action": "list_merged_changes",
        "method": "get",
        "path": "/api/v1/workspaces/{workspace_id}/documents/merged-changes",
        "summary": "",
        "mutating": False,
    },
    {
        "action": "propose_document_update",
        "method": "post",
        "path": "/api/v1/workspaces/{workspace_id}/documents/{document_id}/propose",
        "summary": "",
        "mutating": True,
    },
    {
        "action": "create_document_from_repository",
        "method": "post",
        "path": "/api/v1/workspaces/{workspace_id}/documents/from-repository",
        "summary": "",
        "mutating": True,
    },
]

CATALOG = {
    "capabilities": [
        {"capability": "mcp.docs", "operations": DOCS_OPS, "operation_count": len(DOCS_OPS)},
        {
            "capability": "mcp.crm",
            "operations": [
                {
                    "action": "list_contacts",
                    "method": "get",
                    "path": "/x",
                    "summary": "",
                    "mutating": False,
                }
            ],
            "operation_count": 1,
        },
    ]
}


class TestTheToolList:
    def test_the_named_tools_are_offered_to_a_docs_caller(self):
        names = [t["name"] for t in build_tools(CATALOG, {"mcp.docs"})]

        for tool in WORKFLOW_TOOLS:
            if tool["capability"] == "mcp.docs":
                assert tool["name"] in names

    def test_they_are_withheld_from_a_caller_without_the_capability(self):
        """A shortcut to an operation outside your grants must be absent, not
        merely refused — a tool that always fails still costs selection
        accuracy on every call you do make."""
        names = [t["name"] for t in build_tools(CATALOG, {"mcp.crm"})]

        for tool in WORKFLOW_TOOLS:
            assert tool["name"] not in names

    def test_they_come_before_the_capability_enum(self):
        """An agent scanning the list should meet the route before the enum
        that contains it."""
        names = [t["name"] for t in build_tools(CATALOG, {"mcp.docs"})]

        assert names.index("aexy_docs_needing_update") < names.index("aexy_docs")

    def test_each_declares_a_real_body_shape(self):
        """The point of a named tool is that its schema is the actual payload,
        not `body: object` with the shape left to guesswork."""
        propose = workflow_tool("aexy_docs_propose")

        props = propose["input_schema"]["properties"]
        assert "markdown" in props
        assert "summary" in props
        # The workspace is the grant's, never the model's to supply.
        assert set(propose["input_schema"]["required"]) == {"document_id", "markdown"}


class TestRouting:
    def _executor(self):
        return McpToolExecutor(
            app=MagicMock(), catalog=CATALOG, granted={"mcp.docs"}, db=None
        )

    async def test_flat_arguments_are_spread_into_the_call_shape(self, monkeypatch):
        """The path / query / body split is an artefact of HTTP, not something
        an agent should have to reason about."""
        executor = self._executor()
        seen = {}

        async def _perform(*, operation, arguments, developer_id, workspace_id, **_):
            seen.update(operation=operation, arguments=arguments)
            return ToolResult("ok")

        monkeypatch.setattr(executor, "_perform", _perform)

        await executor.call(
            tool_name="aexy_docs_propose",
            arguments={
                "workspace_id": "ws-1",
                "document_id": "doc-1",
                "markdown": "# New",
                "summary": "Rewrote auth",
            },
            developer_id="dev-1",
            workspace_id="ws-1",
        )

        assert seen["operation"]["action"] == "propose_document_update"
        assert seen["arguments"]["path_params"] == {
            "workspace_id": "ws-1",
            "document_id": "doc-1",
        }
        assert seen["arguments"]["body"] == {
            "markdown": "# New",
            "summary": "Rewrote auth",
        }

    async def test_an_omitted_optional_argument_is_left_out(self, monkeypatch):
        executor = self._executor()
        seen = {}

        async def _perform(*, operation, arguments, developer_id, workspace_id, **_):
            seen.update(arguments=arguments)
            return ToolResult("ok")

        monkeypatch.setattr(executor, "_perform", _perform)

        await executor.call(
            tool_name="aexy_docs_needing_update",
            arguments={"workspace_id": "ws-1"},
            developer_id="dev-1",
            workspace_id="ws-1",
        )

        assert "query" not in seen["arguments"]

    async def test_an_unknown_argument_is_dropped_rather_than_guessed(
        self, monkeypatch
    ):
        """Forwarding an unrecognised field into the body would make a typo
        look like it worked."""
        executor = self._executor()
        seen = {}

        async def _perform(*, operation, arguments, developer_id, workspace_id, **_):
            seen.update(arguments=arguments)
            return ToolResult("ok")

        monkeypatch.setattr(executor, "_perform", _perform)

        await executor.call(
            tool_name="aexy_docs_propose",
            arguments={
                "workspace_id": "ws-1",
                "document_id": "doc-1",
                "markdown": "# New",
                "sumary": "typo",
            },
            developer_id="dev-1",
            workspace_id="ws-1",
        )

        assert "sumary" not in seen["arguments"].get("body", {})

    async def test_the_generic_tool_still_works(self, monkeypatch):
        executor = self._executor()
        seen = {}

        async def _perform(*, operation, arguments, developer_id, workspace_id, **_):
            seen.update(operation=operation)
            return ToolResult("ok")

        monkeypatch.setattr(executor, "_perform", _perform)

        await executor.call(
            tool_name="aexy_call",
            arguments={"action": "propose_document_update"},
            developer_id="dev-1",
            workspace_id="ws-1",
        )

        assert seen["operation"]["action"] == "propose_document_update"


class TestAgainstTheRealCatalogue:
    """The guard that matters.

    Everything above runs on a synthetic catalogue, so it passed happily while
    all three declared actions were wrong — prefixed `documents.` and pointed
    at a capability called `docs` rather than `mcp.docs`. The tools resolved to
    nothing and were silently withheld from every caller, which is the failure
    mode a named tool has: absent looks the same as not-granted.
    """

    def test_every_workflow_action_exists(self):
        from aexy.main import app
        from aexy.services.mcp_catalog import build_catalog

        catalog = build_catalog(app.openapi())
        actions = {op["action"] for g in catalog["capabilities"] for op in g["operations"]}

        missing = [t["name"] for t in WORKFLOW_TOOLS if t["action"] not in actions]
        assert missing == [], f"declared actions that do not exist: {missing}"

    def test_every_workflow_capability_exists(self):
        from aexy.main import app
        from aexy.services.mcp_catalog import build_catalog

        catalog = build_catalog(app.openapi())
        capabilities = {g["capability"] for g in catalog["capabilities"]}

        wrong = [
            f"{t['name']} -> {t['capability']}"
            for t in WORKFLOW_TOOLS
            if t["capability"] not in capabilities
        ]
        assert wrong == [], f"declared capabilities that do not exist: {wrong}"

    def test_they_reach_a_real_docs_caller(self):
        from aexy.main import app
        from aexy.services.mcp_catalog import build_catalog

        catalog = build_catalog(app.openapi())
        names = [t["name"] for t in build_tools(catalog, {"mcp.docs"})]

        for tool in WORKFLOW_TOOLS:
            if tool["capability"] == "mcp.docs":
                assert tool["name"] in names
            else:
                assert tool["name"] not in names, f"{tool['name']} leaked into a docs-only surface"

    def test_the_declared_path_params_match_the_real_path(self):
        """A named tool maps arguments into path_params; if the real path takes
        a segment the map does not supply, the call fails at format time with a
        message about braces rather than about the argument."""
        import re

        from aexy.main import app
        from aexy.services.mcp_catalog import build_catalog

        catalog = build_catalog(app.openapi())
        # Keyed on (capability, action): action names are unique within a
        # capability, not across the catalogue — `list_records` is both CRM
        # and Tables, and a routine binds one of them.
        by_action = {
            (g["capability"], op["action"]): op
            for g in catalog["capabilities"]
            for op in g["operations"]
        }

        for tool in WORKFLOW_TOOLS:
            op = by_action[(tool["capability"], tool["action"])]
            needed = set(re.findall(r"\{(\w+)\}", op["path"]))
            supplied = {
                key
                for key, target in tool["argument_map"].items()
                if target == "path"
            }
            assert needed <= supplied, (
                f"{tool['name']} cannot fill {needed - supplied} in {op['path']}"
            )
