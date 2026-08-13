"""Anchoring a comment to the passage it is about.

Comments were a flat list under the document, which stops working past about three
remarks because nothing says which sentence "is this still true?" refers to. An
anchored thread and a whole-document remark are now the same row with the same
threading and notification behaviour; `anchor_id IS NULL` *is* the whole-document
one. So the things worth pinning are the seams of that decision:

* a reply must not carry its own anchor — it is about whatever its parent was, and
  two copies give one thread two places to disagree with itself;
* an existing comment, written before any of this, must keep reading as a
  whole-document comment rather than becoming an orphan;
* the anchor is not a position and not a foreign key, so the row survives its
  passage being edited away. That is intended, and `quoted_text` is what keeps the
  thread readable afterwards.
"""

import uuid

import pytest

from aexy.api.documents import _comment_to_response
from aexy.models.developer import Developer
from aexy.models.documentation import Document
from aexy.services.document_comment_service import DocumentCommentService
from tests.conftest import seed_workspace

pytestmark = pytest.mark.asyncio

ANCHOR = "a1b2c3d4e5"


async def _developer(db, name="Ada") -> str:
    """Through the ORM — see the note in test_document_comments._developer."""
    developer = Developer(id=str(uuid.uuid4()), name=name)
    db.add(developer)
    await db.flush()
    return str(developer.id)


async def _document(db, workspace_id, owner_id) -> Document:
    document = Document(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        title="Runbook",
        content={},
        visibility="workspace",
        created_by_id=owner_id,
    )
    db.add(document)
    await db.flush()
    return document


async def _setup(db):
    workspace_id = await seed_workspace(db)
    owner_id = await _developer(db, "Owner")
    document = await _document(db, workspace_id, owner_id)
    return workspace_id, owner_id, document


async def test_an_anchored_comment_keeps_its_passage(db_session):
    workspace_id, owner_id, document = await _setup(db_session)

    comment = await DocumentCommentService(db_session).create_comment(
        workspace_id=workspace_id,
        document_id=str(document.id),
        author_id=owner_id,
        content="<p>Is this still true?</p>",
        anchor_id=ANCHOR,
        quoted_text="the API returns a 202",
    )

    assert comment.anchor_id == ANCHOR
    assert comment.quoted_text == "the API returns a 202"
    # And it survives serialisation, which is where the client reads it from.
    response = _comment_to_response(comment)
    assert response.anchor_id == ANCHOR
    assert response.quoted_text == "the API returns a 202"


async def test_a_comment_with_no_anchor_is_a_whole_document_comment(db_session):
    """The shape every comment written before anchoring existed still has."""
    workspace_id, owner_id, document = await _setup(db_session)

    comment = await DocumentCommentService(db_session).create_comment(
        workspace_id=workspace_id,
        document_id=str(document.id),
        author_id=owner_id,
        content="<p>Worth splitting this page in two.</p>",
    )

    assert comment.anchor_id is None
    assert comment.quoted_text is None
    assert _comment_to_response(comment).anchor_id is None


async def test_a_reply_does_not_carry_its_own_anchor(db_session):
    """Even when the client sends one — the parent is what the thread is about."""
    workspace_id, owner_id, document = await _setup(db_session)
    service = DocumentCommentService(db_session)
    root = await service.create_comment(
        workspace_id=workspace_id,
        document_id=str(document.id),
        author_id=owner_id,
        content="<p>Is this still true?</p>",
        anchor_id=ANCHOR,
        quoted_text="the API returns a 202",
    )

    reply = await service.create_comment(
        workspace_id=workspace_id,
        document_id=str(document.id),
        author_id=owner_id,
        content="<p>No, it returns 200 now.</p>",
        parent_id=str(root.id),
        # A client that sends these on a reply is not obeyed rather than erroring:
        # the intent is unambiguous and the anchor is simply not the reply's to set.
        anchor_id="a-different-anchor",
        quoted_text="something else entirely",
    )

    assert reply.parent_id is not None
    assert reply.anchor_id is None
    assert reply.quoted_text is None


async def test_the_thread_outlives_its_passage(db_session):
    """Editing the text away leaves the row, which is the point.

    No position is stored and no foreign key exists, so nothing cascades when the
    mark disappears from the content. The thread is still the record of a
    conversation, and `quoted_text` is what keeps it readable — the client decides
    to show it as unanchored, because only the client can see the marks.
    """
    workspace_id, owner_id, document = await _setup(db_session)
    service = DocumentCommentService(db_session)
    await service.create_comment(
        workspace_id=workspace_id,
        document_id=str(document.id),
        author_id=owner_id,
        content="<p>Is this still true?</p>",
        anchor_id=ANCHOR,
        quoted_text="the API returns a 202",
    )

    # The passage is rewritten and the mark goes with it.
    document.content = {"type": "doc", "content": [{"type": "paragraph"}]}
    await db_session.flush()

    roots, total, unresolved = await service.list_comments(
        workspace_id=workspace_id, document_id=str(document.id), developer_id=owner_id
    )
    assert total == 1 and unresolved == 1
    assert roots[0].anchor_id == ANCHOR
    assert roots[0].quoted_text == "the API returns a 202"


async def test_anchored_and_whole_document_threads_come_back_together(db_session):
    """One list, one table — the client partitions on `anchor_id`."""
    workspace_id, owner_id, document = await _setup(db_session)
    service = DocumentCommentService(db_session)
    await service.create_comment(
        workspace_id=workspace_id,
        document_id=str(document.id),
        author_id=owner_id,
        content="<p>About this line.</p>",
        anchor_id=ANCHOR,
        quoted_text="a passage",
    )
    await service.create_comment(
        workspace_id=workspace_id,
        document_id=str(document.id),
        author_id=owner_id,
        content="<p>About the whole page.</p>",
    )

    roots, total, _ = await service.list_comments(
        workspace_id=workspace_id, document_id=str(document.id), developer_id=owner_id
    )

    assert total == 2
    assert sorted(c.anchor_id or "" for c in roots) == ["", ANCHOR]
