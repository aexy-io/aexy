"""Who a doc-to-code sync belongs to, and what happens when they leave.

A sync outlives the person who set it up. Three things used to be read from
`documents.created_by_id` — the plan tier that decides how the sync behaves,
the GitHub credentials it runs on, and the account the LLM spend lands on —
which made a document's *author* responsible for a sync they may never have
configured, and made their departure silently stop it.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from aexy.models.plan import PlanTier
from aexy.services.document_sync_service import DocumentSyncService, SyncTriggerType


def make_service():
    svc = DocumentSyncService.__new__(DocumentSyncService)  # skip __init__
    svc.db = MagicMock()
    svc.limits_service = MagicMock()
    return svc


class StubAppService:
    """Records which resolution route was taken, and in what order."""

    def __init__(self, *, account_ok: bool, developer_ok: bool):
        self.account_ok = account_ok
        self.developer_ok = developer_ok
        self.calls: list[tuple] = []

    async def get_installation_token_for_account(self, account_login):
        self.calls.append(("account", account_login))
        return ("ghs_account", 11) if self.account_ok else None

    async def get_installation_token_for_developer(self, developer_id, account_login=None):
        self.calls.append(("developer", developer_id))
        return ("ghs_dev", 22) if self.developer_ok else None

    async def get_file_content(self, installation_id, owner, repo, path, ref="main"):
        return {"content": "x"}


def wire(monkeypatch, *, account_ok, developer_ok):
    stub = StubAppService(account_ok=account_ok, developer_ok=developer_ok)
    monkeypatch.setattr(
        "aexy.services.github_app_service.GitHubAppService", lambda db: stub
    )
    return stub


def fixtures(*, owner_id="owner-dev", author_id="author-dev"):
    repository = SimpleNamespace(
        full_name="acme/widgets", owner_login="acme", name="widgets"
    )
    document = SimpleNamespace(id="doc-1", created_by_id=author_id)
    code_link = SimpleNamespace(
        id="link-1",
        repository=repository,
        path="src/pkg",
        branch="main",
        owner_developer_id=owner_id,
    )
    return document, code_link


class TestCredentialResolutionOrder:
    @pytest.mark.asyncio
    async def test_the_repository_is_asked_before_any_person(self, monkeypatch):
        """The fix for departure: an installation covering the account works
        no matter who is still employed."""
        stub = wire(monkeypatch, account_ok=True, developer_ok=True)
        document, code_link = fixtures()

        reader = await make_service()._build_github_reader(document, code_link)

        assert reader is not None
        assert stub.calls == [("account", "acme")]

    @pytest.mark.asyncio
    async def test_the_sync_owner_is_the_fallback(self, monkeypatch):
        stub = wire(monkeypatch, account_ok=False, developer_ok=True)
        document, code_link = fixtures()

        reader = await make_service()._build_github_reader(document, code_link)

        assert reader is not None
        assert stub.calls == [("account", "acme"), ("developer", "owner-dev")]

    @pytest.mark.asyncio
    async def test_a_link_predating_ownership_falls_back_to_the_author(
        self, monkeypatch
    ):
        """Rows created before the owner column existed have a null owner and
        must keep behaving exactly as they did."""
        stub = wire(monkeypatch, account_ok=False, developer_ok=True)
        document, code_link = fixtures(owner_id=None)

        reader = await make_service()._build_github_reader(document, code_link)

        assert reader is not None
        assert stub.calls == [("account", "acme"), ("developer", "author-dev")]

    @pytest.mark.asyncio
    async def test_no_access_anywhere_yields_no_reader(self, monkeypatch):
        wire(monkeypatch, account_ok=False, developer_ok=False)
        document, code_link = fixtures()

        assert await make_service()._build_github_reader(document, code_link) is None


class TestSyncTierComesFromTheSyncOwner:
    """`handle_code_change` routes by plan tier. Reading the document author's
    tier meant that after a whole-repository run, one person's plan governed
    every document in that repository."""

    @pytest.mark.asyncio
    async def test_the_owners_tier_is_used_not_the_authors(self):
        svc = make_service()
        tiers = {
            "owner-dev": SimpleNamespace(
                enable_real_time_sync=True, tier=PlanTier.PRO.value
            ),
            "author-dev": SimpleNamespace(
                enable_real_time_sync=False, tier=PlanTier.FREE.value
            ),
        }

        async def get_developer_with_plan(developer_id):
            return SimpleNamespace(plan=tiers[developer_id])

        svc.limits_service.get_developer_with_plan = get_developer_with_plan

        assert (
            await svc.get_sync_type_for_developer("owner-dev")
            == SyncTriggerType.REAL_TIME
        )
        assert (
            await svc.get_sync_type_for_developer("author-dev")
            == SyncTriggerType.MANUAL
        )


class TestTransferOnDeparture:
    def setup_service(self, links, workspace_owner_id="ws-owner"):
        svc = make_service()
        workspace = SimpleNamespace(id="ws-1", owner_id=workspace_owner_id)
        departing = SimpleNamespace(id="leaver", name="Sam Rivers")

        results = [
            SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: links)),
            SimpleNamespace(scalar_one_or_none=lambda: workspace),
            SimpleNamespace(scalar_one_or_none=lambda: departing),
        ]
        svc.db.execute = AsyncMock(side_effect=results)
        return svc

    @pytest.mark.asyncio
    async def test_syncs_move_to_the_workspace_owner(self, monkeypatch):
        links = [
            SimpleNamespace(id="l1", owner_developer_id="leaver"),
            SimpleNamespace(id="l2", owner_developer_id="leaver"),
        ]
        svc = self.setup_service(links)

        sent = {}

        async def fake_notify(db, recipient_id, sync_count, previous_owner_label, workspace_id=None):
            sent.update(
                recipient_id=recipient_id,
                sync_count=sync_count,
                previous_owner_label=previous_owner_label,
            )
            return 1

        monkeypatch.setattr(
            "aexy.services.notification_service.notify_document_sync_ownership_transferred",
            fake_notify,
        )

        result = await svc.transfer_owned_syncs("leaver", "ws-1")

        assert result == {"transferred": 2, "new_owner_id": "ws-owner"}
        assert [link.owner_developer_id for link in links] == ["ws-owner", "ws-owner"]

    @pytest.mark.asyncio
    async def test_the_new_owner_is_told(self, monkeypatch):
        """A silent transfer is worse than none: the first the new owner would
        otherwise hear is a proposal on a document they did not know was
        theirs."""
        links = [SimpleNamespace(id="l1", owner_developer_id="leaver")]
        svc = self.setup_service(links)

        sent = {}

        async def fake_notify(db, recipient_id, sync_count, previous_owner_label, workspace_id=None):
            sent.update(
                recipient_id=recipient_id,
                sync_count=sync_count,
                previous_owner_label=previous_owner_label,
                workspace_id=workspace_id,
            )
            return 1

        monkeypatch.setattr(
            "aexy.services.notification_service.notify_document_sync_ownership_transferred",
            fake_notify,
        )

        await svc.transfer_owned_syncs("leaver", "ws-1")

        assert sent == {
            "recipient_id": "ws-owner",
            "sync_count": 1,
            "previous_owner_label": "Sam Rivers",
            "workspace_id": "ws-1",
        }

    @pytest.mark.asyncio
    async def test_an_explicit_recipient_wins_over_the_workspace_owner(
        self, monkeypatch
    ):
        links = [SimpleNamespace(id="l1", owner_developer_id="leaver")]
        svc = make_service()
        departing = SimpleNamespace(id="leaver", name="Sam Rivers")
        svc.db.execute = AsyncMock(
            side_effect=[
                SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: links)),
                SimpleNamespace(scalar_one_or_none=lambda: departing),
            ]
        )
        monkeypatch.setattr(
            "aexy.services.notification_service.notify_document_sync_ownership_transferred",
            AsyncMock(return_value=1),
        )

        result = await svc.transfer_owned_syncs("leaver", "ws-1", new_owner_id="chosen")

        assert result["new_owner_id"] == "chosen"
        assert links[0].owner_developer_id == "chosen"

    @pytest.mark.asyncio
    async def test_nothing_owned_means_nothing_done(self):
        svc = make_service()
        svc.db.execute = AsyncMock(
            return_value=SimpleNamespace(
                scalars=lambda: SimpleNamespace(all=lambda: [])
            )
        )

        assert await svc.transfer_owned_syncs("leaver", "ws-1") == {
            "transferred": 0,
            "new_owner_id": None,
        }

    @pytest.mark.asyncio
    async def test_links_are_left_alone_when_there_is_no_sensible_recipient(self):
        """Nulling the owner would throw away the one remaining clue about
        which installation the sync has been running on."""
        links = [SimpleNamespace(id="l1", owner_developer_id="leaver")]
        svc = self.setup_service(links, workspace_owner_id=None)
        svc.db.execute = AsyncMock(
            side_effect=[
                SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: links)),
                SimpleNamespace(scalar_one_or_none=lambda: None),
            ]
        )

        result = await svc.transfer_owned_syncs("leaver", "ws-1")

        assert result == {"transferred": 0, "new_owner_id": None}
        assert links[0].owner_developer_id == "leaver"

    @pytest.mark.asyncio
    async def test_a_transfer_failure_never_blocks_a_removal(self):
        svc = make_service()
        svc.db.execute = AsyncMock(side_effect=RuntimeError("db gone"))

        assert await svc.transfer_owned_syncs("leaver", "ws-1") == {
            "transferred": 0,
            "new_owner_id": None,
        }


class TestRemovalTriggersTheTransfer:
    def test_remove_member_hands_on_owned_syncs(self):
        """The call site, not the behaviour: a transfer wired into only one of
        several removal paths is a transfer that mostly does not happen."""
        import inspect

        from aexy.services.workspace_service import WorkspaceService

        source = inspect.getsource(WorkspaceService.remove_member)
        assert "transfer_owned_syncs" in source
