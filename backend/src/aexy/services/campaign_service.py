"""Campaign service for email campaign management and sending."""

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select, and_, func, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.email_marketing import (
    EmailCampaign,
    EmailTemplate,
    CampaignRecipient,
    EmailSubscriber,
    CampaignStatus,
    RecipientStatus,
    SubscriberStatus,
)
from aexy.models.crm import CRMList, CRMRecord, CRMListEntry
from aexy.models.email_infrastructure import SendingDomain, SendingIdentity, SendingPool
from aexy.schemas.email_infrastructure import RoutingConfigUpdate
from aexy.schemas.email_marketing import (
    EmailCampaignCreate,
    EmailCampaignUpdate,
    FilterCondition,
)
from aexy.services.domain_service import DomainService
from aexy.services.routing_service import RoutingService
from aexy.services.template_service import TemplateService
from aexy.services.automation_service import dispatch_automation_event

logger = logging.getLogger(__name__)


class CampaignService:
    """Service for email campaign management and sending."""

    def __init__(self, db: AsyncSession):
        """Initialize the campaign service."""
        self.db = db
        self.template_service = TemplateService(db)

    # =========================================================================
    # CAMPAIGN CRUD
    # =========================================================================

    async def create_campaign(
        self,
        workspace_id: str,
        data: EmailCampaignCreate,
        created_by_id: str | None = None,
    ) -> EmailCampaign:
        """Create a new email campaign."""
        await self._validate_routing(
            workspace_id, data.sending_pool_id, data.sending_identity_id
        )
        campaign = EmailCampaign(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=data.name,
            description=data.description,
            template_id=data.template_id,
            list_id=data.list_id,
            audience_filters=[f.model_dump() for f in data.audience_filters],
            campaign_type=data.campaign_type,
            status=CampaignStatus.DRAFT.value,
            from_name=data.from_name,
            from_email=data.from_email,
            reply_to=data.reply_to,
            template_context=data.template_context,
            scheduled_at=data.scheduled_at,
            send_window=data.send_window.model_dump() if data.send_window else None,
            sending_pool_id=data.sending_pool_id,
            sending_identity_id=data.sending_identity_id,
            created_by_id=created_by_id,
        )

        self.db.add(campaign)
        await self.db.commit()
        await self.db.refresh(campaign)

        logger.info(f"Created email campaign: {campaign.id} ({campaign.name})")
        return campaign

    async def get_campaign(
        self,
        campaign_id: str,
        workspace_id: str | None = None,
    ) -> EmailCampaign | None:
        """Get a campaign by ID."""
        query = select(EmailCampaign).where(EmailCampaign.id == campaign_id)
        if workspace_id:
            query = query.where(EmailCampaign.workspace_id == workspace_id)

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_campaign_with_template(
        self,
        campaign_id: str,
        workspace_id: str | None = None,
    ) -> EmailCampaign | None:
        """Get a campaign with its template loaded."""
        query = (
            select(EmailCampaign)
            .options(selectinload(EmailCampaign.template))
            .where(EmailCampaign.id == campaign_id)
        )
        if workspace_id:
            query = query.where(EmailCampaign.workspace_id == workspace_id)

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_campaigns(
        self,
        workspace_id: str,
        status: str | None = None,
        campaign_type: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[EmailCampaign], int]:
        """List campaigns with optional filters."""
        query = select(EmailCampaign).where(EmailCampaign.workspace_id == workspace_id)

        if status:
            query = query.where(EmailCampaign.status == status)
        if campaign_type:
            query = query.where(EmailCampaign.campaign_type == campaign_type)

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Apply pagination
        query = query.order_by(EmailCampaign.created_at.desc())
        query = query.offset(offset).limit(limit)

        result = await self.db.execute(query)
        campaigns = list(result.scalars().all())

        return campaigns, total

    async def update_campaign(
        self,
        campaign_id: str,
        workspace_id: str,
        data: EmailCampaignUpdate,
    ) -> EmailCampaign | None:
        """Update a campaign."""
        campaign = await self.get_campaign(campaign_id, workspace_id)
        if not campaign:
            return None

        # Only allow updates on draft or paused campaigns
        if campaign.status not in [CampaignStatus.DRAFT.value, CampaignStatus.PAUSED.value]:
            raise ValueError(f"Cannot update campaign in {campaign.status} status")

        update_data = data.model_dump(exclude_unset=True)

        # Validate routing against the *resulting* state, not the incoming patch:
        # setting a pool on a campaign that already has an identity has to be
        # caught, and a partial update sends only one of the two fields.
        if "sending_pool_id" in update_data or "sending_identity_id" in update_data:
            await self._validate_routing(
                workspace_id,
                update_data.get("sending_pool_id", campaign.sending_pool_id),
                update_data.get("sending_identity_id", campaign.sending_identity_id),
            )

        # Handle audience_filters conversion
        if "audience_filters" in update_data and update_data["audience_filters"] is not None:
            update_data["audience_filters"] = [
                f.model_dump() if hasattr(f, "model_dump") else f
                for f in update_data["audience_filters"]
            ]

        # Handle send_window conversion
        if "send_window" in update_data and update_data["send_window"] is not None:
            if hasattr(update_data["send_window"], "model_dump"):
                update_data["send_window"] = update_data["send_window"].model_dump()

        for field, value in update_data.items():
            setattr(campaign, field, value)

        await self.db.commit()
        await self.db.refresh(campaign)

        logger.info(f"Updated campaign: {campaign.id}")
        return campaign

    async def delete_campaign(
        self,
        campaign_id: str,
        workspace_id: str,
    ) -> bool:
        """Delete a campaign."""
        campaign = await self.get_campaign(campaign_id, workspace_id)
        if not campaign:
            return False

        # Only allow deletion of draft or cancelled campaigns
        if campaign.status not in [CampaignStatus.DRAFT.value, CampaignStatus.CANCELLED.value]:
            raise ValueError(f"Cannot delete campaign in {campaign.status} status")

        await self.db.delete(campaign)
        await self.db.commit()

        logger.info(f"Deleted campaign: {campaign_id}")
        return True

    async def duplicate_campaign(
        self,
        campaign_id: str,
        workspace_id: str,
        new_name: str | None = None,
        created_by_id: str | None = None,
    ) -> EmailCampaign | None:
        """Duplicate a campaign."""
        original = await self.get_campaign(campaign_id, workspace_id)
        if not original:
            return None

        duplicate = EmailCampaign(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=new_name or f"{original.name} (Copy)",
            description=original.description,
            template_id=original.template_id,
            list_id=original.list_id,
            audience_filters=original.audience_filters,
            campaign_type=original.campaign_type,
            status=CampaignStatus.DRAFT.value,
            from_name=original.from_name,
            from_email=original.from_email,
            reply_to=original.reply_to,
            template_context=original.template_context,
            send_window=original.send_window,
            created_by_id=created_by_id,
        )

        self.db.add(duplicate)
        await self.db.commit()
        await self.db.refresh(duplicate)

        logger.info(f"Duplicated campaign {campaign_id} to {duplicate.id}")
        return duplicate

    # =========================================================================
    # CAMPAIGN STATUS MANAGEMENT
    # =========================================================================

    async def schedule_campaign(
        self,
        campaign_id: str,
        workspace_id: str,
        scheduled_at: datetime,
        send_window: dict | None = None,
    ) -> EmailCampaign | None:
        """Schedule a campaign for sending."""
        campaign = await self.get_campaign(campaign_id, workspace_id)
        if not campaign:
            return None

        if campaign.status != CampaignStatus.DRAFT.value:
            raise ValueError(f"Cannot schedule campaign in {campaign.status} status")

        if not campaign.template_id:
            raise ValueError("Campaign must have a template to be scheduled")

        # Deliberately *not* gated on the sender here. Scheduling next week's
        # newsletter while DNS propagates is legitimate — propagation can take a
        # day — and the poller holds a campaign it cannot send yet rather than
        # reporting success, so the gate belongs there. Recording the problem now
        # means the campaign says what it is waiting for before its send time
        # arrives, instead of looking scheduled and fine.
        _, sender_problem = await self.resolve_campaign_sender(campaign)
        campaign.last_error = sender_problem or None

        # Calculate recipients before scheduling
        recipient_count = await self.calculate_audience(campaign)
        if recipient_count == 0:
            raise ValueError("Campaign has no recipients")

        campaign.scheduled_at = scheduled_at
        campaign.send_window = send_window
        campaign.status = CampaignStatus.SCHEDULED.value
        campaign.total_recipients = recipient_count

        await self.db.commit()
        await self.db.refresh(campaign)

        # Notify campaign creator
        if campaign.created_by_id:
            try:
                from aexy.services.notification_service import notify_campaign_scheduled

                await notify_campaign_scheduled(
                    db=self.db,
                    creator_id=campaign.created_by_id,
                    campaign_name=campaign.name,
                    scheduled_at=scheduled_at.isoformat(),
                    workspace_id=workspace_id,
                )
            except Exception:
                pass

        # Dispatch campaign.scheduled event for automations
        await dispatch_automation_event(
            db=self.db,
            workspace_id=workspace_id,
            module="email_marketing",
            trigger_type="campaign.scheduled",
            entity_id=campaign.id,
            trigger_data={
                "campaign_id": campaign.id,
                "campaign_name": campaign.name,
                "scheduled_at": scheduled_at.isoformat(),
                "total_recipients": recipient_count,
                "workspace_id": workspace_id,
            },
        )

        logger.info(f"Scheduled campaign {campaign_id} for {scheduled_at}")
        return campaign

    async def pause_campaign(
        self,
        campaign_id: str,
        workspace_id: str,
    ) -> EmailCampaign | None:
        """Pause a sending campaign."""
        campaign = await self.get_campaign(campaign_id, workspace_id)
        if not campaign:
            return None

        if campaign.status not in [CampaignStatus.SCHEDULED.value, CampaignStatus.SENDING.value]:
            raise ValueError(f"Cannot pause campaign in {campaign.status} status")

        campaign.status = CampaignStatus.PAUSED.value

        await self.db.commit()
        await self.db.refresh(campaign)

        logger.info(f"Paused campaign {campaign_id}")
        return campaign

    async def resume_campaign(
        self,
        campaign_id: str,
        workspace_id: str,
    ) -> EmailCampaign | None:
        """Resume a paused campaign."""
        campaign = await self.get_campaign(campaign_id, workspace_id)
        if not campaign:
            return None

        if campaign.status != CampaignStatus.PAUSED.value:
            raise ValueError(f"Cannot resume campaign in {campaign.status} status")

        # Determine target status based on whether it was sending or scheduled
        if campaign.started_at:
            campaign.status = CampaignStatus.SENDING.value
        else:
            campaign.status = CampaignStatus.SCHEDULED.value

        await self.db.commit()
        await self.db.refresh(campaign)

        logger.info(f"Resumed campaign {campaign_id}")
        return campaign

    async def cancel_campaign(
        self,
        campaign_id: str,
        workspace_id: str,
    ) -> EmailCampaign | None:
        """Cancel a campaign."""
        campaign = await self.get_campaign(campaign_id, workspace_id)
        if not campaign:
            return None

        if campaign.status in [CampaignStatus.SENT.value, CampaignStatus.CANCELLED.value]:
            raise ValueError(f"Cannot cancel campaign in {campaign.status} status")

        campaign.status = CampaignStatus.CANCELLED.value

        await self.db.commit()
        await self.db.refresh(campaign)

        logger.info(f"Cancelled campaign {campaign_id}")
        return campaign

    # =========================================================================
    # AUDIENCE MANAGEMENT
    # =========================================================================

    async def calculate_audience(self, campaign: EmailCampaign) -> int:
        """Calculate recipient count based on list and filters."""
        query = await self._build_audience_query(campaign)
        if query is None:
            return 0

        count_result = await self.db.execute(select(func.count()).select_from(query.subquery()))
        return count_result.scalar() or 0

    async def get_audience_records(
        self,
        campaign: EmailCampaign,
        limit: int = 1000,
        offset: int = 0,
    ) -> list[CRMRecord]:
        """Get CRM records that match campaign audience criteria."""
        query = await self._build_audience_query(campaign)
        if query is None:
            return []

        query = query.offset(offset).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def _build_audience_query(self, campaign: EmailCampaign):
        """Build SQLAlchemy query for campaign audience."""
        workspace_id = campaign.workspace_id

        # Start with base query for records with email
        base_query = (
            select(CRMRecord)
            .where(CRMRecord.workspace_id == workspace_id)
            .where(CRMRecord.is_archived == False)  # noqa: E712
        )

        # If a list is specified, filter to list members
        if campaign.list_id:
            list_subquery = (
                select(CRMListEntry.record_id)
                .where(CRMListEntry.list_id == campaign.list_id)
            )
            base_query = base_query.where(CRMRecord.id.in_(list_subquery))

        # TODO: Apply additional audience_filters
        # This would require parsing FilterCondition and building dynamic queries
        # For now, we return the base query with list filtering

        return base_query

    async def populate_recipients(
        self,
        campaign_id: str,
        workspace_id: str,
    ) -> int:
        """
        Populate campaign recipients from audience.

        Returns number of recipients created.
        """
        campaign = await self.get_campaign(campaign_id, workspace_id)
        if not campaign:
            raise ValueError("Campaign not found")

        # Get audience records
        records = await self.get_audience_records(campaign)
        if not records:
            return 0

        created_count = 0
        for record in records:
            # Extract email from record values
            email = self._extract_email(record)
            if not email:
                continue

            # Check subscription status
            can_send, reason = await self._check_can_send(workspace_id, email)
            if not can_send:
                logger.debug(f"Skipping {email}: {reason}")
                continue

            # Check if recipient already exists
            existing = await self.db.execute(
                select(CampaignRecipient).where(
                    and_(
                        CampaignRecipient.campaign_id == campaign_id,
                        CampaignRecipient.email == email,
                    )
                )
            )
            if existing.scalar_one_or_none():
                continue

            # Get or create subscriber
            subscriber = await self._get_or_create_subscriber(workspace_id, email, record.id)

            # Create recipient
            recipient = CampaignRecipient(
                id=str(uuid4()),
                campaign_id=campaign_id,
                record_id=record.id,
                subscriber_id=subscriber.id if subscriber else None,
                email=email,
                recipient_name=self._extract_name(record),
                context=self._build_recipient_context(record),
                status=RecipientStatus.PENDING.value,
            )
            self.db.add(recipient)
            created_count += 1

        await self.db.commit()

        # Update campaign recipient count
        campaign.total_recipients = created_count
        await self.db.commit()

        # Dispatch recipient.added for the batch
        if created_count > 0:
            await dispatch_automation_event(
                db=self.db,
                workspace_id=workspace_id,
                module="email_marketing",
                trigger_type="recipient.added",
                entity_id=campaign_id,
                trigger_data={
                    "campaign_id": campaign_id,
                    "campaign_name": campaign.name,
                    "recipients_added": created_count,
                    "workspace_id": workspace_id,
                },
            )

        logger.info(f"Populated {created_count} recipients for campaign {campaign_id}")
        return created_count

    def _extract_email(self, record: CRMRecord) -> str | None:
        """Extract email from CRM record values."""
        values = record.values or {}
        return values.get("email") or values.get("Email") or values.get("EMAIL")

    def _extract_name(self, record: CRMRecord) -> str | None:
        """Extract name from CRM record values."""
        values = record.values or {}
        first = values.get("first_name") or values.get("firstName") or ""
        last = values.get("last_name") or values.get("lastName") or ""
        if first or last:
            return f"{first} {last}".strip()
        return values.get("name") or record.display_name

    def _build_recipient_context(self, record: CRMRecord) -> dict:
        """Build personalization context from CRM record."""
        values = record.values or {}
        return {
            "first_name": values.get("first_name") or values.get("firstName"),
            "last_name": values.get("last_name") or values.get("lastName"),
            "name": values.get("name") or record.display_name,
            "email": self._extract_email(record),
            "company": values.get("company"),
            "title": values.get("title") or values.get("job_title"),
            "record_id": record.id,
        }

    async def _check_can_send(
        self,
        workspace_id: str,
        email: str,
    ) -> tuple[bool, str | None]:
        """Check if we can send to this email address."""
        email_hash = hashlib.sha256(email.lower().encode()).hexdigest()

        result = await self.db.execute(
            select(EmailSubscriber).where(
                and_(
                    EmailSubscriber.workspace_id == workspace_id,
                    EmailSubscriber.email_hash == email_hash,
                )
            )
        )
        subscriber = result.scalar_one_or_none()

        if subscriber:
            if subscriber.status == SubscriberStatus.UNSUBSCRIBED.value:
                return False, "unsubscribed"
            if subscriber.status == SubscriberStatus.BOUNCED.value:
                return False, "bounced"
            if subscriber.status == SubscriberStatus.COMPLAINED.value:
                return False, "complained"

        return True, None

    async def _get_or_create_subscriber(
        self,
        workspace_id: str,
        email: str,
        record_id: str | None = None,
    ) -> EmailSubscriber | None:
        """Get or create an email subscriber."""
        email_hash = hashlib.sha256(email.lower().encode()).hexdigest()

        result = await self.db.execute(
            select(EmailSubscriber).where(
                and_(
                    EmailSubscriber.workspace_id == workspace_id,
                    EmailSubscriber.email_hash == email_hash,
                )
            )
        )
        subscriber = result.scalar_one_or_none()

        if not subscriber:
            subscriber = EmailSubscriber(
                id=str(uuid4()),
                workspace_id=workspace_id,
                record_id=record_id,
                email=email,
                email_hash=email_hash,
                status=SubscriberStatus.ACTIVE.value,
                preference_token=uuid4().hex,
            )
            self.db.add(subscriber)

        return subscriber

    # =========================================================================
    # RECIPIENT MANAGEMENT
    # =========================================================================

    async def get_recipient(
        self,
        recipient_id: str,
        campaign_id: str | None = None,
    ) -> CampaignRecipient | None:
        """Get a campaign recipient by ID."""
        query = select(CampaignRecipient).where(CampaignRecipient.id == recipient_id)
        if campaign_id:
            query = query.where(CampaignRecipient.campaign_id == campaign_id)

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_recipients(
        self,
        campaign_id: str,
        status: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[CampaignRecipient], int]:
        """List recipients for a campaign."""
        query = select(CampaignRecipient).where(CampaignRecipient.campaign_id == campaign_id)

        if status:
            query = query.where(CampaignRecipient.status == status)

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Apply pagination
        query = query.order_by(CampaignRecipient.created_at.asc())
        query = query.offset(offset).limit(limit)

        result = await self.db.execute(query)
        recipients = list(result.scalars().all())

        return recipients, total

    async def update_recipient_status(
        self,
        recipient_id: str,
        status: str,
        **kwargs: Any,
    ) -> CampaignRecipient | None:
        """Update recipient status and related fields."""
        recipient = await self.get_recipient(recipient_id)
        if not recipient:
            return None

        recipient.status = status

        # Update timestamps based on status
        now = datetime.now(timezone.utc)
        if status == RecipientStatus.SENT.value:
            recipient.sent_at = kwargs.get("sent_at", now)
            recipient.message_id = kwargs.get("message_id")
        elif status == RecipientStatus.DELIVERED.value:
            recipient.delivered_at = kwargs.get("delivered_at", now)
        elif status == RecipientStatus.OPENED.value:
            if not recipient.first_opened_at:
                recipient.first_opened_at = kwargs.get("opened_at", now)
            recipient.open_count += 1
        elif status == RecipientStatus.CLICKED.value:
            if not recipient.first_clicked_at:
                recipient.first_clicked_at = kwargs.get("clicked_at", now)
            recipient.click_count += 1
        elif status == RecipientStatus.BOUNCED.value:
            recipient.bounce_type = kwargs.get("bounce_type")
            recipient.error_message = kwargs.get("error_message")
        elif status == RecipientStatus.FAILED.value:
            recipient.error_message = kwargs.get("error_message")

        await self.db.commit()
        await self.db.refresh(recipient)

        return recipient

    # =========================================================================
    # CAMPAIGN STATS
    # =========================================================================

    async def update_campaign_stats(self, campaign_id: str) -> None:
        """Aggregate recipient stats to campaign level."""
        # Get counts by status
        result = await self.db.execute(
            select(
                CampaignRecipient.status,
                func.count(CampaignRecipient.id),
            )
            .where(CampaignRecipient.campaign_id == campaign_id)
            .group_by(CampaignRecipient.status)
        )
        status_counts = {row[0]: row[1] for row in result.all()}

        # Get unique open/click counts
        opens_result = await self.db.execute(
            select(func.count(CampaignRecipient.id))
            .where(CampaignRecipient.campaign_id == campaign_id)
            .where(CampaignRecipient.first_opened_at.isnot(None))
        )
        unique_opens = opens_result.scalar() or 0

        clicks_result = await self.db.execute(
            select(func.count(CampaignRecipient.id))
            .where(CampaignRecipient.campaign_id == campaign_id)
            .where(CampaignRecipient.first_clicked_at.isnot(None))
        )
        unique_clicks = clicks_result.scalar() or 0

        # Get total opens/clicks
        total_opens_result = await self.db.execute(
            select(func.sum(CampaignRecipient.open_count))
            .where(CampaignRecipient.campaign_id == campaign_id)
        )
        total_opens = total_opens_result.scalar() or 0

        total_clicks_result = await self.db.execute(
            select(func.sum(CampaignRecipient.click_count))
            .where(CampaignRecipient.campaign_id == campaign_id)
        )
        total_clicks = total_clicks_result.scalar() or 0

        # Update campaign
        campaign = await self.get_campaign(campaign_id)
        if campaign:
            campaign.sent_count = status_counts.get(RecipientStatus.SENT.value, 0) + \
                                  status_counts.get(RecipientStatus.DELIVERED.value, 0) + \
                                  status_counts.get(RecipientStatus.OPENED.value, 0) + \
                                  status_counts.get(RecipientStatus.CLICKED.value, 0)
            campaign.delivered_count = status_counts.get(RecipientStatus.DELIVERED.value, 0) + \
                                       status_counts.get(RecipientStatus.OPENED.value, 0) + \
                                       status_counts.get(RecipientStatus.CLICKED.value, 0)
            campaign.open_count = total_opens
            campaign.unique_open_count = unique_opens
            campaign.click_count = total_clicks
            campaign.unique_click_count = unique_clicks
            campaign.bounce_count = status_counts.get(RecipientStatus.BOUNCED.value, 0)
            campaign.unsubscribe_count = status_counts.get(RecipientStatus.UNSUBSCRIBED.value, 0)

            await self.db.commit()

    # =========================================================================
    # SENDING
    # =========================================================================

    async def update_routing(
        self,
        campaign_id: str,
        workspace_id: str,
        data: RoutingConfigUpdate,
    ) -> EmailCampaign | None:
        """Set how a campaign chooses its sending domain."""
        campaign = await self.get_campaign(campaign_id, workspace_id)
        if not campaign:
            return None

        if campaign.status not in [CampaignStatus.DRAFT.value, CampaignStatus.PAUSED.value]:
            raise ValueError(f"Cannot change routing on a {campaign.status} campaign")

        await self._validate_routing(workspace_id, data.sending_pool_id, data.sending_identity_id)

        campaign.sending_pool_id = data.sending_pool_id
        campaign.sending_identity_id = data.sending_identity_id
        # Merged rather than replaced: `fallback_enabled` is read from here by the
        # send path and is not part of this schema, so overwriting would silently
        # reset it.
        campaign.routing_config = {
            **(campaign.routing_config or {}),
            "strategy": data.routing_strategy,
            "prefer_warming_complete": data.prefer_warming_complete,
            "min_health_score": data.min_health_score,
        }

        await self.db.commit()
        await self.db.refresh(campaign)
        logger.info(
            "Campaign %s routing set to pool=%s identity=%s",
            campaign_id,
            data.sending_pool_id,
            data.sending_identity_id,
        )
        return campaign

    async def _validate_routing(
        self,
        workspace_id: str,
        pool_id: str | None,
        identity_id: str | None,
    ) -> None:
        """Refuse a pool or identity belonging to another workspace.

        Both columns FK to their own tables, not to anything workspace-scoped, so
        an id from another tenant would be accepted by the database and then used
        to send — the same class of hole `_require_own_integration` closes for
        service-desk mailboxes.
        """
        if pool_id and identity_id:
            raise ValueError(
                "Set either a sending pool or a sending identity, not both — "
                "a pool chooses the domain per recipient, an identity pins one"
            )

        if pool_id:
            pool = (
                await self.db.execute(
                    select(SendingPool).where(
                        SendingPool.id == pool_id,
                        SendingPool.workspace_id == workspace_id,
                    )
                )
            ).scalar_one_or_none()
            if pool is None:
                raise ValueError("Sending pool not found in this workspace")
            if not pool.is_active:
                raise ValueError(f"Sending pool '{pool.name}' is not active")

        if identity_id:
            identity = (
                await self.db.execute(
                    select(SendingIdentity).where(
                        SendingIdentity.id == identity_id,
                        SendingIdentity.workspace_id == workspace_id,
                    )
                )
            ).scalar_one_or_none()
            if identity is None:
                raise ValueError("Sending identity not found in this workspace")
            if not identity.is_active:
                raise ValueError(f"Sending identity {identity.email} is not active")

    async def resolve_pool_sender(
        self, workspace_id: str, pool_id: str
    ) -> tuple[SendingDomain | None, str]:
        """Whether a pool has any member domain able to send.

        A pooled campaign's From address comes from whichever domain the router
        picks per recipient, so asking whether `from_email` is verified is the
        wrong question — the right one is whether the pool has a usable member.
        """
        pool = (
            await self.db.execute(
                select(SendingPool).where(
                    SendingPool.id == pool_id,
                    SendingPool.workspace_id == workspace_id,
                )
            )
        ).scalar_one_or_none()
        if pool is None:
            return None, "Sending pool not found in this workspace"
        if not pool.is_active:
            return None, f"Sending pool '{pool.name}' is not active"

        domain_service = DomainService(self.db)
        members = await RoutingService(self.db).list_pool_domains(pool_id, workspace_id)
        if not members:
            return None, f"Sending pool '{pool.name}' has no active domains"

        for domain in members:
            can_send, _ = await domain_service.can_send(domain.id, workspace_id)
            if can_send:
                return domain, ""

        return None, (
            f"No domain in '{pool.name}' can send right now — check verification, "
            "daily limits and health"
        )

    async def resolve_sender(
        self, workspace_id: str, from_email: str
    ) -> tuple[SendingDomain | None, str]:
        """The sending domain that owns ``from_email``, and why it can't send.

        Returns ``(domain, reason)`` where an empty reason means it can send.

        This replaced a workspace-wide "does *any* verified domain exist" count.
        That check let a campaign send as ``sender@somewhere-else.com`` as long as
        the workspace had verified some unrelated domain — and it was the only
        sender validation anywhere, since nothing compared ``from_email`` to a
        domain. The send path resolves the provider through the same domain
        (``EmailCampaignService.send_campaign_email``), so agreeing here is what
        makes the answer meaningful rather than decorative.
        """
        domain_service = DomainService(self.db)
        domain = await domain_service.resolve_domain_for_email(workspace_id, from_email)
        if domain is None:
            return None, (
                f"No sending domain in this workspace covers {from_email} — "
                "add and verify its domain before sending"
            )

        can_send, reason = await domain_service.can_send(domain.id, workspace_id)
        if not can_send:
            return domain, f"{domain.domain} cannot send: {reason}"

        return domain, ""

    async def resolve_campaign_sender(
        self, campaign: EmailCampaign
    ) -> tuple[SendingDomain | None, str]:
        """The sender check for a campaign, whichever routing mode it uses.

        Three modes, and asking the wrong question of the wrong one is how this
        went wrong before: a pooled campaign's From address is chosen per recipient
        from the pool, so validating `from_email` against a domain would refuse a
        perfectly sendable campaign.
        """
        if campaign.sending_pool_id:
            return await self.resolve_pool_sender(
                campaign.workspace_id, campaign.sending_pool_id
            )

        if campaign.sending_identity_id:
            identity = (
                await self.db.execute(
                    select(SendingIdentity).where(
                        SendingIdentity.id == campaign.sending_identity_id,
                        SendingIdentity.workspace_id == campaign.workspace_id,
                    )
                )
            ).scalar_one_or_none()
            if identity is None:
                return None, "Sending identity not found in this workspace"
            if not identity.is_active:
                return None, f"Sending identity {identity.email} is not active"
            # The identity fixes the address, so check the domain behind it.
            return await self.resolve_sender(campaign.workspace_id, identity.email)

        return await self.resolve_sender(campaign.workspace_id, campaign.from_email)

    async def sender_status(self, campaign: EmailCampaign) -> dict[str, Any]:
        """A compact, UI-shaped answer to "can this campaign send?".

        Returned on the campaign payload so the wizard and the detail page stop
        each deriving it from the domain list in slightly different ways — the
        detail page's own copy tested statuses that its `DomainStatus` union did
        not even contain.
        """
        domain, reason = await self.resolve_campaign_sender(campaign)
        mode = (
            "pool"
            if campaign.sending_pool_id
            else "identity"
            if campaign.sending_identity_id
            else "from_email"
        )
        return {
            "can_send": not reason,
            "mode": mode,
            "domain": domain.domain if domain else None,
            "domain_id": domain.id if domain else None,
            "domain_status": domain.status if domain else None,
            "reason": reason or None,
        }

    async def start_sending(
        self,
        campaign_id: str,
        workspace_id: str,
    ) -> EmailCampaign | None:
        """
        Initiate campaign sending.

        This populates recipients and marks campaign as sending.
        Actual sending is handled by Temporal activities.
        """
        campaign = await self.get_campaign_with_template(campaign_id, workspace_id)
        if not campaign:
            return None

        if campaign.status not in [CampaignStatus.DRAFT.value, CampaignStatus.SCHEDULED.value]:
            raise ValueError(f"Cannot start sending campaign in {campaign.status} status")

        if not campaign.template:
            raise ValueError("Campaign must have a template")

        # E2.6: refuse to send until this campaign has a sender that can actually
        # send — an unverified domain wrecks deliverability and enables spoofing.
        # The UI mirrors this by disabling "Send" and naming the same reason.
        _, sender_problem = await self.resolve_campaign_sender(campaign)
        if sender_problem:
            raise ValueError(sender_problem)

        # Populate recipients
        recipient_count = await self.populate_recipients(campaign_id, workspace_id)
        if recipient_count == 0:
            raise ValueError("Campaign has no valid recipients")

        # Update status
        campaign.status = CampaignStatus.SENDING.value
        campaign.started_at = datetime.now(timezone.utc)
        campaign.total_recipients = recipient_count
        # Whatever last blocked it no longer applies.
        campaign.last_error = None

        await self.db.commit()
        await self.db.refresh(campaign)

        logger.info(f"Started sending campaign {campaign_id} to {recipient_count} recipients")
        return campaign

    async def mark_completed(
        self,
        campaign_id: str,
    ) -> None:
        """Mark a campaign as completed."""
        campaign = await self.get_campaign(campaign_id)
        if campaign and campaign.status == CampaignStatus.SENDING.value:
            # Check if all recipients have been processed
            result = await self.db.execute(
                select(func.count(CampaignRecipient.id))
                .where(CampaignRecipient.campaign_id == campaign_id)
                .where(CampaignRecipient.status == RecipientStatus.PENDING.value)
            )
            pending = result.scalar() or 0

            if pending == 0:
                campaign.status = CampaignStatus.SENT.value
                campaign.completed_at = datetime.now(timezone.utc)
                await self.db.commit()
                logger.info(f"Campaign {campaign_id} completed")

                # Notify campaign creator
                if campaign.created_by_id:
                    try:
                        from aexy.services.notification_service import notify_campaign_completed

                        await notify_campaign_completed(
                            db=self.db,
                            creator_id=campaign.created_by_id,
                            campaign_name=campaign.name,
                            total_recipients=campaign.total_recipients or 0,
                            workspace_id=str(campaign.workspace_id),
                        )
                    except Exception:
                        pass

                # Dispatch automation event
                await dispatch_automation_event(
                    db=self.db,
                    workspace_id=str(campaign.workspace_id),
                    module="email_marketing",
                    trigger_type="campaign.sent",
                    entity_id=str(campaign.id),
                    trigger_data={
                        "campaign_name": campaign.name,
                        "total_recipients": campaign.total_recipients,
                        "completed_at": campaign.completed_at.isoformat(),
                    },
                )

    async def get_pending_recipients(
        self,
        campaign_id: str,
        limit: int = 100,
    ) -> list[CampaignRecipient]:
        """Get pending recipients for sending."""
        result = await self.db.execute(
            select(CampaignRecipient)
            .where(CampaignRecipient.campaign_id == campaign_id)
            .where(CampaignRecipient.status == RecipientStatus.PENDING.value)
            .order_by(CampaignRecipient.created_at.asc())
            .limit(limit)
        )
        return list(result.scalars().all())
