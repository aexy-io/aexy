"""Document comments: threading, access, and who hears about them.

The parts worth pinning are the ones that are wrong-but-plausible:

* being both @mentioned in a comment and a participant in its thread must produce
  **one** notification, not two, for a single comment — the mention is the louder
  signal and wins;
* the author never notifies themselves, which is the most common case of all
  (commenting on your own document);
* a private document's comments are not readable by a workspace member who was
  never given access, even though the document CRUD endpoints gate on workspace
  membership alone;
* threading is one level, so a reply to a reply attaches to the same root rather
  than nesting further.
"""

import uuid
from datetime import datetime

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from aexy.api.documents import _comment_to_response
from aexy.models.developer import Developer
from aexy.models.documentation import Document, DocumentComment
from aexy.models.notification import Notification, NotificationEventType
from aexy.services.document_comment_service import DocumentCommentService
from tests.conftest import seed_member, seed_workspace

pytestmark = pytest.mark.asyncio


async def _developer(db, name="Ada", workspace_id: str | None = None) -> str:
    """Insert through the ORM, not raw SQL.

    A raw INSERT stores the id exactly as given, while the ORM's UUID type
    dash-strips it on the SQLite the suite runs against — so a raw-inserted
    developer and an ORM-written `author_id` never join, and `author` silently
    resolves to None. Real Postgres has native uuid columns and would not care,
    which is what makes it a trap: the assertion fails only in the test.
    """
    developer = Developer(id=str(uuid.uuid4()), name=name)
    db.add(developer)
    await db.flush()
    # Workspace membership is the floor under every document permission since
    # `DocumentAccess` landed — a developer with no `workspace_members` row
    # reads nothing, which is the point of it.
    if workspace_id:
        await seed_member(db, workspace_id, str(developer.id))
    return str(developer.id)


async def _document(db, workspace_id, owner_id, *, visibility="workspace") -> Document:
    document = Document(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        title="Runbook",
        content={},
        visibility=visibility,
        created_by_id=owner_id,
    )
    db.add(document)
    await db.flush()
    return document


async def _notifications(db, recipient_id, event: NotificationEventType) -> list[Notification]:
    rows = await db.execute(
        select(Notification).where(
            Notification.recipient_id == recipient_id,
            Notification.event_type == event.value,
        )
    )
    return list(rows.scalars().all())


def _mention(developer_id: str) -> str:
    """A mention in the shape the shared parser reads."""
    return f'<p>ping <a href="mention:user:{developer_id}">@someone</a></p>'


async def test_comment_notifies_the_document_owner(db_session):
    workspace_id = await seed_workspace(db_session)
    owner_id = await _developer(db_session, "Owner", workspace_id)
    commenter_id = await _developer(db_session, "Commenter", workspace_id)
    document = await _document(db_session, workspace_id, owner_id)

    await DocumentCommentService(db_session).create_comment(
        workspace_id=workspace_id,
        document_id=str(document.id),
        author_id=commenter_id,
        content="<p>Is step 3 still right?</p>",
    )

    sent = await _notifications(
        db_session, owner_id, NotificationEventType.DOCUMENT_COMMENTED
    )
    assert len(sent) == 1
    assert "Runbook" in sent[0].body


async def test_commenting_on_your_own_document_notifies_nobody(db_session):
    workspace_id = await seed_workspace(db_session)
    owner_id = await _developer(db_session, "Owner", workspace_id)
    document = await _document(db_session, workspace_id, owner_id)

    await DocumentCommentService(db_session).create_comment(
        workspace_id=workspace_id,
        document_id=str(document.id),
        author_id=owner_id,
        content="<p>Note to self</p>",
    )

    assert await _notifications(
        db_session, owner_id, NotificationEventType.DOCUMENT_COMMENTED
    ) == []


