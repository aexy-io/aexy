"""Daily sweep that reminds people about work they own that is coming due.

`deadline_reminder_1_day` and `deadline_reminder_day_of` were declared, given
channel defaults, and listed in notification settings — and nothing ever fired
them. Review cycles had their own sweep (`check_review_deadlines`), so the only
deadlines anyone was reminded about were review deadlines; a task with a due date
tomorrow told its assignee nothing.

That is the other half of assignment. Being told a task is yours and never being
told it is due is most of the way to not being told at all.

Covers the two work-item types that actually carry a date:

* ``SprintTask.end_date`` — tasks and project/backlog cards, to ``assignee_id``
* ``UserStory.target_date`` — stories, to ``owner_id``

Bugs are deliberately absent: the ``Bug`` model has no due-date column, so there
is nothing to sweep. If one is added, it joins the ``specs`` list below.

Idempotency is by inspection of the notifications already sent rather than a new
column on three tables: a reminder is skipped when a notification of the same
event type already exists for that recipient and that item. That is exact — each
threshold is its own event type, so an item can produce at most one T-1 and one
day-of reminder, ever — and it survives the sweep running twice in a day or
catching up after a missed one.
"""

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)

# How far back to read already-sent reminders when building the skip set. Only
# needs to cover the window in which a given item could still be reminded about,
# and keeps the query bounded on a workspace with a long notification history.
_SENT_LOOKBACK_DAYS = 120


@dataclass
class CheckWorkItemDeadlinesInput:
    """No input — the activity scans every workspace. Trigger via the
    `work-item-deadline-reminders` schedule defined in `temporal/schedules.py`."""


def _as_date(value: Any) -> date | None:
    """Normalise a date or datetime column to a plain date."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


@activity.defn
async def check_work_item_deadlines(
    input: CheckWorkItemDeadlinesInput,
) -> dict[str, Any]:
    """Fire due-tomorrow and due-today reminders for assigned work items."""
    from sqlalchemy import select

    from aexy.models.notification import Notification, NotificationEventType
    from aexy.models.sprint import SprintTask
    from aexy.models.story import UserStory
    from aexy.services.notification_service import notify_deadline_reminder

    today = date.today()
    tomorrow = today + timedelta(days=1)

    day_of = NotificationEventType.DEADLINE_REMINDER_DAY_OF
    one_day = NotificationEventType.DEADLINE_REMINDER_1_DAY

    sent = 0
    scanned = 0

    async with async_session_maker() as db:
        # (model, due column, assignee column, statuses to skip, label, url builder)
        specs = [
            (
                SprintTask,
                SprintTask.end_date,
                SprintTask.assignee_id,
                ["done", "cancelled"],
                "task",
                lambda item: (
                    f"/sprints/{item.team_id}/board?task={item.id}"
                    if item.team_id
                    else f"/sprints?task={item.id}"
                ),
            ),
            (
                UserStory,
                UserStory.target_date,
                UserStory.owner_id,
                ["accepted", "rejected"],
                "story",
                lambda item: f"/sprints?story={item.id}",
            ),
        ]

        due_items: list[tuple[Any, str, str, str, str, date]] = []

        for model, due_col, assignee_col, skip_statuses, label, url_for in specs:
            query = select(model).where(
                due_col.isnot(None),
                assignee_col.isnot(None),
                model.status.notin_(skip_statuses),
            )
            # Archived cards are off everyone's list; only SprintTask has the flag.
            if hasattr(model, "is_archived"):
                query = query.where(model.is_archived.is_(False))

            for item in (await db.execute(query)).scalars().all():
                scanned += 1
                due = _as_date(getattr(item, due_col.key))
                if due is None:
                    continue
                # Overdue items are not reminded about: a reminder that a thing
                # was due last week reads as a bug, and chasing overdue work is
                # what the escalation and digest paths are for.
                if due == today:
                    event = day_of
                elif due == tomorrow:
                    event = one_day
                else:
                    continue

                recipient = getattr(item, assignee_col.key)
                due_items.append(
                    (item, str(recipient), event.value, label, url_for(item), due)
                )

        if not due_items:
            return {"scanned": scanned, "sent": 0}

        # One query for everything already sent, rather than one per item.
        recipients = {entry[1] for entry in due_items}
        cutoff = datetime.now(timezone.utc) - timedelta(days=_SENT_LOOKBACK_DAYS)
        existing = (
            await db.execute(
                select(Notification).where(
                    Notification.recipient_id.in_(recipients),
                    Notification.event_type.in_([day_of.value, one_day.value]),
                    Notification.created_at >= cutoff,
                )
            )
        ).scalars().all()

        # Compared in Python rather than with a JSONB operator so this behaves the
        # same on the SQLite the test suite runs against.
        already_sent = {
            (n.recipient_id, n.event_type, (n.context or {}).get("entity_id"))
            for n in existing
        }

        for item, recipient, event_value, label, action_url, due in due_items:
            if (recipient, event_value, str(item.id)) in already_sent:
                continue
            try:
                await notify_deadline_reminder(
                    db=db,
                    developer_id=recipient,
                    task_type=label,
                    # The date resolved above, rather than re-deriving it from
                    # whichever column this model happens to use — that version
                    # would raise AttributeError on `None.isoformat()` the moment a
                    # third work-item type joined the sweep with a differently
                    # named due column.
                    deadline=due.isoformat(),
                    action_url=action_url,
                    is_day_of=event_value == day_of.value,
                    entity_id=str(item.id),
                    title=item.title,
                )
                already_sent.add((recipient, event_value, str(item.id)))
                sent += 1
            except Exception:
                logger.exception(
                    "Failed to send deadline reminder for %s %s", label, item.id
                )

        await db.commit()

    logger.info("Work item deadline sweep: scanned=%s sent=%s", scanned, sent)
    return {"scanned": scanned, "sent": sent}
