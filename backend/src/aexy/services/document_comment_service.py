"""Comments on documents, and the notifications they produce.

Its own module rather than more methods on ``DocumentService``, which is already
1100 lines covering documents, versions, templates, collaborators, favourites and
search.

Access rules mirror the document endpoints rather than inventing a stricter or
looser model, with one deliberate exception: a *private* document is checked
against ``DocumentService.check_permission`` so a workspace member who was never
given access cannot read or write its comments. The document CRUD endpoints gate
on workspace membership alone, which is arguably too loose for private docs; a
new surface should not copy that.
"""

import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.documentation import Document, DocumentComment, DocumentPermission
from aexy.services.document_service import DocumentService
from aexy.services.notification_service import (
    extract_mentioned_user_ids,
    notify_document_commented,
    notify_document_mentioned,
)

logger = logging.getLogger(__name__)


class DocumentCommentService:
    """Read and write document comments."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ─── Access ────────────────────────────────────────────────────

    async def _load_document(
        self, workspace_id: str, document_id: str, developer_id: str, *, write: bool
    ) -> Document:
        """Load a document the caller may comment on, or 404/403.

        404 rather than 403 for a document outside the workspace, so ids stay
        unenumerable — the same reasoning the service desk applies to ticket ids.
        """
        document = (
            await self.db.execute(
                select(Document).where(
                    Document.id == document_id,
                    Document.workspace_id == workspace_id,
                )
            )
        ).scalar_one_or_none()

        if document is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
            )

        # Was: check only when `visibility == "private"`, through
        # `DocumentService.check_permission`, which knew about the collaborator
        # table and nothing else. A document in a restricted space was
        # `visibility="workspace"`, so it took this branch never — anyone in
        # the workspace could read and post on the comment thread of a document
        # they could not open.
        from aexy.services.document_access import AccessLevel, DocumentAccess

        required = AccessLevel.COMMENT if write else AccessLevel.VIEW
        level = await DocumentAccess(self.db).resolve(
            document, developer_id, workspace_id=workspace_id
        )
        if level == AccessLevel.NONE:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
            )
        if level < required:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to comment on this document",
            )

        return document

    # ─── Read ──────────────────────────────────────────────────────

    async def list_comments(
        self, workspace_id: str, document_id: str, developer_id: str
    ) -> tuple[list[DocumentComment], int, int]:
        """Root comments oldest-first with their replies, plus counts.

        Returns ``(roots, total, unresolved_count)``. ``total`` counts every
        comment including replies, because that is what a "12 comments" badge
        means to a reader; ``unresolved_count`` counts threads, because that is
        what a reviewer still has to deal with.
        """
        await self._load_document(
            workspace_id, document_id, developer_id, write=False
        )

        roots = (
            (
                await self.db.execute(
                    select(DocumentComment)
                    .where(
                        DocumentComment.document_id == document_id,
                        DocumentComment.parent_id.is_(None),
                    )
                    .options(
                        selectinload(DocumentComment.author),
                        selectinload(DocumentComment.replies).selectinload(
                            DocumentComment.author
                        ),
                    )
                    .order_by(DocumentComment.created_at)
                    # Same reason as `_reload`: a root already in the identity map
                    # keeps whatever `replies` it was loaded with, so posting a
                    # reply and then listing in the same session served the thread
                    # without it.
                    .execution_options(populate_existing=True)
                )
            )
            .scalars()
            .unique()
            .all()
        )

        total = (
            await self.db.execute(
                select(func.count(DocumentComment.id)).where(
                    DocumentComment.document_id == document_id
                )
            )
        ).scalar_one()

        unresolved = (
            await self.db.execute(
                select(func.count(DocumentComment.id)).where(
                    DocumentComment.document_id == document_id,
                    DocumentComment.parent_id.is_(None),
                    DocumentComment.is_resolved.is_(False),
                    DocumentComment.is_deleted.is_(False),
                )
            )
        ).scalar_one()

        return list(roots), int(total), int(unresolved)

    # ─── Write ─────────────────────────────────────────────────────

    async def create_comment(
        self,
        workspace_id: str,
        document_id: str,
        author_id: str,
        content: str,
        parent_id: str | None = None,
        anchor_id: str | None = None,
        quoted_text: str | None = None,
    ) -> DocumentComment:
        """Post a comment or a reply, then notify the people in the conversation.

        An ``anchor_id`` ties the thread to a passage of the document — see the
        column's note on the model. It is dropped on a reply: a reply is about
        whatever its parent was about, so storing it twice would give one thread
        two places to disagree with itself.
        """
        document = await self._load_document(
            workspace_id, document_id, author_id, write=True
        )

        if parent_id is not None:
            parent = (
                await self.db.execute(
                    select(DocumentComment).where(
                        DocumentComment.id == parent_id,
                        DocumentComment.document_id == document_id,
                    )
                )
            ).scalar_one_or_none()
            if parent is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Parent comment not found",
                )
            # One level of threading. Replying to a reply attaches to the same
            # root instead of erroring — the user's intent is unambiguous and
            # refusing it would be pedantry.
            if parent.parent_id is not None:
                parent_id = str(parent.parent_id)

        comment = DocumentComment(
            id=str(uuid4()),
            document_id=document_id,
            parent_id=parent_id,
            author_id=author_id,
            content=content,
            anchor_id=None if parent_id else anchor_id,
            quoted_text=None if parent_id else quoted_text,
        )
        self.db.add(comment)
        await self.db.flush()

        await self._notify(document, comment, author_id)
        return await self._reload(str(comment.id))

    async def update_comment(
        self,
        workspace_id: str,
        document_id: str,
        comment_id: str,
        developer_id: str,
        content: str,
    ) -> DocumentComment:
        """Edit your own comment. Editing does not re-notify."""
        await self._load_document(workspace_id, document_id, developer_id, write=True)
        comment = await self._own_comment(document_id, comment_id, developer_id)

        comment.content = content
        comment.is_edited = True
        await self.db.flush()
        return await self._reload(str(comment.id))

    async def delete_comment(
        self,
        workspace_id: str,
        document_id: str,
        comment_id: str,
        developer_id: str,
    ) -> None:
        """Soft-delete your own comment, keeping its place in the thread."""
        await self._load_document(workspace_id, document_id, developer_id, write=True)
        comment = await self._own_comment(document_id, comment_id, developer_id)

        comment.is_deleted = True
        comment.content = ""
        await self.db.flush()

    async def set_resolved(
        self,
        workspace_id: str,
        document_id: str,
        comment_id: str,
        developer_id: str,
        resolved: bool,
    ) -> DocumentComment:
        """Resolve or reopen a thread.

        Anybody who can comment can resolve — a thread is a shared conversation,
        and restricting this to the author means a resolved question stays open
        because its asker moved on.
        """
        await self._load_document(workspace_id, document_id, developer_id, write=True)

        comment = (
            await self.db.execute(
                select(DocumentComment).where(
                    DocumentComment.id == comment_id,
                    DocumentComment.document_id == document_id,
                )
            )
        ).scalar_one_or_none()
        if comment is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found"
            )
        if comment.parent_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only a thread's first comment can be resolved",
            )

        comment.is_resolved = resolved
        comment.resolved_by_id = developer_id if resolved else None
        # A Python datetime, not `func.now()`. Assigning a SQL function marks the
        # column for a post-flush fetch, and reading it back — which the endpoint
        # does immediately, to build the response — triggers a *synchronous*
        # refresh that raises MissingGreenlet on an async session. Resolving a
        # thread returned a 500.
        comment.resolved_at = datetime.now(timezone.utc) if resolved else None
        await self.db.flush()
        return await self._reload(str(comment.id))

    async def _reload(self, comment_id: str) -> DocumentComment:
        """Re-read a comment with its author and replies loaded.

        A freshly `add`ed-and-flushed instance has no relationship state, so the
        response built straight from it reported ``author_name: null`` for the
        person who just posted, and touching ``replies`` risked a lazy load that
        raises MissingGreenlet on an async session.

        ``populate_existing`` is what makes the re-read actually take effect: the
        SELECT hands back the identity-mapped instance, and SQLAlchemy will not
        overwrite attributes it already holds — so without this the query runs and
        changes nothing, which is the same trap
        ``SprintTaskService._reload_with_assignees`` exists for.
        """
        return (
            await self.db.execute(
                select(DocumentComment)
                .where(DocumentComment.id == comment_id)
                .options(
                    selectinload(DocumentComment.author),
                    selectinload(DocumentComment.replies).selectinload(
                        DocumentComment.author
                    ),
                )
                .execution_options(populate_existing=True)
            )
        ).scalars().unique().one()

    async def _own_comment(
        self, document_id: str, comment_id: str, developer_id: str
    ) -> DocumentComment:
        comment = (
            await self.db.execute(
                select(DocumentComment).where(
                    DocumentComment.id == comment_id,
                    DocumentComment.document_id == document_id,
                )
            )
        ).scalar_one_or_none()
        if comment is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found"
            )
        if str(comment.author_id) != str(developer_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only edit or delete your own comments",
            )
        if comment.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found"
            )
        return comment

    # ─── Notifications ─────────────────────────────────────────────

    async def _participants(self, document: Document, comment: DocumentComment) -> set[str]:
        """Everyone already in this conversation, plus the document's owner.

        The owner is included even on a thread they have not spoken in: it is
        their document, and a comment on it is the thing they most need to know
        about. Everyone else is here because they already said something in the
        same thread.
        """
        people: set[str] = set()
        if document.created_by_id:
            people.add(str(document.created_by_id))

        root_id = comment.parent_id or comment.id
        rows = (
            await self.db.execute(
                select(DocumentComment.author_id).where(
                    DocumentComment.document_id == document.id,
                    (DocumentComment.id == root_id)
                    | (DocumentComment.parent_id == root_id),
                )
            )
        ).scalars().all()
        people.update(str(a) for a in rows if a)
        return people

    async def _notify(
        self, document: Document, comment: DocumentComment, author_id: str
    ) -> None:
        """Mention the named, then tell the rest of the conversation.

        Order matters: mentioned users are removed from the ambient recipient set
        so that being both @mentioned and a thread participant produces one
        notification, not two, for a single comment. The same rule task comments
        follow.
        """
        try:
            mentioned = {
                uid
                for uid in extract_mentioned_user_ids(comment.content)
                if uid and str(uid) != str(author_id)
            }
            workspace_id = (
                str(document.workspace_id) if document.workspace_id else None
            )
            actor_name = await self._author_name(author_id)

            if mentioned:
                await notify_document_mentioned(
                    db=self.db,
                    recipient_ids=mentioned,
                    actor_id=author_id,
                    actor_name=actor_name,
                    document_id=str(document.id),
                    document_title=document.title,
                    comment=comment.content,
                    workspace_id=workspace_id,
                    comment_id=str(comment.id),
                )

            others = await self._participants(document, comment)
            others -= mentioned
            others.discard(str(author_id))
            if others:
                await notify_document_commented(
                    db=self.db,
                    recipient_ids=others,
                    actor_id=author_id,
                    actor_name=actor_name,
                    document_id=str(document.id),
                    document_title=document.title,
                    comment=comment.content,
                    workspace_id=workspace_id,
                    comment_id=str(comment.id),
                )
        except Exception:
            # Posting the comment is the user's intent; failing to announce it
            # must not lose it.
            logger.exception(
                "Failed to send notifications for comment %s", comment.id
            )

    async def _author_name(self, developer_id: str) -> str:
        from aexy.models.developer import Developer

        developer = (
            await self.db.execute(
                select(Developer).where(Developer.id == developer_id)
            )
        ).scalar_one_or_none()
        if not developer:
            return "Someone"
        return developer.name or developer.github_username or "Someone"
