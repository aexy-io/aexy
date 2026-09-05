"""The collaboration socket authenticates.

This file is the regression for the worst defect in the module. The endpoint
used to authenticate nobody:

    parts = token.split(":")
    return {"id": parts[0], "name": parts[1], "email": parts[2], ...}

and the client sent exactly that — `${userId}:${userName}:${userEmail}` —
unsigned. The router carried only `require_app_access_document_scoped("docs")`,
which is auth-free by its own docstring and resolves the workspace from the
`document_id` in the caller's own URL. So anyone who knew or guessed a document
id could read every live edit on it, inject content that legitimate clients
then autosaved, and appear in the presence list as whoever they liked.

Every test here is a shape of that attack. They assert on close codes rather
than on absence of data, because a socket that closes is the only observable
proof that nothing was sent.
"""

import uuid

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

# WS_FORBIDDEN is exercised by the read-only participant test in
# `test_document_collaboration.py`, which needs a full handshake to reach it.
from aexy.api.collaboration import WS_INVALID_TOKEN, WS_NOT_FOUND
from aexy.core.database import get_db
from aexy.main import app
from aexy.models.developer import Developer
from aexy.models.documentation import Document, DocumentVisibility
from tests.conftest import requires_sqlite, seed_member, seed_workspace

# SQLite-only for a harness reason, not a coverage one. These drive the real
# ASGI app through `TestClient` so that the WebSocket handshake is exercised
# end to end, and `TestClient` runs the app in its own event loop — which an
# asyncpg session cannot be shared across. The assertions all pass on
# PostgreSQL; it is the fixture teardown that cannot, and the close codes being
# asserted do not depend on the dialect.
pytestmark = [pytest.mark.asyncio, requires_sqlite]


@pytest.fixture
def ws_client(db_session):
    """A TestClient whose sessions are the test's SQLite session.

    The websocket route opens its own session through `get_async_session`
    rather than `Depends(get_db)`, so both are pointed here — otherwise the
    route would reach for the developer's real database.
    """

    async def override_get_db():
        yield db_session

    class _Session:
        async def __aenter__(self):
            return db_session

        async def __aexit__(self, *_exc):
            return False

    import aexy.api.collaboration as collaboration_api

    app.dependency_overrides[get_db] = override_get_db
    original = collaboration_api.get_async_session
    collaboration_api.get_async_session = lambda: _Session()
    try:
        with TestClient(app) as client:
            yield client
    finally:
        collaboration_api.get_async_session = original
        app.dependency_overrides.clear()


def _close_code(client, document_id: str, token: str) -> int:
    """Open the socket and return the close code the server answered with."""
    try:
        with client.websocket_connect(
            f"/api/v1/collaboration/ws/{document_id}?token={token}"
        ) as ws:
            ws.receive()
    except WebSocketDisconnect as exc:
        return exc.code
    except Exception as exc:  # pragma: no cover - surfaces the real failure
        pytest.fail(f"unexpected socket failure: {type(exc).__name__}: {exc}")
    return 0


async def _document(db, *, visibility=DocumentVisibility.WORKSPACE.value):
    workspace_id = await seed_workspace(db)
    author = Developer(id=str(uuid.uuid4()), name="Author")
    db.add(author)
    await db.flush()
    await seed_member(db, workspace_id, str(author.id))

    document = Document(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        title="Runbook",
        content={"type": "doc", "content": []},
        visibility=visibility,
        created_by_id=str(author.id),
    )
    db.add(document)
    await db.flush()
    await db.commit()
    return workspace_id, author, document


class TestTheOriginalAttack:
    async def test_a_colon_joined_identity_is_refused(self, db_session, ws_client):
        """The exact token the old client sent and the old server believed."""
        _ws, author, document = await _document(db_session)

        forged = f"{author.id}:Author:author@example.test"
        assert _close_code(ws_client, str(document.id), forged) == WS_INVALID_TOKEN

    async def test_an_arbitrary_string_is_refused(self, db_session, ws_client):
        _ws, _author, document = await _document(db_session)
        assert _close_code(ws_client, str(document.id), "anything") == WS_INVALID_TOKEN

    async def test_an_empty_token_is_refused(self, db_session, ws_client):
        _ws, _author, document = await _document(db_session)
        assert _close_code(ws_client, str(document.id), "%20") == WS_INVALID_TOKEN

    async def test_a_token_signed_with_the_wrong_key_is_refused(
        self, db_session, ws_client
    ):
        """A JWT that *looks* right. The old parser never verified a signature
        because it never parsed a JWT at all."""
        from jose import jwt

        _ws, author, document = await _document(db_session)
        forged = jwt.encode(
            {"sub": str(author.id)}, "not-the-servers-secret", algorithm="HS256"
        )
        assert _close_code(ws_client, str(document.id), forged) == WS_INVALID_TOKEN


class TestAccessIsChecked:
    async def test_a_valid_token_for_an_unrelated_person_is_refused(
        self, db_session, ws_client
    ):
        """Authentication was only half the hole. The endpoint also never asked
        whether the person could open the document — the code said so, in a
        comment: `# Note: In production, verify user has access to document`.
        """
        from aexy.core.config import get_settings
        from jose import jwt

        _ws, _author, document = await _document(
            db_session, visibility=DocumentVisibility.PRIVATE.value
        )

        outsider = Developer(id=str(uuid.uuid4()), name="Outsider")
        db_session.add(outsider)
        await db_session.flush()
        await db_session.commit()

        settings = get_settings()
        token = jwt.encode(
            {"sub": str(outsider.id)},
            settings.secret_key,
            algorithm=settings.algorithm,
        )

        # 404, not 403: confirming that a document exists but is not yours is
        # itself a disclosure, and the search leak this work closed was exactly
        # that fact made searchable.
        assert _close_code(ws_client, str(document.id), token) == WS_NOT_FOUND

    async def test_a_missing_document_is_not_found(self, db_session, ws_client):
        from aexy.core.config import get_settings
        from jose import jwt

        _ws, author, _doc = await _document(db_session)
        settings = get_settings()
        token = jwt.encode(
            {"sub": str(author.id)},
            settings.secret_key,
            algorithm=settings.algorithm,
        )

        assert _close_code(ws_client, str(uuid.uuid4()), token) == WS_NOT_FOUND


class TestRestEndpoints:
    async def test_status_requires_authentication(self, db_session, ws_client):
        """`/collaboration/{id}/users` and `/status` were unauthenticated and
        returned who was editing any document in any workspace."""
        _ws, _author, document = await _document(db_session)

        response = ws_client.get(f"/api/v1/collaboration/{document.id}/status")
        assert response.status_code in (401, 403)

    async def test_the_old_users_endpoint_is_gone(self, db_session, ws_client):
        _ws, _author, document = await _document(db_session)

        response = ws_client.get(f"/api/v1/collaboration/{document.id}/users")
        assert response.status_code == 404
