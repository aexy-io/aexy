"""Taking a file off a Service Desk ticket, and not paying an LLM to log one.

Two things a desk lives or dies by, both of which used to be wrong:

* An attachment was a filename rendered as text. A KAM could see that a claim
  register had arrived and had no way to open it, so the ticket could only be
  worked from the mailbox it came from — which is the thing the desk exists to
  replace. The bytes are never stored, so a download re-fetches them from the
  message the file arrived on; these tests pin who is allowed to ask, and what
  happens when the file cannot be fetched at all.

* Logging a call ran an LLM classification inside the HTTP request and then
  overwrote every field it produced with what the operator had typed. The last
  test here is the guard: no model call on that path, ever.
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.models.developer import Developer
from aexy.models.google_integration import GoogleIntegration
from aexy.models.service_desk import MailboxChannel, ServiceDeskMailbox, ServiceDeskTicket
from aexy.models.ticketing import Ticket
from aexy.models.workspace import Workspace, WorkspaceMember
from tests.conftest import seed_service_desk_taxonomy

settings = get_settings()

REGISTER = b"policy_no,member_name\nP-1,Asha\n"


def _auth(developer_id: str) -> dict:
    payload = {
        "sub": developer_id,
        "type": "access",
        "exp": datetime.now(timezone.utc).timestamp() + 1800,
    }
    return {
        "Authorization": (
            f"Bearer {jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)}"
        )
    }


def _base(ws_id: str) -> str:
    return f"/api/v1/workspaces/{ws_id}/service-desk"


@pytest_asyncio.fixture
async def desk(db_session: AsyncSession):
    """A desk whose mailbox is a connected Gmail account."""
    dev = Developer(id=str(uuid4()), email=f"ops-{uuid4().hex[:6]}@example.com", name="Ops Head")
    db_session.add(dev)
    await db_session.flush()
    ws = Workspace(id=str(uuid4()), name="Acme Ops", slug=f"acme-{uuid4().hex[:6]}", owner_id=dev.id)
    db_session.add(ws)
    await db_session.flush()
    db_session.add(WorkspaceMember(workspace_id=ws.id, developer_id=dev.id, role="admin", status="active"))
    await seed_service_desk_taxonomy(db_session, ws.id)

    integration = GoogleIntegration(
        id=str(uuid4()),
        workspace_id=ws.id,
        connected_by_id=dev.id,
        access_token="token",
        refresh_token="refresh",
        token_expiry=datetime.now(timezone.utc) + timedelta(hours=1),
        google_email="operations@example.com",
        granted_scopes=[],
        gmail_sync_enabled=True,
    )
    db_session.add(integration)
    await db_session.flush()
    mailbox = ServiceDeskMailbox(
        id=str(uuid4()),
        workspace_id=ws.id,
        address="operations@example.com",
        channel=MailboxChannel.GMAIL_SYNC.value,
        integration_id=integration.id,
    )
    db_session.add(mailbox)
    await db_session.commit()
    return {"dev": dev, "ws": ws, "headers": _auth(dev.id), "mailbox": mailbox}


async def _ticket_with_attachments(
    client, db_session: AsyncSession, desk, attachments: list[dict]
) -> str:
    """Log a ticket, then put files on it as intake would have."""
    ws = desk["ws"].id
    created = await client.post(
        _base(ws) + "/tickets/manual",
        headers=desk["headers"],
        json={"subject": "Claim register", "body": "Attached", "request_type": "claims"},
    )
    assert created.status_code == 201, created.text
    ticket_id = created.json()["ticket_id"]

    ticket = await db_session.get(Ticket, ticket_id)
    values = dict(ticket.field_values or {})
    values["attachments"] = attachments
    ticket.field_values = values
    sd = (
        await db_session.execute(
            select(ServiceDeskTicket).where(ServiceDeskTicket.ticket_id == ticket_id)
        )
    ).scalar_one()
    # A manual ticket has no mailbox of its own; point it at the connected one so
    # the re-fetch has somewhere to go, exactly as an email-borne ticket would.
    sd.mailbox_id = desk["mailbox"].id
    sd.source_message_id = "msg-1"
    await db_session.commit()
    return ticket_id


@pytest.mark.asyncio
async def test_attachment_is_downloadable_by_anyone_who_can_see_the_ticket(
    client, db_session, desk, monkeypatch
):
    from aexy.services.gmail_sync_service import GmailSyncService

    ticket_id = await _ticket_with_attachments(
        client,
        db_session,
        desk,
        [
            {
                "filename": "Tata AI Loader LOT 5 AUG 2026.xlsx",
                "content_type": "text/csv",
                "size_bytes": len(REGISTER),
                "attachment_id": "att-1",
                "message_id": "msg-1",
            }
        ],
    )
    ws, h = desk["ws"].id, desk["headers"]

    # The detail response carries the handle the download URL takes.
    detail = (await client.get(f"{_base(ws)}/tickets/{ticket_id}", headers=h)).json()
    assert [(a["index"], a["can_forward"]) for a in detail["attachments"]] == [(0, True)]

    asked: dict = {}

    async def fake_bytes(self, integration, message_id, body, **kwargs):
        asked.update({"message_id": message_id, "attachment_id": body.get("attachmentId")})
        return REGISTER

    monkeypatch.setattr(GmailSyncService, "gmail_attachment_bytes", fake_bytes)

    got = await client.get(f"{_base(ws)}/tickets/{ticket_id}/attachments/0", headers=h)

    assert got.status_code == 200, got.text
    assert got.content == REGISTER
    # Fetched from the message the file arrived on, by its own handle — never
    # from anything the caller supplied.
    assert asked == {"message_id": "msg-1", "attachment_id": "att-1"}
    # A browser has to save this rather than render it, and the name has to
    # survive the spaces in it.
    disposition = got.headers["content-disposition"]
    assert disposition.startswith("attachment;")
    assert "Tata%20AI%20Loader%20LOT%205%20AUG%202026.xlsx" in disposition
    # One person's document: not something a shared cache should keep.
    assert "no-store" in got.headers["cache-control"]
    # The content type is whatever the sender's MIME part claimed, so the two
    # headers that stop it being rendered on our own origin have to be there.
    assert got.headers["x-content-type-options"] == "nosniff"


@pytest.mark.asyncio
async def test_file_without_a_provider_handle_is_refused_not_offered(
    client, db_session, desk
):
    """Mail that arrived before handles were captured has no bytes to fetch."""
    ticket_id = await _ticket_with_attachments(
        client,
        db_session,
        desk,
        [{"filename": "old.pdf", "content_type": "application/pdf", "size_bytes": 12}],
    )
    ws, h = desk["ws"].id, desk["headers"]

    detail = (await client.get(f"{_base(ws)}/tickets/{ticket_id}", headers=h)).json()
    # The UI is told not to offer it, and the endpoint refuses if it does anyway.
    assert detail["attachments"][0]["can_forward"] is False

    refused = await client.get(f"{_base(ws)}/tickets/{ticket_id}/attachments/0", headers=h)
    assert refused.status_code == 400
    assert "original email" in refused.json()["detail"]


@pytest.mark.asyncio
async def test_unknown_index_is_a_404(client, db_session, desk):
    ticket_id = await _ticket_with_attachments(client, db_session, desk, [])
    ws, h = desk["ws"].id, desk["headers"]

    assert (await client.get(f"{_base(ws)}/tickets/{ticket_id}/attachments/0", headers=h)).status_code == 404
    assert (await client.get(f"{_base(ws)}/tickets/{ticket_id}/attachments/7", headers=h)).status_code == 404


@pytest.mark.asyncio
async def test_a_stranger_cannot_reach_another_workspaces_attachment(
    client, db_session, desk
):
    """Somebody outside the workspace is stopped by the module guard.

    This is the outer gate, not the row scope: the request never reaches
    ``load_attachment``, so the assertion is the app-access 403 rather than the
    404 an *in-scope-less member* gets. That second case — knowing the id of a
    peer's ticket — is pinned alongside every other by-id path in
    ``test_kam_reaching_a_peer_ticket_by_id_gets_404_everywhere``, where the
    fixture has the roles to exercise it properly.
    """
    ticket_id = await _ticket_with_attachments(
        client,
        db_session,
        desk,
        [
            {
                "filename": "register.csv",
                "size_bytes": len(REGISTER),
                "attachment_id": "att-1",
                "message_id": "msg-1",
            }
        ],
    )
    outsider = Developer(id=str(uuid4()), email=f"other-{uuid4().hex[:6]}@example.com", name="Outsider")
    db_session.add(outsider)
    await db_session.commit()

    blocked = await client.get(
        f"{_base(desk['ws'].id)}/tickets/{ticket_id}/attachments/0", headers=_auth(outsider.id)
    )
    assert blocked.status_code == 403
    assert blocked.content != REGISTER


@pytest.mark.asyncio
async def test_logging_a_call_never_waits_on_the_model(client, db_session, desk, monkeypatch):
    """Manual logging must not call an LLM, even with AI classification on.

    It used to, inside the request, and then threw the answer away: the lines
    below this in ``create_manual_ticket`` overwrite request type, product and
    account with what the operator typed. The only thing the call bought was the
    seconds the operator spent watching a spinner with a caller on the line.
    """
    from aexy.llm import gateway

    ws, h = desk["ws"].id, desk["headers"]
    assert (await client.patch(
        _base(ws) + "/settings", headers=h, json={"ai_classification_enabled": True}
    )).status_code == 200

    # Recorded rather than raised: ``_classify`` wraps its whole body in a bare
    # ``except Exception`` — enrichment is best-effort — so an assertion thrown
    # from here would be swallowed and this test would pass on a path that does
    # call the model. The counter is the only thing that cannot be swallowed.
    reached: list[str] = []

    def spy_gateway():
        reached.append("gateway")
        raise RuntimeError("no LLM is reachable from a test")

    monkeypatch.setattr(gateway, "get_llm_gateway", spy_gateway)

    created = await client.post(
        _base(ws) + "/tickets/manual",
        headers=h,
        json={"subject": "Policy status", "body": "Please check", "request_type": "claims"},
    )

    assert created.status_code == 201, created.text
    assert reached == [], "manual ticket logging must not call the LLM gateway"
    detail = (await client.get(f"{_base(ws)}/tickets/{created.json()['ticket_id']}", headers=h)).json()
    assert detail["request_type"] == "claims"
    # And it is not flagged for triage: triage asks a human for the request type,
    # and the human who would answer is the one who just filled the form in.
    assert detail["needs_triage"] is False