async def test_a_mention_wins_over_the_thread_notification(db_session):
    """One comment, one notification — the mention, not both."""
    workspace_id = await seed_workspace(db_session)
    owner_id = await _developer(db_session, "Owner", workspace_id)
    commenter_id = await _developer(db_session, "Commenter", workspace_id)
    document = await _document(db_session, workspace_id, owner_id)

    service = DocumentCommentService(db_session)
    # The owner is a thread participant by virtue of owning the document, and is
    # also named in the comment.
    await service.create_comment(
        workspace_id=workspace_id,
        document_id=str(document.id),
        author_id=commenter_id,
        content=_mention(owner_id),
    )

    mentioned = await _notifications(
        db_session, owner_id, NotificationEventType.DOCUMENT_MENTIONED
    )
    commented = await _notifications(
        db_session, owner_id, NotificationEventType.DOCUMENT_COMMENTED
    )
    assert len(mentioned) == 1
    assert commented == []


async def test_replies_notify_the_other_people_in_the_thread(db_session):
    workspace_id = await seed_workspace(db_session)
    owner_id = await _developer(db_session, "Owner", workspace_id)
    first_id = await _developer(db_session, "First", workspace_id)
    second_id = await _developer(db_session, "Second", workspace_id)
    document = await _document(db_session, workspace_id, owner_id)

    service = DocumentCommentService(db_session)
    root = await service.create_comment(
        workspace_id=workspace_id,
        document_id=str(document.id),
        author_id=first_id,
        content="<p>Question</p>",
    )
    await service.create_comment(
        workspace_id=workspace_id,
        document_id=str(document.id),
        author_id=second_id,
        content="<p>Answer</p>",
        parent_id=str(root.id),
    )

    # The owner and the person who asked both hear about the reply; the replier
    # does not hear about their own.
    assert len(
        await _notifications(db_session, first_id, NotificationEventType.DOCUMENT_COMMENTED)
    ) == 1
    assert len(
        await _notifications(db_session, owner_id, NotificationEventType.DOCUMENT_COMMENTED)
    ) == 2
    assert await _notifications(
        db_session, second_id, NotificationEventType.DOCUMENT_COMMENTED
    ) == []


async def test_a_reply_to_a_reply_joins_the_same_thread(db_session):
    """Threading is one level; the user's intent is unambiguous, so don't error."""
    workspace_id = await seed_workspace(db_session)
    owner_id = await _developer(db_session, workspace_id=workspace_id)
    document = await _document(db_session, workspace_id, owner_id)

    service = DocumentCommentService(db_session)
    root = await service.create_comment(
        workspace_id=workspace_id, document_id=str(document.id),
        author_id=owner_id, content="<p>a</p>",
    )
    reply = await service.create_comment(
        workspace_id=workspace_id, document_id=str(document.id),
        author_id=owner_id, content="<p>b</p>", parent_id=str(root.id),
    )
    nested = await service.create_comment(
        workspace_id=workspace_id, document_id=str(document.id),
        author_id=owner_id, content="<p>c</p>", parent_id=str(reply.id),
    )

    assert str(nested.parent_id) == str(root.id)


async def test_deleting_keeps_the_row_and_drops_the_body(db_session):
    workspace_id = await seed_workspace(db_session)
    owner_id = await _developer(db_session, workspace_id=workspace_id)
    document = await _document(db_session, workspace_id, owner_id)

    service = DocumentCommentService(db_session)
    comment = await service.create_comment(
        workspace_id=workspace_id, document_id=str(document.id),
        author_id=owner_id, content="<p>oops</p>",
    )
    await service.delete_comment(
        workspace_id=workspace_id, document_id=str(document.id),
        comment_id=str(comment.id), developer_id=owner_id,
    )

    row = (
        await db_session.execute(
            select(DocumentComment).where(DocumentComment.id == comment.id)
        )
    ).scalar_one()
    assert row.is_deleted is True
    assert row.content == ""


async def test_you_cannot_delete_someone_elses_comment(db_session):
    workspace_id = await seed_workspace(db_session)
    owner_id = await _developer(db_session, workspace_id=workspace_id)
    other_id = await _developer(db_session, "Other", workspace_id)
    document = await _document(db_session, workspace_id, owner_id)

    service = DocumentCommentService(db_session)
    comment = await service.create_comment(
        workspace_id=workspace_id, document_id=str(document.id),
        author_id=owner_id, content="<p>mine</p>",
    )

    with pytest.raises(HTTPException) as exc:
        await service.delete_comment(
            workspace_id=workspace_id, document_id=str(document.id),
            comment_id=str(comment.id), developer_id=other_id,
        )
    assert exc.value.status_code == 403


