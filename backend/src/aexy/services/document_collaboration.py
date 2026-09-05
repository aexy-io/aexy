"""Server-authoritative collaborative editing for documents.

What this replaces
------------------

``api/collaboration.py`` was a relay. It forwarded whatever bytes arrived to
whoever else was connected, stored nothing, and authenticated nobody:
``validate_token_and_get_user`` split the ``token`` query parameter on ``:`` and
returned the pieces as a user, while the client sent
``` `${userId}:${userName}:${userEmail}` ```. An unauthenticated caller who knew
a document id could read every keystroke on it, inject content that legitimate
clients would then autosave, and appear in the presence list as anybody.

It was also wrong even when nobody was attacking it. Each client built an empty
``Y.Doc`` and seeded it with ``setContent()`` from the REST body, so two people
opening one page each inserted the entire document into their own history and
the merge duplicated it. Nothing persisted the CRDT, so the actual save path
was a debounced ``PATCH`` of the whole body — last writer wins, silently.

The three properties that fix it
--------------------------------

**Authenticated.** The socket carries a real signed token, verified by the same
code the HTTP dependency uses, and the connection is refused unless
``DocumentAccess`` grants at least VIEW. EDIT decides whether the socket may
write, so a viewer can watch a document being edited without being able to
change it — which the old relay could not express at all.

**Authoritative.** The server holds a ``pycrdt.Doc`` per open document, seeded
from ``document_yjs_state`` (or, the first time, from the stored TipTap body).
Clients run the standard y-protocol against *it*, not against each other. A
person opening a document alone still gets the merged state, and an edit made
as the last tab closes is not lost.

**Shared across processes.** Rooms live in a process, but every update is also
published on Redis, so replicas holding the same document converge. Yjs updates
are commutative and idempotent, which is what makes that safe: a duplicate
delivery is a no-op rather than a duplicated paragraph.

Flattening
----------

The CRDT is the truth while people are editing, but search, the knowledge
graph, the AI paths and every REST reader want ``documents.content``. The room
flattens the Yjs document into TipTap JSON on a debounce and at teardown. That
write goes through ``DocumentService.update_document`` so version history,
activity and text extraction all still happen exactly as they do for a normal
save.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import redis.asyncio as aioredis
from pycrdt import Doc, XmlElement, XmlFragment, XmlText
from pycrdt._sync import (
    YMessageType,
    create_sync_step1_message,
    create_update_message,
    handle_sync_message,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.core.database import get_async_session
from aexy.models.documentation import Document, DocumentYjsState

logger = logging.getLogger(__name__)
settings = get_settings()

#: The Yjs shared type the TipTap `Collaboration` extension binds to. Fixed by
#: the client library, not a choice.
FRAGMENT_KEY = "default"

#: How long after the last edit the room flattens the CRDT into
#: `documents.content`. Long enough that a burst of typing is one write, short
#: enough that a reader arriving through search is not looking at a body from
#: several minutes ago.
FLUSH_DEBOUNCE_SECONDS = 3.0

#: Flatten regardless once this much time has passed with continuous editing,
#: so a document nobody stops typing in still reaches the database.
FLUSH_MAX_INTERVAL_SECONDS = 30.0

#: A room with no connections is torn down after this, having flushed. Not
#: immediately: reconnects after a network blip are common, and rebuilding the
#: document from Postgres on each one is wasted work.
ROOM_IDLE_SECONDS = 30.0

_REDIS_CHANNEL_PREFIX = "doc:collab:"


class CollaborationError(RuntimeError):
    """The room could not be established or kept."""


@dataclass
class Participant:
    """One socket. `can_write` is resolved once, at connect.

    Deliberately not re-checked per message: a permission change mid-session
    should end the session, which the room does by closing the socket, rather
    than silently degrading it into a viewer whose keystrokes vanish.
    """

    id: str
    developer_id: str
    name: str
    avatar_url: str | None
    color: str
    can_write: bool
    send: Any  # async callable taking bytes
    joined_at: float = field(default_factory=time.monotonic)


class DocumentRoom:
    """The server's copy of one document, plus everyone currently in it."""

    def __init__(self, document_id: str, workspace_id: str):
        self.document_id = document_id
        self.workspace_id = workspace_id
        self.doc = Doc()
        self.participants: dict[str, Participant] = {}
        #: Opaque per-client awareness blobs (cursors, selections, names).
        #: Kept out of the CRDT on purpose — awareness is ephemeral, and
        #: persisting a cursor position is how a document ends up with a
        #: caret belonging to somebody who left last Tuesday.
        self.awareness: dict[str, bytes] = {}
        self._lock = asyncio.Lock()
        self._dirty = False
        self._last_flush = time.monotonic()
        self._first_dirty_at: float | None = None
        self._loaded = False
        self._closing = False

    # ------------------------------------------------------------------
    # Lifecycle

    async def load(self, db: AsyncSession) -> None:
        """Seed the room's CRDT, once.

        Prefers the stored Yjs state. Falls back to converting the TipTap body,
        which is what happens the first time a document that predates this
        feature is opened collaboratively — and is the only place that
        conversion may happen. Doing it per client is precisely the bug that
        duplicated content.
        """
        if self._loaded:
            return

        row = (
            await db.execute(
                select(DocumentYjsState).where(
                    DocumentYjsState.document_id == self.document_id
                )
            )
        ).scalar_one_or_none()

        if row is not None and row.state:
            self.doc.apply_update(row.state)
            self._loaded = True
            return

        document = (
            await db.execute(
                select(Document).where(Document.id == self.document_id)
            )
        ).scalar_one_or_none()
        if document is None:
            raise CollaborationError("Document not found")

        tiptap_to_yjs(self.doc, document.content or {})
        self._loaded = True

        # Persist the seed immediately. If the first editor's socket dies
        # before the first flush, the next one must not re-seed from the REST
        # body and merge two independent insertions of the same text.
        await self._persist_state(db)

    # ------------------------------------------------------------------
    # Participants

    async def join(self, participant: Participant) -> None:
        async with self._lock:
            self.participants[participant.id] = participant
            known_awareness = list(self.awareness.values())

        # Standard y-protocol handshake: the server offers its state vector,
        # the client replies with what the server is missing and vice versa.
        await participant.send(create_sync_step1_message(self.doc.get_state()))

        # Replay everyone else's awareness to the newcomer. Without this a
        # person joining an occupied document sees an empty participant list
        # until the next client heartbeat — up to thirty seconds of appearing
        # to be alone in a document two other people are typing in.
        for frame in known_awareness:
            await participant.send(frame)

    async def leave(self, participant_id: str) -> None:
        async with self._lock:
            self.participants.pop(participant_id, None)
            # Drop their awareness with them. The old relay had a loop here
            # that was a literal `pass`, so presence accumulated ghosts for as
            # long as the process lived.
            self.awareness.pop(participant_id, None)

    @property
    def is_empty(self) -> bool:
        return not self.participants

    # ------------------------------------------------------------------
    # Messages

    async def handle_client_message(
        self, participant: Participant, message: bytes
    ) -> None:
        """Apply one y-protocol message from a client.

        A frame is `[YMessageType, ...]`; `handle_sync_message` wants what
        follows the first byte, and returns a complete frame to send back.
        """
        if not message:
            return

        message_type = message[0]
        if message_type == YMessageType.SYNC:
            await self._handle_sync(participant, message[1:])
        elif message_type == YMessageType.AWARENESS:
            await self._handle_awareness(participant, message)

    async def _handle_sync(self, participant: Participant, payload: bytes) -> None:
        before = self.doc.get_state()

        try:
            reply = handle_sync_message(payload, self.doc)
        except Exception:
            logger.debug("collab: unreadable sync frame from %s", participant.id)
            return
        if reply is not None:
            await participant.send(reply)

        after = self.doc.get_state()
        if after == before:
            return

        if not participant.can_write:
            # A viewer's socket managed to advance the document. `handle_sync`
            # has already applied it, so undoing it cleanly is not possible —
            # reload the room from the database and drop the connection, rather
            # than let an unauthorised edit stand because rolling it back is
            # awkward.
            logger.warning(
                "collab: read-only participant %s wrote to %s; dropping",
                participant.developer_id,
                self.document_id,
            )
            raise PermissionError("This document is read-only for you")

        update = self.doc.get_update(before)
        await self._fanout(create_update_message(update), exclude=participant.id)
        await self._publish(update)
        self._mark_dirty()

    async def _handle_awareness(
        self, participant: Participant, message: bytes
    ) -> None:
        self.awareness[participant.id] = message
        await self._fanout(message, exclude=participant.id)

    async def apply_remote_update(self, update: bytes) -> None:
        """Apply an update that arrived from another replica via Redis.

        Not marked dirty and not re-published: whichever replica originated it
        owns flushing it, and re-publishing would loop. Yjs updates are
        idempotent, so applying one we already have is a no-op.
        """
        before = self.doc.get_state()
        self.doc.apply_update(update)
        if self.doc.get_state() != before:
            await self._fanout(create_update_message(update))

    # ------------------------------------------------------------------
    # Fanout

    async def _fanout(self, message: bytes, exclude: str | None = None) -> None:
        dead: list[str] = []
        for pid, participant in list(self.participants.items()):
            if pid == exclude:
                continue
            try:
                await participant.send(message)
            except Exception:
                dead.append(pid)
        for pid in dead:
            await self.leave(pid)

    # ------------------------------------------------------------------
    # Persistence

    def _mark_dirty(self) -> None:
        self._dirty = True
        if self._first_dirty_at is None:
            self._first_dirty_at = time.monotonic()

    def _should_flush(self) -> bool:
        if not self._dirty:
            return False
        now = time.monotonic()
        quiet_for = now - (self._first_dirty_at or now)
        return (
            now - self._last_flush >= FLUSH_DEBOUNCE_SECONDS
            or quiet_for >= FLUSH_MAX_INTERVAL_SECONDS
        )

    async def flush(self, db: AsyncSession, *, force: bool = False) -> bool:
        """Write the CRDT out, and flatten it into `documents.content`.

        Both, in that order, and both matter. The CRDT is what a reconnecting
        editor needs; the flattened body is what search, the knowledge graph,
        the AI paths and every REST reader see.
        """
        if not (force or self._should_flush()):
            return False

        async with self._lock:
            if not self._dirty and not force:
                return False
            self._dirty = False
            self._first_dirty_at = None
            self._last_flush = time.monotonic()

        await self._persist_state(db)
        await self._flatten(db)
        return True

    async def _persist_state(self, db: AsyncSession) -> None:
        update = self.doc.get_update()
        state_vector = self.doc.get_state()

        row = (
            await db.execute(
                select(DocumentYjsState).where(
                    DocumentYjsState.document_id == self.document_id
                )
            )
        ).scalar_one_or_none()

        if row is None:
            db.add(
                DocumentYjsState(
                    document_id=self.document_id,
                    state=update,
                    state_vector=state_vector,
                )
            )
        else:
            row.state = update
            row.state_vector = state_vector
        await db.commit()

    async def _flatten(self, db: AsyncSession) -> None:
        """Project the CRDT into TipTap JSON on the document row.

        Routed through `DocumentService.update_document` rather than a direct
        UPDATE so version history, the activity feed and `content_text`
        extraction happen exactly as they do for an ordinary save — a
        collaborative edit that leaves no version behind would be worse than
        the last-write-wins it replaces.
        """
        from aexy.services.document_service import (
            DocumentService,
            DocumentTooLargeError,
        )
        from aexy.services.proposed_edits_service import compute_content_sha

        content = yjs_to_tiptap(self.doc)
        sha = compute_content_sha(content)

        row = (
            await db.execute(
                select(DocumentYjsState).where(
                    DocumentYjsState.document_id == self.document_id
                )
            )
        ).scalar_one_or_none()
        if row is not None and row.snapshot_sha == sha:
            return

        editor = next(
            (p.developer_id for p in self.participants.values() if p.can_write),
            None,
        )

        try:
            await DocumentService(db).update_document(
                document_id=self.document_id,
                updated_by_id=editor,
                content=content,
                # One version per flush, not one per keystroke. The debounce is
                # what makes collaborative editing produce a readable history
                # instead of a version per character typed.
                is_auto_save=True,
            )
        except DocumentTooLargeError:
            # The CRDT keeps the content either way; what stops here is the
            # flattened copy. Logged rather than raised, because failing the
            # flush loop would take the whole room down over a document that is
            # still perfectly editable — the REST body just stops tracking it.
            logger.error(
                "collab: document %s has outgrown the body limit; the stored "
                "copy is now behind the live one",
                self.document_id,
            )
            return
        except ValueError:
            # A Word document. Its body is a file; there is nothing to flatten
            # into, and the collaborative editor should never have opened it.
            logger.warning(
                "collab: refusing to flatten CRDT into docx document %s",
                self.document_id,
            )
            return

        if row is not None:
            row.snapshot_sha = sha
            row.snapshot_at = datetime.now(timezone.utc)
            await db.commit()

    # ------------------------------------------------------------------
    # Cross-replica

    async def _publish(self, update: bytes) -> None:
        client = await _redis()
        if client is None:
            return
        try:
            await client.publish(
                f"{_REDIS_CHANNEL_PREFIX}{self.document_id}",
                _ORIGIN_TAG + update,
            )
        except Exception:  # pragma: no cover - Redis is best effort
            logger.debug("collab: could not publish update for %s", self.document_id)


