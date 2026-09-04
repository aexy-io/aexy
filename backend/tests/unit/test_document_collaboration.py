"""Server-authoritative collaborative editing.

The three things worth pinning are the three that were wrong:

* **content did not survive two editors.** Each client built an empty `Y.Doc`
  and seeded it with `setContent()` from the REST body, so two people opening
  one page each inserted the whole document into their own history and the
  merge duplicated it. The server holding the document is what fixes that, and
  `test_two_editors_do_not_duplicate_the_document` is the regression.

* **nothing persisted.** The relay forwarded bytes and stored none of them; the
  actual save was a debounced whole-body `PATCH`, last writer wins.

* **a viewer could write.** Every connection was a source of bytes and the
  relay could not express the difference.

The TipTap⇄Yjs projection gets its own tests because it is the one place the
mapping is written down, and a lossy round trip would quietly delete formatting
from every document the moment somebody opened it collaboratively.
"""

import uuid

import pytest
from pycrdt import Doc
from pycrdt._sync import create_sync_step1_message, handle_sync_message

from aexy.models.developer import Developer
from aexy.models.documentation import Document, DocumentYjsState
from aexy.services.document_collaboration import (
    DocumentRoom,
    Participant,
    tiptap_to_yjs,
    yjs_to_tiptap,
)
from tests.conftest import seed_member, seed_workspace

pytestmark = pytest.mark.asyncio


def _tiptap(*paragraphs: str) -> dict:
    return {
        "type": "doc",
        "content": [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": text}],
            }
            for text in paragraphs
        ],
    }


def _texts(content: dict) -> list[str]:
    """Every text run in the document, flattened."""
    out: list[str] = []

    def walk(node):
        if node.get("type") == "text":
            out.append(node.get("text", ""))
        for child in node.get("content") or []:
            walk(child)

    walk(content)
    return out


# ──────────────────────────────────────────────────────────────────────
# The projection


class TestTiptapYjsProjection:
    def test_a_plain_document_round_trips_exactly(self):
        content = _tiptap("First line", "Second line")
        doc = Doc()
        tiptap_to_yjs(doc, content)
        assert yjs_to_tiptap(doc) == content

    def test_marks_survive(self):
        """Reading the text back with `str()` instead of `diff()` would drop
        every bold, italic and link in the document — silently, and on the
        flush that writes it back to Postgres."""
        content = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "plain "},
                        {"type": "text", "text": "bold", "marks": [{"type": "bold"}]},
                        {
                            "type": "text",
                            "text": "link",
                            "marks": [
                                {
                                    "type": "link",
                                    "attrs": {"href": "https://example.test"},
                                }
                            ],
                        },
                    ],
                }
            ],
        }
        doc = Doc()
        tiptap_to_yjs(doc, content)
        assert yjs_to_tiptap(doc) == content

    def test_typed_attributes_survive(self):
        """Yjs XML attributes are strings; a heading's level is an integer.
        Without the JSON encoding on both sides a round trip turns `2` into
        `"2"` and the client renders a different heading."""
        content = {
            "type": "doc",
            "content": [
                {
                    "type": "heading",
                    "attrs": {"level": 3},
                    "content": [{"type": "text", "text": "Title"}],
                }
            ],
        }
        doc = Doc()
        tiptap_to_yjs(doc, content)
        out = yjs_to_tiptap(doc)
        assert out == content
        assert out["content"][0]["attrs"]["level"] == 3

    def test_nesting_survives(self):
        content = {
            "type": "doc",
            "content": [
                {
                    "type": "bulletList",
                    "content": [
                        {
                            "type": "listItem",
                            "content": [
                                {
                                    "type": "paragraph",
                                    "content": [{"type": "text", "text": "one"}],
                                }
                            ],
                        }
                    ],
                }
            ],
        }
        doc = Doc()
        tiptap_to_yjs(doc, content)
        assert yjs_to_tiptap(doc) == content

    def test_an_empty_document_round_trips(self):
        doc = Doc()
        tiptap_to_yjs(doc, {})
        assert yjs_to_tiptap(doc) == {"type": "doc", "content": []}


# ──────────────────────────────────────────────────────────────────────
# The room


