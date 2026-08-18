"""The impact endpoint's contract, and who may touch it.

Three decisions worth pinning:

* reading an unevaluated pull request is a 200, not a 404 — a pull request that
  touches no documented page is the most ordinary situation in the product, and a
  404 puts a red toast in front of somebody for whom nothing is wrong;
* dismissing one you were never shown *is* a 404, because that is a genuine
  mistake rather than an ordinary state;
* the payload carries no English. Guidance is ids and params, so it can be
  translated — `/review`'s server-rendered group headings are why that page
  cannot be.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from aexy.api.document_impact import (
    dismiss_document_impact,
    get_doc_impact_settings,
    get_document_impact,
    undismiss_document_impact,
    update_doc_impact_settings,
)
from aexy.schemas.document_impact import (
    DocImpactResponse,
    DocImpactSettingsUpdate,
    ImpactDismissRequest,
)

pytestmark = pytest.mark.asyncio

USER = SimpleNamespace(id="dev-1")


def patches(*, allowed=True, impact=None, found=True):
    workspace_service = MagicMock()
    workspace_service.check_permission = AsyncMock(return_value=allowed)

    service = MagicMock()
    service.get_impact = AsyncMock(
        return_value=impact
        if impact is not None
        else {
            "analyzed": False,
            "repository_id": "repo-1",
            "pull_request_number": 7,
            "repository_document_count": 0,
            "items": [],
        }
    )
    service.set_dismissed = AsyncMock(return_value=found)

    return (
        patch(
            "aexy.api.document_impact.WorkspaceService",
            return_value=workspace_service,
        ),
        patch(
            "aexy.api.document_impact.DocumentImpactService", return_value=service
        ),
        service,
        workspace_service,
    )


class TestReading:
    async def test_an_unevaluated_pull_request_is_a_calm_two_hundred(self):
        p1, p2, service, _ = patches()
        with p1, p2:
            result = await get_document_impact(
                workspace_id="ws-1",
                repository_id="repo-1",
                pull_request_number=7,
                current_user=USER,
                db=MagicMock(),
            )

        assert result["analyzed"] is False
        assert result["items"] == []

    async def test_a_viewer_may_read(self):
        p1, p2, _, workspace_service = patches()
        with p1, p2:
            await get_document_impact(
                workspace_id="ws-1",
                repository_id="repo-1",
                pull_request_number=7,
                current_user=USER,
                db=MagicMock(),
            )

        assert workspace_service.check_permission.await_args.args[2] == "viewer"

    async def test_an_outsider_may_not(self):
        p1, p2, _, _ = patches(allowed=False)
        with p1, p2, pytest.raises(HTTPException) as caught:
            await get_document_impact(
                workspace_id="ws-1",
                repository_id="repo-1",
                pull_request_number=7,
                current_user=USER,
                db=MagicMock(),
            )

        assert caught.value.status_code == 403


class TestDismissing:
    async def test_it_records_who_said_no_and_why(self):
        p1, p2, service, _ = patches()
        with p1, p2:
            await dismiss_document_impact(
                workspace_id="ws-1",
                repository_id="repo-1",
                pull_request_number=7,
                document_id="doc-1",
                data=ImpactDismissRequest(reason="Renamed a prop"),
                current_user=USER,
                db=MagicMock(),
            )

        kwargs = service.set_dismissed.await_args.kwargs
        assert kwargs["dismissed"] is True
        assert kwargs["developer_id"] == "dev-1"
        assert kwargs["reason"] == "Renamed a prop"

    async def test_the_reason_is_optional(self):
        """The dismissal is what matters. Requiring a justification to say "this
        does not apply to me" is how a feature earns resentment."""
        p1, p2, service, _ = patches()
        with p1, p2:
            await dismiss_document_impact(
                workspace_id="ws-1",
                repository_id="repo-1",
                pull_request_number=7,
                document_id="doc-1",
                data=None,
                current_user=USER,
                db=MagicMock(),
            )

        assert service.set_dismissed.await_args.kwargs["reason"] is None

    async def test_it_takes_a_member_not_a_viewer(self):
        p1, p2, _, workspace_service = patches()
        with p1, p2:
            await dismiss_document_impact(
                workspace_id="ws-1",
                repository_id="repo-1",
                pull_request_number=7,
                document_id="doc-1",
                data=None,
                current_user=USER,
                db=MagicMock(),
            )

        assert workspace_service.check_permission.await_args.args[2] == "member"

    async def test_dismissing_something_you_were_never_shown_is_not_found(self):
        p1, p2, _, _ = patches(found=False)
        with p1, p2, pytest.raises(HTTPException) as caught:
            await dismiss_document_impact(
                workspace_id="ws-1",
                repository_id="repo-1",
                pull_request_number=7,
                document_id="doc-1",
                data=None,
                current_user=USER,
                db=MagicMock(),
            )

        assert caught.value.status_code == 404

    async def test_undo_clears_it(self):
        p1, p2, service, _ = patches()
        with p1, p2:
            await undismiss_document_impact(
                workspace_id="ws-1",
                repository_id="repo-1",
                pull_request_number=7,
                document_id="doc-1",
                current_user=USER,
                db=MagicMock(),
            )

        assert service.set_dismissed.await_args.kwargs["dismissed"] is False

    async def test_both_return_the_whole_impact_so_the_page_needs_no_refetch(self):
        p1, p2, service, _ = patches()
        with p1, p2:
            await dismiss_document_impact(
                workspace_id="ws-1",
                repository_id="repo-1",
                pull_request_number=7,
                document_id="doc-1",
                data=None,
                current_user=USER,
                db=MagicMock(),
            )
        service.get_impact.assert_awaited_once()