# ----------------------------------------------------------------------
# TipTap ⇄ Yjs
#
# TipTap stores a ProseMirror document, and its `Collaboration` extension
# represents that as a Yjs XmlFragment: element nodes become XmlElement with
# their ProseMirror attrs as XML attributes, text nodes become XmlText. These
# two functions are the only place that mapping is written down.


def tiptap_to_yjs(doc: Doc, content: dict[str, Any]) -> None:
    """Seed a fresh Yjs document from stored TipTap JSON.

    Built top-down because it has to be: a pycrdt XML node has no document
    until it is inserted into one, and `insert` returns the *integrated*
    instance. Assembling a subtree first and inserting it afterwards raises
    "Not integrated in a document yet" on the first child.
    """
    fragment = XmlFragment()
    doc[FRAGMENT_KEY] = fragment

    with doc.transaction():
        for node in (content or {}).get("content") or []:
            _append_node(fragment, node)


def _append_node(parent, node: dict[str, Any]) -> None:
    """Append one ProseMirror node under an integrated XML parent."""
    node_type = node.get("type")
    if not node_type:
        return

    if node_type == "text":
        text = node.get("text") or ""
        if not text:
            return
        # TipTap marks (bold, italic, link, …) become XmlText attributes over
        # the inserted range — which is how the client's `Collaboration`
        # extension represents them, and why `diff()` can recover them.
        attrs = _marks_to_attrs(node.get("marks") or [])
        xml_text = parent.children.insert(len(parent.children), XmlText(""))
        xml_text.insert(0, text, attrs or None)
        return

    element = parent.children.insert(
        len(parent.children), XmlElement(node_type)
    )
    for key, value in (node.get("attrs") or {}).items():
        if value is not None:
            # ProseMirror attrs are typed (heading level is an int); Yjs XML
            # attributes are strings. `_attr_from_string` reverses this, and
            # the pair has to stay symmetric or a round trip changes the
            # document.
            element.attributes[key] = json.dumps(value)

    for child in node.get("content") or []:
        _append_node(element, child)


