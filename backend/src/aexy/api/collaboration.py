"""WebSocket endpoint for real-time document collaboration.

This file used to authenticate nobody. `validate_token_and_get_user` split the
`token` query parameter on `:` and returned the pieces as a user:

    parts = token.split(":")
    return {"id": parts[0], "name": parts[1], "email": parts[2], ...}

and the client sent exactly that, unsigned. The router carried only
`require_app_access_document_scoped("docs")`, which by its own docstring is
auth-free and checks that the *workspace* has the docs app enabled — resolving
that workspace from the `document_id` in the attacker's own URL. So anyone who
knew or guessed a document id could read every live edit on it, inject content
that legitimate clients would then autosave, and appear in the presence list as
whoever they liked. Two further REST endpoints returned, unauthenticated, who
was editing any document.

Now: a real signed token, verified by the same code the HTTP dependency uses;
`DocumentAccess` decides whether the socket opens at all and whether it may
write; and the server holds the document rather than relaying bytes between
clients. See `services/document_collaboration.py` for that half.
"""

from __future__ import annotations

import asyncio
import logging
import uuid

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer, verify_token
from aexy.core.database import get_async_session, get_db
from aexy.models.developer import Developer
from aexy.models.documentation import Document
from aexy.services.document_access import AccessLevel, DocumentAccess
from aexy.services.document_approval import DocumentApprovalService
from aexy.services.document_collaboration import (
    CollaborationError,
    Participant,
    get_room,
    release_room,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/collaboration", tags=["collaboration"])


# Close codes. 4001/4003/4004 rather than a generic 1008 so the client can tell
# "log in again" from "you may not open this" from "it is gone" and stop
# retrying on the two that will never succeed.
WS_INVALID_TOKEN = 4001
WS_FORBIDDEN = 4003
WS_NOT_FOUND = 4004
#: The space reviews changes, so there is no live room to join. Its own code
#: because the editor must render it as an explanation rather than an error —
#: the document is perfectly editable, just not collaboratively.
WS_REVIEWED_SPACE = 4005

_PALETTE = [
    "#f87171",
    "#fb923c",
    "#fbbf24",
    "#a3e635",
    "#34d399",
    "#22d3ee",
    "#60a5fa",
    "#a78bfa",
    "#f472b6",
]


def user_color(developer_id: str) -> str:
    """A stable colour per person, so their caret does not change hue between
    sessions."""
    return _PALETTE[sum(ord(c) for c in developer_id) % len(_PALETTE)]


@router.websocket("/ws/{document_id}")
async def document_websocket(
    websocket: WebSocket,
    document_id: str,
    token: str = Query(..., description="A bearer token — the same one the REST API takes"),
):
    """Collaborative editing socket, speaking the standard y-protocol.

    The token arrives as a query parameter because browsers cannot set headers
    on a WebSocket handshake. It is a real signed token and is verified as one;
    the previous implementation's "token" was a colon-joined user id and name
    supplied by the client.
    """
    async with get_async_session() as db:
        identity = await verify_token(token, db)
        if identity is None:
            await websocket.close(code=WS_INVALID_TOKEN, reason="Invalid token")
            return
        developer_id, _actor = identity

        document = (
            await db.execute(select(Document).where(Document.id == document_id))
        ).scalar_one_or_none()
        if document is None or document.deleted_at is not None:
            await websocket.close(code=WS_NOT_FOUND, reason="Document not found")
            return

        if document.is_docx:
            # A Word document's body is a file; there is no CRDT to share and
            # flattening one into it would produce a document whose two bodies
            # disagree.
            await websocket.close(
                code=WS_FORBIDDEN, reason="Word documents are edited through their own endpoints"
            )
            return

        level = await DocumentAccess(db).resolve(document, developer_id)
        if level == AccessLevel.NONE:
            # Same 404-shaped answer the REST API gives: confirming that a
            # document exists but is not yours is itself a disclosure.
            await websocket.close(code=WS_NOT_FOUND, reason="Document not found")
            return

        # A space that reviews changes does not get live co-editing, and this
        # is where that decision is enforced.
        #
        # `DocumentRoom._flatten` writes the CRDT straight through
        # `update_document` on a debounce, so a room in an approval space would
        # bypass the gate entirely — and a gate anyone can step over by opening
        # the editor is worse than no gate, because it is believed. The
        # alternative that keeps both is a draft body separate from an approved
        # one, which is a much larger change; until somebody asks for it, these
        # spaces use single-writer saves, which become proposals.
        approvals = DocumentApprovalService(db)
        policy = await approvals.policy_for(document, developer_id)
        if policy.gates:
            await websocket.close(
                code=WS_REVIEWED_SPACE,
                reason="This space reviews changes before publishing",
            )
            return

        developer = (
            await db.execute(select(Developer).where(Developer.id == developer_id))
        ).scalar_one_or_none()

        try:
            room = await get_room(document_id, str(document.workspace_id), db)
        except CollaborationError:
            await websocket.close(code=WS_NOT_FOUND, reason="Document not found")
            return

    await websocket.accept()

    participant = Participant(
        id=str(uuid.uuid4()),
        developer_id=developer_id,
        name=(developer.name if developer else "Unknown"),
        avatar_url=(getattr(developer, "avatar_url", None) if developer else None),
        color=user_color(developer_id),
        # A viewer may watch the document being edited and may not change it.
        # The old relay had no way to express this: every connection could
        # write, because every connection was just a source of bytes.
        can_write=level >= AccessLevel.EDIT,
        send=websocket.send_bytes,
    )

    flusher: asyncio.Task | None = None
    try:
        await room.join(participant)
        flusher = asyncio.create_task(_flush_loop(room))

        while True:
            message = await websocket.receive_bytes()
            try:
                await room.handle_client_message(participant, message)
            except PermissionError as exc:
                await websocket.close(code=WS_FORBIDDEN, reason=str(exc))
                break

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("collab: socket error on %s", document_id)
    finally:
        if flusher is not None:
            flusher.cancel()
        await room.leave(participant.id)
        # Flushes before dropping the room, so the last edit before the last
        # tab closed is written rather than left in a dying process's memory.
        await release_room(document_id)


async def _flush_loop(room) -> None:
    """Write the document out while people are still typing in it.

    A room that only flushed at teardown would lose everything if the process
    died, and would leave search and the AI paths reading a body from whenever
    the document was last closed.
    """
    try:
        while True:
            await asyncio.sleep(1.0)
            async with get_async_session() as db:
                try:
                    await room.flush(db)
                except Exception:
                    logger.exception("collab: flush failed for %s", room.document_id)
    except asyncio.CancelledError:
        pass


# ==================== REST ====================
#
# Both of these were unauthenticated and returned who was editing any document
# in any workspace to anyone who asked.


@router.get("/{document_id}/status")
async def get_collaboration_status(
    document_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Who is currently editing this document."""
    document = (
        await db.execute(select(Document).where(Document.id == document_id))
    ).scalar_one_or_none()
    if document is None or document.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )

    level = await DocumentAccess(db).resolve(document, str(current_user.id))
    if level == AccessLevel.NONE:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )

    from aexy.services.document_collaboration import _rooms

    room = _rooms.get(document_id)
    users = (
        [
            {
                "id": p.developer_id,
                "name": p.name,
                "avatar_url": p.avatar_url,
                "color": p.color,
                "can_write": p.can_write,
            }
            for p in room.participants.values()
        ]
        if room
        else []
    )

    return {
        "documentId": document_id,
        "users": users,
        "count": len(users),
        "can_write": level >= AccessLevel.EDIT,
    }
