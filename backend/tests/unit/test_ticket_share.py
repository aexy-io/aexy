"""Tests for public ticket share links."""

import io
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from aexy.api.public_tickets import shared_ticket_to_response
from aexy.models.ticketing import Ticket, TicketResponse, TicketStatus
from aexy.services.ticket_service import TicketService


async def _make_ticket(db_session, **overrides) -> Ticket:
    """Insert a minimal ticket (FKs are not enforced under SQLite)."""
    ticket = Ticket(
        id=str(uuid4()),
        form_id=str(uuid4()),
        workspace_id=str(uuid4()),
        ticket_number=overrides.get("ticket_number", 1),
        submitter_name=overrides.get("submitter_name", "Jane"),
        field_values=overrides.get("field_values", {"title": "Cannot log in"}),
        status=TicketStatus.NEW.value,
    )
    db_session.add(ticket)
    await db_session.flush()
    return ticket


@pytest.mark.asyncio
async def test_create_and_resolve_share_link(db_session):
    service = TicketService(db_session)
    ticket = await _make_ticket(db_session)

    link = await service.create_or_enable_share_link(ticket, created_by_id=None)
    assert link.is_active
    assert link.token

    resolved, resolved_link = await service.get_shared_ticket(link.token)
    assert resolved.id == ticket.id
    # Access bumps the use counter.
    assert resolved_link.use_count == 1


@pytest.mark.asyncio
async def test_unknown_token_raises_not_found(db_session):
    service = TicketService(db_session)
    with pytest.raises(ValueError, match="not_found"):
        await service.get_shared_ticket("does-not-exist")


@pytest.mark.asyncio
async def test_disabled_link_is_not_found(db_session):
    service = TicketService(db_session)
    ticket = await _make_ticket(db_session)
    link = await service.create_or_enable_share_link(ticket)

    await service.update_share_link(ticket.id, is_active=False)
    with pytest.raises(ValueError, match="not_found"):
        await service.get_shared_ticket(link.token)


@pytest.mark.asyncio
async def test_expired_link(db_session):
    service = TicketService(db_session)
    ticket = await _make_ticket(db_session)
    link = await service.create_or_enable_share_link(
        ticket, expires_at=datetime.now(timezone.utc) - timedelta(days=1)
    )
    with pytest.raises(ValueError, match="expired"):
        await service.get_shared_ticket(link.token)


@pytest.mark.asyncio
async def test_max_uses_exhausted(db_session):
    service = TicketService(db_session)
    ticket = await _make_ticket(db_session)
    link = await service.create_or_enable_share_link(ticket, max_uses=1)

    # First access is allowed and consumes the single use.
    await service.get_shared_ticket(link.token)
    with pytest.raises(ValueError, match="exhausted"):
        await service.get_shared_ticket(link.token)


@pytest.mark.asyncio
async def test_password_protected_link(db_session):
    service = TicketService(db_session)
    ticket = await _make_ticket(db_session)
    link = await service.create_or_enable_share_link(ticket, password="hunter2")

    with pytest.raises(ValueError, match="password_required"):
        await service.get_shared_ticket(link.token)
    with pytest.raises(ValueError, match="invalid_password"):
        await service.get_shared_ticket(link.token, password="wrong")

    resolved, _ = await service.get_shared_ticket(link.token, password="hunter2")
    assert resolved.id == ticket.id


@pytest.mark.asyncio
async def test_regenerate_rotates_token(db_session):
    service = TicketService(db_session)
    ticket = await _make_ticket(db_session)
    link = await service.create_or_enable_share_link(ticket)
    old_token = link.token

    updated = await service.update_share_link(ticket.id, regenerate=True)
    assert updated.token != old_token
    assert updated.use_count == 0

    with pytest.raises(ValueError, match="not_found"):
        await service.get_shared_ticket(old_token)


@pytest.mark.asyncio
async def test_revoke_share_link(db_session):
    service = TicketService(db_session)
    ticket = await _make_ticket(db_session)
    link = await service.create_or_enable_share_link(ticket)

    assert await service.revoke_share_link(ticket.id) is True
    with pytest.raises(ValueError, match="not_found"):
        await service.get_shared_ticket(link.token)


