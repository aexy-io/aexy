"""Applying one improvement suggestion.

The suggestion is a sentence of prose written by a model. It arrived as a query
parameter, which put arbitrary prose in a URL — a length limit, and a line in
every access log that keeps the document's contents. This pins it to a body,
and pins the part that matters more: applying does not touch the document, it
queues a proposal.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aexy.api.documents import apply_suggestion
from aexy.schemas.document import ApplySuggestionRequest

SUGGESTION = "Say what the endpoint is for in the first sentence"


def test_the_suggestion_is_a_body_not_a_query_parameter():
    from aexy.main import app

    spec = app.openapi()
    path = next(p for p in spec["paths"] if p.endswith("/suggest-improvements/apply"))
    operation = spec["paths"][path]["post"]

    declared = {p["name"] for p in operation.get("parameters", [])}
    assert "suggestion_summary" not in declared, (
        "prose in a URL is a length limit and a log entry waiting to happen"
    )
    schema_ref = operation["requestBody"]["content"]["application/json"]["schema"]
    model = schema_ref["$ref"].rsplit("/", 1)[-1]
    assert "suggestion_summary" in spec["components"]["schemas"][model]["properties"]


def test_an_empty_suggestion_is_rejected_before_the_model_call():
    # Rewriting a document from an empty instruction spends a model call to
    # produce nothing anybody asked for.
    with pytest.raises(Exception):
        ApplySuggestionRequest(suggestion_summary="")


@pytest.mark.asyncio
async def test_applying_queues_a_proposal_and_leaves_the_document_alone():
    document = SimpleNamespace(
        id="doc-1", content={"type": "doc", "content": [{"type": "paragraph"}]}
    )
    original = dict(document.content)

    db = MagicMock()
    db.commit = AsyncMock()
    user = SimpleNamespace(id="dev-1")

    gen = MagicMock()
    gen.update_documentation = AsyncMock(
        return_value={"updated_doc": {"type": "doc", "content": []}}
    )
    proposals = MagicMock()
    proposals.create_proposal = AsyncMock(return_value=SimpleNamespace(id="pe-1"))

    doc_service = MagicMock()
    doc_service.get_document = AsyncMock(return_value=document)

    with (
        patch("aexy.api.documents.check_workspace_permission", AsyncMock()),
        patch("aexy.api.documents.DocumentService", return_value=doc_service),
        patch("aexy.api.documents.DocumentGenerationService", return_value=gen),
        patch("aexy.api.documents.ProposedEditsService", return_value=proposals),
    ):
        result = await apply_suggestion(
            workspace_id="ws-1",
            document_id="doc-1",
            data=ApplySuggestionRequest(suggestion_summary=SUGGESTION),
            current_user=user,
            db=db,
        )

    assert result["status"] == "proposed"
    assert result["proposed_edit_id"] == "pe-1"

    # The instruction reaches the model...
    assert gen.update_documentation.await_args.kwargs["changes_summary"] == SUGGESTION
    # ...and is kept on the proposal, so a reviewer reading the queue can see
    # which suggestion produced this rewrite rather than a bare diff.
    assert proposals.create_proposal.await_args.kwargs["diff_summary"] == {
        "suggestion": SUGGESTION
    }
    # Nothing was written to the document. This is the whole promise the panel
    # makes to the person clicking Apply.
    assert document.content == original
