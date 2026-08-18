"""Who may hand a sync to somebody else.

Any member could, which is a wider grant than it reads as. Ownership decides the
plan tier the sync runs on and whose LLM spend it is, so an unrestricted transfer
is a way to bill a colleague for real-time regeneration you are not entitled to
— and ownership carries a GitHub credential fallback, so it is also a way to
reach a repository through the installation of whoever you assigned it to.

The same reasoning already gates agent-action approval to admins: a gate a member
can step around on their own behalf is a formality.
"""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from aexy.api.documents import transfer_code_link_owner
from aexy.schemas.document import CodeLinkTransfer

OWNER_ID = "dev-owner"
OTHER_ID = "dev-other"
TARGET_ID = "dev-target"


def _patches(*, link_owner=OWNER_ID, is_admin=False, target_is_member=True):
    """The route's two collaborators, with the answers each test needs."""
    document = SimpleNamespace(id="doc-1")
    link = SimpleNamespace(id="link-1", owner_developer_id=link_owner)

    doc_service = MagicMock()
    doc_service.get_document = AsyncMock(return_value=document)
    doc_service.get_code_link = AsyncMock(return_value=link)
    doc_service.set_code_link_owner = AsyncMock(
        return_value=SimpleNamespace(
            id="link-1",
            document_id="doc-1",
            repository_id="repo-1",
            repository=SimpleNamespace(full_name="acme/widgets"),
            path="src/pkg",
            link_type="directory",
            branch="main",
            document_section_id=None,
            last_commit_sha=None,
            last_content_hash=None,
            last_synced_at=None,
            has_pending_changes=False,
            owner_developer_id=TARGET_ID,
            sync_mode="propose",
            created_at=datetime(2026, 1, 1),
            updated_at=datetime(2026, 3, 1),
        )
    )

    workspace_service = MagicMock()

    async def check_permission(workspace_id, developer_id, role):
        if role == "admin":
            return is_admin
        # The target's membership check, and the route's own member floor.
        return target_is_member

    workspace_service.check_permission = AsyncMock(side_effect=check_permission)

    return (
        patch("aexy.api.documents.check_workspace_permission", AsyncMock()),
        patch("aexy.api.documents.DocumentService", return_value=doc_service),
        patch("aexy.api.documents.WorkspaceService", return_value=workspace_service),
        doc_service,
    )


async def _transfer(caller_id: str, **kwargs):
    p1, p2, p3, doc_service = _patches(**kwargs)
    with p1, p2, p3:
        await transfer_code_link_owner(
            workspace_id="ws-1",
            document_id="doc-1",
            link_id="link-1",
            data=CodeLinkTransfer(owner_developer_id=TARGET_ID),
            current_user=SimpleNamespace(id=caller_id),
            db=MagicMock(),
        )
    return doc_service


class TestWhoMayTransfer:
    @pytest.mark.asyncio
    async def test_the_current_owner_may_hand_it_on(self):
        doc_service = await _transfer(OWNER_ID)
        assert doc_service.set_code_link_owner.await_args.kwargs[
            "owner_developer_id"
        ] == TARGET_ID

    @pytest.mark.asyncio
    async def test_an_admin_may_reassign_somebody_else_s(self):
        doc_service = await _transfer(OTHER_ID, is_admin=True)
        doc_service.set_code_link_owner.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_an_ordinary_member_may_not(self):
        """The finding. This is the call that moved a colleague's sync — and its
        cost — onto somebody else."""
        with pytest.raises(HTTPException) as caught:
            await _transfer(OTHER_ID, is_admin=False)

        assert caught.value.status_code == 403
        assert "owner or a workspace admin" in caught.value.detail

    @pytest.mark.asyncio
    async def test_a_member_may_not_claim_an_orphaned_sync(self):
        """Owner null means the previous owner left. Letting anybody claim it
        would make the transfer gate optional — wait for a departure, then take
        it. An admin assigns these."""
        with pytest.raises(HTTPException) as caught:
            await _transfer(OTHER_ID, link_owner=None, is_admin=False)

        assert caught.value.status_code == 403

    @pytest.mark.asyncio
    async def test_an_admin_may_assign_an_orphaned_sync(self):
        doc_service = await _transfer(OTHER_ID, link_owner=None, is_admin=True)
        doc_service.set_code_link_owner.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_the_new_owner_must_be_in_the_workspace(self):
        """Unchanged, and still the point: ownership carries a credential
        fallback, so an outsider receiving it could read the repository through
        somebody else's installation."""
        with pytest.raises(HTTPException) as caught:
            await _transfer(OWNER_ID, target_is_member=False)

        assert caught.value.status_code == 400

    @pytest.mark.asyncio
    async def test_a_link_from_another_document_is_not_found(self):
        p1, p2, p3, doc_service = _patches()
        doc_service.get_code_link = AsyncMock(return_value=None)

        with p1, p2, p3, pytest.raises(HTTPException) as caught:
            await transfer_code_link_owner(
                workspace_id="ws-1",
                document_id="doc-1",
                link_id="someone-elses-link",
                data=CodeLinkTransfer(owner_developer_id=TARGET_ID),
                current_user=SimpleNamespace(id=OWNER_ID),
                db=MagicMock(),
            )

        assert caught.value.status_code == 404