@pytest.mark.asyncio
async def test_public_view_hides_internal_notes(db_session):
    service = TicketService(db_session)
    ticket = await _make_ticket(db_session)
    ticket.attachments = [
        {"filename": "screenshot.png", "url": "https://x/s.png", "size": 10, "type": "image/png"}
    ]

    db_session.add(
        TicketResponse(
            id=str(uuid4()),
            ticket_id=ticket.id,
            is_internal=True,
            content="secret internal note",
        )
    )
    db_session.add(
        TicketResponse(
            id=str(uuid4()),
            ticket_id=ticket.id,
            author_email="jane@example.com",
            is_internal=False,
            content="public reply",
            attachments=[{"filename": "log.txt", "url": "https://x/l.txt", "size": 5, "type": "text/plain"}],
        )
    )
    await db_session.flush()

    # Re-fetch so responses are eagerly loaded, then build the public view.
    fetched = await service.get_ticket(ticket.id)
    view = shared_ticket_to_response(fetched, can_reply=False)

    contents = [r.content for r in view.responses]
    assert "public reply" in contents
    assert "secret internal note" not in contents
    assert view.subject == "Cannot log in"
    # Attachments flow through at both the ticket and reply level.
    assert view.attachments[0]["filename"] == "screenshot.png"
    public_reply = next(r for r in view.responses if r.content == "public reply")
    assert public_reply.attachments[0]["filename"] == "log.txt"


class _FakeStorage:
    """In-memory stand-in for the S3 storage service."""

    def __init__(self):
        self.objects: dict[str, tuple[bytes, str]] = {}

    def is_configured(self):
        return True

    def upload_fileobj(self, key, fileobj, content_type):
        fileobj.seek(0)
        self.objects[key] = (fileobj.read(), content_type)
        return True

    def get_object(self, key):
        return self.objects.get(key)

    def get_object_stream(self, key, byte_range=None, chunk_size=256 * 1024):
        obj = self.objects.get(key)
        if obj is None:
            return None
        data, ctype = obj
        if byte_range is not None:
            start, end = byte_range
            end = len(data) - 1 if end is None else end
            chunk = data[start : end + 1]
            return {
                "iter": iter([chunk]),
                "content_type": ctype,
                "content_length": len(chunk),
                "content_range": f"bytes {start}-{end}/{len(data)}",
            }
        return {
            "iter": iter([data]),
            "content_type": ctype,
            "content_length": len(data),
            "content_range": None,
        }

    async def delete_object(self, key):
        self.objects.pop(key, None)
        return True

    def key_from_url(self, url):
        return None


def _file(name, ctype, data):
    """Build an (filename, content_type, fileobj, size) upload tuple."""
    return (name, ctype, io.BytesIO(data), len(data))


@pytest.fixture
def fake_storage(mocker):
    storage = _FakeStorage()
    mocker.patch("aexy.services.ticket_service.get_storage_service", return_value=storage)
    mocker.patch("aexy.api.tickets.get_storage_service", return_value=storage)
    return storage


@pytest.mark.asyncio
async def test_upload_stores_key_and_public_view_hides_it(db_session, fake_storage):
    service = TicketService(db_session)
    ticket = await _make_ticket(db_session)

    created = await service.add_ticket_attachments(
        ticket, [_file("shot.png", "image/png", b"imgbytes")]
    )
    assert len(created) == 1
    meta = created[0]
    assert meta["key"] in fake_storage.objects  # uploaded to storage
    assert meta["id"] and meta["filename"] == "shot.png"

    # The public view exposes id/filename/size/type but never the storage key.
    fetched = await service.get_ticket(ticket.id)
    view = shared_ticket_to_response(fetched, can_reply=False)
    assert view.attachments[0]["id"] == meta["id"]
    assert "key" not in view.attachments[0]


@pytest.mark.asyncio
async def test_find_attachment_excludes_internal_responses(db_session, fake_storage):
    service = TicketService(db_session)
    ticket = await _make_ticket(db_session)

    internal = TicketResponse(
        id=str(uuid4()),
        ticket_id=ticket.id,
        is_internal=True,
        content="internal",
        attachments=[{"id": "att-internal", "filename": "secret.pdf", "key": "k/secret"}],
    )
    public = TicketResponse(
        id=str(uuid4()),
        ticket_id=ticket.id,
        is_internal=False,
        content="public",
        attachments=[{"id": "att-public", "filename": "ok.pdf", "key": "k/ok"}],
    )
    db_session.add_all([internal, public])
    await db_session.flush()

    fetched = await service.get_ticket(ticket.id)
    # Public callers can fetch public-response attachments but not internal ones.
    assert service.find_ticket_attachment(fetched, "att-public") is not None
    assert service.find_ticket_attachment(fetched, "att-internal") is None
    # Staff (include_internal) can fetch either.
    assert service.find_ticket_attachment(fetched, "att-internal", include_internal=True) is not None


