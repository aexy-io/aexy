"""The work list an agent picks up over MCP.

Detection is cheap — path matching against pushes, no model involved — so the
platform tracks what has gone stale centrally and leaves the writing to
whoever has the source in context. This is the read side of that split, and
the shape of it matters more than usual: an agent decides what to do next
from these fields alone.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from aexy.services.document_sync_service import DocumentSyncService


def make_service(links, pending_counts=()):
    svc = DocumentSyncService.__new__(DocumentSyncService)  # skip __init__
    svc.db = MagicMock()
    svc.limits_service = MagicMock()
    svc.db.execute = AsyncMock(
        side_effect=[
            SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: links)),
            SimpleNamespace(all=lambda: list(pending_counts)),
        ]
    )
    return svc


def link(
    *,
    link_id="link-1",
    document_id="doc-1",
    title="Session service",
    last_synced_at=None,
    last_commit_sha="abc123",
    owner="owner-dev",
    path="src/pkg",
):
    return SimpleNamespace(
        id=link_id,
        document_id=document_id,
        repository_id="repo-1",
        repository=SimpleNamespace(full_name="acme/widgets"),
        path=path,
        link_type="directory",
        branch="main",
        last_synced_at=last_synced_at,
        last_commit_sha=last_commit_sha,
        owner_developer_id=owner,
        document=SimpleNamespace(id=document_id, title=title, icon="📘"),
    )


SYNCED = datetime(2026, 3, 1, tzinfo=timezone.utc)


class TestWorkListShape:
    @pytest.mark.asyncio
    async def test_an_item_carries_the_coordinates_needed_to_go_and_read_the_code(self):
        """A document id alone would force the agent to make a second call
        before it could do anything."""
        svc = make_service([link(last_synced_at=SYNCED)])

        [item] = await svc.list_documents_needing_update("ws-1")

        assert item["document_id"] == "doc-1"
        assert item["document_title"] == "Session service"
        assert item["repository_full_name"] == "acme/widgets"
        assert item["path"] == "src/pkg"
        assert item["branch"] == "main"
        assert item["link_type"] == "directory"
        assert item["last_seen_commit_sha"] == "abc123"
        assert item["owner_developer_id"] == "owner-dev"

    @pytest.mark.asyncio
    async def test_a_document_that_has_been_generated_before_reads_as_changed(self):
        svc = make_service([link(last_synced_at=SYNCED)])

        [item] = await svc.list_documents_needing_update("ws-1")

        assert item["reason"] == "code_changed"

    @pytest.mark.asyncio
    async def test_a_document_never_generated_from_its_code_says_so(self):
        """Different work: there is no previous version to update, so the
        agent should write rather than revise."""
        svc = make_service([link(last_synced_at=None)])

        [item] = await svc.list_documents_needing_update("ws-1")

        assert item["reason"] == "never_synced"

    @pytest.mark.asyncio
    async def test_an_empty_workspace_asks_no_further_questions(self):
        """No links means the proposal-count query must not run — an agent
        polling this on a quiet repository should cost one query."""
        svc = DocumentSyncService.__new__(DocumentSyncService)
        svc.db = MagicMock()
        svc.limits_service = MagicMock()
        svc.db.execute = AsyncMock(
            side_effect=[
                SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [])),
                AssertionError("second query should not run"),
            ]
        )

        assert await svc.list_documents_needing_update("ws-1") == []
        assert svc.db.execute.await_count == 1


class TestAlreadyHandled:
    @pytest.mark.asyncio
    async def test_a_document_with_a_proposal_waiting_is_flagged(self):
        """Without this an agent regenerates documents that are already sitting
        in someone's review queue, and the reviewer gets two of everything."""
        svc = make_service(
            [link(document_id="doc-1"), link(link_id="link-2", document_id="doc-2")],
            pending_counts=[("doc-1", 2)],
        )

        items = await svc.list_documents_needing_update("ws-1")

        by_id = {i["document_id"]: i for i in items}
        assert by_id["doc-1"]["pending_proposal_count"] == 2
        assert by_id["doc-2"]["pending_proposal_count"] == 0

    @pytest.mark.asyncio
    async def test_proposal_counts_cost_one_query_for_the_whole_list(self):
        """Per-document counting would make the endpoint's cost scale with
        the size of the backlog it exists to report."""
        links = [link(link_id=f"l{n}", document_id=f"doc-{n}") for n in range(25)]
        svc = make_service(links, pending_counts=[])

        await svc.list_documents_needing_update("ws-1")

        assert svc.db.execute.await_count == 2


class TestOrdering:
    @pytest.mark.asyncio
    async def test_the_query_puts_never_synced_first(self):
        """`nulls_first` is the intent: a document linked to code and never
        generated from it is the most out of date thing there is, and default
        ascending order in PostgreSQL would sort those nulls last."""
        svc = make_service([link()])

        await svc.list_documents_needing_update("ws-1")

        statement = str(svc.db.execute.await_args_list[0].args[0])
        assert "NULLS FIRST" in statement.upper()

    @pytest.mark.asyncio
    async def test_the_query_filters_to_the_workspace(self):
        svc = make_service([link()])

        await svc.list_documents_needing_update("ws-1")

        statement = str(svc.db.execute.await_args_list[0].args[0]).lower()
        assert "documents.workspace_id" in statement


class TestDiscoverability:
    def test_the_route_is_registered_before_the_document_id_route(self):
        """`/needs-update` after `/{document_id}` would be read as a document
        id and 404 — the same trap the comments routes carry a note about."""
        from aexy.api.documents import router

        prefix = "/workspaces/{workspace_id}/documents"
        paths = [r.path for r in router.routes]
        assert f"{prefix}/needs-update" in paths
        assert paths.index(f"{prefix}/needs-update") < paths.index(
            f"{prefix}/{{document_id}}"
        )

    def test_the_first_docstring_line_describes_the_work_not_the_table(self):
        """MCP's catalogue shows an agent the first line of the docstring and
        nothing else, so it has to say what the endpoint is for."""
        from aexy.api.documents import list_documents_needing_update

        first_line = (list_documents_needing_update.__doc__ or "").strip().split("\n")[0]
        assert "changed" in first_line.lower()
        assert len(first_line) > 40