async def test_only_a_thread_root_can_be_resolved(db_session):
    workspace_id = await seed_workspace(db_session)
    owner_id = await _developer(db_session, workspace_id=workspace_id)
    document = await _document(db_session, workspace_id, owner_id)

    service = DocumentCommentService(db_session)
    root = await service.create_comment(
        workspace_id=workspace_id, document_id=str(document.id),
        author_id=owner_id, content="<p>a</p>",
    )
    reply = await service.create_comment(
        workspace_id=workspace_id, document_id=str(document.id),
        author_id=owner_id, content="<p>b</p>", parent_id=str(root.id),
    )

    resolved = await service.set_resolved(
        workspace_id=workspace_id, document_id=str(document.id),
        comment_id=str(root.id), developer_id=owner_id, resolved=True,
    )
    assert resolved.is_resolved is True

    with pytest.raises(HTTPException) as exc:
        await service.set_resolved(
            workspace_id=workspace_id, document_id=str(document.id),
            comment_id=str(reply.id), developer_id=owner_id, resolved=True,
        )
    assert exc.value.status_code == 400


async def test_a_private_documents_comments_are_not_public_to_the_workspace(db_session):
    """404, not 403, so private document ids stay unenumerable."""
    workspace_id = await seed_workspace(db_session)
    owner_id = await _developer(db_session, workspace_id=workspace_id)
    outsider_id = await _developer(db_session, "Outsider", workspace_id)
    document = await _document(
        db_session, workspace_id, owner_id, visibility="private"
    )

    service = DocumentCommentService(db_session)
    with pytest.raises(HTTPException) as exc:
        await service.list_comments(
            workspace_id=workspace_id,
            document_id=str(document.id),
            developer_id=outsider_id,
        )
    assert exc.value.status_code == 404

    # The owner still gets their own private document's comments.
    roots, total, unresolved = await service.list_comments(
        workspace_id=workspace_id,
        document_id=str(document.id),
        developer_id=owner_id,
    )
    assert (roots, total, unresolved) == ([], 0, 0)


