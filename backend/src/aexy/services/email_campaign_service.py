"""Service for email campaign sending, analytics, and onboarding email ops.

Extracted from processing/email_marketing_tasks.py for the Temporal migration.
Each method converts the old sync Temporal activity logic to async using self.db (AsyncSession).
"""

import hashlib
import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import TYPE_CHECKING
from uuid import uuid4

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import select, func, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.email_marketing import (
    EmailCampaign,
    EmailTemplate,
    CampaignRecipient,
    CampaignStatus,
    RecipientStatus,
    CampaignAnalytics,
    EmailSubscriber,
    SubscriberStatus,
    WorkspaceEmailStats,
    VisualTemplateBlock,
)

if TYPE_CHECKING:  # imported for the annotation only; the module imports it lazily
    from aexy.models.email_infrastructure import SendingDomain

logger = logging.getLogger(__name__)


@dataclass
class ResolvedSender:
    """The address a campaign will actually send as, for one recipient.

    Its own type because three things need the same answer and used to compute it
    separately: the real send, the test send, and the sender gate. The test send
    reporting a different From address than the real send would defeat the point of
    testing at all.
    """

    from_email: str
    from_name: str
    reply_to: str | None
    domain: "SendingDomain | None"


class EmailCampaignService:
    """Service for email campaign operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # CAMPAIGN SENDING
    # =========================================================================

    async def process_campaign_sending(self, campaign_id: str) -> dict:
        """Process campaign sending in batches.

        Fetches pending recipients batch, dispatches individual sends,
        marks campaign complete when done.
        """
        logger.info(f"Starting campaign send: {campaign_id}")

        campaign = (await self.db.execute(
            select(EmailCampaign).where(EmailCampaign.id == campaign_id)
        )).scalar_one_or_none()

        if not campaign:
            logger.error(f"Campaign not found: {campaign_id}")
            return {"status": "error", "message": "Campaign not found"}

        if campaign.status != CampaignStatus.SENDING.value:
            logger.info(f"Campaign {campaign_id} is not in sending state: {campaign.status}")
            return {"status": "skipped", "message": f"Campaign status is {campaign.status}"}

        template = (await self.db.execute(
            select(EmailTemplate).where(EmailTemplate.id == campaign.template_id)
        )).scalar_one_or_none()

        if not template:
            campaign.status = CampaignStatus.CANCELLED.value
            await self.db.commit()
            logger.error(f"Template not found for campaign: {campaign_id}")
            return {"status": "error", "message": "Template not found"}

        # Get batch of pending recipients
        batch_size = 50
        recipients = list((await self.db.execute(
            select(CampaignRecipient)
            .where(CampaignRecipient.campaign_id == campaign_id)
            .where(CampaignRecipient.status == RecipientStatus.PENDING.value)
            .order_by(CampaignRecipient.created_at.asc())
            .limit(batch_size)
        )).scalars().all())

        if not recipients:
            # No more recipients, mark campaign as completed
            campaign.status = CampaignStatus.SENT.value
            campaign.completed_at = datetime.now(timezone.utc)
            await self.db.commit()

            # Trigger stats update
            from aexy.temporal.dispatch import dispatch
            from aexy.temporal.task_queues import TaskQueue
            from aexy.temporal.activities.email import UpdateCampaignStatsInput

            await dispatch(
                "update_campaign_stats",
                UpdateCampaignStatsInput(campaign_id=campaign_id),
                task_queue=TaskQueue.EMAIL,
            )

            logger.info(f"Campaign {campaign_id} completed")
            return {"status": "completed", "message": "All emails sent"}

        # Queue individual sends
        from aexy.temporal.dispatch import dispatch
        from aexy.temporal.task_queues import TaskQueue
        from aexy.temporal.activities.email import SendCampaignEmailInput

        sent_count = 0
        for recipient in recipients:
            try:
                await dispatch(
                    "send_campaign_email",
                    SendCampaignEmailInput(
                        campaign_id=campaign_id,
                        recipient_id=recipient.id,
                    ),
                    task_queue=TaskQueue.EMAIL,
                )
                sent_count += 1
            except Exception as e:
                logger.error(f"Failed to queue email for recipient {recipient.id}: {e}")

        # Check remaining
        remaining_count = (await self.db.execute(
            select(func.count(CampaignRecipient.id))
            .where(CampaignRecipient.campaign_id == campaign_id)
            .where(CampaignRecipient.status == RecipientStatus.PENDING.value)
        )).scalar() or 0

        remaining_count -= sent_count

        if remaining_count > 0:
            # Schedule next batch
            from aexy.temporal.activities.email import SendCampaignInput

            await dispatch(
                "send_campaign",
                SendCampaignInput(campaign_id=campaign_id),
                task_queue=TaskQueue.EMAIL,
            )

        logger.info(f"Queued {sent_count} emails for campaign {campaign_id}, {remaining_count} remaining")
        return {"status": "in_progress", "queued": sent_count, "remaining": remaining_count}

    async def resolve_send_sender(
        self,
        campaign: EmailCampaign,
        recipient_email: str,
    ) -> ResolvedSender:
        """Which address this campaign sends as, and from which domain.

        Three modes, and the campaign's own `from_email` wins in only one of them:

        * **identity** — a pinned address; its display name and reply-to win too.
        * **pool** — the router picks a domain per recipient, so the From address
          comes from the domain it picked. Sending as an address on a domain other
          than the one delivering it is what the sender gate exists to prevent.
        * **neither** — the normal path: resolve the domain that owns `from_email`.

        Shared with the test-send endpoint, which used to send from
        `campaign.from_email` in all three cases — so a test on a pooled campaign
        showed an address the real send would never use, which is precisely the
        kind of false reassurance a test send exists to avoid.

        Says nothing about whether the domain may send; that is `can_send`, and the
        caller layers fallback on top.
        """
        from aexy.models.email_infrastructure import SendingDomain, SendingIdentity
        from aexy.services.domain_service import DomainService
        from aexy.services.routing_service import RoutingService

        from_email = campaign.from_email
        from_name = campaign.from_name
        reply_to = campaign.reply_to
        domain: SendingDomain | None = None

        routing_config = campaign.routing_config or {}
        # None, not a default: absent means "use the pool's own strategy", which is
        # what a pool's `routing_strategy` column is for. Defaulting to
        # health_based here would override every pool's choice.
        strategy = routing_config.get("strategy")

        if campaign.sending_identity_id:
            identity = (
                await self.db.execute(
                    select(SendingIdentity).where(
                        SendingIdentity.id == campaign.sending_identity_id
                    )
                )
            ).scalar_one_or_none()
            if identity and identity.is_active:
                from_email = identity.email
                if identity.display_name:
                    from_name = identity.display_name
                if identity.reply_to:
                    reply_to = identity.reply_to

                domain = (
                    await self.db.execute(
                        select(SendingDomain).where(SendingDomain.id == identity.domain_id)
                    )
                ).scalar_one_or_none()

        elif campaign.sending_pool_id:
            # `min_health_score` and `prefer_warming_complete` come from the
            # campaign's own routing_config, so a transactional campaign can demand
            # a healthier domain than a newsletter.
            decision = await RoutingService(self.db).route_email(
                workspace_id=campaign.workspace_id,
                recipient_email=recipient_email,
                pool_id=campaign.sending_pool_id,
                prefer_warming_complete=routing_config.get("prefer_warming_complete", True),
                min_health_score=routing_config.get("min_health_score", 50),
                strategy=strategy,
            )

            if decision:
                domain = (
                    await self.db.execute(
                        select(SendingDomain).where(SendingDomain.id == decision.domain_id)
                    )
                ).scalar_one_or_none()
                from_email = decision.from_email
                if decision.identity_id:
                    identity = (
                        await self.db.execute(
                            select(SendingIdentity).where(
                                SendingIdentity.id == decision.identity_id
                            )
                        )
                    ).scalar_one_or_none()
                    if identity:
                        from_name = identity.display_name or from_name
                        reply_to = identity.reply_to or reply_to
            else:
                logger.warning(
                    "Campaign %s: pool %s had no domain able to send to %s",
                    campaign.id,
                    campaign.sending_pool_id,
                    recipient_email,
                )

        else:
            # Until this branch existed, no API-created campaign ever resolved a
            # domain, so every send fell through to the platform mailer and went out
            # from the deployment's own address — ignoring `from_email` entirely.
            domain = await DomainService(self.db).resolve_domain_for_email(
                campaign.workspace_id, from_email
            )
            if domain is None:
                logger.warning(
                    "Campaign %s: no sending domain owns %s in workspace %s",
                    campaign.id,
                    from_email,
                    campaign.workspace_id,
                )

        return ResolvedSender(
            from_email=from_email,
            from_name=from_name,
            reply_to=reply_to,
            domain=domain,
        )

    async def send_campaign_email(
        self,
        campaign_id: str,
        recipient_id: str,
    ) -> dict:
        """Send individual campaign email with multi-domain routing and tracking."""
        logger.debug(f"Sending email: campaign={campaign_id}, recipient={recipient_id}")

        campaign = (await self.db.execute(
            select(EmailCampaign).where(EmailCampaign.id == campaign_id)
        )).scalar_one_or_none()

        if not campaign:
            return {"status": "error", "message": "Campaign not found"}

        template = (await self.db.execute(
            select(EmailTemplate).where(EmailTemplate.id == campaign.template_id)
        )).scalar_one_or_none()

        if not template:
            return {"status": "error", "message": "Template not found"}

        recipient = (await self.db.execute(
            select(CampaignRecipient).where(CampaignRecipient.id == recipient_id)
        )).scalar_one_or_none()

        if not recipient:
            return {"status": "error", "message": "Recipient not found"}

        # Check campaign state
        if campaign.status not in [CampaignStatus.SENDING.value]:
            recipient.status = RecipientStatus.PENDING.value
            await self.db.commit()
            return {"status": "skipped", "message": "Campaign not in sending state"}

        # Check subscription status
        if recipient.subscriber_id:
            subscriber = (await self.db.execute(
                select(EmailSubscriber).where(EmailSubscriber.id == recipient.subscriber_id)
            )).scalar_one_or_none()

            if subscriber and subscriber.status != SubscriberStatus.ACTIVE.value:
                recipient.status = RecipientStatus.UNSUBSCRIBED.value
                await self.db.commit()
                return {"status": "skipped", "message": "Subscriber unsubscribed"}

        # Build context for template rendering
        context = {
            **campaign.template_context,
            **recipient.context,
            "unsubscribe_url": f"/preferences/{recipient.subscriber_id}" if recipient.subscriber_id else "",
        }

        try:
            from aexy.services.template_service import TemplateService
            from aexy.services.routing_service import RoutingService
            from aexy.services.provider_service import ProviderService
            from aexy.services.domain_service import DomainService
            from aexy.services.reputation_service import ReputationService
            from aexy.models.email_infrastructure import SendingDomain, SendingIdentity

            # Render template
            template_service = TemplateService(self.db)
            # Not awaited: ``render_template`` is synchronous (every other caller
            # calls it plainly). Awaiting a tuple raised TypeError inside the
            # broad ``except`` below, so this send path failed for reasons the
            # error never named.
            subject, html_body, text_body = template_service.render_template(template, context)

            # Inject tracking pixel and rewrite links
            from aexy.services.tracking_service import TrackingService
            tracking_service = TrackingService(self.db)
            html_body, pixel_id = await tracking_service.process_email_body(
                html_body=html_body,
                workspace_id=campaign.workspace_id,
                campaign_id=campaign_id,
                recipient_id=recipient_id,
                record_id=recipient.record_id,
            )

            if pixel_id:
                recipient.tracking_pixel_id = pixel_id

            # Multi-domain routing
            routing_service = RoutingService(self.db)
            provider_service = ProviderService(self.db)
            domain_service = DomainService(self.db)
            reputation_service = ReputationService(self.db)

            # Still read here for `fallback_enabled` below; the rest of the routing
            # config is the resolver's business.
            routing_config = campaign.routing_config or {}

            resolved = await self.resolve_send_sender(campaign, recipient.email)
            from_email = resolved.from_email
            from_name = resolved.from_name
            reply_to = resolved.reply_to
            send_domain = resolved.domain
            send_provider = None

            # Check if domain can send
            domain_blocked_reason: str | None = None
            if send_domain:
                can_send, reason = await domain_service.can_send(send_domain.id, campaign.workspace_id)
                if not can_send:
                    logger.warning(f"Domain {send_domain.domain} cannot send: {reason}")
                    if campaign.sending_pool_id and routing_config.get("fallback_enabled", True):
                        # Fallback stays inside the pool. A pool is a deliberate
                        # statement about which domains this campaign may send
                        # from, so falling back to any active domain in the
                        # workspace would send from a domain the user excluded.
                        fallback = await routing_service.get_fallback_domain(
                            workspace_id=campaign.workspace_id,
                            exclude_domain_ids=[send_domain.id],
                            recipient_email=recipient.email,
                            pool_id=campaign.sending_pool_id,
                            min_health_score=routing_config.get("min_health_score", 50),
                        )
                        if fallback:
                            domain_result = await self.db.execute(
                                select(SendingDomain).where(SendingDomain.id == fallback.domain_id)
                            )
                            send_domain = domain_result.scalar_one_or_none()
                            from_email = fallback.from_email
                        else:
                            domain_blocked_reason = (
                                f"{reason}, and no other domain in the pool could send"
                            )
                            send_domain = None
                    else:
                        # A domain that is over its daily limit or unhealthy is a
                        # reason to stop, not to quietly send from somewhere else.
                        domain_blocked_reason = reason
                        send_domain = None

                if send_domain:
                    # The domain's own provider, or the workspace default. The
                    # latter is why `get_default_provider` exists; nothing called
                    # it before, so a domain added without a provider could never
                    # send through the workspace's configured one.
                    send_provider = send_domain.provider_id
                    if not send_provider:
                        default_provider = await provider_service.get_default_provider(
                            campaign.workspace_id
                        )
                        send_provider = default_provider.id if default_provider else None

            if domain_blocked_reason:
                recipient.status = RecipientStatus.FAILED.value
                recipient.error_message = domain_blocked_reason
                await self.db.commit()
                return {"status": "failed", "error": domain_blocked_reason}

            # Send email
            now = datetime.now(timezone.utc)
            message_id = None
            send_success = False

            if send_domain and send_provider:
                try:
                    unsub_url = f"/preferences/{recipient.subscriber_id}" if recipient.subscriber_id else None
                    result = await provider_service.send_email(
                        provider_id=send_provider,
                        to_email=recipient.email,
                        from_email=from_email,
                        from_name=from_name,
                        subject=subject,
                        html_body=html_body,
                        text_body=text_body or "",
                        reply_to=reply_to,
                        unsubscribe_url=unsub_url,
                    )

                    if result.get("success"):
                        send_success = True
                        message_id = result.get("message_id")

                        await domain_service.increment_daily_sent(send_domain.id)
                        await reputation_service.record_send_event(
                            domain_id=send_domain.id,
                            event_type="send",
                            recipient_email=recipient.email,
                            message_id=message_id,
                        )

                        from aexy.models.email_infrastructure import WarmingStatus
                        if send_domain.warming_status == WarmingStatus.IN_PROGRESS.value:
                            from aexy.temporal.dispatch import dispatch
                            from aexy.temporal.task_queues import TaskQueue
                            from aexy.temporal.activities.warming import UpdateWarmingMetricsInput

                            await dispatch(
                                "update_warming_metrics",
                                UpdateWarmingMetricsInput(domain_id=send_domain.id, emails_sent=1),
                                task_queue=TaskQueue.EMAIL,
                            )

                        recipient.sent_via_domain_id = send_domain.id
                        recipient.sent_via_provider_id = send_provider
                    else:
                        logger.error(f"Provider send failed: {result.get('error')}")
                        raise Exception(result.get("error", "Provider send failed"))

                except Exception as e:
                    # A configured provider that fails is a failure, not a reason to
                    # re-send from the platform address. It used to fall through
                    # here, so a workspace whose SES credentials had expired saw
                    # its mail silently go out from the deployment's own sender.
                    logger.error(f"Provider send failed for {recipient.email}: {e}")
                    recipient.status = RecipientStatus.FAILED.value
                    recipient.error_message = str(e)
                    await self.db.commit()
                    return {"status": "failed", "error": str(e)}

            # Fallback to the platform mailer, for a workspace that has deliberately
            # configured no provider of its own. It sends from the deployment's
            # address rather than `from_email`, which is why it is last and why the
            # UI tells the user their sender is not set up.
            if not send_success:
                from aexy.services.email_service import email_service

                if send_domain and not send_provider:
                    logger.warning(
                        "Campaign %s: domain %s has no provider and the workspace has "
                        "no default; sending via the platform mailer, so mail will not "
                        "come from %s",
                        campaign.id,
                        send_domain.domain,
                        from_email,
                    )

                try:
                    log = await email_service.send_templated_email(
                        db=self.db,
                        recipient_email=recipient.email,
                        subject=subject,
                        body_text=text_body or "",
                        body_html=html_body,
                    )
                    if log.status == "sent":
                        send_success = True
                        message_id = log.ses_message_id
                    else:
                        recipient.status = RecipientStatus.FAILED.value
                        recipient.error_message = log.error_message
                        await self.db.commit()
                        return {"status": "failed", "error": log.error_message}
                except Exception as e:
                    logger.error(f"Default email service failed: {e}")
                    recipient.status = RecipientStatus.FAILED.value
                    recipient.error_message = str(e)
                    await self.db.commit()
                    return {"status": "failed", "error": str(e)}

            # Update recipient status
            if send_success:
                recipient.status = RecipientStatus.SENT.value
                recipient.sent_at = now
                recipient.message_id = message_id
                await self.db.commit()
                return {
                    "status": "sent",
                    "message_id": message_id,
                    "domain": send_domain.domain if send_domain else None,
                }
            else:
                recipient.status = RecipientStatus.FAILED.value
                recipient.error_message = "Send failed"
                await self.db.commit()
                return {"status": "failed", "error": "Send failed"}

        except Exception as e:
            logger.error(f"Error sending email to {recipient.email}: {e}")
            recipient.status = RecipientStatus.FAILED.value
            recipient.error_message = str(e)
            await self.db.commit()
            raise

    # =========================================================================
    # STATS & ANALYTICS
    # =========================================================================

    async def update_campaign_stats(self, campaign_id: str) -> dict:
        """Aggregate recipient stats to campaign level."""
        logger.info(f"Updating stats for campaign: {campaign_id}")

        campaign = (await self.db.execute(
            select(EmailCampaign).where(EmailCampaign.id == campaign_id)
        )).scalar_one_or_none()

        if not campaign:
            return {"status": "error", "message": "Campaign not found"}

        # Get counts by status
        status_counts = {}
        result = await self.db.execute(
            select(
                CampaignRecipient.status,
                func.count(CampaignRecipient.id),
            )
            .where(CampaignRecipient.campaign_id == campaign_id)
            .group_by(CampaignRecipient.status)
        )
        for row in result.all():
            status_counts[row[0]] = row[1]

        unique_opens = (await self.db.execute(
            select(func.count(CampaignRecipient.id))
            .where(CampaignRecipient.campaign_id == campaign_id)
            .where(CampaignRecipient.first_opened_at.isnot(None))
        )).scalar() or 0

        unique_clicks = (await self.db.execute(
            select(func.count(CampaignRecipient.id))
            .where(CampaignRecipient.campaign_id == campaign_id)
            .where(CampaignRecipient.first_clicked_at.isnot(None))
        )).scalar() or 0

        total_opens = (await self.db.execute(
            select(func.sum(CampaignRecipient.open_count))
            .where(CampaignRecipient.campaign_id == campaign_id)
        )).scalar() or 0

        total_clicks = (await self.db.execute(
            select(func.sum(CampaignRecipient.click_count))
            .where(CampaignRecipient.campaign_id == campaign_id)
        )).scalar() or 0

        campaign.sent_count = (
            status_counts.get(RecipientStatus.SENT.value, 0)
            + status_counts.get(RecipientStatus.DELIVERED.value, 0)
            + status_counts.get(RecipientStatus.OPENED.value, 0)
            + status_counts.get(RecipientStatus.CLICKED.value, 0)
        )
        campaign.delivered_count = (
            status_counts.get(RecipientStatus.DELIVERED.value, 0)
            + status_counts.get(RecipientStatus.OPENED.value, 0)
            + status_counts.get(RecipientStatus.CLICKED.value, 0)
        )
        campaign.open_count = total_opens
        campaign.unique_open_count = unique_opens
        campaign.click_count = total_clicks
        campaign.unique_click_count = unique_clicks
        campaign.bounce_count = status_counts.get(RecipientStatus.BOUNCED.value, 0)
        campaign.unsubscribe_count = status_counts.get(RecipientStatus.UNSUBSCRIBED.value, 0)

        await self.db.commit()

        logger.info(f"Updated stats for campaign {campaign_id}: sent={campaign.sent_count}")
        return {
            "status": "success",
            "sent": campaign.sent_count,
            "opens": campaign.unique_open_count,
            "clicks": campaign.unique_click_count,
        }

    # How long a due campaign is held while whatever blocks it gets fixed. Long
    # enough for DNS to propagate and for someone to notice over a weekend.
    SCHEDULE_GRACE_PERIOD = timedelta(days=3)

    async def check_scheduled_campaigns(self) -> dict:
        """Check for scheduled campaigns that are due to be sent."""
        logger.info("Checking for scheduled campaigns")

        now = datetime.now(timezone.utc)

        campaigns = list((await self.db.execute(
            select(EmailCampaign)
            .where(EmailCampaign.status == CampaignStatus.SCHEDULED.value)
            .where(EmailCampaign.scheduled_at <= now)
        )).scalars().all())

        from aexy.services.campaign_service import CampaignService
        from aexy.temporal.dispatch import dispatch
        from aexy.temporal.task_queues import TaskQueue
        from aexy.temporal.activities.email import SendCampaignInput

        campaign_service = CampaignService(self.db)

        started_count = 0
        blocked_count = 0
        expired_count = 0
        for campaign in campaigns:
            try:
                # Go through `start_sending` rather than flipping the status by
                # hand. This is the whole fix: that shortcut skipped the sender
                # gate *and* `populate_recipients`, so a scheduled campaign was
                # dispatched with zero recipient rows, the send activity found
                # nothing pending, and the campaign was marked `sent` having
                # delivered to nobody.
                started = await campaign_service.start_sending(campaign.id, campaign.workspace_id)
                if started is None:
                    logger.error(f"Scheduled campaign {campaign.id} vanished before starting")
                    continue

                await dispatch(
                    "send_campaign",
                    SendCampaignInput(campaign_id=campaign.id),
                    task_queue=TaskQueue.EMAIL,
                )
                started_count += 1

                logger.info(f"Started scheduled campaign: {campaign.id}")
            except ValueError as e:
                # A refusal, not a fault: an unverified sender, an exhausted daily
                # limit, an audience that resolves to nobody. Stay `scheduled` and
                # record why, so the campaign goes out by itself once the cause is
                # fixed instead of needing to be re-scheduled by hand.
                reason = str(e)
                if campaign.last_error != reason:
                    logger.warning(f"Scheduled campaign {campaign.id} not started: {reason}")
                campaign.status = CampaignStatus.SCHEDULED.value
                campaign.started_at = None
                campaign.last_error = reason

                # But not forever. Holding it lets a domain finish verifying, which
                # takes hours; a week later nobody is coming, and a campaign that
                # still says "scheduled" for a date long past is lying about its
                # own state. Hand it back as a draft with the reason on it.
                overdue_by = now - (campaign.scheduled_at or now)
                if overdue_by > self.SCHEDULE_GRACE_PERIOD:
                    campaign.status = CampaignStatus.DRAFT.value
                    campaign.scheduled_at = None
                    logger.warning(
                        "Scheduled campaign %s gave up after %s: %s",
                        campaign.id,
                        overdue_by,
                        reason,
                    )
                    await self._notify_send_blocked(campaign, reason)
                    expired_count += 1

                await self.db.commit()
                blocked_count += 1
            except Exception as e:
                logger.error(f"Failed to start campaign {campaign.id}: {e}")

        return {
            "started": started_count,
            "blocked": blocked_count,
            "expired": expired_count,
        }

    async def _notify_send_blocked(self, campaign: EmailCampaign, reason: str) -> None:
        """Tell the campaign's creator, if it has one.

        Best-effort: a notification that fails must not take the poller's other
        campaigns down with it.
        """
        if not campaign.created_by_id:
            return
        try:
            from aexy.services.notification_service import notify_campaign_send_blocked

            await notify_campaign_send_blocked(
                db=self.db,
                creator_id=campaign.created_by_id,
                campaign_name=campaign.name,
                reason=reason,
                workspace_id=campaign.workspace_id,
                campaign_id=campaign.id,
            )
        except Exception as e:
            logger.error(f"Failed to notify about blocked campaign {campaign.id}: {e}")

    async def aggregate_daily_analytics(self) -> dict:
        """Aggregate campaign analytics on a daily basis."""
        logger.info("Aggregating daily campaign analytics")

        today = date.today()
        yesterday = today - timedelta(days=1)

        campaigns = list((await self.db.execute(
            select(EmailCampaign)
            .where(EmailCampaign.status.in_([
                CampaignStatus.SENDING.value,
                CampaignStatus.SENT.value,
            ]))
        )).scalars().all())

        processed_count = 0
        for campaign in campaigns:
            try:
                existing = (await self.db.execute(
                    select(CampaignAnalytics)
                    .where(CampaignAnalytics.campaign_id == campaign.id)
                    .where(func.date(CampaignAnalytics.date) == yesterday)
                    .where(CampaignAnalytics.hour.is_(None))
                )).scalar_one_or_none()

                if existing:
                    continue

                analytics = CampaignAnalytics(
                    id=str(uuid4()),
                    campaign_id=campaign.id,
                    date=datetime.combine(yesterday, datetime.min.time()),
                    sent=campaign.sent_count,
                    delivered=campaign.delivered_count,
                    opened=campaign.open_count,
                    unique_opens=campaign.unique_open_count,
                    clicked=campaign.click_count,
                    unique_clicks=campaign.unique_click_count,
                    bounced=campaign.bounce_count,
                    unsubscribed=campaign.unsubscribe_count,
                )

                if campaign.delivered_count > 0:
                    analytics.open_rate = campaign.unique_open_count / campaign.delivered_count
                    analytics.click_rate = campaign.unique_click_count / campaign.delivered_count
                if campaign.unique_open_count > 0:
                    analytics.click_to_open_rate = campaign.unique_click_count / campaign.unique_open_count

                self.db.add(analytics)
                processed_count += 1
            except Exception as e:
                logger.error(f"Failed to aggregate analytics for campaign {campaign.id}: {e}")

        await self.db.commit()
        logger.info(f"Aggregated analytics for {processed_count} campaigns")
        return {"processed": processed_count}

    async def aggregate_workspace_stats(self) -> dict:
        """Aggregate workspace-level email stats (7d/30d/90d)."""
        logger.info("Aggregating workspace email stats")

        today = date.today()
        period_end = datetime.combine(today, datetime.max.time()).replace(tzinfo=timezone.utc)

        periods = {
            "7d": timedelta(days=7),
            "30d": timedelta(days=30),
            "90d": timedelta(days=90),
        }

        processed_count = 0

        workspace_ids = list((await self.db.execute(
            select(EmailCampaign.workspace_id).distinct()
        )).scalars().all())

        for workspace_id in workspace_ids:
            for period_name, delta in periods.items():
                try:
                    period_start = period_end - delta

                    campaigns = list((await self.db.execute(
                        select(EmailCampaign)
                        .where(EmailCampaign.workspace_id == workspace_id)
                        .where(EmailCampaign.status == CampaignStatus.SENT.value)
                        .where(EmailCampaign.completed_at >= period_start)
                        .where(EmailCampaign.completed_at <= period_end)
                    )).scalars().all())

                    if not campaigns:
                        continue

                    total_sent = sum(c.sent_count for c in campaigns)
                    total_delivered = sum(c.delivered_count for c in campaigns)
                    total_opens = sum(c.open_count for c in campaigns)
                    total_unique_opens = sum(c.unique_open_count for c in campaigns)
                    total_clicks = sum(c.click_count for c in campaigns)
                    total_unique_clicks = sum(c.unique_click_count for c in campaigns)
                    total_bounces = sum(c.bounce_count for c in campaigns)
                    total_unsubscribes = sum(c.unsubscribe_count for c in campaigns)
                    total_complaints = sum(c.complaint_count for c in campaigns)

                    avg_open_rate = None
                    avg_click_rate = None
                    bounce_rate = None

                    if total_delivered > 0:
                        avg_open_rate = total_unique_opens / total_delivered
                        avg_click_rate = total_unique_clicks / total_delivered
                    if total_sent > 0:
                        bounce_rate = total_bounces / total_sent

                    existing = (await self.db.execute(
                        select(WorkspaceEmailStats)
                        .where(WorkspaceEmailStats.workspace_id == workspace_id)
                        .where(WorkspaceEmailStats.period == period_name)
                    )).scalar_one_or_none()

                    if existing:
                        existing.period_start = period_start
                        existing.period_end = period_end
                        existing.campaigns_sent = len(campaigns)
                        existing.emails_sent = total_sent
                        existing.emails_delivered = total_delivered
                        existing.total_opens = total_opens
                        existing.unique_opens = total_unique_opens
                        existing.total_clicks = total_clicks
                        existing.unique_clicks = total_unique_clicks
                        existing.total_bounces = total_bounces
                        existing.total_unsubscribes = total_unsubscribes
                        existing.total_complaints = total_complaints
                        existing.avg_open_rate = avg_open_rate
                        existing.avg_click_rate = avg_click_rate
                        existing.bounce_rate = bounce_rate
                        existing.updated_at = datetime.now(timezone.utc)
                    else:
                        stats = WorkspaceEmailStats(
                            id=str(uuid4()),
                            workspace_id=workspace_id,
                            period=period_name,
                            period_start=period_start,
                            period_end=period_end,
                            campaigns_sent=len(campaigns),
                            emails_sent=total_sent,
                            emails_delivered=total_delivered,
                            total_opens=total_opens,
                            unique_opens=total_unique_opens,
                            total_clicks=total_clicks,
                            unique_clicks=total_unique_clicks,
                            total_bounces=total_bounces,
                            total_unsubscribes=total_unsubscribes,
                            total_complaints=total_complaints,
                            avg_open_rate=avg_open_rate,
                            avg_click_rate=avg_click_rate,
                            bounce_rate=bounce_rate,
                        )
                        self.db.add(stats)

                    processed_count += 1
                except Exception as e:
                    logger.error(f"Failed to aggregate stats for workspace {workspace_id}: {e}")

        await self.db.commit()
        logger.info(f"Aggregated workspace stats: {processed_count} records updated")
        return {"processed": processed_count}

    async def cleanup_old_analytics(self, retention_days: int = 90) -> dict:
        """Delete hourly CampaignAnalytics older than retention period."""
        logger.info(f"Cleaning up analytics older than {retention_days} days")

        cutoff_date = datetime.now(timezone.utc) - timedelta(days=retention_days)

        result = await self.db.execute(
            delete(CampaignAnalytics)
            .where(CampaignAnalytics.date < cutoff_date)
            .where(CampaignAnalytics.hour.isnot(None))
        )
        deleted_count = result.rowcount

        await self.db.commit()
        logger.info(f"Deleted {deleted_count} old analytics records")
        return {"deleted": deleted_count}

    # =========================================================================
    # WORKFLOW EMAIL
    # =========================================================================

    def _build_unsubscribe_url(self, subscriber) -> str:
        """One-click unsubscribe URL for the recipient's preference token."""
        from aexy.core.config import get_settings

        base = get_settings().frontend_url.rstrip("/")
        return f"{base}/preferences/{subscriber.preference_token}"

    async def _ensure_subscriber(
        self, workspace_id: str, email: str, record_id: str | None = None
    ):
        """Get or create a tracked subscriber for this recipient (E2.8 consent basis).

        Every automation recipient becomes a first-class subscriber with an
        active status + preference token, so a future unsubscribe/bounce is
        honoured by `_suppression_reason` on subsequent sends.
        """
        email_hash = hashlib.sha256(email.lower().encode()).hexdigest()
        subscriber = (
            await self.db.execute(
                select(EmailSubscriber).where(
                    EmailSubscriber.workspace_id == workspace_id,
                    EmailSubscriber.email_hash == email_hash,
                )
            )
        ).scalar_one_or_none()
        if subscriber:
            return subscriber

        try:
            async with self.db.begin_nested():
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
                await self.db.flush()
                return subscriber
        except IntegrityError:
            # Another send created the subscriber between our lookup and insert.
            subscriber = (
                await self.db.execute(
                    select(EmailSubscriber).where(
                        EmailSubscriber.workspace_id == workspace_id,
                        EmailSubscriber.email_hash == email_hash,
                    )
                )
            ).scalar_one_or_none()
            if subscriber:
                return subscriber
            raise

    async def _suppression_reason(self, workspace_id: str, email: str) -> str | None:
        """Return the suppression reason for an email in a workspace, or None.

        Mirrors the campaign path's suppression check so every send path honours
        the same unsubscribe/bounce/complaint list.
        """
        email_hash = hashlib.sha256(email.lower().encode()).hexdigest()
        subscriber = (
            await self.db.execute(
                select(EmailSubscriber).where(
                    EmailSubscriber.workspace_id == workspace_id,
                    EmailSubscriber.email_hash == email_hash,
                )
            )
        ).scalar_one_or_none()
        if subscriber and subscriber.status in {
            SubscriberStatus.UNSUBSCRIBED.value,
            SubscriberStatus.BOUNCED.value,
            SubscriberStatus.COMPLAINED.value,
        }:
            return subscriber.status
        return None

    async def send_workflow_email(
        self,
        workspace_id: str,
        to_email: str,
        subject: str,
        html_body: str,
        from_name: str | None = None,
        from_email: str | None = None,
        record_id: str | None = None,
        execution_id: str | None = None,
        track_opens: bool = True,
        track_clicks: bool = True,
        sending_pool_id: str | None = None,
    ) -> dict:
        """Send a tracked email from a workflow action.

        Uses multi-domain infrastructure if sending_pool_id is provided,
        otherwise falls back to the default email service.
        """
        logger.info(f"Sending workflow email to {to_email}")

        # E2.9: never attempt to send to a malformed address.
        try:
            validate_email(to_email, check_deliverability=False)
        except EmailNotValidError:
            logger.info(f"Skipping workflow email: invalid address {to_email!r}")
            return {"status": "skipped", "reason": "invalid_email", "to": to_email}

        # E2.7: enforce suppression on the workflow send path too (previously
        # only the campaign path honoured unsubscribes/bounces/complaints).
        suppressed = await self._suppression_reason(workspace_id, to_email)
        if suppressed:
            logger.info(f"Skipping workflow email to {to_email}: {suppressed}")
            return {"status": "skipped", "reason": suppressed, "to": to_email}

        # E2.8: register the recipient as a tracked subscriber (consent basis)
        # and build a one-click unsubscribe URL so automation mail carries a
        # List-Unsubscribe header, just like campaigns.
        subscriber = await self._ensure_subscriber(workspace_id, to_email, record_id)
        unsubscribe_url = self._build_unsubscribe_url(subscriber)

        # Automation mail now carries the same open/click tracking as campaign
        # mail. Both flags were always accepted here and never applied, so
        # email.opened / email.clicked could never fire for an automation's own
        # email - the palette offered triggers nothing could ever satisfy.
        #
        # No recipient_id: that column is a FK to campaign recipients and
        # automation mail has no campaign. The CRM bridge keys off record_id,
        # which is what resolves an open back to the right record.
        #
        # Deliberately non-fatal: tracking is an enhancement, and a tracking
        # failure must never stop a customer's email from being sent.
        if track_opens or track_clicks:
            try:
                from aexy.services.tracking_service import TrackingService

                html_body, _ = await TrackingService(self.db).process_email_body(
                    html_body=html_body,
                    workspace_id=workspace_id,
                    record_id=record_id,
                    inject_pixel=track_opens,
                    track_links=track_clicks,
                )
            except Exception as tracking_error:
                logger.warning(
                    "Email tracking not applied for %s: %s", to_email, tracking_error
                )

        message_id = None
        send_success = False

        if sending_pool_id:
            from aexy.services.routing_service import RoutingService
            from aexy.services.provider_service import ProviderService
            from aexy.services.domain_service import DomainService

            routing_service = RoutingService(self.db)
            provider_service = ProviderService(self.db)
            domain_service = DomainService(self.db)

            routing_decision = await routing_service.route_email(
                workspace_id=workspace_id,
                recipient_email=to_email,
                pool_id=sending_pool_id,
            )

            if routing_decision:
                domain_id = routing_decision.domain_id
                # A domain in a pool need not carry its own provider, so fall back
                # to the workspace default before giving up on the pool.
                provider_id = routing_decision.provider_id
                if not provider_id:
                    default_provider = await provider_service.get_default_provider(workspace_id)
                    provider_id = default_provider.id if default_provider else None

                can_send, reason = await domain_service.can_send(domain_id, workspace_id)
                if not can_send:
                    logger.warning(
                        "Workflow email: pool %s selected %s, which cannot send: %s",
                        sending_pool_id,
                        routing_decision.domain,
                        reason,
                    )
                if can_send and provider_id:
                    # The pool decides the domain, so it decides the From address:
                    # keeping a caller-supplied `from_email` would send as one
                    # domain through another.
                    result = await provider_service.send_email(
                        provider_id=provider_id,
                        to_email=to_email,
                        from_email=routing_decision.from_email,
                        from_name=from_name or "Notifications",
                        subject=subject,
                        html_body=html_body,
                        text_body="",
                        unsubscribe_url=unsubscribe_url,
                    )

                    if result.get("success"):
                        send_success = True
                        message_id = result.get("message_id")
                        await domain_service.increment_daily_sent(domain_id)
                        logger.info(f"Workflow email sent via domain {routing_decision.domain}")
                    else:
                        logger.error(
                            "Workflow email: provider send failed via %s: %s",
                            routing_decision.domain,
                            result.get("error"),
                        )

        # Fallback to default email service
        if not send_success:
            from aexy.services.email_service import email_service

            try:
                log = await email_service.send_templated_email(
                    db=self.db,
                    recipient_email=to_email,
                    subject=subject,
                    body_text="",
                    body_html=html_body,
                    unsubscribe_url=unsubscribe_url,
                )
                if log.status == "sent":
                    send_success = True
                    message_id = log.ses_message_id
                    logger.info("Workflow email sent via default service")
                else:
                    logger.error(f"Workflow email failed: {log.error_message}")
                    return {"status": "failed", "error": log.error_message}
            except Exception as e:
                logger.error(f"Failed to send workflow email: {e}")
                return {"status": "failed", "error": str(e)}

        if send_success:
            return {"status": "sent", "message_id": message_id, "to": to_email}
        else:
            return {"status": "failed", "error": "Send failed"}

    # =========================================================================
    # VISUAL BUILDER
    # =========================================================================

    async def seed_default_blocks(self, workspace_id: str) -> dict:
        """Seed default system blocks for the visual email builder."""
        logger.info("Seeding default visual builder blocks")

        from aexy.services.visual_builder_service import DEFAULT_BLOCKS

        created = 0
        for block_data in DEFAULT_BLOCKS:
            existing = (await self.db.execute(
                select(VisualTemplateBlock)
                .where(VisualTemplateBlock.workspace_id.is_(None))
                .where(VisualTemplateBlock.slug == block_data["slug"])
            )).scalar_one_or_none()

            if existing:
                continue

            html_template = _get_default_block_html(block_data["block_type"])

            block = VisualTemplateBlock(
                id=str(uuid4()),
                workspace_id=None,  # System block
                name=block_data["name"],
                slug=block_data["slug"],
                description=block_data.get("description"),
                block_type=block_data["block_type"],
                category=block_data.get("category", "content"),
                schema={},
                default_props=block_data.get("default_props", {}),
                html_template=html_template,
                icon=block_data.get("icon"),
                is_system=True,
                is_active=True,
            )
            self.db.add(block)
            created += 1

        await self.db.commit()
        logger.info(f"Created {created} default blocks")
        return {"created": created}