class TestThePayloadCarriesNoEnglish:
    def test_guidance_is_an_id_and_params(self):
        """The one thing keeping this translatable."""
        response = DocImpactResponse(
            analyzed=True,
            repository_id="repo-1",
            pull_request_number=7,
            items=[
                {
                    "document_id": "doc-1",
                    "document_title": "Filtering tickets",
                    "status": "needs_review",
                    "screenshots": {
                        "count": 2,
                        "spots": [{"heading": "Creating a filter", "label": "a.png"}],
                    },
                    "guidance": [
                        {"id": "screenshots", "params": {"count": 2}},
                        {"id": "route", "params": {"routes": ["/tickets"]}},
                    ],
                }
            ],
        )

        for entry in response.items[0].guidance:
            assert entry.id.isidentifier()
            assert isinstance(entry.params, dict)

    def test_a_nameless_screenshot_stays_nameless(self):
        """A `data:` URI has no filename and an image before the first heading has
        no section. Both stay null so the client can render the shorter line
        instead of the server inventing a word it cannot translate."""
        response = DocImpactResponse(
            analyzed=True,
            repository_id="repo-1",
            pull_request_number=7,
            items=[
                {
                    "document_id": "doc-1",
                    "document_title": "A page",
                    "status": "needs_review",
                    "screenshots": {"count": 1, "spots": [{}]},
                }
            ],
        )
        spot = response.items[0].screenshots.spots[0]
        assert spot.heading is None
        assert spot.label is None

    def test_a_dismiss_reason_is_bounded(self):
        """280 characters. A reason field with no limit becomes a place people
        paste stack traces."""
        with pytest.raises(ValueError):
            ImpactDismissRequest(reason="x" * 281)


class TestWhoDecidesAboutWritingIntoPullRequests:
    """A comment on a pull request is one shared artifact that every reviewer
    sees. There is no honest way to reconcile four developers' opinions about
    whether it exists, so it is a workspace decision — taken by an admin, who is
    also the person who can grant the GitHub App the permission it needs."""

    async def test_any_member_may_read_it(self):
        """So the impact page can explain why no comment appeared."""
        p1, p2, service, workspace_service = patches()
        service.get_settings = AsyncMock(return_value={})
        with p1, p2:
            await get_doc_impact_settings(
                workspace_id="ws-1", current_user=USER, db=MagicMock()
            )

        assert workspace_service.check_permission.await_args.args[2] == "viewer"

    async def test_only_an_admin_may_change_it(self):
        p1, p2, service, workspace_service = patches()
        service.update_settings = AsyncMock(return_value={})
        with p1, p2:
            await update_doc_impact_settings(
                workspace_id="ws-1",
                data=DocImpactSettingsUpdate(pr_comment_enabled=True),
                current_user=USER,
                db=MagicMock(),
            )

        assert workspace_service.check_permission.await_args.args[2] == "admin"

    async def test_a_member_is_refused(self):
        p1, p2, service, _ = patches(allowed=False)
        service.update_settings = AsyncMock(return_value={})
        with p1, p2, pytest.raises(HTTPException) as caught:
            await update_doc_impact_settings(
                workspace_id="ws-1",
                data=DocImpactSettingsUpdate(pr_comment_enabled=True),
                current_user=USER,
                db=MagicMock(),
            )

        assert caught.value.status_code == 403
        service.update_settings.assert_not_awaited()

    async def test_only_the_fields_sent_are_passed_on(self):
        """A PATCH-shaped PUT. Sending the whole object back would let a client
        with a stale read silently re-disable something somebody else turned on."""
        p1, p2, service, _ = patches()
        service.update_settings = AsyncMock(return_value={})
        with p1, p2:
            await update_doc_impact_settings(
                workspace_id="ws-1",
                data=DocImpactSettingsUpdate(check_run_enabled=True),
                current_user=USER,
                db=MagicMock(),
            )

        assert service.update_settings.await_args.args[1] == {"check_run_enabled": True}

    async def test_an_unknown_conclusion_is_refused_rather_than_stored(self):
        """Otherwise it is accepted, written, and then fails at the GitHub call —
        after the workspace believed it was configured."""
        p1, p2, service, _ = patches()
        service.update_settings = AsyncMock(return_value={})
        with p1, p2, pytest.raises(HTTPException) as caught:
            await update_doc_impact_settings(
                workspace_id="ws-1",
                data=DocImpactSettingsUpdate(check_run_conclusion="explode"),
                current_user=USER,
                db=MagicMock(),
            )

        assert caught.value.status_code == 400
        service.update_settings.assert_not_awaited()