class TestResponsesAreSerialisable:
    """Everything a write endpoint returns must survive the response schema.

    These exist because the first version of this service passed its own tests and
    still 500'd in the endpoint. The tests only read model attributes; the
    endpoints call `_comment_to_response`, which touches relationships and
    timestamps the freshly-written instance had never loaded:

    * ``resolved_at`` was set to ``func.now()``, which marks the column for a
      post-flush fetch — reading it back triggered a *synchronous* refresh and
      raised MissingGreenlet on the async session;
    * a just-added instance has no ``author`` loaded, so the response reported
      ``author_name: null`` for the person who had that moment posted.

    Asserting through the schema is what makes the difference, so these do.
    """

    @pytest.mark.asyncio
    async def test_a_new_comment_names_its_author(self, db_session):
        workspace_id = await seed_workspace(db_session)
        author_id = await _developer(db_session, "Ada Lovelace", workspace_id)
        document = await _document(db_session, workspace_id, author_id)

        comment = await DocumentCommentService(db_session).create_comment(
            workspace_id=workspace_id,
            document_id=str(document.id),
            author_id=author_id,
            content="<p>first</p>",
        )
        response = _comment_to_response(comment)
        assert response.author_name == "Ada Lovelace"
        assert response.replies == []

    @pytest.mark.asyncio
    async def test_resolving_returns_a_real_timestamp(self, db_session):
        workspace_id = await seed_workspace(db_session)
        author_id = await _developer(db_session, workspace_id=workspace_id)
        document = await _document(db_session, workspace_id, author_id)

        service = DocumentCommentService(db_session)
        comment = await service.create_comment(
            workspace_id=workspace_id, document_id=str(document.id),
            author_id=author_id, content="<p>q</p>",
        )
        resolved = await service.set_resolved(
            workspace_id=workspace_id, document_id=str(document.id),
            comment_id=str(comment.id), developer_id=author_id, resolved=True,
        )

        assert isinstance(resolved.resolved_at, datetime)
        response = _comment_to_response(resolved)
        assert response.is_resolved is True
        assert response.resolved_at is not None

    @pytest.mark.asyncio
    async def test_reopening_clears_the_timestamp(self, db_session):
        workspace_id = await seed_workspace(db_session)
        author_id = await _developer(db_session, workspace_id=workspace_id)
        document = await _document(db_session, workspace_id, author_id)

        service = DocumentCommentService(db_session)
        comment = await service.create_comment(
            workspace_id=workspace_id, document_id=str(document.id),
            author_id=author_id, content="<p>q</p>",
        )
        await service.set_resolved(
            workspace_id=workspace_id, document_id=str(document.id),
            comment_id=str(comment.id), developer_id=author_id, resolved=True,
        )
        reopened = await service.set_resolved(
            workspace_id=workspace_id, document_id=str(document.id),
            comment_id=str(comment.id), developer_id=author_id, resolved=False,
        )

        response = _comment_to_response(reopened)
        assert response.is_resolved is False
        assert response.resolved_at is None
        assert response.resolved_by_id is None

    @pytest.mark.asyncio
    async def test_an_edited_comment_serialises(self, db_session):
        workspace_id = await seed_workspace(db_session)
        author_id = await _developer(db_session, workspace_id=workspace_id)
        document = await _document(db_session, workspace_id, author_id)

        service = DocumentCommentService(db_session)
        comment = await service.create_comment(
            workspace_id=workspace_id, document_id=str(document.id),
            author_id=author_id, content="<p>before</p>",
        )
        edited = await service.update_comment(
            workspace_id=workspace_id, document_id=str(document.id),
            comment_id=str(comment.id), developer_id=author_id,
            content="<p>after</p>",
        )

        response = _comment_to_response(edited)
        assert response.content == "<p>after</p>"
        assert response.is_edited is True

    @pytest.mark.asyncio
    async def test_a_thread_serialises_with_its_replies_nested(self, db_session):
        workspace_id = await seed_workspace(db_session)
        author_id = await _developer(db_session, "Root Author", workspace_id)
        replier_id = await _developer(db_session, "Replier", workspace_id)
        document = await _document(db_session, workspace_id, author_id)

        service = DocumentCommentService(db_session)
        root = await service.create_comment(
            workspace_id=workspace_id, document_id=str(document.id),
            author_id=author_id, content="<p>root</p>",
        )
        await service.create_comment(
            workspace_id=workspace_id, document_id=str(document.id),
            author_id=replier_id, content="<p>reply</p>", parent_id=str(root.id),
        )

        roots, _, _ = await service.list_comments(
            workspace_id=workspace_id,
            document_id=str(document.id),
            developer_id=author_id,
        )
        response = _comment_to_response(roots[0])
        assert len(response.replies) == 1
        assert response.replies[0].author_name == "Replier"


async def test_counts_separate_all_comments_from_open_threads(db_session):
    workspace_id = await seed_workspace(db_session)
    owner_id = await _developer(db_session, workspace_id=workspace_id)
    document = await _document(db_session, workspace_id, owner_id)

    service = DocumentCommentService(db_session)
    first = await service.create_comment(
        workspace_id=workspace_id, document_id=str(document.id),
        author_id=owner_id, content="<p>one</p>",
    )
    await service.create_comment(
        workspace_id=workspace_id, document_id=str(document.id),
        author_id=owner_id, content="<p>reply</p>", parent_id=str(first.id),
    )
    await service.create_comment(
        workspace_id=workspace_id, document_id=str(document.id),
        author_id=owner_id, content="<p>two</p>",
    )
    await service.set_resolved(
        workspace_id=workspace_id, document_id=str(document.id),
        comment_id=str(first.id), developer_id=owner_id, resolved=True,
    )

    roots, total, unresolved = await service.list_comments(
        workspace_id=workspace_id,
        document_id=str(document.id),
        developer_id=owner_id,
    )
    assert len(roots) == 2       # replies nest, they are not roots
    assert total == 3            # a badge counts every comment
    assert unresolved == 1       # a reviewer only owes the open thread
