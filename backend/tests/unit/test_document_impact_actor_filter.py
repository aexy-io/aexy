"""The recipient is the actor, and that is the trap.

Every other `notify_*` helper in this product passes `actor_id`, and
`_notify_quietly` skips `recipient == actor` — for good reason, spelled out in its
own docstring: mailing somebody about their own click is how people learn to
ignore the sender.

These two events are the exception. They are *about* the recipient's own action:
you opened a pull request, and here is what it affects. Passing `actor_id` here
would deliver precisely nothing, while every test of the wiring, the templates,
the preferences and the fixture still passed. The feature would ship, look
complete, and never notify anybody.

So this file asserts the one thing none of those would catch.
"""

from __future__ import annotations

import inspect

import pytest

from aexy.models.notification import (
    DEFAULT_NOTIFICATION_PREFERENCES,
    EVENT_TYPE_TO_CATEGORY,
    NotificationEventType,
)
from aexy.services import notification_service
from aexy.services.notification_service import (
    _screenshot_hint,
    notify_document_impact_pr_merged,
    notify_document_impact_pr_opened,
)

EVENTS = (
    NotificationEventType.DOCUMENT_IMPACT_PR_OPENED,
    NotificationEventType.DOCUMENT_IMPACT_PR_MERGED,
)


class Spy:
    """Captures what `_notify_quietly` was called with, and nothing else."""

    def __init__(self):
        self.calls: list[dict] = []

    async def __call__(self, db, recipient_ids, event_type, **kwargs):
        self.calls.append(
            {
                "recipients": list(recipient_ids),
                "event_type": event_type,
                **kwargs,
            }
        )
        return len(list(recipient_ids))


@pytest.fixture
def spy(monkeypatch):
    replacement = Spy()
    monkeypatch.setattr(notification_service, "_notify_quietly", replacement)
    return replacement


ARGS = dict(
    repository_id="repo-1",
    pr_number=412,
    repository="acme/app",
    document_titles=["Filtering tickets"],
    screenshot_page_count=1,
    workspace_id="ws-1",
)


class TestTheAuthorHearsAboutTheirOwnPullRequest:
    async def test_opened_does_not_filter_the_author_out(self, spy):
        await notify_document_impact_pr_opened(None, "dev-author", **ARGS)

        call = spy.calls[0]
        assert call["recipients"] == ["dev-author"]
        # The whole point. `actor_id` unset — or defaulted to None — is what lets
        # the author receive it.
        assert call.get("actor_id") is None

    async def test_merged_does_not_either(self, spy):
        await notify_document_impact_pr_merged(None, "dev-author", **ARGS)

        assert spy.calls[0]["recipients"] == ["dev-author"]
        assert spy.calls[0].get("actor_id") is None

    def test_the_call_passes_no_actor_keyword(self):
        """Read from the syntax tree, not the text: this file's own docstrings
        explain why `actor_id` is absent, and a substring search finds those.

        Asserted at all because a future edit adding `actor_id=recipient_id` for
        symmetry with every other emitter here would break the feature in a way
        nothing else notices."""
        import ast
        import textwrap

        tree = ast.parse(
            textwrap.dedent(
                inspect.getsource(notification_service._notify_document_impact)
            )
        )
        calls = [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and getattr(node.func, "id", None) == "_notify_quietly"
        ]
        assert calls, "the shared emitter no longer calls _notify_quietly"
        for call in calls:
            assert not any(
                keyword.arg == "actor_id" for keyword in call.keywords
            ), "passing actor_id here delivers nothing — see this file's docstring"

    def test_notify_quietly_still_drops_the_actor_for_everybody_else(self):
        """The behaviour being worked around is correct and must stay. If this
        ever fails, the reason these two emitters are written differently has
        gone away and they should be reconsidered rather than left odd."""
        source = inspect.getsource(notification_service._notify_quietly)
        assert "recipient == actor" in source


class TestTheContextTheChannelsNeed:
    async def test_workspace_id_is_always_present(self, spy):
        """Slack fan-out is gated on `context["workspace_id"]` and skips silently
        without it. Required rather than optional here, so the failure mode is
        removed instead of tolerated."""
        await notify_document_impact_pr_opened(None, "dev-1", **ARGS)
        assert spy.calls[0]["context"]["workspace_id"] == "ws-1"

    async def test_the_action_url_goes_to_the_impact_page(self, spy):
        await notify_document_impact_pr_opened(None, "dev-1", **ARGS)
        assert (
            spy.calls[0]["context"]["action_url"]
            == "/docs/impact/repo-1/412"
        )

    async def test_it_carries_an_entity_id_for_grouping(self, spy):
        await notify_document_impact_pr_opened(None, "dev-1", **ARGS)
        assert spy.calls[0]["context"]["entity_id"] == "repo-1:412"

    async def test_the_body_names_the_pages(self, spy):
        await notify_document_impact_pr_opened(
            None, "dev-1", **{**ARGS, "document_titles": ["Filtering", "Saved views"]}
        )
        body = spy.calls[0]["body"]
        assert "Filtering" in body and "Saved views" in body

    async def test_a_long_list_is_trimmed_but_the_count_stays_true(self, spy):
        titles = [f"Page {n}" for n in range(9)]
        await notify_document_impact_pr_opened(
            None, "dev-1", **{**ARGS, "document_titles": titles}
        )
        context = spy.calls[0]["context"]
        assert context["document_count"] == 9
        assert context["document_titles"].endswith("…")


class TestTheScreenshotHint:
    def test_it_is_empty_when_there_are_none(self):
        """Pre-rendered because the template interpolates it. Empty rather than
        absent, so `.format(**context)` cannot KeyError — and there is
        deliberately no "consider adding screenshots" variant, because an
        unsolicited suggestion is the first thing anybody mutes."""
        assert _screenshot_hint(0, 3) == ""

    def test_one_page_reads_as_one_page(self):
        assert _screenshot_hint(1, 1) == "It contains screenshots that may need retaking."

    def test_several_pages_say_how_many_of_them(self):
        hint = _screenshot_hint(2, 5)
        assert "2 of them" in hint

    async def test_a_page_with_no_images_produces_no_hint_in_the_body(self, spy):
        await notify_document_impact_pr_opened(
            None, "dev-1", **{**ARGS, "screenshot_page_count": 0}
        )
        assert "screenshot" not in spy.calls[0]["body"].lower()
        assert spy.calls[0]["context"]["screenshot_hint"] == ""


class TestTheEventsAreProperlyDeclared:
    @pytest.mark.parametrize("event", EVENTS)
    def test_each_has_its_own_category(self, event):
        """Not "documents": turning off document comments must not silence
        feedback on your own pull requests as a side effect."""
        assert EVENT_TYPE_TO_CATEGORY[event.value] == "documentation_impact"

    def test_the_open_moment_does_not_email(self):
        """It fires on most pull requests in a well-documented repository. An
        email per pull request teaches somebody to filter the sender."""
        assert DEFAULT_NOTIFICATION_PREFERENCES[EVENTS[0]]["email"] is False
        assert DEFAULT_NOTIFICATION_PREFERENCES[EVENTS[0]]["in_app"] is True

    def test_the_merge_moment_does(self):
        """Once per pull request, at the moment the author stops thinking about
        it — which is exactly when nobody is looking at the app."""
        assert DEFAULT_NOTIFICATION_PREFERENCES[EVENTS[1]]["email"] is True