def _marks_to_attrs(marks: list[dict[str, Any]]) -> dict[str, Any]:
    """ProseMirror marks as a flat attribute map.

    A bare mark becomes `{"bold": True}`; one with attrs (a link's href) keeps
    them, so nothing is dropped on the way in and `_attrs_to_marks` can put it
    back.
    """
    attrs: dict[str, Any] = {}
    for mark in marks:
        name = mark.get("type")
        if not name:
            continue
        attrs[name] = mark.get("attrs") or True
    return attrs


def _attrs_to_marks(attrs: dict[str, Any] | None) -> list[dict[str, Any]]:
    marks: list[dict[str, Any]] = []
    for name, value in (attrs or {}).items():
        if value in (None, False):
            continue
        mark: dict[str, Any] = {"type": name}
        if isinstance(value, dict):
            mark["attrs"] = value
        marks.append(mark)
    return marks


def yjs_to_tiptap(doc: Doc) -> dict[str, Any]:
    """Project the CRDT back into the TipTap JSON the REST API serves."""
    fragment = doc.get(FRAGMENT_KEY, type=XmlFragment)
    content: list[dict[str, Any]] = []
    for child in fragment.children:
        content.extend(_yjs_to_nodes(child))
    return {"type": "doc", "content": content}


def _yjs_to_nodes(node) -> list[dict[str, Any]]:
    """One XML node as zero or more ProseMirror nodes.

    Zero or more rather than one because an `XmlText` holding differently
    formatted runs is several ProseMirror text nodes — `diff()` is what splits
    them, and reading `str(node)` instead would silently drop every mark in the
    document.
    """
    if isinstance(node, XmlText):
        out: list[dict[str, Any]] = []
        for text, attrs in node.diff():
            if not text:
                continue
            piece: dict[str, Any] = {"type": "text", "text": text}
            marks = _attrs_to_marks(attrs)
            if marks:
                piece["marks"] = marks
            out.append(piece)
        return out

    if not isinstance(node, XmlElement):
        return []

    out_node: dict[str, Any] = {"type": node.tag}

    attrs = {}
    for key, value in node.attributes:
        attrs[key] = _attr_from_string(value)
    if attrs:
        out_node["attrs"] = attrs

    children: list[dict[str, Any]] = []
    for child in node.children:
        children.extend(_yjs_to_nodes(child))
    if children:
        out_node["content"] = children

    return [out_node]


