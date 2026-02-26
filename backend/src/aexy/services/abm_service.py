"""Account-Based Marketing service for target list and account management."""

import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select, and_, func, delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.gtm_abm import ABMTargetList, ABMAccount

logger = logging.getLogger(__name__)


class ABMService:
    """Service for ABM target lists, accounts, engagement, and analytics."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # TARGET LIST CRUD
    # =========================================================================

    async def create_target_list(
        self,
        workspace_id: str,
        data: dict,
        created_by: str | None = None,
    ) -> ABMTargetList:
        """Create a new ABM target list."""
        target_list = ABMTargetList(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=data["name"],
            description=data.get("description"),
            criteria=data.get("criteria", {}),
            is_dynamic=data.get("is_dynamic", False),
            is_active=data.get("is_active", True),
            created_by=created_by,
        )
        self.db.add(target_list)
        await self.db.commit()
        await self.db.refresh(target_list)
        logger.info("Created ABM target list %s in workspace %s", target_list.id, workspace_id)
        return target_list

    async def update_target_list(
        self,
        workspace_id: str,
        list_id: str,
        data: dict,
    ) -> ABMTargetList | None:
        """Update an existing target list."""
        target_list = await self.get_target_list(workspace_id, list_id)
        if not target_list:
            return None
        for field in ("name", "description", "criteria", "is_dynamic", "is_active"):
            if field in data:
                setattr(target_list, field, data[field])
        await self.db.commit()
        await self.db.refresh(target_list)
        return target_list

    async def delete_target_list(self, workspace_id: str, list_id: str) -> bool:
        """Delete a target list and its accounts (cascade)."""
        target_list = await self.get_target_list(workspace_id, list_id)
        if not target_list:
            return False
        await self.db.execute(
            delete(ABMAccount).where(
                and_(
                    ABMAccount.workspace_id == workspace_id,
                    ABMAccount.target_list_id == list_id,
                )
            )
        )
        await self.db.delete(target_list)
        await self.db.commit()
        logger.info("Deleted ABM target list %s", list_id)
        return True

    async def list_target_lists(self, workspace_id: str) -> list[ABMTargetList]:
        """List all target lists for a workspace."""
        result = await self.db.execute(
            select(ABMTargetList)
            .where(ABMTargetList.workspace_id == workspace_id)
            .order_by(ABMTargetList.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_target_list(self, workspace_id: str, list_id: str) -> ABMTargetList | None:
        """Get a single target list by ID."""
        result = await self.db.execute(
            select(ABMTargetList).where(
                and_(
                    ABMTargetList.workspace_id == workspace_id,
                    ABMTargetList.id == list_id,
                )
            )
        )
        return result.scalar_one_or_none()

    # =========================================================================
    # ACCOUNT MANAGEMENT
    # =========================================================================

    async def add_accounts(
        self,
        workspace_id: str,
        list_id: str,
        accounts: list[dict],
    ) -> list[ABMAccount]:
        """Bulk add accounts to a target list."""
        target_list = await self.get_target_list(workspace_id, list_id)
        if not target_list:
            raise ValueError(f"Target list {list_id} not found")

        created = []
        for entry in accounts:
            account = ABMAccount(
                id=str(uuid4()),
                workspace_id=workspace_id,
                target_list_id=list_id,
                record_id=entry["record_id"],
                tier=entry.get("tier", "tier_2"),
                owner_id=entry.get("owner_id"),
                notes=entry.get("notes"),
                stage_history=[
                    {
                        "stage": "unaware",
                        "changed_at": datetime.now(timezone.utc).isoformat(),
                        "notes": "Account added to list",
                    }
                ],
            )
            self.db.add(account)
            created.append(account)

        target_list.account_count = target_list.account_count + len(created)
        await self.db.commit()
        for acct in created:
            await self.db.refresh(acct)
        logger.info("Added %d accounts to list %s", len(created), list_id)
        return created

    async def remove_account(self, workspace_id: str, account_id: str) -> bool:
        """Remove an account and decrement the parent list count."""
        account = await self.get_account(workspace_id, account_id)
        if not account:
            return False
        target_list = await self.get_target_list(workspace_id, account.target_list_id)
        await self.db.delete(account)
        if target_list and target_list.account_count > 0:
            target_list.account_count = target_list.account_count - 1
        await self.db.commit()
        return True

    async def change_stage(
        self,
        workspace_id: str,
        account_id: str,
        new_stage: str,
        notes: str | None = None,
    ) -> ABMAccount | None:
        """Update account stage and append to stage_history."""
        account = await self.get_account(workspace_id, account_id)
        if not account:
            return None
        history_entry = {
            "stage": new_stage,
            "changed_at": datetime.now(timezone.utc).isoformat(),
            "notes": notes,
        }
        account.stage = new_stage
        account.stage_history = [*account.stage_history, history_entry]
        await self.db.commit()
        await self.db.refresh(account)
        return account

    async def list_accounts(
        self,
        workspace_id: str,
        page: int = 1,
        per_page: int = 50,
        target_list_id: str | None = None,
        tier: str | None = None,
        stage: str | None = None,
    ) -> dict:
        """Paginated account listing with optional filters."""
        conditions = [ABMAccount.workspace_id == workspace_id]
        if target_list_id:
            conditions.append(ABMAccount.target_list_id == target_list_id)
        if tier:
            conditions.append(ABMAccount.tier == tier)
        if stage:
            conditions.append(ABMAccount.stage == stage)

        where = and_(*conditions)

        total_result = await self.db.execute(
            select(func.count(ABMAccount.id)).where(where)
        )
        total = total_result.scalar() or 0

        offset = (page - 1) * per_page
        result = await self.db.execute(
            select(ABMAccount)
            .where(where)
            .order_by(ABMAccount.engagement_score.desc(), ABMAccount.added_at.desc())
            .offset(offset)
            .limit(per_page)
        )
        accounts = list(result.scalars().all())

        return {
            "accounts": accounts,
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": (total + per_page - 1) // per_page if per_page else 0,
        }

    async def get_account(self, workspace_id: str, account_id: str) -> ABMAccount | None:
        """Get a single account by ID."""
        result = await self.db.execute(
            select(ABMAccount).where(
                and_(
                    ABMAccount.workspace_id == workspace_id,
                    ABMAccount.id == account_id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def update_account(
        self,
        workspace_id: str,
        account_id: str,
        data: dict,
    ) -> ABMAccount | None:
        """Update account fields (tier, owner_id, notes)."""
        account = await self.get_account(workspace_id, account_id)
        if not account:
            return None
        for field in ("tier", "owner_id", "notes"):
            if field in data:
                setattr(account, field, data[field])
        await self.db.commit()
        await self.db.refresh(account)
        return account

    # =========================================================================
    # ENGAGEMENT
    # =========================================================================

    async def recalculate_engagement(
        self,
        workspace_id: str,
        account_id: str,
    ) -> ABMAccount | None:
        """Recalculate engagement score for an account from real data sources.

        Pulls from: outreach enrollments (emails sent/replied), email campaign
        recipients (opens/clicks), visitor sessions, and intent signals.
        Falls back to the stored counters for meetings/deals which are
        updated manually or via CRM sync.
        """
        account = await self.get_account(workspace_id, account_id)
        if not account or not account.record_id:
            return None

        record_id = account.record_id

        # ---- Pull real engagement data ----
        try:
            from aexy.models.gtm_outreach import OutreachEnrollment, OutreachStepExecution
            from aexy.models.email_marketing import CampaignRecipient
            from aexy.models.gtm import VisitorSession
            from aexy.models.gtm_intent import IntentSignal

            # Outreach: count sent steps and replied enrollments
            sent_steps = await self.db.scalar(
                select(func.count(OutreachStepExecution.id))
                .join(OutreachEnrollment, OutreachStepExecution.enrollment_id == OutreachEnrollment.id)
                .where(and_(
                    OutreachEnrollment.record_id == record_id,
                    OutreachEnrollment.workspace_id == workspace_id,
                    OutreachStepExecution.status == "sent",
                ))
            ) or 0

            replied_enrollments = await self.db.scalar(
                select(func.count(OutreachEnrollment.id)).where(and_(
                    OutreachEnrollment.record_id == record_id,
                    OutreachEnrollment.workspace_id == workspace_id,
                    OutreachEnrollment.status == "replied",
                ))
            ) or 0

            # Email campaigns: opens + clicks
            email_agg = (await self.db.execute(
                select(
                    func.coalesce(func.sum(CampaignRecipient.open_count), 0),
                    func.coalesce(func.sum(CampaignRecipient.click_count), 0),
                ).where(CampaignRecipient.record_id == record_id)
            )).one_or_none()
            total_opens = email_agg[0] if email_agg else 0
            total_clicks = email_agg[1] if email_agg else 0

            # Visitor sessions
            visit_count = await self.db.scalar(
                select(func.count(VisitorSession.id)).where(and_(
                    VisitorSession.workspace_id == workspace_id,
                    VisitorSession.record_id == record_id,
                ))
            ) or 0

            # Intent signals (non-dismissed)
            intent_count = await self.db.scalar(
                select(func.count(IntentSignal.id)).where(and_(
                    IntentSignal.workspace_id == workspace_id,
                    IntentSignal.record_id == record_id,
                    IntentSignal.is_dismissed == False,  # noqa: E712
                ))
            ) or 0

            # Update stored counters
            account.emails_sent = sent_steps
            account.emails_replied = replied_enrollments

        except Exception:
            # If any model isn't available yet, fall back to stored counters
            logger.debug("ABM engagement: falling back to stored counters for account %s", account_id)
            sent_steps = account.emails_sent
            replied_enrollments = account.emails_replied
            total_opens = 0
            total_clicks = 0
            visit_count = 0
            intent_count = 0

        # ---- Compute weighted score ----
        score = min(100, (
            sent_steps * 1
            + total_opens * 2
            + total_clicks * 5
            + replied_enrollments * 20
            + visit_count * 3
            + intent_count * 8
            + account.meetings_booked * 25
            + account.deals_created * 30
        ))
        account.engagement_score = score
        await self.db.commit()
        await self.db.refresh(account)
        return account

    async def batch_recalculate_engagement(self, workspace_id: str) -> int:
        """Recalculate engagement scores for all accounts in a workspace."""
        result = await self.db.execute(
            select(ABMAccount.id).where(ABMAccount.workspace_id == workspace_id)
        )
        account_ids = list(result.scalars().all())
        for account_id in account_ids:
            await self.recalculate_engagement(workspace_id, account_id)
        logger.info("Recalculated engagement for %d accounts in workspace %s", len(account_ids), workspace_id)
        return len(account_ids)

    # =========================================================================
    # DYNAMIC LISTS
    # =========================================================================

    async def refresh_dynamic_list(self, workspace_id: str, list_id: str) -> ABMTargetList | None:
        """Refresh a dynamic list by re-evaluating criteria against CRM.

        Placeholder: updates account_count from actual DB count.
        """
        target_list = await self.get_target_list(workspace_id, list_id)
        if not target_list or not target_list.is_dynamic:
            return target_list

        count_result = await self.db.execute(
            select(func.count(ABMAccount.id)).where(
                and_(
                    ABMAccount.workspace_id == workspace_id,
                    ABMAccount.target_list_id == list_id,
                )
            )
        )
        target_list.account_count = count_result.scalar() or 0
        await self.db.commit()
        await self.db.refresh(target_list)
        logger.info("Refreshed dynamic list %s, account_count=%d", list_id, target_list.account_count)
        return target_list

    # =========================================================================
    # ANALYTICS
    # =========================================================================

    async def get_abm_overview(self, workspace_id: str) -> dict:
        """Get ABM overview analytics for a workspace."""
        base = ABMAccount.workspace_id == workspace_id

        # Stage distribution
        stage_result = await self.db.execute(
            select(ABMAccount.stage, func.count(ABMAccount.id))
            .where(base)
            .group_by(ABMAccount.stage)
        )
        stage_distribution = {row[0]: row[1] for row in stage_result.all()}

        # Tier distribution
        tier_result = await self.db.execute(
            select(ABMAccount.tier, func.count(ABMAccount.id))
            .where(base)
            .group_by(ABMAccount.tier)
        )
        tier_distribution = {row[0]: row[1] for row in tier_result.all()}

        # Aggregate metrics
        agg_result = await self.db.execute(
            select(
                func.count(ABMAccount.id),
                func.coalesce(func.avg(ABMAccount.engagement_score), 0),
            ).where(base)
        )
        row = agg_result.one()
        total_accounts = row[0]
        avg_engagement_score = round(float(row[1]), 2)

        # Total lists
        list_count_result = await self.db.execute(
            select(func.count(ABMTargetList.id)).where(
                ABMTargetList.workspace_id == workspace_id
            )
        )
        total_lists = list_count_result.scalar() or 0

        # Top 10 accounts by engagement
        top_result = await self.db.execute(
            select(ABMAccount)
            .where(base)
            .order_by(ABMAccount.engagement_score.desc())
            .limit(10)
        )
        top_accounts = list(top_result.scalars().all())

        return {
            "total_accounts": total_accounts,
            "total_lists": total_lists,
            "avg_engagement_score": avg_engagement_score,
            "stage_distribution": stage_distribution,
            "tier_distribution": tier_distribution,
            "top_accounts": top_accounts,
        }

    async def get_account_journey(self, workspace_id: str, account_id: str) -> dict | None:
        """Get the journey timeline for an account (stage history + campaigns)."""
        account = await self.get_account(workspace_id, account_id)
        if not account:
            return None

        events: list[dict] = []

        for entry in account.stage_history:
            events.append({
                "type": "stage_change",
                "stage": entry.get("stage"),
                "at": entry.get("changed_at"),
                "notes": entry.get("notes"),
            })

        for campaign in account.assigned_campaigns:
            events.append({
                "type": "campaign_assigned",
                "campaign_id": campaign.get("campaign_id"),
                "campaign_name": campaign.get("campaign_name"),
                "at": campaign.get("assigned_at"),
            })

        # Sort events chronologically
        events.sort(key=lambda e: e.get("at") or "")

        return {
            "account_id": account.id,
            "record_id": account.record_id,
            "events": events,
        }

    # =========================================================================
    # CAMPAIGN ASSIGNMENT
    # =========================================================================

    async def assign_campaign(
        self,
        workspace_id: str,
        account_id: str,
        campaign_id: str,
        campaign_name: str,
    ) -> ABMAccount | None:
        """Assign a campaign to an account."""
        account = await self.get_account(workspace_id, account_id)
        if not account:
            return None
        entry = {
            "campaign_id": campaign_id,
            "campaign_name": campaign_name,
            "assigned_at": datetime.now(timezone.utc).isoformat(),
        }
        account.assigned_campaigns = [*account.assigned_campaigns, entry]
        await self.db.commit()
        await self.db.refresh(account)
        logger.info("Assigned campaign %s to account %s", campaign_id, account_id)
        return account
