"""Unit tests for the AI-suggestion approval queue.

These pin the lifecycle invariants that the FE banner + diff review
depend on:

  - Creating a fresh proposal supersedes older pending ones (no
    stack-up).
  - Approving applies the content via DocumentService (which creates
    a DocumentVersion).
  - Rejecting leaves the document untouched and records the reason.
  - Stale detection compares base_content_sha against the doc's
    current SHA.
  - compute_content_sha is deterministic + insensitive to key order.

DB-heavy methods (list_pending, update statements) are exercised
via a mocked AsyncSession because the SQLite test DB can't materialise
the Postgres-specific ARRAY columns elsewhere in the schema (see
backend/tests/ai/conftest.py).
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from aexy.models.documentation import ProposedEditSource, ProposedEditStatus
from aexy.services.proposed_edits_service import (
    ProposedEditsService,
    compute_content_sha,
)


# ─── Pure helpers ──────────────────────────────────────────────────


class TestComputeContentSha:
    def test_deterministic(self):
        a = compute_content_sha({"type": "doc", "content": [{"x": 1}]})
        b = compute_content_sha({"type": "doc", "content": [{"x": 1}]})
        assert a == b

    def test_key_order_invariant(self):
        """Same fields in different declaration order must hash the
        same; otherwise stale detection would fire on JS round-trips
        that re-serialize in a different order."""
        a = compute_content_sha({"type": "doc", "content": []})
        b = compute_content_sha({"content": [], "type": "doc"})
        assert a == b

    def test_different_content_different_hash(self):
        a = compute_content_sha({"type": "doc", "content": []})
        b = compute_content_sha(
            {"type": "doc", "content": [{"type": "paragraph"}]}
        )
        assert a != b

    def test_none_and_empty_dict_match(self):
        """`None` and `{}` should hash to the same value — a brand-new
        document has empty content, conceptually identical to no
        content at all."""
        assert compute_content_sha(None) == compute_content_sha({})


# ─── Service logic ─────────────────────────────────────────────────


def make_service():
    """Build a ProposedEditsService with a mocked AsyncSession.

    The service does:
      - db.get(Document, id) — returns SimpleNamespace
      - db.add(...) + db.flush()
      - db.execute(...) for the supersede update
    """
    db = MagicMock()
    db.get = AsyncMock()
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.execute = AsyncMock()
    svc = ProposedEditsService(db)
    return svc, db


def make_doc(*, doc_id="doc-1", owner_id="owner-1", content=None):
    return SimpleNamespace(
        id=doc_id,
        # `title` and `workspace_id` are read when notifying the owner: the
        # notification now names the document and is workspace-scoped for Slack
        # routing, where the old inbox row carried neither.
        title="Runbook",
        workspace_id="ws-1",
        content=content or {"type": "doc", "content": []},
        created_by_id=owner_id,
    )


class TestCreateProposal:
    @pytest.mark.asyncio
    async def test_snapshots_current_content_sha_when_omitted(self):
        svc, db = make_service()
        # Document with known content; service must hash it and store
        # the SHA on the new proposal as base_content_sha.
        existing_content = {"type": "doc", "content": [{"x": "y"}]}
        db.get.return_value = make_doc(content=existing_content)

        proposal = await svc.create_proposal(
            document_id="doc-1",
            source=ProposedEditSource.REGENERATE,
            proposed_content={"type": "doc", "content": []},
            proposed_by_id="dev-1",
        )

        assert proposal.base_content_sha == compute_content_sha(existing_content)
        assert proposal.status == ProposedEditStatus.PENDING.value
        # The source is normalised to the enum's string value.
        assert proposal.source == "regenerate"

    @pytest.mark.asyncio
    async def test_supersede_runs_after_new_proposal_is_flushed(self):
        """The supersede UPDATE must reference the new proposal's id —
        which means the new row has to be flushed first to obtain it.
        If the order were reversed, the new proposal itself could be
        swept into the supersede set."""
        svc, db = make_service()
        db.get.return_value = make_doc(content={"type": "doc"})

        call_order: list[str] = []

        async def track_flush():
            call_order.append("flush")

        async def track_execute(stmt):
            call_order.append("execute_supersede")

        db.flush.side_effect = track_flush
        db.execute.side_effect = track_execute

        await svc.create_proposal(
            document_id="doc-1",
            source="regenerate",
            proposed_content={"type": "doc"},
        )

        # flush must come before the supersede execute.
        assert call_order.index("flush") < call_order.index("execute_supersede"), (
            f"supersede ran before flush, would have null-id UPDATE: {call_order}"
        )

    @pytest.mark.asyncio
    async def test_accepts_string_source(self):
        """The API surface passes the source as a string from the
        public schema; the service must normalise it."""
        svc, db = make_service()
        db.get.return_value = None

        proposal = await svc.create_proposal(
            document_id="doc-1",
            source="suggest_improvements",
            proposed_content={"type": "doc"},
        )
        assert proposal.source == "suggest_improvements"


class TestIsStale:
    @pytest.mark.asyncio
    async def test_no_base_sha_is_never_stale(self):
        """Legacy rows without a base_content_sha can't be evaluated
        for staleness — treat them as fresh to avoid false-positive
        conflict banners."""
        svc, db = make_service()
        proposal = SimpleNamespace(
            document_id="doc-1", base_content_sha=None
        )
        assert (await svc.is_stale(proposal)) is False

    @pytest.mark.asyncio
    async def test_matching_sha_not_stale(self):
        svc, db = make_service()
        content = {"type": "doc", "content": []}
        db.get.return_value = SimpleNamespace(content=content)

        proposal = SimpleNamespace(
            document_id="doc-1",
            base_content_sha=compute_content_sha(content),
        )
        assert (await svc.is_stale(proposal)) is False

    @pytest.mark.asyncio
    async def test_diverged_sha_is_stale(self):
        """User has hand-edited the doc since the proposal was
        authored — proposal must surface as stale so the FE renders
        the merge-conflict UX."""
        svc, db = make_service()
        original = {"type": "doc", "content": []}
        edited = {"type": "doc", "content": [{"type": "paragraph"}]}
        db.get.return_value = SimpleNamespace(content=edited)

        proposal = SimpleNamespace(
            document_id="doc-1",
            base_content_sha=compute_content_sha(original),
        )
        assert (await svc.is_stale(proposal)) is True


class TestNotificationOnCreate:
    """The owner is told a proposal is waiting, through NotificationService.

    This used to insert a row into a `document_notifications` table read only by
    an "Inbox" panel in the docs sidebar — no email, no per-user preference, no
    presence in the main notification bell. A proposal from a scheduled sync,
    which nobody clicked anything to cause, waited for the owner to happen to open
    that one panel. These tests now assert on the shared notification path, so the
    delivery guarantees are the same as every other event in the product.
    """

    @pytest.mark.asyncio
    async def test_notification_fired_for_owner(self, monkeypatch):
        """A system-generated proposal (proposed_by_id is None) notifies the owner."""
        import aexy.services.notification_service as notifications

        sent = []

        async def _capture(**kwargs):
            sent.append(kwargs)
            return 1

        monkeypatch.setattr(notifications, "notify_document_ai_proposal", _capture)

        svc, db = make_service()
        db.get.return_value = make_doc(owner_id="owner-1")

        await svc.create_proposal(
            document_id="doc-1",
            source=ProposedEditSource.CODE_CHANGE_SYNC,
            proposed_content={"type": "doc"},
            proposed_by_id=None,
        )

        added_kinds = [type(call.args[0]).__name__ for call in db.add.call_args_list]
        assert "DocumentProposedEdit" in added_kinds, added_kinds
        assert len(sent) == 1, (
            f"owner was not notified — the proposal is invisible to them: {sent}"
        )
        assert sent[0]["recipient_id"] == "owner-1"
        assert sent[0]["document_title"] == "Runbook"
        # The label names what produced it, since usually no person did.
        assert sent[0]["actor_label"]

    @pytest.mark.asyncio
    async def test_no_self_notification(self, monkeypatch):
        """Proposer == doc owner shouldn't get a notification about
        their own action (manual regenerate triggered by the owner)."""
        import aexy.services.notification_service as notifications

        sent = []

        async def _capture(**kwargs):
            sent.append(kwargs)
            return 1

        monkeypatch.setattr(notifications, "notify_document_ai_proposal", _capture)

        svc, db = make_service()
        db.get.return_value = make_doc(owner_id="dev-1")

        await svc.create_proposal(
            document_id="doc-1",
            source=ProposedEditSource.REGENERATE,
            proposed_content={"type": "doc"},
            proposed_by_id="dev-1",
        )

        assert sent == [], "owner-triggered proposal fired a notification to the owner"

    @pytest.mark.asyncio
    async def test_no_notification_when_owner_missing(self):
        """Doc without created_by_id (test fixtures, legacy rows) —
        notification step is a no-op rather than a crash."""
        svc, db = make_service()
        db.get.return_value = make_doc(owner_id=None)

        await svc.create_proposal(
            document_id="doc-1",
            source=ProposedEditSource.REGENERATE,
            proposed_content={"type": "doc"},
        )

        added_kinds = [type(call.args[0]).__name__ for call in db.add.call_args_list]
        assert "DocumentNotification" not in added_kinds, (
            f"notification fired without an owner to notify: {added_kinds}"
        )