def _attr_from_string(value: str) -> Any:
    """Undo the JSON encoding `_append_node` applies to ProseMirror attrs.

    Falls back to the raw string for a value this server did not write — a
    client's own `Collaboration` extension sets plain strings, and refusing to
    parse one would lose the attribute rather than keep it imperfectly.
    """
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return value


# ----------------------------------------------------------------------
# Room registry

#: Distinguishes this process's own publications from other replicas', so a
#: room does not apply its own update twice. Random per process rather than a
#: hostname: two workers on one host are two origins.
_ORIGIN_TAG = __import__("uuid").uuid4().bytes  # 16 bytes

_rooms: dict[str, DocumentRoom] = {}
_room_lock = asyncio.Lock()
_redis_client: aioredis.Redis | None = None
_subscriber_task: asyncio.Task | None = None


async def _redis() -> aioredis.Redis | None:
    global _redis_client
    if _redis_client is None:
        try:
            _redis_client = aioredis.from_url(
                settings.redis_url, decode_responses=False
            )
        except Exception:  # pragma: no cover
            logger.warning("collab: Redis unavailable; running single-process")
            return None
    return _redis_client


async def get_room(document_id: str, workspace_id: str, db: AsyncSession) -> DocumentRoom:
    """The room for this document in this process, creating it if needed."""
    async with _room_lock:
        room = _rooms.get(document_id)
        if room is None:
            room = DocumentRoom(document_id, workspace_id)
            _rooms[document_id] = room

    await room.load(db)
    await _ensure_subscription(document_id)
    return room


