"""One resolver for every repository read and write.

Two callers in `github_sync_service` unpacked `(token, installation_id)` as
`installation_id, token`, so they passed a JWT where an integer belonged and
document export and import never worked. A single function that returns the id
first removes the coin flip — `installation_id, token = ...` is now the only
shape there is.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from aexy.services.github_app_service import GitHubAppService

pytestmark = pytest.mark.asyncio

REPO = SimpleNamespace(full_name="acme/widgets", owner_login="acme", name="widgets")


def service(*, account=None, developer=None):
    svc = GitHubAppService.__new__(GitHubAppService)
    svc.db = None
    svc.get_installation_token_for_account = AsyncMock(return_value=account)
    svc.get_installation_token_for_developer = AsyncMock(return_value=developer)
    return svc


class TestResolutionOrder:
    async def test_the_owning_account_is_asked_first(self):
        """Repository-first is what survives the departure of whoever set the
        sync up."""
        svc = service(account=("tok-acct", 11), developer=("tok-dev", 22))

        assert await svc.resolve_repository_access(REPO, "dev-1") == (11, "tok-acct")
        svc.get_installation_token_for_developer.assert_not_awaited()

    async def test_a_developer_is_the_fallback(self):
        """Which is what works before an org-wide installation exists."""
        svc = service(account=None, developer=("tok-dev", 22))

        assert await svc.resolve_repository_access(REPO, "dev-1") == (22, "tok-dev")

    async def test_the_developer_lookup_is_scoped_to_the_account(self):
        """A developer may hold installations on several orgs; only one can
        read this repository, and the unscoped call returned whichever came
        first."""
        svc = service(account=None, developer=("tok-dev", 22))

        await svc.resolve_repository_access(REPO, "dev-1")

        assert svc.get_installation_token_for_developer.await_args.args == (
            "dev-1",
            "acme",
        )

    async def test_no_access_returns_none(self):
        svc = service(account=None, developer=None)

        assert await svc.resolve_repository_access(REPO, "dev-1") is None

    async def test_no_developer_means_account_only(self):
        svc = service(account=None, developer=("tok-dev", 22))

        assert await svc.resolve_repository_access(REPO, None) is None
        svc.get_installation_token_for_developer.assert_not_awaited()


class TestTheOrderIsIdFirst:
    async def test_the_installation_id_comes_first(self):
        """The bug this exists to prevent: the helpers return the token first,
        and two call sites read them the other way round. An integer id and a
        string token are trivially distinguishable in a test and were not in
        the code."""
        svc = service(account=("a-token-string", 42))

        installation_id, token = await svc.resolve_repository_access(REPO, None)

        assert isinstance(installation_id, int)
        assert isinstance(token, str)


class TestCallersUseIt:
    def test_the_sync_service_no_longer_unpacks_by_hand(self):
        import inspect

        from aexy.services import github_sync_service

        source = inspect.getsource(github_sync_service)
        assert "resolve_repository_access" in source
        # The shape that was wrong twice.
        assert "installation_id, token = token_result" not in source

    def test_every_repository_reader_shares_the_resolver(self):
        import inspect

        from aexy.api import documents
        from aexy.services import document_sync_service

        for module in (documents, document_sync_service):
            assert "resolve_repository_access" in inspect.getsource(module)
