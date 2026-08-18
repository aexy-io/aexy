"""Which pull request events ask about documentation, and which stay quiet.

The action table is the whole behaviour of this feature from the outside, and each
row is a decision:

* `opened` / `reopened` / `ready_for_review` — the author can still fix it here;
* `synchronize` — refresh, but the growth rule decides whether to speak;
* `closed` **and merged** — the pages are wrong now;
* `closed` unmerged and `edited` — nothing happened to the code, so nothing to say.

Also pinned: the dispatch does not require a local `PullRequest` row. An external
contributor has no account here, and that is precisely the case where the pull
request comment is the only channel that reaches them — so needing the local row
would silence the one path that works.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from aexy.api.webhooks import _dispatch_document_impact
from aexy.services.webhook_handler import PROCESSABLE_PR_ACTIONS


def make_db(repository=SimpleNamespace(id="repo-1", full_name="acme/app")):
    db = MagicMock()
    db.execute = AsyncMock(
        return_value=SimpleNamespace(scalar_one_or_none=lambda: repository)
    )
    return db


def make_event(action, *, merged=False, number=412, sha="abc123def456789"):
    return SimpleNamespace(
        action=action,
        repository="acme/app",
        pull_request={
            "number": number,
            "title": "Rework the ticket filters",
            "head": {"sha": sha},
            "user": {"login": "octocat"},
            "merged": merged,
        },
    )


@pytest.fixture
def dispatched(monkeypatch):
    calls: list[dict] = []

    async def fake_dispatch(name, payload, **kwargs):
        calls.append({"name": name, "payload": payload, **kwargs})

    import aexy.temporal.dispatch as dispatch_module

    monkeypatch.setattr(dispatch_module, "dispatch", fake_dispatch)
    return calls


class TestWhichActionsAsk:
    @pytest.mark.parametrize(
        "action,expected",
        [
            ("opened", "opened"),
            ("reopened", "opened"),
            ("ready_for_review", "opened"),
            ("synchronize", "synchronize"),
        ],
    )
    async def test_the_moments_that_do(self, action, expected, dispatched):
        moment = await _dispatch_document_impact(make_db(), make_event(action), None)

        assert moment == expected
        assert dispatched[0]["payload"].moment == expected

    async def test_a_merge_asks(self, dispatched):
        moment = await _dispatch_document_impact(
            make_db(), make_event("closed", merged=True), None
        )
        assert moment == "merged"

    async def test_a_closed_unmerged_pull_request_does_not(self, dispatched):
        """Nothing happened to the code. Saying its pages are behind would be
        plainly wrong, and this is the most common way a pull request ends other
        than merging."""
        moment = await _dispatch_document_impact(
            make_db(), make_event("closed", merged=False), None
        )

        assert moment is None
        assert dispatched == []

    @pytest.mark.parametrize("action", ["edited", "labeled", "assigned", "", None])
    async def test_actions_that_cannot_change_a_file_do_not(self, action, dispatched):
        """A title or a label cannot change which files a pull request touches."""
        moment = await _dispatch_document_impact(make_db(), make_event(action), None)

        assert moment is None
        assert dispatched == []


class TestWhatItSendsWith:
    async def test_the_head_sha_comes_from_the_payload(self, dispatched):
        """Which is why no column had to be added to `pull_requests`: the webhook
        always carries it, and the check run needs it paired with the impact row."""
        await _dispatch_document_impact(
            make_db(), make_event("opened", sha="deadbeefcafe123"), None
        )
        assert dispatched[0]["payload"].head_sha == "deadbeefcafe123"

    async def test_a_payload_with_no_head_sha_is_skipped(self, dispatched):
        event = make_event("opened")
        event.pull_request["head"] = {}

        assert await _dispatch_document_impact(make_db(), event, None) is None
        assert dispatched == []

    async def test_it_carries_the_author_when_there_is_a_local_row(self, dispatched):
        pr = SimpleNamespace(developer_id="dev-7")
        await _dispatch_document_impact(make_db(), make_event("opened"), pr)

        payload = dispatched[0]["payload"]
        assert payload.author_developer_id == "dev-7"
        assert payload.author_login == "octocat"

    async def test_it_dispatches_without_one(self, dispatched):
        """The external-contributor case. Requiring the local row here would mean
        the pull request comment — the only channel that reaches somebody with no
        account — never gets written."""
        await _dispatch_document_impact(make_db(), make_event("opened"), None)

        payload = dispatched[0]["payload"]
        assert payload.author_developer_id is None
        assert payload.author_login == "octocat"

    async def test_the_workflow_id_collapses_a_redelivered_webhook(self, dispatched):
        await _dispatch_document_impact(make_db(), make_event("opened"), None)
        await _dispatch_document_impact(make_db(), make_event("opened"), None)

        assert dispatched[0]["workflow_id"] == dispatched[1]["workflow_id"]
        # And a different push is a different run, or a second commit would be
        # silently dropped.
        await _dispatch_document_impact(
            make_db(), make_event("synchronize", sha="0000111122223333"), None
        )
        assert dispatched[2]["workflow_id"] != dispatched[0]["workflow_id"]

    async def test_an_unknown_repository_is_not_an_error(self, dispatched):
        assert (
            await _dispatch_document_impact(
                make_db(repository=None), make_event("opened"), None
            )
            is None
        )
        assert dispatched == []

    async def test_a_dispatch_failure_never_fails_the_webhook(self, monkeypatch):
        """A pull request must still be ingested when Temporal is unreachable.
        GitHub retries a failed webhook, and a retry storm over a notification is
        a bad trade."""
        import aexy.temporal.dispatch as dispatch_module

        async def boom(*args, **kwargs):
            raise RuntimeError("temporal is down")

        monkeypatch.setattr(dispatch_module, "dispatch", boom)

        assert (
            await _dispatch_document_impact(make_db(), make_event("opened"), None)
            is None
        )


class TestReadyForReviewIsReachableNow:
    def test_it_is_a_processable_action(self):
        """`webhooks.py` already branched on `ready_for_review` for realtime PR
        analysis, but it was missing here — so `should_process` returned False and
        that branch was dead code. A draft marked ready produced nothing at all."""
        assert "ready_for_review" in PROCESSABLE_PR_ACTIONS

    def test_the_actions_the_handler_processes_cover_what_we_dispatch_on(self):
        """Anything this feature reacts to has to survive the gate upstream of it,
        or the dispatch is unreachable for that action."""
        from aexy.api.webhooks import _DOC_IMPACT_MOMENTS

        assert set(_DOC_IMPACT_MOMENTS) <= PROCESSABLE_PR_ACTIONS


def test_the_webhook_actually_calls_the_dispatcher():
    """The join itself. Every test above drives `_dispatch_document_impact`
    directly, so all of them would pass with nothing calling it."""
    from aexy.api.webhooks import handle_github_webhook

    assert "_dispatch_document_impact" in handle_github_webhook.__code__.co_names
