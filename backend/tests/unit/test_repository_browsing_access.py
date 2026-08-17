"""Who can browse a repository the workspace adopted.

Both endpoints resolved access through the caller's own GitHub App
installation, which made browsing a personal act: a member of a workspace that
had adopted a repository could not read it unless they had installed the app
themselves. That is why the docs pickers had to read the per-developer
repository list to stay honest — offering a repository nobody could browse
would only have moved the dead end one click later.

Repository first, then the caller — the same order `resolve_repository_access`
already imposes on code links, GitHub sync and background regeneration.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from aexy.api.repositories import (
    get_repository_branches,
    get_repository_contents,
)

REPO = SimpleNamespace(id="repo-1", owner_login="acme", name="widgets")


def _services(*, access):
    """The two services both endpoints construct, with access pre-decided."""
    repo_service = MagicMock()
    repo_service.get_repository_by_id = AsyncMock(return_value=REPO)

    app_service = MagicMock()
    app_service.resolve_repository_access = AsyncMock(return_value=access)
    app_service.get_repository_contents = AsyncMock(return_value=[{"name": "a.ts"}])
    app_service.get_repository_branches = AsyncMock(return_value=[{"name": "main"}])
    # Present so a test fails loudly if the endpoint reverts to it rather than
    # silently passing through a different resolution.
    app_service.get_installation_token_for_developer = AsyncMock(
        side_effect=AssertionError("must resolve by repository first")
    )
    return repo_service, app_service


def _patched(repo_service, app_service):
    return (
        patch("aexy.api.repositories.RepositoryService", return_value=repo_service),
        patch("aexy.api.repositories.GitHubAppService", return_value=app_service),
    )


class TestBrowsingContents:
    @pytest.mark.asyncio
    async def test_it_resolves_by_repository_not_by_the_caller_alone(self):
        repo_service, app_service = _services(access=(42, "tok"))
        p1, p2 = _patched(repo_service, app_service)

        with p1, p2:
            result = await get_repository_contents(
                repo_id="repo-1",
                path="src",
                ref="main",
                developer_id="dev-without-an-installation",
                db=MagicMock(),
            )

        assert result == [{"name": "a.ts"}]
        app_service.resolve_repository_access.assert_awaited_once_with(
            REPO, "dev-without-an-installation"
        )
        # The installation id, not the token — these were unpacked the wrong way
        # round elsewhere in the codebase and broke document export outright.
        assert (
            app_service.get_repository_contents.await_args.kwargs["installation_id"]
            == 42
        )

    @pytest.mark.asyncio
    async def test_no_installation_anywhere_is_still_a_403(self):
        repo_service, app_service = _services(access=None)
        p1, p2 = _patched(repo_service, app_service)

        with p1, p2, pytest.raises(HTTPException) as caught:
            await get_repository_contents(
                repo_id="repo-1",
                path="",
                ref="main",
                developer_id="dev-1",
                db=MagicMock(),
            )

        assert caught.value.status_code == 403


class TestBrowsingBranches:
    @pytest.mark.asyncio
    async def test_it_resolves_the_same_way_as_contents(self):
        """Two endpoints one click apart: if only one of them accepts a
        workspace-adopted repository, the picker works and the branch dropdown
        below it does not."""
        repo_service, app_service = _services(access=(42, "tok"))
        p1, p2 = _patched(repo_service, app_service)

        with p1, p2:
            result = await get_repository_branches(
                repo_id="repo-1",
                developer_id="dev-without-an-installation",
                db=MagicMock(),
            )

        assert result == [{"name": "main"}]
        app_service.resolve_repository_access.assert_awaited_once_with(
            REPO, "dev-without-an-installation"
        )
        assert (
            app_service.get_repository_branches.await_args.kwargs["installation_id"]
            == 42
        )
