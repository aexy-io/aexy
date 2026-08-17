"""Which documents the tree should mark as behind their code.

The provenance strip answers this for the page you have open. The tree is
where you decide *which* page to open, and until now it said nothing — so a
document could sit wrong for a week while somebody scrolled past it.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from aexy.services.document_service import DocumentService

pytestmark = pytest.mark.asyncio

WORKSPACE = "11111111-1111-4111-8111-111111111111"


def service(rows):
    svc = DocumentService.__new__(DocumentService)
    svc.db = MagicMock()
    svc.db.execute = AsyncMock(
        return_value=SimpleNamespace(fetchall=lambda: rows)
    )
    return svc


class TestDocumentsBehindTheirCode:
    async def test_returns_the_flagged_documents(self):
        svc = service([("doc-1",), ("doc-2",)])

        assert await svc._documents_behind_their_code(WORKSPACE) == {"doc-1", "doc-2"}

    async def test_an_up_to_date_workspace_returns_nothing(self):
        svc = service([])

        assert await svc._documents_behind_their_code(WORKSPACE) == set()

    async def test_muted_links_are_excluded_in_sql(self):
        """"Off" means stop watching, and that has to include the tree — a
        badge somebody cannot clear is the kind that teaches people to ignore
        badges."""
        svc = service([])

        await svc._documents_behind_their_code(WORKSPACE)

        statement = str(svc.db.execute.await_args.args[0]).lower()
        assert "sync_mode" in statement
        assert "has_pending_changes" in statement

    async def test_it_is_one_query_for_the_whole_tree(self):
        """The tree recurses per level. Asking per document would be a query
        per node, on the surface that renders on every page of the module."""
        svc = service([("doc-1",)])

        await svc._documents_behind_their_code(WORKSPACE)

        assert svc.db.execute.await_count == 1
