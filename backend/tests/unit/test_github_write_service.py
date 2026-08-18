"""The only code that writes into somebody else's repository.

Three behaviours worth pinning, all of them about not being annoying or wrong:

* **one comment per pull request, edited in place.** A bot that posts on every
  push is the surest way to get an integration switched off, and the message
  states current state rather than announcing an event;
* **a check run belongs to a commit**, so a new head sha gets a new run — updating
  the old one leaves the new commit unannotated;
* **a refusal is authoritative and repairs the cache.** The stored permissions are
  stale by construction: they are written during OAuth sync, and an admin granting
  a permission afterwards produces no OAuth sync.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aexy.services.github_write_service import (
    COMMENT_MARKER,
    GitHubPermissionError,
    GitHubWriteError,
    GitHubWriteService,
    WriteTarget,
)


def target(**overrides) -> WriteTarget:
    defaults = dict(
        installation_id=42,
        token="tok",
        owner="acme",
        repo="app",
        account_login="acme",
        account_type="Organization",
        permissions={"pull_requests": "write", "checks": "write"},
    )
    defaults.update(overrides)
    return WriteTarget(**defaults)


def service() -> GitHubWriteService:
    svc = GitHubWriteService.__new__(GitHubWriteService)
    svc.db = MagicMock()
    svc.app_service = MagicMock()
    svc.api_base_url = "https://api.github.test"
    svc.refresh_installation_permissions = AsyncMock(return_value={})
    return svc


class FakeResponse:
    def __init__(self, status_code, payload=None):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = "body"

    def json(self):
        return self._payload


def fake_client(*, post=None, patch_=None):
    """An httpx.AsyncClient stand-in that records the calls it was given."""
    calls: list[dict] = []

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, headers=None, json=None, params=None):
            calls.append({"method": "POST", "url": url, "json": json})
            return post.pop(0) if isinstance(post, list) else post

        async def patch(self, url, headers=None, json=None):
            calls.append({"method": "PATCH", "url": url, "json": json})
            return patch_.pop(0) if isinstance(patch_, list) else patch_

    return Client, calls


class TestPermissionsAreCheckedBeforeAnyNetworkCall:
    async def test_no_pull_request_write_means_no_request_at_all(self):
        svc = service()
        with patch("aexy.services.github_write_service.httpx.AsyncClient") as client:
            with pytest.raises(GitHubPermissionError) as caught:
                await svc.upsert_pr_comment(
                    target(permissions={"pull_requests": "read"}), 1, "body"
                )
            client.assert_not_called()

        assert caught.value.permission == "pull_requests"
        assert "Pull requests: write" in str(caught.value)

    async def test_no_checks_write_means_no_request_either(self):
        svc = service()
        with patch("aexy.services.github_write_service.httpx.AsyncClient") as client:
            with pytest.raises(GitHubPermissionError):
                await svc.upsert_check_run(
                    target(permissions={"checks": "read"}),
                    "a" * 40,
                    conclusion="neutral",
                    title="t",
                    summary="s",
                )
            client.assert_not_called()

    def test_admin_counts_as_write(self):
        assert target(permissions={"pull_requests": "admin"}).may("pull_requests")

    def test_absence_does_not(self):
        assert not target(permissions={}).may("pull_requests")

    def test_the_error_names_where_to_fix_it(self):
        """An org admin, not the pull request author, and the URL differs for a
        user account and an organisation."""
        org = GitHubPermissionError(
            "pull_requests",
            installation_id=7,
            account_login="acme",
            account_type="Organization",
        )
        assert org.settings_url == (
            "https://github.com/organizations/acme/settings/installations/7"
        )

        user = GitHubPermissionError(
            "pull_requests", installation_id=7, account_login="octocat",
            account_type="User",
        )
        assert user.settings_url == "https://github.com/settings/installations/7"

    def test_no_installation_id_means_no_link_rather_than_a_broken_one(self):
        assert GitHubPermissionError("checks").settings_url is None


class TestTheCommentIsEditedInPlace:
    async def test_the_first_time_it_posts(self):
        svc = service()
        Client, calls = fake_client(post=FakeResponse(201, {"id": 999}))
        with patch("aexy.services.github_write_service.httpx.AsyncClient", Client):
            comment_id = await svc.upsert_pr_comment(target(), 412, "hello")

        assert comment_id == 999
        assert calls[0]["method"] == "POST"
        assert calls[0]["url"].endswith("/issues/412/comments")

    async def test_afterwards_it_edits(self):
        """One comment per pull request. The message is a statement of current
        state, so a second near-identical comment is strictly worse."""
        svc = service()
        Client, calls = fake_client(patch_=FakeResponse(200, {"id": 999}))
        with patch("aexy.services.github_write_service.httpx.AsyncClient", Client):
            comment_id = await svc.upsert_pr_comment(
                target(), 412, "updated", comment_id=999
            )

        assert comment_id == 999
        assert [c["method"] for c in calls] == ["PATCH"]
        assert "/issues/comments/999" in calls[0]["url"]

    async def test_a_deleted_comment_is_posted_again(self):
        """Somebody deleting it is not a decision that we should stay quiet — but
        it must not become two comments either, so the new id is returned for the
        caller to store."""
        svc = service()
        Client, calls = fake_client(
            patch_=FakeResponse(404), post=FakeResponse(201, {"id": 1000})
        )
        with patch("aexy.services.github_write_service.httpx.AsyncClient", Client):
            comment_id = await svc.upsert_pr_comment(
                target(), 412, "body", comment_id=999
            )

        assert comment_id == 1000
        assert [c["method"] for c in calls] == ["PATCH", "POST"]

    async def test_a_403_repairs_the_cache_and_raises(self):
        """The cache said write; GitHub disagreed. GitHub wins, and the next pull
        request short-circuits at the permission check instead of burning another
        403."""
        svc = service()
        Client, _ = fake_client(post=FakeResponse(403))
        with patch("aexy.services.github_write_service.httpx.AsyncClient", Client):
            with pytest.raises(GitHubPermissionError):
                await svc.upsert_pr_comment(target(), 412, "body")

        svc.refresh_installation_permissions.assert_awaited_once_with(42)

    async def test_another_failure_is_not_reported_as_a_permission_problem(self):
        """A 500 is ours to investigate; telling a customer to grant a permission
        they already granted is worse than saying nothing."""
        svc = service()
        Client, _ = fake_client(post=FakeResponse(500))
        with patch("aexy.services.github_write_service.httpx.AsyncClient", Client):
            with pytest.raises(GitHubWriteError) as caught:
                await svc.upsert_pr_comment(target(), 412, "body")

        assert not isinstance(caught.value, GitHubPermissionError)
        svc.refresh_installation_permissions.assert_not_awaited()


class TestTheCheckRunBelongsToACommit:
    async def test_the_same_sha_updates_the_existing_run(self):
        svc = service()
        Client, calls = fake_client(patch_=FakeResponse(200, {"id": 5}))
        with patch("aexy.services.github_write_service.httpx.AsyncClient", Client):
            run_id = await svc.upsert_check_run(
                target(),
                "a" * 40,
                conclusion="neutral",
                title="t",
                summary="s",
                check_run_id=5,
                check_run_head_sha="a" * 40,
            )

        assert run_id == 5
        assert [c["method"] for c in calls] == ["PATCH"]
        # head_sha is not sent on an update — it is the thing that cannot change.
        assert "head_sha" not in calls[0]["json"]

    async def test_a_new_sha_creates_a_new_run(self):
        """Updating the old one would leave the new commit unannotated, which is
        the failure nobody notices: the checks list looks fine on the commit
        before the one you are about to merge."""
        svc = service()
        Client, calls = fake_client(post=FakeResponse(201, {"id": 6}))
        with patch("aexy.services.github_write_service.httpx.AsyncClient", Client):
            run_id = await svc.upsert_check_run(
                target(),
                "b" * 40,
                conclusion="neutral",
                title="t",
                summary="s",
                check_run_id=5,
                check_run_head_sha="a" * 40,
            )

        assert run_id == 6
        assert [c["method"] for c in calls] == ["POST"]
        assert calls[0]["json"]["head_sha"] == "b" * 40

    async def test_the_conclusion_is_passed_through(self):
        """`neutral` never blocks a merge; a workspace can choose otherwise."""
        svc = service()
        Client, calls = fake_client(post=FakeResponse(201, {"id": 1}))
        with patch("aexy.services.github_write_service.httpx.AsyncClient", Client):
            await svc.upsert_check_run(
                target(),
                "c" * 40,
                conclusion="action_required",
                title="t",
                summary="s",
                details_url="https://app/docs/impact/r/1",
            )

        assert calls[0]["json"]["conclusion"] == "action_required"
        assert calls[0]["json"]["details_url"] == "https://app/docs/impact/r/1"

    async def test_a_404_on_create_reads_as_a_missing_permission(self):
        """GitHub hides the check-runs endpoint rather than refusing it when the
        App has no `checks` access, so a 404 here is not "no such repository"."""
        svc = service()
        Client, _ = fake_client(post=FakeResponse(404))
        with patch("aexy.services.github_write_service.httpx.AsyncClient", Client):
            with pytest.raises(GitHubPermissionError) as caught:
                await svc.upsert_check_run(
                    target(), "d" * 40, conclusion="neutral", title="t", summary="s"
                )

        assert caught.value.permission == "checks"


class TestResolvingWhereToWrite:
    async def test_the_cached_permissions_travel_with_the_token(self):
        """One permission source, not two. A separate probe cache with its own TTL
        could disagree with `GitHubInstallation.permissions`, and then nothing knows
        which is right."""
        svc = service()
        svc.app_service.resolve_repository_access = AsyncMock(return_value=(42, "tok"))
        svc.db.scalar = AsyncMock(
            return_value=SimpleNamespace(
                account_login="acme",
                account_type="Organization",
                permissions={"pull_requests": "write"},
            )
        )

        resolved = await svc.resolve_target(
            SimpleNamespace(full_name="acme/app"), "dev-1"
        )

        assert resolved.installation_id == 42
        assert resolved.owner == "acme" and resolved.repo == "app"
        assert resolved.may("pull_requests")
        assert not resolved.may("checks")

    async def test_no_installation_means_nothing_to_write_through(self):
        svc = service()
        svc.app_service.resolve_repository_access = AsyncMock(return_value=None)

        assert await svc.resolve_target(SimpleNamespace(full_name="acme/app")) is None

    async def test_a_malformed_full_name_is_declined(self):
        svc = service()
        svc.app_service.resolve_repository_access = AsyncMock(return_value=(1, "t"))

        assert await svc.resolve_target(SimpleNamespace(full_name="nonsense")) is None


class TestTheCommentBody:
    def test_it_is_recognisable_and_names_what_it_found(self):
        from aexy.services.document_impact_service import render_pr_comment

        body = render_pr_comment(
            pages=[
                {
                    "title": "Filtering tickets",
                    "url": "https://app/docs/1",
                    "paths": ["a/FilterBar.tsx"],
                    "screenshots": 3,
                    "guidance": [
                        {
                            "id": "screenshots",
                            "params": {"headings": ["Creating a filter"]},
                        }
                    ],
                }
            ],
            impact_url="https://app/docs/impact/r/412",
        )

        assert body.endswith(COMMENT_MARKER)
        assert "[Filtering tickets](https://app/docs/1)" in body
        assert "`a/FilterBar.tsx`" in body
        assert "3 screenshots" in body
        assert "Creating a filter" in body

    def test_it_says_nothing_about_screenshots_the_server_did_not_flag(self):
        """The same conjunction as the page. A page with images and a backend-only
        change gets its name in the list and no screenshot line."""
        from aexy.services.document_impact_service import render_pr_comment

        body = render_pr_comment(
            pages=[
                {
                    "title": "Filtering tickets",
                    "url": "https://app/docs/1",
                    "paths": ["a/service.py"],
                    "screenshots": 3,
                    "guidance": [],
                }
            ],
            impact_url="https://app/x",
        )

        assert "Filtering tickets" in body
        assert "screenshot" not in body.lower()

    def test_a_merged_pull_request_is_worded_in_the_past(self):
        from aexy.services.document_impact_service import render_pr_comment

        body = render_pr_comment(
            pages=[{"title": "A", "url": "u", "paths": [], "screenshots": 0}],
            impact_url="https://app/x",
            merged=True,
        )
        assert "merged" in body

    def test_truncation_is_admitted(self):
        """Silently under-reporting would make "2 pages affected" a claim we
        cannot support on a three-thousand-file pull request."""
        from aexy.services.document_impact_service import render_pr_comment

        body = render_pr_comment(
            pages=[{"title": "A", "url": "u", "paths": [], "screenshots": 0}],
            impact_url="https://app/x",
            truncated=True,
        )
        assert "may be incomplete" in body

    def test_one_page_reads_as_one_page(self):
        from aexy.services.document_impact_service import render_check_run

        title, summary = render_check_run(
            pages=[{"title": "A", "screenshots": 2}]
        )
        assert title == "1 documented page affected"
        assert "It contains screenshots" in summary

    def test_several_pages_count_them(self):
        from aexy.services.document_impact_service import render_check_run

        title, summary = render_check_run(
            pages=[{"title": "A", "screenshots": 2}, {"title": "B", "screenshots": 0}]
        )
        assert title == "2 documented pages affected"
        assert "1 of them contain" in summary


class TestTheCommentDoesNotGoStale:
    def test_the_resolved_body_stops_claiming_work(self):
        """Reached when every affected page was marked "no update needed". The
        comment is a statement of current state, so leaving the old body up —
        listing pages and screenshots — would turn it into a stale claim that
        somebody already answered."""
        from aexy.services.document_impact_service import render_resolved_pr_comment

        body = render_resolved_pr_comment(impact_url="https://app/docs/impact/r/412")

        assert "nothing outstanding" in body.lower()
        assert "needing no update" in body
        # Still ours, so the next push edits this one rather than posting again.
        assert body.endswith(COMMENT_MARKER)
        # And it must not still be naming pages or screenshots.
        assert "screenshot" not in body.lower()

    def test_it_never_posts_a_comment_to_say_nothing_is_wrong(self):
        """Read from the activity: the resolve path is guarded on an existing
        comment id. A comment whose only content is "nothing is wrong" is exactly
        the noise this feature is trying not to be, and on a pull request that
        never had one, silence is already the right answer."""
        import inspect

        from aexy.temporal.activities import document_impact

        source = inspect.getsource(document_impact._write_to_github)
        resolve_branch = source.split("if not pages:")[1].split("writer =")[0]
        assert "impact.pr_comment_id and wants_comment" in resolve_branch
