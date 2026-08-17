"""Merged pull requests, offered as things nobody has documented.

`/needs-update` can only find pages that already exist and have fallen behind.
The larger gap on most teams is the change nobody wrote about at all, and there
was no queue for those — so the moment worth catching is the merge, while the
person who would know still has the whole thing in their head.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from aexy.services.document_sync_service import DocumentSyncService


def pr(*, pr_id="pr-1", number=41, title="Rework session expiry", repository="acme/widgets"):
    return SimpleNamespace(
        id=pr_id,
        number=number,
        title=title,
        repository=repository,
        merged_at=datetime(2026, 8, 14, tzinfo=timezone.utc),
        merged_by_login="riya",
        additions=120,
        deletions=8,
        files_changed=6,
    )


def make_service(rows, doc_counts=()):
    svc = DocumentSyncService.__new__(DocumentSyncService)  # skip __init__
    svc.db = MagicMock()
    svc.limits_service = MagicMock()
    svc.db.execute = AsyncMock(
        side_effect=[
            SimpleNamespace(all=lambda: rows),
            SimpleNamespace(all=lambda: list(doc_counts)),
        ]
    )
    return svc


class TestTheWorkList:
    @pytest.mark.asyncio
    async def test_it_reports_the_coordinates_needed_to_act(self):
        svc = make_service([(pr(), "repo-1", "Anita")], doc_counts=[("repo-1", 3)])

        items = await svc.list_merged_changes("ws-1")

        assert len(items) == 1
        item = items[0]
        # The repository id is what "document this" needs to open the generator
        # already pointed at the right place — the full name alone would make
        # the caller go and look it up.
        assert item["repository_id"] == "repo-1"
        assert item["number"] == 41
        assert item["author_name"] == "Anita"
        assert item["repository_document_count"] == 3

    @pytest.mark.asyncio
    async def test_an_unmerged_pull_request_is_not_a_change_to_document(self):
        svc = make_service([])

        await svc.list_merged_changes("ws-1")

        statement = str(svc.db.execute.await_args_list[0].args[0]).lower()
        assert "merged_at is not null" in statement

    @pytest.mark.asyncio
    async def test_it_is_scoped_through_workspace_adoption(self):
        """`pull_requests` is not workspace-scoped — it hangs off developers. So
        without the adoption join, one member's personal repositories would show
        up as work for a workspace that never adopted them."""
        svc = make_service([])

        await svc.list_merged_changes("ws-1")

        statement = str(svc.db.execute.await_args_list[0].args[0]).lower()
        assert "workspace_repositories" in statement
        assert "workspace_repositories.workspace_id" in statement

    @pytest.mark.asyncio
    async def test_the_newest_merge_comes_first(self):
        svc = make_service([])

        await svc.list_merged_changes("ws-1")

        statement = str(svc.db.execute.await_args_list[0].args[0]).lower()
        assert "order by pull_requests.merged_at desc" in statement

    @pytest.mark.asyncio
    async def test_nothing_merged_costs_one_query_not_two(self):
        """The document count is only meaningful for repositories that appeared,
        and an empty `IN ()` is a query that reads the table for nothing."""
        svc = make_service([])

        assert await svc.list_merged_changes("ws-1") == []
        assert svc.db.execute.await_count == 1

    @pytest.mark.asyncio
    async def test_a_repository_with_no_documents_reads_as_zero(self):
        svc = make_service([(pr(), "repo-1", "Anita")], doc_counts=[])

        items = await svc.list_merged_changes("ws-1")

        # Zero is the honest answer: this repository has no documentation at
        # all. Absent would render as blank and read as "unknown".
        assert items[0]["repository_document_count"] == 0


class TestDiscoverability:
    def test_the_route_is_registered_before_the_document_id_route(self):
        from aexy.api.documents import router

        prefix = "/workspaces/{workspace_id}/documents"
        paths = [r.path for r in router.routes]
        assert f"{prefix}/merged-changes" in paths
        assert paths.index(f"{prefix}/merged-changes") < paths.index(
            f"{prefix}/{{document_id}}"
        )

    def test_it_is_a_named_tool_rather_than_something_to_assemble(self):
        """An agent asked to keep documentation honest needs both halves of the
        work list, and finding the second one through discovery is work the tool
        list can do once."""
        from aexy.services.mcp_catalog import workflow_tool

        tool = workflow_tool("aexy_docs_merged_changes")
        assert tool is not None
        assert tool["action"] == "list_merged_changes"
        assert tool["capability"] == "mcp.docs"

    def test_it_does_not_claim_to_know_what_is_already_documented(self):
        """`pull_requests` does not store the files a pull request touched, so a
        documented/undocumented badge would be a guess — and a wrong "already
        documented" is worse than no badge."""
        from aexy.schemas.document import MergedChangeItem

        assert "documented" not in MergedChangeItem.model_fields
        assert "is_documented" not in MergedChangeItem.model_fields