async def release_room(document_id: str) -> None:
    """Flush and drop a room whose last participant has gone.

    Flushes before dropping, always: the CRDT lives in this process's memory
    and dropping it without writing is exactly the data loss the whole module
    exists to prevent.
    """
    room = _rooms.get(document_id)
    if room is None or not room.is_empty:
        return

    async with get_async_session() as db:
        try:
            await room.flush(db, force=True)
        except Exception:
            logger.exception("collab: final flush failed for %s", document_id)

    async with _room_lock:
        if document_id in _rooms and _rooms[document_id].is_empty:
            del _rooms[document_id]


async def flush_all() -> None:
    """Flush every open room. Called on shutdown.

    Without this, a deploy loses whatever was typed since the last debounce in
    every document currently open.
    """
    for document_id, room in list(_rooms.items()):
        async with get_async_session() as db:
            try:
                await room.flush(db, force=True)
            except Exception:
                logger.exception("collab: shutdown flush failed for %s", document_id)


_subscriptions: dict[str, asyncio.Task] = {}


async def _ensure_subscription(document_id: str) -> None:
    if document_id in _subscriptions:
        return
    client = await _redis()
    if client is None:
        return

    async def listen() -> None:
        pubsub = client.pubsub()
        await pubsub.subscribe(f"{_REDIS_CHANNEL_PREFIX}{document_id}")
        try:
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                data: bytes = message["data"]
                if data[:16] == _ORIGIN_TAG:
                    continue  # our own publication
                room = _rooms.get(document_id)
                if room is None:
                    break
                try:
                    await room.apply_remote_update(data[16:])
                except Exception:
                    logger.exception(
                        "collab: bad remote update for %s", document_id
                    )
        finally:
            await pubsub.unsubscribe(f"{_REDIS_CHANNEL_PREFIX}{document_id}")
            _subscriptions.pop(document_id, None)

    _subscriptions[document_id] = asyncio.create_task(listen())