@pytest.mark.asyncio
async def test_stream_attachment_serves_bytes(db_session, fake_storage):
    from aexy.api.tickets import stream_attachment

    service = TicketService(db_session)
    ticket = await _make_ticket(db_session)
    created = await service.add_ticket_attachments(
        ticket, [_file("a.png", "image/png", b"hello")]
    )
    resp = stream_attachment(created[0])
    assert resp.media_type == "image/png"


@pytest.mark.asyncio
async def test_stream_attachment_range_returns_206(db_session, fake_storage):
    from aexy.api.tickets import stream_attachment

    service = TicketService(db_session)
    ticket = await _make_ticket(db_session)
    created = await service.add_ticket_attachments(
        ticket, [_file("a.bin", "application/octet-stream", b"0123456789")]
    )
    resp = stream_attachment(created[0], range_header="bytes=2-5")
    assert resp.status_code == 206
    assert resp.headers["Content-Range"] == "bytes 2-5/10"
    assert resp.headers["Content-Length"] == "4"
    assert resp.headers["Accept-Ranges"] == "bytes"


@pytest.mark.asyncio
async def test_upload_rejects_oversized_file(db_session, fake_storage, monkeypatch):
    from aexy.services import ticket_service as ts_module

    # Shrink the cap to 1 byte so a tiny file trips it.
    monkeypatch.setattr(ts_module.settings, "ticket_max_attachment_mb", 0)
    service = TicketService(db_session)
    ticket = await _make_ticket(db_session)

    # 0 MB cap → any non-empty file exceeds it.
    with pytest.raises(ValueError, match="too_large"):
        await service.add_ticket_attachments(
            ticket, [("big.bin", "application/octet-stream", io.BytesIO(b"xx"), 2)]
        )


@pytest.mark.asyncio
async def test_stream_missing_object_404(db_session, fake_storage):
    from fastapi import HTTPException
    from aexy.api.tickets import stream_attachment

    with pytest.raises(HTTPException) as exc:
        stream_attachment({"id": "x", "filename": "gone.png", "key": "missing/key"})
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_remove_attachment_deletes_from_storage(db_session, fake_storage):
    service = TicketService(db_session)
    ticket = await _make_ticket(db_session)
    created = await service.add_ticket_attachments(ticket, [_file("a.png", "image/png", b"x")])
    key = created[0]["key"]
    assert key in fake_storage.objects

    ok = await service.remove_ticket_attachment(ticket, created[0]["id"])
    assert ok is True
    assert key not in fake_storage.objects
    assert await service.remove_ticket_attachment(ticket, created[0]["id"]) is False


@pytest.mark.asyncio
async def test_attachment_proxy_blocked_when_link_revoked(db_session, fake_storage):
    from aexy.api.public_tickets import get_shared_ticket_attachment
    from fastapi import HTTPException

    service = TicketService(db_session)
    ticket = await _make_ticket(db_session)
    created = await service.add_ticket_attachments(ticket, [_file("a.png", "image/png", b"x")])
    link = await service.create_or_enable_share_link(ticket)

    # Valid link → streams.
    resp = await get_shared_ticket_attachment(
        token=link.token, attachment_id=created[0]["id"], password=None, range_header=None, db=db_session
    )
    assert resp.media_type == "image/png"

    # Revoked link → 404.
    await service.revoke_share_link(ticket.id)
    with pytest.raises(HTTPException) as exc:
        await get_shared_ticket_attachment(
            token=link.token, attachment_id=created[0]["id"], password=None, db=db_session
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_auto_share_on_default_form(db_session):
    from aexy.models.ticketing import TicketForm
    from aexy.schemas.ticketing import PublicTicketSubmission

    # A real workspace row, because `create_ticket` allocates the ticket number
    # from a counter on it. It used to be `max(ticket_number) + 1`, which happily
    # numbered into a workspace that did not exist — the FK would have caught it
    # on a real database, but not under SQLite, so this test passed on a ticket
    # that could never have been created in production.
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace

    owner = Developer(id=str(uuid4()), name="Owner", email="owner@example.com")
    db_session.add(owner)
    await db_session.flush()
    workspace = Workspace(
        id=str(uuid4()), name="Acme", slug="acme", owner_id=owner.id
    )
    db_session.add(workspace)
    await db_session.flush()
    workspace_id = workspace.id

    form = TicketForm(
        id=str(uuid4()),
        workspace_id=workspace_id,
        name="Bug Reports",
        slug="bug-reports",
        default_share_enabled=True,
    )
    db_session.add(form)
    await db_session.flush()

    service = TicketService(db_session)
    ticket = await service.create_ticket(
        form_id=form.id,
        workspace_id=workspace_id,
        submission=PublicTicketSubmission(field_values={"title": "boom"}),
    )

    link = await service.get_share_link(ticket.id)
    assert link is not None
    assert link.is_active
