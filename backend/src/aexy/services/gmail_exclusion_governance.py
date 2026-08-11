"""Who can see a mailbox's exclusions, and who gets told.

The policy this implements, stated plainly because it is unusual: exclusions
are **not private**. Workspace admins can see every rule and every one-off hide,
and a department head is notified when one of their people creates a standing
rule. The organisation wants a record that business correspondence is not being
quietly suppressed.

Three consequences are designed for here rather than left to emerge:

* **Rules notify, hides do not.** Notifying a head on every one-off "not this
  thread" would be noise loud enough to be ignored, which costs the signal the
  policy exists for. Standing rules are the decisions worth a person's
  attention; hides are visible in the admin list without being announced.
* **Looking is recorded.** An exclusion list is itself revealing — a set of
  hidden domains reads as a set of things somebody would rather their manager
  not see — so whoever reads it is written down.
* **The owner is not told when their list is read.** Decided, not overlooked:
  the record exists so the access can be reviewed later, not so it can be
  watched live.

None of that is defensible unless people know *before* they choose, which is
why the disclosure sits on the connect screen and again on the follow-up prompt
rather than in this module's docstring.
"""

from __future__ import annotations

import logging
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.google_integration import GoogleSyncExclusionAudit
from aexy.models.organization import Department, DepartmentMember

logger = logging.getLogger(__name__)

ACTION_RULE_CREATED = "exclusion_rule_created"
ACTION_RULE_DELETED = "exclusion_rule_deleted"
ACTION_MESSAGE_HIDDEN = "message_hidden"
ACTION_VIEWED = "exclusions_viewed"

# Only standing rules reach a head. See the module docstring.
NOTIFYING_ACTIONS = (ACTION_RULE_CREATED, ACTION_RULE_DELETED)


class GmailExclusionGovernance:
    """Audit writes and head notifications for one workspace."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def record(
        self,
        workspace_id: str,
        action: str,
        actor_id: str | None,
        integration_id: str | None = None,
        target: str | None = None,
        extra_data: dict | None = None,
    ) -> GoogleSyncExclusionAudit:
        entry = GoogleSyncExclusionAudit(
            id=str(uuid4()),
            workspace_id=workspace_id,
            integration_id=integration_id,
            actor_id=actor_id,
            action=action,
            target=target,
            extra_data=extra_data,
        )
        self.db.add(entry)
        await self.db.flush()
        return entry

    async def list_audit(
        self, workspace_id: str, limit: int = 200
    ) -> list[GoogleSyncExclusionAudit]:
        result = await self.db.execute(
            select(GoogleSyncExclusionAudit)
            .where(GoogleSyncExclusionAudit.workspace_id == workspace_id)
            .order_by(GoogleSyncExclusionAudit.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def _head_of(self, workspace_id: str, developer_id: str) -> str | None:
        """The department head who should hear about this person's rules.

        The primary department first — somebody in two departments has one
        manager for this purpose, and telling both would spread a private-feeling
        fact wider than the policy asks for.
        """
        rows = (
            await self.db.execute(
                select(Department.head_id, DepartmentMember.is_primary)
                .join(DepartmentMember, DepartmentMember.department_id == Department.id)
                .where(
                    Department.workspace_id == workspace_id,
                    DepartmentMember.developer_id == developer_id,
                    Department.head_id.isnot(None),
                )
            )
        ).all()
        if not rows:
            return None

        primary = next((head for head, is_primary in rows if is_primary), None)
        head_id = primary or rows[0][0]

        # Nobody needs telling about their own rule.
        if head_id and str(head_id) == str(developer_id):
            return None
        return str(head_id) if head_id else None

    async def notify_head(
        self,
        workspace_id: str,
        actor_id: str | None,
        action: str,
        value: str,
    ) -> bool:
        """Tell the actor's department head about a standing rule.

        Returns whether anyone was notified — false is a normal outcome, not a
        failure: a workspace with no departments, or a department with no head,
        has nobody to tell. The audit entry is written either way, so the record
        does not depend on the org chart being filled in.
        """
        if action not in NOTIFYING_ACTIONS or not actor_id:
            return False

        head_id = await self._head_of(workspace_id, actor_id)
        if not head_id:
            return False

        actor = (
            await self.db.execute(select(Developer).where(Developer.id == actor_id))
        ).scalar_one_or_none()
        who = (actor.name or actor.email or "A team member") if actor else "A team member"

        added = action == ACTION_RULE_CREATED
        try:
            from aexy.services.notification_service import NotificationService

            await NotificationService(self.db).create_notification(
                recipient_id=head_id,
                event_type="gmail_exclusion_changed",
                title=(
                    f"{who} excluded {value} from Gmail sync"
                    if added
                    else f"{who} stopped excluding {value} from Gmail sync"
                ),
                body=(
                    f"Mail to or from {value} will no longer sync into Aexy, and "
                    f"anything already synced was removed."
                    if added
                    else f"Mail to or from {value} will sync into Aexy again."
                ),
                context={"workspace_id": workspace_id, "value": value, "action": action},
            )
            return True
        except Exception:  # noqa: BLE001
            # A failed notification must not fail the exclusion. The person asked
            # for mail to stay out of Aexy; refusing that because a message could
            # not be delivered would be the wrong thing to protect.
            logger.exception(
                "Could not notify head %s of exclusion change by %s", head_id, actor_id
            )
            return False
