"""Where the desk's AI switch comes from.

The desk used to keep its own opt-in, off by default and independent of the
workspace-wide AI switch that exists to be the single answer to "AI on our data,
or not". A workspace could enable AI, watch every ticket still arrive as an
unclassified default, and have no way to tell which of two switches was the
reason.

It follows the workspace now, and keeps a veto rather than a duplicate opt-in.
Reading attachment *bytes* is the one thing that does not inherit: classifying a
subject reads text the desk was sent anyway, opening the customer's PDF is a
different question.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.workspace import Workspace
from aexy.models.workspace_ai_settings import WorkspaceAISettings
from aexy.services.service_desk_intake_service import (
    ai_classification_enabled,
    attachment_previews_enabled,
)


async def _workspace(db: AsyncSession, slug: str, desk_settings: dict | None = None) -> Workspace:
    owner = Developer(id=str(uuid4()), email=f"owner-{slug}@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    ws = Workspace(
        id=str(uuid4()),
        name=f"WS {slug}",
        slug=slug,
        owner_id=owner.id,
        settings={"service_desk": desk_settings} if desk_settings is not None else None,
    )
    db.add(ws)
    await db.commit()
    return ws


async def _workspace_ai(db: AsyncSession, workspace_id: str, enabled: bool) -> None:
    db.add(WorkspaceAISettings(id=str(uuid4()), workspace_id=workspace_id, ai_enabled=enabled))
    await db.commit()


# ------------------------------------------------------------------ inherit


@pytest.mark.asyncio
async def test_a_workspace_that_never_configured_ai_gets_it(db_session: AsyncSession):
    """No settings row at all is the default state: AI on, so the desk reads."""
    ws = await _workspace(db_session, "ai-default")

    assert await ai_classification_enabled(db_session, ws.id) is True


@pytest.mark.asyncio
async def test_the_workspace_switch_turns_the_desk_on(db_session: AsyncSession):
    ws = await _workspace(db_session, "ai-on")
    await _workspace_ai(db_session, ws.id, True)

    assert await ai_classification_enabled(db_session, ws.id) is True


@pytest.mark.asyncio
async def test_the_workspace_kill_switch_turns_the_desk_off(db_session: AsyncSession):
    """"No AI on our data" has to mean the desk too, without a second visit."""
    ws = await _workspace(db_session, "ai-off")
    await _workspace_ai(db_session, ws.id, False)

    assert await ai_classification_enabled(db_session, ws.id) is False


# --------------------------------------------------------------------- veto


@pytest.mark.asyncio
async def test_the_desk_can_veto_while_the_workspace_keeps_ai(db_session: AsyncSession):
    ws = await _workspace(db_session, "ai-veto", {"ai_classification_enabled": False})
    await _workspace_ai(db_session, ws.id, True)

    assert await ai_classification_enabled(db_session, ws.id) is False


@pytest.mark.asyncio
async def test_a_legacy_explicit_true_reads_as_inherit(db_session: AsyncSession):
    """The value written before this was inheritable must not pin AI on.

    The gateway refuses the call when the workspace has AI off, so honouring a
    stored ``True`` would only produce a desk that says it is classifying and
    silently is not.
    """
    ws = await _workspace(db_session, "ai-legacy", {"ai_classification_enabled": True})
    await _workspace_ai(db_session, ws.id, False)

    assert await ai_classification_enabled(db_session, ws.id) is False


# -------------------------------------------------------------- attachments


@pytest.mark.asyncio
async def test_attachments_are_not_read_by_inheritance(db_session: AsyncSession):
    """AI on for the workspace does not consent to opening customers' files."""
    ws = await _workspace(db_session, "ai-files-default")
    await _workspace_ai(db_session, ws.id, True)

    assert await ai_classification_enabled(db_session, ws.id) is True
    assert await attachment_previews_enabled(db_session, ws.id) is False


@pytest.mark.asyncio
async def test_attachments_are_read_once_asked_for(db_session: AsyncSession):
    ws = await _workspace(db_session, "ai-files-on", {"ai_attachment_previews_enabled": True})
    await _workspace_ai(db_session, ws.id, True)

    assert await attachment_previews_enabled(db_session, ws.id) is True


@pytest.mark.asyncio
async def test_a_desk_veto_also_stops_attachment_reads(db_session: AsyncSession):
    """The file read is downstream of the classifier; no classifier, no read."""
    ws = await _workspace(
        db_session,
        "ai-files-vetoed",
        {"ai_classification_enabled": False, "ai_attachment_previews_enabled": True},
    )
    await _workspace_ai(db_session, ws.id, True)

    assert await attachment_previews_enabled(db_session, ws.id) is False