class _Socket:
    """A participant's send side, captured."""

    def __init__(self):
        self.sent: list[bytes] = []

    async def __call__(self, message: bytes) -> None:
        self.sent.append(message)


def _participant(socket: _Socket, *, can_write: bool = True, name="Ada") -> Participant:
    return Participant(
        id=str(uuid.uuid4()),
        developer_id=str(uuid.uuid4()),
        name=name,
        avatar_url=None,
        color="#60a5fa",
        can_write=can_write,
        send=socket,
    )


async def _seed_document(db, content: dict) -> tuple[str, str, str]:
    workspace_id = await seed_workspace(db)
    author = Developer(id=str(uuid.uuid4()), name="Author")
    db.add(author)
    await db.flush()
    await seed_member(db, workspace_id, str(author.id))

    document = Document(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        title="Runbook",
        content=content,
        created_by_id=str(author.id),
    )
    db.add(document)
    await db.flush()
    return workspace_id, str(document.id), str(author.id)


class TestRoomLifecycle:
    async def test_a_room_seeds_from_the_stored_body(self, db_session):
        content = _tiptap("Restart the worker", "Then check the queue")
        workspace_id, document_id, _ = await _seed_document(db_session, content)

        room = DocumentRoom(document_id, workspace_id)
        await room.load(db_session)

        assert yjs_to_tiptap(room.doc) == content

    async def test_loading_persists_the_seed_immediately(self, db_session):
        """If the first editor's socket dies before the first flush, the next
        one must not re-seed from the REST body — that is the merge that
        duplicates the document."""
        from sqlalchemy import select

        content = _tiptap("Only once")
        workspace_id, document_id, _ = await _seed_document(db_session, content)

        room = DocumentRoom(document_id, workspace_id)
        await room.load(db_session)

        row = (
            await db_session.execute(
                select(DocumentYjsState).where(
                    DocumentYjsState.document_id == document_id
                )
            )
        ).scalar_one_or_none()
        assert row is not None
        assert row.state

    async def test_a_second_room_resumes_from_the_crdt_not_the_body(
        self, db_session
    ):
        """The property the whole design turns on. Two rooms built over the
        life of one document must not each import the body."""
        content = _tiptap("Original line")
        workspace_id, document_id, _ = await _seed_document(db_session, content)

        first = DocumentRoom(document_id, workspace_id)
        await first.load(db_session)

        # An edit lands, and is persisted as CRDT state but not yet flattened.
        _append_paragraph(first.doc, "Added by the first editor")
        await first._persist_state(db_session)

        second = DocumentRoom(document_id, workspace_id)
        await second.load(db_session)

        assert _texts(yjs_to_tiptap(second.doc)) == [
            "Original line",
            "Added by the first editor",
        ]

    async def test_two_editors_do_not_duplicate_the_document(self, db_session):
        """The regression for the original bug.

        Both clients sync against the *server's* document. Before, each seeded
        its own empty Y.Doc from the REST body, so the merged result contained
        the document twice.
        """
        content = _tiptap("Shared paragraph")
        workspace_id, document_id, _ = await _seed_document(db_session, content)

        room = DocumentRoom(document_id, workspace_id)
        await room.load(db_session)

        # Two clients each perform the standard handshake against the server.
        alice, bob = Doc(), Doc()
        for client in (alice, bob):
            reply = handle_sync_message(
                _payload(create_sync_step1_message(room.doc.get_state())), client
            )
            assert reply is not None
            handle_sync_message(_payload(reply), room.doc)
            # …and take the server's state in return.
            back = handle_sync_message(
                _payload(create_sync_step1_message(client.get_state())), room.doc
            )
            if back is not None:
                handle_sync_message(_payload(back), client)

        assert _texts(yjs_to_tiptap(alice)) == ["Shared paragraph"]
        assert _texts(yjs_to_tiptap(bob)) == ["Shared paragraph"]
        assert _texts(yjs_to_tiptap(room.doc)) == ["Shared paragraph"]


def _payload(message: bytes) -> bytes:
    """A y-protocol frame minus its leading `YMessageType` byte, which is what
    `handle_sync_message` takes."""
    return message[1:]


