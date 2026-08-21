"""Drafting a Word edit out of band, and answering @-mentions in its comments.

Two of the three doors into ``DocxAiEditService`` live here. The third is the
HTTP endpoint, which runs the same service inline because the person is waiting.

Why these two are activities rather than inline work:

* A 300-page contract does not fit in an HTTP request's patience. The model call
  alone can run to minutes, and a request that times out halfway leaves the user
  with no draft and no error worth reading.
* The mention scan runs on every save of every Word document. A save must not
  wait on a model call to return the bytes the editor is expecting.

Both notify when they finish, which is the whole reason they can be slow: the
person who asked has gone, and the review queue alone would never tell them.
"""

import logging
from dataclasses import dataclass, field
from typing import Any

from temporalio import activity

from aexy.core.database import get_async_session

logger = logging.getLogger(__name__)


@dataclass
class DraftDocxEditInput:
    document_id: str
    workspace_id: str | None = None
    requested_by_id: str | None = None
    instruction: str | None = None
    selection_text: str | None = None
    scope: str = "document"
    address_comments: bool = False
    comment_ids: list[str] = field(default_factory=list)


@activity.defn
async def draft_docx_ai_edit(input: DraftDocxEditInput) -> dict[str, Any]:
    """Draft the edit, queue it for review, and tell whoever asked.

    Returns a summary rather than raising for a refusal the user caused — a
    workspace with AI off, or an instruction the model could not act on, is not
    something Temporal should retry. Genuine faults propagate and get the
    activity's retry policy.
    """
    from aexy.models.documentation import Document
    from aexy.services.docx_ai_edit_service import (
        DocxAiEditError,
        DocxAiEditService,
        DraftRequest,
    )
    from aexy.services.notification_service import notify_docx_ai_draft_ready

    async with get_async_session() as db:
        request = DraftRequest(
            document_id=input.document_id,
            requested_by_id=input.requested_by_id,
            instruction=input.instruction,
            selection_text=input.selection_text,
            scope=input.scope,  # type: ignore[arg-type]
            address_comments=input.address_comments,
            comment_ids=tuple(input.comment_ids),
            trigger={
                "door": "background",
                "requested_by_id": input.requested_by_id,
                "instruction": input.instruction,
            },
        )

        try:
            proposal = await DocxAiEditService(db).draft_edit(request)
        except DocxAiEditError as exc:
            # The user's own doing — AI switched off, an instruction the model
            # could not act on, more changes than the workspace allows. Retrying
            # would produce the same refusal, so record it and stop.
            logger.info(
                "docx_ai_edit.background_refused document=%s: %s",
                input.document_id,
                exc,
            )
            return {"drafted": False, "reason": str(exc)}

        diff = proposal.diff_summary or {}
        summary = diff.get("summary") or "Changes drafted"
        change_count = int(diff.get("op_count") or 0)

        if input.requested_by_id:
            # The owner event that `create_proposal` sends has a self-action
            # guard, so it deliberately does not tell you about your own
            # request. Without this, the person who asked for a background draft
            # hears nothing at all.
            document = await db.get(Document, input.document_id)
            await notify_docx_ai_draft_ready(
                db,
                recipient_id=input.requested_by_id,
                document_id=input.document_id,
                document_title=(document.title if document else "your document"),
                summary=summary,
                change_count=change_count,
                workspace_id=input.workspace_id,
            )

        return {
            "drafted": True,
            "proposal_id": str(proposal.id),
            "change_count": change_count,
        }


@dataclass
class ScanDocxCommentsInput:
    document_id: str
    workspace_id: str | None = None
    #: Who saved the file. Not the notification's recipient — that is whoever
    #: wrote each comment, who is often somebody else entirely.
    saved_by_id: str | None = None


