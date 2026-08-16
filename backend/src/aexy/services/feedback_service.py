"""Product feedback: writing it, voting on it, and getting it in front of us."""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.models.developer import Developer
from aexy.models.feedback import Feedback, FeedbackStatus, FeedbackVote
from aexy.models.workspace import Workspace

logger = logging.getLogger(__name__)
settings = get_settings()

# One person can file this many in an hour. Not a security boundary — a brake,
# so a stuck client or a frustrated afternoon cannot bury the board.
MAX_SUBMISSIONS_PER_HOUR = 5


class FeedbackRateLimited(Exception):
    """Too many submissions from one person in the last hour."""


class FeedbackService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------ write

    async def create(
        self,
        workspace_id: str,
        developer_id: str,
        kind: str,
        subject: str,
        body: str,
        context: dict | None = None,
    ) -> Feedback:
        since = datetime.now(timezone.utc) - timedelta(hours=1)
        recent = await self.db.scalar(
            select(func.count())
            .select_from(Feedback)
            .where(Feedback.developer_id == developer_id, Feedback.created_at >= since)
        )
        if (recent or 0) >= MAX_SUBMISSIONS_PER_HOUR:
            raise FeedbackRateLimited(
                f"Only {MAX_SUBMISSIONS_PER_HOUR} pieces of feedback an hour, sorry — "
                "the rest of yours are safe, try again shortly."
            )

        item = Feedback(
            workspace_id=workspace_id,
            developer_id=developer_id,
            kind=kind,
            subject=subject.strip(),
            body=body.strip(),
            context=context or {},
            status=FeedbackStatus.NEW.value,
        )
        self.db.add(item)
        await self.db.commit()
        await self.db.refresh(item)

        # The author's own opinion counts, and starting at zero makes a brand
        # new item look unwanted next to one that has been up for a week.
        await self.vote(item.id, developer_id)
        await self.db.refresh(item)
        return item

    async def vote(self, feedback_id: str, developer_id: str) -> tuple[bool, int]:
        """Add a vote. Idempotent: voting twice leaves one vote.

        Returns (voted, vote_count).
        """
        item = await self.db.get(Feedback, feedback_id)
        if not item:
            raise ValueError("Feedback not found")

        self.db.add(FeedbackVote(feedback_id=feedback_id, developer_id=developer_id))
        try:
            await self.db.flush()
        except IntegrityError:
            # The unique constraint did its job: they already voted.
            await self.db.rollback()
            return True, await self._recount(feedback_id)

        await self.db.commit()
        return True, await self._recount(feedback_id)

    async def unvote(self, feedback_id: str, developer_id: str) -> tuple[bool, int]:
        await self.db.execute(
            delete(FeedbackVote).where(
                FeedbackVote.feedback_id == feedback_id,
                FeedbackVote.developer_id == developer_id,
            )
        )
        await self.db.commit()
        return False, await self._recount(feedback_id)

    async def _recount(self, feedback_id: str) -> int:
        """Recount from the votes table rather than incrementing the copy.

        `vote_count` exists to order the board cheaply; it is not the record of
        who voted. Recomputing means a lost race or a deleted developer leaves
        the number right instead of drifting a little further each time.
        """
        count = await self.db.scalar(
            select(func.count())
            .select_from(FeedbackVote)
            .where(FeedbackVote.feedback_id == feedback_id)
        )
        item = await self.db.get(Feedback, feedback_id)
        if item:
            item.vote_count = count or 0
            await self.db.commit()
        return count or 0

    # ------------------------------------------------------------------- read

    async def list_board(
        self,
        developer_id: str,
        kind: str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[dict], int]:
        """The shared board: most wanted first, newest as the tie-break.

        Declined items are hidden unless asked for by name — an answer of "no"
        should be findable, but it is not what the board is for.
        """
        conditions = []
        if kind:
            conditions.append(Feedback.kind == kind)
        if status:
            conditions.append(Feedback.status == status)
        else:
            conditions.append(Feedback.status != FeedbackStatus.DECLINED.value)

        total = await self.db.scalar(
            select(func.count()).select_from(Feedback).where(*conditions)
        )

        rows = (
            await self.db.execute(
                select(Feedback)
                .where(*conditions)
                .order_by(Feedback.vote_count.desc(), Feedback.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        ).scalars().all()

        voted_ids = await self._voted_ids(developer_id, [r.id for r in rows])
        return (
            [
                {
                    "id": r.id,
                    "kind": r.kind,
                    "subject": r.subject,
                    "body": r.body,
                    "status": r.status,
                    "vote_count": r.vote_count,
                    "created_at": r.created_at,
                    "voted": r.id in voted_ids,
                    "mine": str(r.developer_id) == str(developer_id),
                }
                for r in rows
            ],
            total or 0,
        )

    async def list_mine(self, developer_id: str) -> list[dict]:
        rows = (
            await self.db.execute(
                select(Feedback)
                .where(Feedback.developer_id == developer_id)
                .order_by(Feedback.created_at.desc())
            )
        ).scalars().all()
        voted_ids = await self._voted_ids(developer_id, [r.id for r in rows])
        return [
            {
                "id": r.id,
                "kind": r.kind,
                "subject": r.subject,
                "body": r.body,
                "status": r.status,
                "vote_count": r.vote_count,
                "created_at": r.created_at,
                "voted": r.id in voted_ids,
                "mine": True,
            }
            for r in rows
        ]

    async def _voted_ids(self, developer_id: str, feedback_ids: list[str]) -> set[str]:
        if not feedback_ids:
            return set()
        rows = await self.db.execute(
            select(FeedbackVote.feedback_id).where(
                FeedbackVote.developer_id == developer_id,
                FeedbackVote.feedback_id.in_(feedback_ids),
            )
        )
        return {row[0] for row in rows.all()}

    # ------------------------------------------------------------------ admin

    async def list_for_admin(
        self,
        kind: str | None = None,
        status: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[dict], int]:
        conditions = []
        if kind:
            conditions.append(Feedback.kind == kind)
        if status:
            conditions.append(Feedback.status == status)

        total = await self.db.scalar(
            select(func.count()).select_from(Feedback).where(*conditions)
        )

        rows = (
            await self.db.execute(
                select(Feedback, Workspace, Developer)
                .outerjoin(Workspace, Workspace.id == Feedback.workspace_id)
                .outerjoin(Developer, Developer.id == Feedback.developer_id)
                .where(*conditions)
                .order_by(Feedback.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        ).all()

        return (
            [
                {
                    "id": item.id,
                    "kind": item.kind,
                    "subject": item.subject,
                    "body": item.body,
                    "status": item.status,
                    "vote_count": item.vote_count,
                    "created_at": item.created_at,
                    "updated_at": item.updated_at,
                    "voted": False,
                    "mine": False,
                    "workspace_id": item.workspace_id,
                    "workspace_name": workspace.name if workspace else None,
                    "developer_id": item.developer_id,
                    "developer_name": developer.name if developer else None,
                    "developer_email": developer.email if developer else None,
                    "context": item.context or {},
                    "admin_note": item.admin_note,
                    "reviewed_by_id": item.reviewed_by_id,
                    "reviewed_at": item.reviewed_at,
                }
                for item, workspace, developer in rows
            ],
            total or 0,
        )

    async def review(
        self,
        feedback_id: str,
        reviewer_id: str,
        status: str | None = None,
        admin_note: str | None = None,
    ) -> Feedback:
        item = await self.db.get(Feedback, feedback_id)
        if not item:
            raise ValueError("Feedback not found")

        changed_status = status is not None and status != item.status
        if status is not None:
            item.status = status
        if admin_note is not None:
            item.admin_note = admin_note
        item.reviewed_by_id = reviewer_id
        item.reviewed_at = datetime.now(timezone.utc)

        await self.db.commit()
        await self.db.refresh(item)

        if changed_status:
            await self._notify_author_of_status(item)
        return item

    async def since(self, since: datetime) -> list[Feedback]:
        """Everything filed since a moment — what the daily digest reports."""
        rows = await self.db.execute(
            select(Feedback)
            .where(Feedback.created_at >= since)
            .order_by(Feedback.vote_count.desc(), Feedback.created_at.desc())
        )
        return list(rows.scalars().all())

    async def top_open(self, limit: int = 5) -> list[Feedback]:
        """The most wanted open items, so a digest is not only news."""
        rows = await self.db.execute(
            select(Feedback)
            .where(
                Feedback.status.notin_(
                    [FeedbackStatus.SHIPPED.value, FeedbackStatus.DECLINED.value]
                )
            )
            .order_by(Feedback.vote_count.desc(), Feedback.created_at.desc())
            .limit(limit)
        )
        return list(rows.scalars().all())

    # ---------------------------------------------------------- notifications

    async def notify_admins(self, item: Feedback) -> None:
        """In-app notice to the platform admins, best-effort.

        Failing here must not fail the submission: the item is already stored,
        and the daily digest will carry it even if this never lands.
        """
        try:
            from aexy.models.notification import NotificationEventType
            from aexy.services.notification_service import NotificationService

            admins = await self._platform_admins()
            if not admins:
                return

            author = await self.db.get(Developer, item.developer_id)
            workspace = await self.db.get(Workspace, item.workspace_id)
            service = NotificationService(self.db)
            for admin in admins:
                await service.create_notification(
                    recipient_id=str(admin.id),
                    event_type=NotificationEventType.FEEDBACK_SUBMITTED,
                    title=f"New {item.kind.replace('_', ' ')}",
                    body=item.subject,
                    context={
                        "feedback_id": str(item.id),
                        "kind": item.kind,
                        "workspace_id": str(item.workspace_id),
                        "workspace_name": workspace.name if workspace else None,
                        "author_name": author.name if author else None,
                        "action_url": "/admin/feedback",
                    },
                )
        except Exception:  # noqa: BLE001 — the feedback is already recorded
            logger.exception("Could not notify platform admins of feedback %s", item.id)

    async def _notify_author_of_status(self, item: Feedback) -> None:
        """Tell the person who wrote it what happened to it."""
        try:
            from aexy.models.notification import NotificationEventType
            from aexy.services.notification_service import NotificationService

            await NotificationService(self.db).create_notification(
                recipient_id=str(item.developer_id),
                event_type=NotificationEventType.FEEDBACK_STATUS_CHANGED,
                title=f"Your feedback is {item.status}",
                body=item.subject,
                context={
                    "feedback_id": str(item.id),
                    "status": item.status,
                    "admin_note": item.admin_note,
                    "action_url": "/feedback?mine=1",
                },
            )
        except Exception:  # noqa: BLE001
            logger.exception("Could not notify the author of feedback %s", item.id)

    async def _platform_admins(self) -> list[Developer]:
        """The developer rows behind ADMIN_EMAILS.

        Platform admin is granted by email, so an address on the list with no
        account yet simply has nobody to notify in-app — the digest still
        reaches the address itself.
        """
        emails = settings.admin_email_list
        if not emails:
            return []
        rows = await self.db.execute(
            select(Developer).where(func.lower(Developer.email).in_(emails))
        )
        return list(rows.scalars().all())