def _append_paragraph(doc: Doc, text: str) -> None:
    from pycrdt import XmlElement, XmlFragment, XmlText

    from aexy.services.document_collaboration import FRAGMENT_KEY

    fragment = doc.get(FRAGMENT_KEY, type=XmlFragment)
    with doc.transaction():
        element = fragment.children.insert(
            len(fragment.children), XmlElement("paragraph")
        )
        node = element.children.insert(0, XmlText(""))
        node.insert(0, text)


class TestParticipants:
    async def test_a_viewers_write_is_refused(self, db_session):
        """The old relay could not express this at all: every connection was a
        source of bytes, so a read-only participant did not exist as a
        concept."""
        content = _tiptap("Read only")
        workspace_id, document_id, _ = await _seed_document(db_session, content)

        room = DocumentRoom(document_id, workspace_id)
        await room.load(db_session)

        socket = _Socket()
        viewer = _participant(socket, can_write=False)
        await room.join(viewer)

        # A client whose update actually changes the document.
        client = Doc()
        handle_sync_message(
            _payload(create_sync_step1_message(room.doc.get_state())), client
        )
        reply = handle_sync_message(
            _payload(create_sync_step1_message(client.get_state())), room.doc
        )
        if reply is not None:
            handle_sync_message(_payload(reply), client)
        _append_paragraph(client, "A viewer should not be able to write this")

        from pycrdt._sync import create_update_message

        update = create_update_message(client.get_update(room.doc.get_state()))

        with pytest.raises(PermissionError):
            await room.handle_client_message(viewer, update)

    async def test_leaving_drops_the_participants_awareness(self, db_session):
        """The old `disconnect` had a loop here that was a literal `pass`, so
        presence accumulated ghosts for as long as the process lived."""
        workspace_id, document_id, _ = await _seed_document(
            db_session, _tiptap("Anything")
        )
        room = DocumentRoom(document_id, workspace_id)
        await room.load(db_session)

        socket = _Socket()
        participant = _participant(socket)
        await room.join(participant)
        room.awareness[participant.id] = b"cursor"

        await room.leave(participant.id)

        assert participant.id not in room.participants
        assert participant.id not in room.awareness
        assert room.is_empty

    async def test_joining_offers_the_servers_state(self, db_session):
        """The handshake starts from the server, not from another client. That
        is what makes a person who opens a document alone still receive the
        merged state."""
        workspace_id, document_id, _ = await _seed_document(
            db_session, _tiptap("Hello")
        )
        room = DocumentRoom(document_id, workspace_id)
        await room.load(db_session)

        socket = _Socket()
        await room.join(_participant(socket))

        assert socket.sent, "a joining participant is sent nothing"
        client = Doc()
        handle_sync_message(_payload(socket.sent[0]), client)


class TestFlushing:
    async def test_flushing_writes_the_body_back(self, db_session):
        """The CRDT is the truth while people type, but search, the knowledge
        graph and every REST reader want `documents.content`."""
        from sqlalchemy import select

        workspace_id, document_id, _ = await _seed_document(
            db_session, _tiptap("Before")
        )
        room = DocumentRoom(document_id, workspace_id)
        await room.load(db_session)

        _append_paragraph(room.doc, "After")
        await room.flush(db_session, force=True)

        document = (
            await db_session.execute(
                select(Document).where(Document.id == document_id)
            )
        ).scalar_one()
        assert _texts(document.content) == ["Before", "After"]

    async def test_flushing_extracts_searchable_text(self, db_session):
        """Routed through `DocumentService.update_document` rather than a
        direct UPDATE so `content_text`, version history and the activity feed
        all still happen."""
        from sqlalchemy import select

        workspace_id, document_id, _ = await _seed_document(
            db_session, _tiptap("Findable phrase")
        )
        room = DocumentRoom(document_id, workspace_id)
        await room.load(db_session)

        _append_paragraph(room.doc, "Another findable phrase")
        await room.flush(db_session, force=True)

        document = (
            await db_session.execute(
                select(Document).where(Document.id == document_id)
            )
        ).scalar_one()
        assert "Another findable phrase" in (document.content_text or "")

    async def test_a_flush_with_no_changes_is_a_no_op(self, db_session):
        workspace_id, document_id, _ = await _seed_document(
            db_session, _tiptap("Unchanged")
        )
        room = DocumentRoom(document_id, workspace_id)
        await room.load(db_session)

        assert await room.flush(db_session) is False