@activity.defn
async def scan_docx_comments_for_mentions(
    input: ScanDocxCommentsInput,
) -> dict[str, Any]:
    """The third door: somebody wrote ``@aexy`` in a Word comment.

    This is the door that does not start in Aexy at all. A reviewer opens the
    file in Word, types a remark asking for a change, and sends it back. They
    have no reason to be watching a review queue, which is why answering their
    comment sends a notification to *them* rather than to the document's owner.

    One draft for all the mentions in a save, not one per comment: three remarks
    on the same clause are one editing decision, and three separate redlines
    against the same paragraph would conflict with each other on apply.
    """
    from aexy.models.documentation import Document
    from aexy.services import docx_ai_settings
    from aexy.services.docx_ai_edit_service import (
        DocxAiEditError,
        DocxAiEditService,
        DraftRequest,
    )
    from aexy.services.docx_service import DocxReadError, extract_comments
    from aexy.services.notification_service import notify_docx_ai_comment_answered

    async with get_async_session() as db:
        document = await db.get(Document, input.document_id)
        if document is None:
            return {"scanned": False, "reason": "document is gone"}

        workspace_id = input.workspace_id or (
            str(document.workspace_id) if document.workspace_id else None
        )
        settings = (
            await docx_ai_settings.get_settings(db, workspace_id)
            if workspace_id
            else docx_ai_settings.DocxAiSettings()
        )
        if not settings.enabled or not settings.comment_trigger:
            return {"scanned": False, "reason": "comment trigger is off"}

        service = DocxAiEditService(db)
        try:
            raw = await service._load_bytes(input.document_id)
            comments = extract_comments(raw)
        except (DocxReadError, DocxAiEditError) as exc:
            logger.info(
                "docx_ai_edit.scan_unreadable document=%s: %s",
                input.document_id,
                exc,
            )
            return {"scanned": False, "reason": str(exc)}

        handle = settings.mention.lower()
        mentioned = [
            comment
            for comment in comments
            # Resolved threads are excluded: somebody marked that conversation
            # finished, and re-answering it would reopen a closed argument on
            # every subsequent save.
            if not comment.resolved and handle in comment.text.lower()
        ]
        if not mentioned:
            return {"scanned": True, "mentions": 0}

        try:
            proposal = await service.draft_edit(
                DraftRequest(
                    document_id=input.document_id,
                    # No `requested_by_id`: nobody in Aexy asked for this. The
                    # proposal is attributed to the trigger, and the comment
                    # authors are told individually below.
                    requested_by_id=None,
                    address_comments=True,
                    comment_ids=tuple(c.id for c in mentioned),
                    trigger={
                        "door": "comment_mention",
                        "handle": settings.mention,
                        "comment_ids": [c.id for c in mentioned],
                        "comment_authors": sorted({c.author for c in mentioned}),
                    },
                )
            )
        except DocxAiEditError as exc:
            logger.info(
                "docx_ai_edit.scan_refused document=%s: %s", input.document_id, exc
            )
            return {"scanned": True, "mentions": len(mentioned), "drafted": False}

        diff = proposal.diff_summary or {}
        summary = diff.get("summary") or "Changes drafted"

        # One notification per distinct author, not per comment: somebody who
        # left four remarks asked one question as far as the bell is concerned.
        # Resolved once into author -> their first comment, rather than looked up
        # again per notification.
        by_author: dict[str, str] = {}
        for comment in mentioned:
            author_id = await _author_id_of(db, comment, workspace_id)
            if author_id and author_id not in by_author:
                by_author[author_id] = _excerpt(comment.text)

        notified = 0
        for author_id, excerpt in by_author.items():
            notified += await notify_docx_ai_comment_answered(
                db,
                recipient_id=author_id,
                document_id=input.document_id,
                document_title=document.title,
                comment_excerpt=excerpt,
                summary=summary,
                workspace_id=workspace_id,
            )

        return {
            "scanned": True,
            "mentions": len(mentioned),
            "drafted": True,
            "proposal_id": str(proposal.id),
            "notified": notified,
        }


def _excerpt(text: str, limit: int = 120) -> str:
    """A comment short enough to sit inside a notification body."""
    flat = " ".join(text.split())
    return flat if len(flat) <= limit else flat[: limit - 1] + "…"


async def _author_id_of(db: Any, comment: Any, workspace_id: str | None) -> str | None:
    """The Aexy developer behind a Word comment author name, if there is one.

    Word records a display name and initials, not an email — so this is a name
    match against workspace members, and it fails to None rather than guessing.
    A notification sent to the wrong person because two members share a first
    name is worse than one not sent.
    """
    if not workspace_id:
        return None

    from sqlalchemy import func, select

    from aexy.models.developer import Developer
    from aexy.models.workspace import WorkspaceMember

    name = (comment.author or "").strip()
    if not name:
        return None

    rows = (
        await db.execute(
            select(Developer.id)
            .join(WorkspaceMember, WorkspaceMember.developer_id == Developer.id)
            .where(
                WorkspaceMember.workspace_id == workspace_id,
                func.lower(Developer.name) == name.lower(),
            )
            .limit(2)
        )
    ).scalars().all()

    # Exactly one match, or nobody. Two members called "Sam" means we do not know
    # which one wrote the comment.
    return str(rows[0]) if len(rows) == 1 else None