def _get_default_block_html(block_type: str) -> str:
    """Get default HTML for built-in block types."""
    defaults = {
        "container": '<div style="{{style|default(\'\')}}">{{children}}</div>',
        "section": '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding: {{padding|default(\'20px\')}};">{{children}}</td></tr></table>',
        "column": '<td style="width: {{width|default(\'100%\')}}; vertical-align: top;">{{children}}</td>',
        "divider": '<hr style="border: none; border-top: {{thickness|default(\'1px\')}} solid {{color|default(\'#e0e0e0\')}}; margin: {{margin|default(\'20px 0\')}};">',
        "spacer": '<div style="height: {{height|default(\'20px\')}};"></div>',
        "header": '<h{{level|default(1)}} style="color: {{color|default(\'#333\')}}; font-size: {{fontSize|default(\'24px\')}}; margin: {{margin|default(\'0 0 10px 0\')}};">{{text}}</h{{level|default(1)}}>',
        "text": '<p style="color: {{color|default(\'#666\')}}; font-size: {{fontSize|default(\'16px\')}}; line-height: {{lineHeight|default(\'1.6\')}}; margin: {{margin|default(\'0 0 10px 0\')}};">{{text}}</p>',
        "image": '<img src="{{src}}" alt="{{alt|default(\'\')}}}" width="{{width|default(\'100%\')}}" style="max-width: 100%; height: auto; display: block;">',
        "button": '<a href="{{href|default(\'#\')}}" style="display: inline-block; padding: {{padding|default(\'12px 24px\')}}; background-color: {{backgroundColor|default(\'#007bff\')}}; color: {{color|default(\'#ffffff\')}}; text-decoration: none; border-radius: {{borderRadius|default(\'4px\')}}; font-weight: {{fontWeight|default(\'600\')}};">{{text}}</a>',
        "link": '<a href="{{href}}" style="color: {{color|default(\'#007bff\')}}};">{{text}}</a>',
        "hero": '<table width="100%" cellpadding="0" cellspacing="0" style="background-color: {{backgroundColor|default(\'#f8f9fa\')}};"><tr><td style="padding: {{padding|default(\'60px 20px\')}}; text-align: center;">{% if image %}<img src="{{image}}" alt="" style="max-width: 100%; margin-bottom: 20px;">{% endif %}<h1 style="color: {{titleColor|default(\'#333\')}}; margin: 0 0 15px 0;">{{title}}</h1>{% if subtitle %}<p style="color: {{subtitleColor|default(\'#666\')}}; font-size: 18px; margin: 0 0 25px 0;">{{subtitle}}</p>{% endif %}{% if buttonText %}<a href="{{buttonHref|default(\'#\')}}" style="display: inline-block; padding: 14px 32px; background-color: {{buttonColor|default(\'#007bff\')}}; color: #fff; text-decoration: none; border-radius: 4px;">{{buttonText}}</a>{% endif %}</td></tr></table>',
        "footer": '<table width="100%" cellpadding="0" cellspacing="0" style="background-color: {{backgroundColor|default(\'#f8f9fa\')}};"><tr><td style="padding: {{padding|default(\'30px 20px\')}}; text-align: center;"><p style="color: {{textColor|default(\'#999\')}}; font-size: 12px; margin: 0;">{{text}}</p>{% if unsubscribeUrl %}<p style="margin: 10px 0 0 0;"><a href="{{unsubscribeUrl}}" style="color: {{linkColor|default(\'#999\')}}; font-size: 12px;">Unsubscribe</a></p>{% endif %}</td></tr></table>',
        "social": '<div style="text-align: {{align|default(\'center\')}};"> {% for link in links %}<a href="{{link.url}}" style="display: inline-block; margin: 0 8px;"><img src="{{link.icon}}" alt="{{link.name}}" width="24" height="24"></a>{% endfor %}</div>',
        "variable": "{{{{value}}}}",
        "conditional": "{% if {{condition}} %}{{children}}{% endif %}",
        "loop": "{% for item in {{items}} %}{{children}}{% endfor %}",
    }
    return defaults.get(block_type, "<div>{{children}}</div>")
