"""Legacy task functions for email marketing campaign sending and analytics.

Business logic has been moved to Temporal activities.
These functions are retained as plain functions for backward compatibility.
"""

import logging
from datetime import datetime, timezone, timedelta
from uuid import uuid4

from sqlalchemy import select, and_, func

from aexy.core.database import get_sync_session, async_session_maker

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
    OnboardingFlow,
    OnboardingProgress,
    OnboardingStatus,
)

logger = logging.getLogger(__name__)


def send_campaign_task(campaign_id: str) -> dict:
    """
    Process campaign sending in batches.

    This task fetches pending recipients and sends emails in batches.

    Args:
        campaign_id: The campaign ID to send

    Returns:
        Dict with sending result
    """
    logger.info(f"Starting campaign send: {campaign_id}")

    with get_sync_session() as db:
        # Load campaign
        campaign = db.execute(
            select(EmailCampaign)
            .where(EmailCampaign.id == campaign_id)
        ).scalar_one_or_none()

        if not campaign:
            logger.error(f"Campaign not found: {campaign_id}")
            return {"status": "error", "message": "Campaign not found"}

        # Check if campaign is in sending state
        if campaign.status != CampaignStatus.SENDING.value:
            logger.info(f"Campaign {campaign_id} is not in sending state: {campaign.status}")
            return {"status": "skipped", "message": f"Campaign status is {campaign.status}"}

        # Load template
        template = db.execute(
            select(EmailTemplate)
            .where(EmailTemplate.id == campaign.template_id)
        ).scalar_one_or_none()

        if not template:
            campaign.status = CampaignStatus.CANCELLED.value
            db.commit()
            logger.error(f"Template not found for campaign: {campaign_id}")
            return {"status": "error", "message": "Template not found"}

        # Get batch of pending recipients
        batch_size = 50
        recipients = list(db.execute(
            select(CampaignRecipient)
            .where(CampaignRecipient.campaign_id == campaign_id)
            .where(CampaignRecipient.status == RecipientStatus.PENDING.value)
            .order_by(CampaignRecipient.created_at.asc())
            .limit(batch_size)
        ).scalars().all())

        if not recipients:
            # No more recipients, mark campaign as completed
            campaign.status = CampaignStatus.SENT.value
            campaign.completed_at = datetime.now(timezone.utc)
            db.commit()

            # Trigger stats update
            update_campaign_stats_task(campaign_id)

            logger.info(f"Campaign {campaign_id} completed")
            return {"status": "completed", "message": "All emails sent"}

        # Queue individual sends
        sent_count = 0
        for recipient in recipients:
            try:
                send_campaign_email_task(campaign_id, recipient.id)
                sent_count += 1
            except Exception as e:
                logger.error(f"Failed to queue email for recipient {recipient.id}: {e}")

        # If there are more recipients, schedule another batch
        remaining_count = db.execute(
            select(func.count(CampaignRecipient.id))
            .where(CampaignRecipient.campaign_id == campaign_id)
            .where(CampaignRecipient.status == RecipientStatus.PENDING.value)
        ).scalar() or 0

        remaining_count -= sent_count

        if remaining_count > 0:
            # Schedule next batch with a delay
            # Note: Batch scheduling is now handled by Temporal
            send_campaign_task(campaign_id)

        logger.info(f"Queued {sent_count} emails for campaign {campaign_id}, {remaining_count} remaining")
        return {"status": "in_progress", "queued": sent_count, "remaining": remaining_count}


def send_campaign_email_task(campaign_id: str, recipient_id: str) -> dict:
    """
    Send individual campaign email with multi-domain routing and tracking.

    Uses the email infrastructure for:
    - Smart domain routing based on health, warming status, and ISP
    - Failover to alternate domains when limits are reached
    - Provider-specific sending (SES, SendGrid, Mailgun, Postmark)
    - Metrics recording for reputation tracking

    Args:
        campaign_id: The campaign ID
        recipient_id: The recipient ID

    Returns:
        Dict with send result
    """
    logger.debug(f"Sending email: campaign={campaign_id}, recipient={recipient_id}")

    with get_sync_session() as db:
        # Load campaign and template
        campaign = db.execute(
            select(EmailCampaign)
            .where(EmailCampaign.id == campaign_id)
        ).scalar_one_or_none()

        if not campaign:
            return {"status": "error", "message": "Campaign not found"}

        template = db.execute(
            select(EmailTemplate)
            .where(EmailTemplate.id == campaign.template_id)
        ).scalar_one_or_none()

        if not template:
            return {"status": "error", "message": "Template not found"}

        recipient = db.execute(
            select(CampaignRecipient)
            .where(CampaignRecipient.id == recipient_id)
        ).scalar_one_or_none()

        if not recipient:
            return {"status": "error", "message": "Recipient not found"}

        # Check if campaign is paused or cancelled
        if campaign.status not in [CampaignStatus.SENDING.value]:
            recipient.status = RecipientStatus.PENDING.value  # Reset to pending
            db.commit()
            return {"status": "skipped", "message": "Campaign not in sending state"}

        # Check subscription status
        if recipient.subscriber_id:
            subscriber = db.execute(
                select(EmailSubscriber)
                .where(EmailSubscriber.id == recipient.subscriber_id)
            ).scalar_one_or_none()

            if subscriber and subscriber.status != SubscriberStatus.ACTIVE.value:
                recipient.status = RecipientStatus.UNSUBSCRIBED.value
                db.commit()
                return {"status": "skipped", "message": "Subscriber unsubscribed"}

        # Build context for template rendering
        context = {
            **campaign.template_context,
            **recipient.context,
            "unsubscribe_url": f"/preferences/{recipient.subscriber_id}" if recipient.subscriber_id else "",
        }

        try:
            # Import services here to avoid circular imports
            from aexy.services.template_service import TemplateService
            from aexy.services.routing_service import RoutingService
            from aexy.services.provider_service import ProviderService
            from aexy.services.domain_service import DomainService
            from aexy.services.reputation_service import ReputationService
            from aexy.models.email_infrastructure import SendingDomain, SendingIdentity

            # Render template (sync version)
            template_service = TemplateService(db)
            subject, html_body, text_body = template_service.render_template(template, context)

            # Inject tracking pixel and rewrite links for click tracking
            from aexy.services.tracking_service import TrackingService
            tracking_service = TrackingService(db)
            html_body, pixel_id = tracking_service.process_email_body_sync(
                html_body=html_body,
                workspace_id=campaign.workspace_id,
                campaign_id=campaign_id,
                recipient_id=recipient_id,
                record_id=recipient.record_id,
            )

            # Store pixel ID on recipient for reference
            if pixel_id:
                recipient.tracking_pixel_id = pixel_id

            # =========================================================
            # Multi-domain Routing Logic
            # =========================================================

            routing_service = RoutingService(db)
            provider_service = ProviderService(db)
            domain_service = DomainService(db)
            reputation_service = ReputationService(db)

            # Get routing decision based on campaign config
            routing_config = campaign.routing_config or {}
            strategy = routing_config.get("strategy", "health_based")

            # Determine sender info
            from_email = campaign.from_email
            from_name = campaign.from_name
            reply_to = campaign.reply_to

            # Check if campaign has a sending pool or identity configured
            send_domain = None
            send_provider = None
            send_identity = None

            if campaign.sending_identity_id:
                # Use specific identity
                identity_result = db.execute(
                    select(SendingIdentity)
                    .where(SendingIdentity.id == campaign.sending_identity_id)
                )
                send_identity = identity_result.scalar_one_or_none()
                if send_identity and send_identity.is_active:
                    from_email = send_identity.email
                    if send_identity.display_name:
                        from_name = send_identity.display_name
                    if send_identity.reply_to:
                        reply_to = send_identity.reply_to

                    # Get domain for identity
                    domain_result = db.execute(
                        select(SendingDomain)
                        .where(SendingDomain.id == send_identity.domain_id)
                    )
                    send_domain = domain_result.scalar_one_or_none()

            elif campaign.sending_pool_id:
                # Use pool routing
                routing_decision = routing_service.route_email_sync(
                    pool_id=campaign.sending_pool_id,
                    recipient_email=recipient.email,
                    strategy=strategy,
                )

                if routing_decision and routing_decision.get("domain_id"):
                    domain_result = db.execute(
                        select(SendingDomain)
                        .where(SendingDomain.id == routing_decision["domain_id"])
                    )
                    send_domain = domain_result.scalar_one_or_none()

            # Check if domain can send (within limits)
            if send_domain:
                can_send, reason = domain_service.can_send_sync(send_domain.id)
                if not can_send:
                    logger.warning(f"Domain {send_domain.domain} cannot send: {reason}")
                    # Try failover
                    if campaign.sending_pool_id and routing_config.get("fallback_enabled", True):
                        fallback = routing_service.get_fallback_domain_sync(
                            pool_id=campaign.sending_pool_id,
                            exclude_domain_id=send_domain.id,
                            recipient_email=recipient.email,
                        )
                        if fallback:
                            domain_result = db.execute(
                                select(SendingDomain)
                                .where(SendingDomain.id == fallback["domain_id"])
                            )
                            send_domain = domain_result.scalar_one_or_none()
                        else:
                            send_domain = None

                if send_domain:
                    send_provider = send_domain.provider_id

            # =========================================================
            # Send Email
            # =========================================================

            now = datetime.now(timezone.utc)
            message_id = None
            send_success = False

            if send_domain and send_provider:
                # Use multi-domain infrastructure
                try:
                    result = provider_service.send_email_sync(
                        provider_id=send_provider,
                        to_email=recipient.email,
                        from_email=from_email,
                        from_name=from_name,
                        subject=subject,
                        html_body=html_body,
                        text_body=text_body or "",
                        reply_to=reply_to,
                    )

                    if result.get("success"):
                        send_success = True
                        message_id = result.get("message_id")

                        # Increment domain counters
                        domain_service.increment_send_count_sync(send_domain.id)

                        # Record send event for reputation tracking
                        reputation_service.record_send_event_sync(
                            domain_id=send_domain.id,
                            event_type="send",
                            recipient_email=recipient.email,
                            message_id=message_id,
                        )

                        # Update warming metrics if domain is warming
                        from aexy.models.email_infrastructure import WarmingStatus
                        if send_domain.warming_status == WarmingStatus.IN_PROGRESS.value:
                            from aexy.processing.warming_tasks import update_warming_metrics
                            update_warming_metrics(
                                domain_id=send_domain.id,
                                sent=1,
                            )

                        # Update recipient with sent_via tracking
                        recipient.sent_via_domain_id = send_domain.id
                        recipient.sent_via_provider_id = send_provider
                    else:
                        logger.error(f"Provider send failed: {result.get('error')}")
                        raise Exception(result.get("error", "Provider send failed"))

                except Exception as e:
                    logger.error(f"Multi-domain send failed for {recipient.email}: {e}")
                    # Fall back to default email service
                    send_domain = None
                    send_provider = None

            # Fallback to default email service if no domain configured or multi-domain failed
            if not send_success:
                from aexy.services.email_service import email_service
                from aexy.processing.tasks import run_async

                async def _send_email_async():
                    """Send email with proper async session."""
                    async with async_session_maker() as async_db:
                        return await email_service.send_templated_email(
                            db=async_db,
                            recipient_email=recipient.email,
                            subject=subject,
                            body_text=text_body or "",
                            body_html=html_body,
                        )

                try:
                    log = run_async(_send_email_async())
                    if log.status == "sent":
                        send_success = True
                        message_id = log.ses_message_id
                    else:
                        recipient.status = RecipientStatus.FAILED.value
                        recipient.error_message = log.error_message
                        db.commit()
                        return {"status": "failed", "error": log.error_message}
                except Exception as e:
                    logger.error(f"Default email service failed: {e}")
                    recipient.status = RecipientStatus.FAILED.value
                    recipient.error_message = str(e)
                    db.commit()
                    return {"status": "failed", "error": str(e)}

            # Update recipient status
            if send_success:
                recipient.status = RecipientStatus.SENT.value
                recipient.sent_at = now
                recipient.message_id = message_id
                db.commit()
                return {
                    "status": "sent",
                    "message_id": message_id,
                    "domain": send_domain.domain if send_domain else None,
                }
            else:
                recipient.status = RecipientStatus.FAILED.value
                recipient.error_message = "Send failed"
                db.commit()
                return {"status": "failed", "error": "Send failed"}

        except Exception as e:
            logger.error(f"Error sending email to {recipient.email}: {e}")
            recipient.status = RecipientStatus.FAILED.value
            recipient.error_message = str(e)
            db.commit()

            # Note: Retries are now handled by Temporal retry policies
            return {"status": "failed", "error": str(e)}


def update_campaign_stats_task(campaign_id: str) -> dict:
    """
    Aggregate recipient stats to campaign level.

    Args:
        campaign_id: The campaign ID to update stats for

    Returns:
        Dict with update result
    """
    logger.info(f"Updating stats for campaign: {campaign_id}")

    with get_sync_session() as db:
        campaign = db.execute(
            select(EmailCampaign)
            .where(EmailCampaign.id == campaign_id)
        ).scalar_one_or_none()

        if not campaign:
            return {"status": "error", "message": "Campaign not found"}

        # Get counts by status
        status_counts = {}
        result = db.execute(
            select(
                CampaignRecipient.status,
                func.count(CampaignRecipient.id),
            )
            .where(CampaignRecipient.campaign_id == campaign_id)
            .group_by(CampaignRecipient.status)
        )
        for row in result.all():
            status_counts[row[0]] = row[1]

        # Get unique open/click counts
        unique_opens = db.execute(
            select(func.count(CampaignRecipient.id))
            .where(CampaignRecipient.campaign_id == campaign_id)
            .where(CampaignRecipient.first_opened_at.isnot(None))
        ).scalar() or 0

        unique_clicks = db.execute(
            select(func.count(CampaignRecipient.id))
            .where(CampaignRecipient.campaign_id == campaign_id)
            .where(CampaignRecipient.first_clicked_at.isnot(None))
        ).scalar() or 0

        # Get total opens/clicks
        total_opens = db.execute(
            select(func.sum(CampaignRecipient.open_count))
            .where(CampaignRecipient.campaign_id == campaign_id)
        ).scalar() or 0

        total_clicks = db.execute(
            select(func.sum(CampaignRecipient.click_count))
            .where(CampaignRecipient.campaign_id == campaign_id)
        ).scalar() or 0

        # Update campaign stats
        campaign.sent_count = (
            status_counts.get(RecipientStatus.SENT.value, 0) +
            status_counts.get(RecipientStatus.DELIVERED.value, 0) +
            status_counts.get(RecipientStatus.OPENED.value, 0) +
            status_counts.get(RecipientStatus.CLICKED.value, 0)
        )
        campaign.delivered_count = (
            status_counts.get(RecipientStatus.DELIVERED.value, 0) +
            status_counts.get(RecipientStatus.OPENED.value, 0) +
            status_counts.get(RecipientStatus.CLICKED.value, 0)
        )
        campaign.open_count = total_opens
        campaign.unique_open_count = unique_opens
        campaign.click_count = total_clicks
        campaign.unique_click_count = unique_clicks
        campaign.bounce_count = status_counts.get(RecipientStatus.BOUNCED.value, 0)
        campaign.unsubscribe_count = status_counts.get(RecipientStatus.UNSUBSCRIBED.value, 0)

        db.commit()

        logger.info(f"Updated stats for campaign {campaign_id}: sent={campaign.sent_count}")
        return {
            "status": "success",
            "sent": campaign.sent_count,
            "opens": campaign.unique_open_count,
            "clicks": campaign.unique_click_count,
        }


def check_scheduled_campaigns_task() -> dict:
    """
    Check for scheduled campaigns that are due to be sent.

    This task runs periodically via Temporal scheduling.
    """
    logger.info("Checking for scheduled campaigns")

    with get_sync_session() as db:
        now = datetime.now(timezone.utc)

        # Find campaigns that are scheduled and due
        campaigns = list(db.execute(
            select(EmailCampaign)
            .where(EmailCampaign.status == CampaignStatus.SCHEDULED.value)
            .where(EmailCampaign.scheduled_at <= now)
        ).scalars().all())

        started_count = 0
        for campaign in campaigns:
            try:
                # Update status to sending
                campaign.status = CampaignStatus.SENDING.value
                campaign.started_at = now
                db.commit()

                # Queue the send task
                send_campaign_task(campaign.id)
                started_count += 1

                logger.info(f"Started scheduled campaign: {campaign.id}")
            except Exception as e:
                logger.error(f"Failed to start campaign {campaign.id}: {e}")

        return {"started": started_count}


def aggregate_daily_analytics_task() -> dict:
    """
    Aggregate campaign analytics on a daily basis.

    This task runs periodically to compute daily metrics.
    """
    logger.info("Aggregating daily campaign analytics")

    with get_sync_session() as db:
        from datetime import date, timedelta
        from uuid import uuid4

        today = date.today()
        yesterday = today - timedelta(days=1)

        # Find campaigns that have been sent
        campaigns = list(db.execute(
            select(EmailCampaign)
            .where(EmailCampaign.status.in_([
                CampaignStatus.SENDING.value,
                CampaignStatus.SENT.value,
            ]))
        ).scalars().all())

        processed_count = 0
        for campaign in campaigns:
            try:
                # Check if analytics entry exists for yesterday
                existing = db.execute(
                    select(CampaignAnalytics)
                    .where(CampaignAnalytics.campaign_id == campaign.id)
                    .where(func.date(CampaignAnalytics.date) == yesterday)
                    .where(CampaignAnalytics.hour.is_(None))
                ).scalar_one_or_none()

                if existing:
                    continue  # Already processed

                # Create analytics entry
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

                # Calculate rates
                if campaign.delivered_count > 0:
                    analytics.open_rate = campaign.unique_open_count / campaign.delivered_count
                    analytics.click_rate = campaign.unique_click_count / campaign.delivered_count
                if campaign.unique_open_count > 0:
                    analytics.click_to_open_rate = campaign.unique_click_count / campaign.unique_open_count

                db.add(analytics)
                processed_count += 1
            except Exception as e:
                logger.error(f"Failed to aggregate analytics for campaign {campaign.id}: {e}")

        db.commit()
        logger.info(f"Aggregated analytics for {processed_count} campaigns")
        return {"processed": processed_count}


def send_workflow_email(
    workspace_id: str,
    to: str,
    subject: str,
    body: str,
    from_email: str | None = None,
    from_name: str | None = None,
    record_id: str | None = None,
    sending_pool_id: str | None = None,
) -> dict:
    """
    Send a tracked email from a workflow action.

    Uses the multi-domain infrastructure if sending_pool_id is provided,
    otherwise falls back to the default email service.

    Args:
        workspace_id: Workspace ID
        to: Recipient email address
        subject: Email subject
        body: Email HTML body (already processed with tracking)
        from_email: Optional sender email
        from_name: Optional sender name
        record_id: Optional CRM record ID for tracking
        sending_pool_id: Optional sending pool for multi-domain routing

    Returns:
        Dict with send result
    """
    logger.info(f"Sending workflow email to {to}")

    with get_sync_session() as db:
        message_id = None
        send_success = False

        if sending_pool_id:
            # Use multi-domain routing
            from aexy.services.routing_service import RoutingService
            from aexy.services.provider_service import ProviderService
            from aexy.services.domain_service import DomainService

            routing_service = RoutingService(db)
            provider_service = ProviderService(db)
            domain_service = DomainService(db)

            # Get routing decision
            routing_decision = routing_service.route_email_sync(
                pool_id=sending_pool_id,
                recipient_email=to,
                strategy="health_based",
            )

            if routing_decision and routing_decision.get("domain_id"):
                domain_id = routing_decision["domain_id"]
                provider_id = routing_decision.get("provider_id")

                # Check if domain can send
                can_send, reason = domain_service.can_send_sync(domain_id)
                if can_send and provider_id:
                    result = provider_service.send_email_sync(
                        provider_id=provider_id,
                        to_email=to,
                        from_email=from_email or routing_decision.get("from_email", f"no-reply@{routing_decision.get('domain')}"),
                        from_name=from_name or "Notifications",
                        subject=subject,
                        html_body=body,
                        text_body="",
                    )

                    if result.get("success"):
                        send_success = True
                        message_id = result.get("message_id")
                        domain_service.increment_send_count_sync(domain_id)
                        logger.info(f"Workflow email sent via domain {routing_decision.get('domain')}")

        # Fallback to default email service
        if not send_success:
            from aexy.services.email_service import email_service
            from aexy.processing.tasks import run_async

            async def _send_email_async():
                """Send email with proper async session."""
                async with async_session_maker() as async_db:
                    return await email_service.send_templated_email(
                        db=async_db,
                        recipient_email=to,
                        subject=subject,
                        body_text="",
                        body_html=body,
                    )

            try:
                log = run_async(_send_email_async())
                if log.status == "sent":
                    send_success = True
                    message_id = log.ses_message_id
                    logger.info(f"Workflow email sent via default service")
                else:
                    logger.error(f"Workflow email failed: {log.error_message}")
                    return {"status": "failed", "error": log.error_message}
            except Exception as e:
                logger.error(f"Failed to send workflow email: {e}")
                return {"status": "failed", "error": str(e)}

        if send_success:
            return {
                "status": "sent",
                "message_id": message_id,
                "to": to,
            }
        else:
            return {"status": "failed", "error": "Send failed"}


def aggregate_workspace_stats_task() -> dict:
    """
    Aggregate workspace-level email stats.

    This task runs weekly to compute workspace-level email metrics for
    dashboards and reporting.
    """
    logger.info("Aggregating workspace email stats")

    with get_sync_session() as db:
        from datetime import date, timedelta
        from uuid import uuid4
        from aexy.models.email_marketing import WorkspaceEmailStats

        today = date.today()
        period_end = datetime.combine(today, datetime.max.time()).replace(tzinfo=timezone.utc)

        # Process different periods
        periods = {
            "7d": timedelta(days=7),
            "30d": timedelta(days=30),
            "90d": timedelta(days=90),
        }

        processed_count = 0

        # Get all workspaces with campaigns
        workspace_ids = list(db.execute(
            select(EmailCampaign.workspace_id).distinct()
        ).scalars().all())

        for workspace_id in workspace_ids:
            for period_name, delta in periods.items():
                try:
                    period_start = period_end - delta

                    # Get campaign stats for period
                    campaigns = list(db.execute(
                        select(EmailCampaign)
                        .where(EmailCampaign.workspace_id == workspace_id)
                        .where(EmailCampaign.status == CampaignStatus.SENT.value)
                        .where(EmailCampaign.completed_at >= period_start)
                        .where(EmailCampaign.completed_at <= period_end)
                    ).scalars().all())

                    if not campaigns:
                        continue

                    # Aggregate stats
                    total_sent = sum(c.sent_count for c in campaigns)
                    total_delivered = sum(c.delivered_count for c in campaigns)
                    total_opens = sum(c.open_count for c in campaigns)
                    total_unique_opens = sum(c.unique_open_count for c in campaigns)
                    total_clicks = sum(c.click_count for c in campaigns)
                    total_unique_clicks = sum(c.unique_click_count for c in campaigns)
                    total_bounces = sum(c.bounce_count for c in campaigns)
                    total_unsubscribes = sum(c.unsubscribe_count for c in campaigns)
                    total_complaints = sum(c.complaint_count for c in campaigns)

                    # Calculate rates
                    avg_open_rate = None
                    avg_click_rate = None
                    bounce_rate = None

                    if total_delivered > 0:
                        avg_open_rate = total_unique_opens / total_delivered
                        avg_click_rate = total_unique_clicks / total_delivered

                    if total_sent > 0:
                        bounce_rate = total_bounces / total_sent

                    # Upsert stats record
                    existing = db.execute(
                        select(WorkspaceEmailStats)
                        .where(WorkspaceEmailStats.workspace_id == workspace_id)
                        .where(WorkspaceEmailStats.period == period_name)
                    ).scalar_one_or_none()

                    if existing:
                        # Update existing
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
                        # Create new
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
                        db.add(stats)

                    processed_count += 1
                except Exception as e:
                    logger.error(f"Failed to aggregate stats for workspace {workspace_id}: {e}")

        db.commit()
        logger.info(f"Aggregated workspace stats: {processed_count} records updated")
        return {"processed": processed_count}


def cleanup_old_analytics_task(retention_days: int = 90) -> dict:
    """
    Clean up old analytics data beyond retention period.

    Args:
        retention_days: Number of days to retain analytics data

    Returns:
        Dict with cleanup result
    """
    logger.info(f"Cleaning up analytics older than {retention_days} days")

    with get_sync_session() as db:
        from datetime import timedelta

        cutoff_date = datetime.now(timezone.utc) - timedelta(days=retention_days)

        # Delete old hourly analytics (keep daily)
        deleted_count = db.execute(
            CampaignAnalytics.__table__.delete()
            .where(CampaignAnalytics.date < cutoff_date)
            .where(CampaignAnalytics.hour.isnot(None))
        ).rowcount

        db.commit()
        logger.info(f"Deleted {deleted_count} old analytics records")
        return {"deleted": deleted_count}


# =============================================================================
# ONBOARDING TASKS
# =============================================================================

def start_user_onboarding(
    workspace_id: str,
    user_id: str,
    flow_id: str | None = None,
    flow_slug: str | None = None,
    record_id: str | None = None,
) -> dict:
    """
    Start an onboarding flow for a user.

    Args:
        workspace_id: Workspace ID
        user_id: User ID to onboard
        flow_id: Onboarding flow ID
        flow_slug: Onboarding flow slug (alternative to flow_id)
        record_id: Optional CRM record ID

    Returns:
        Dict with result
    """
    logger.info(f"Starting onboarding for user {user_id}")

    with get_sync_session() as db:
        from aexy.models.email_marketing import OnboardingFlow, OnboardingProgress, OnboardingStatus

        # Find flow
        if flow_id:
            flow = db.execute(
                select(OnboardingFlow)
                .where(OnboardingFlow.id == flow_id)
                .where(OnboardingFlow.workspace_id == workspace_id)
            ).scalar_one_or_none()
        elif flow_slug:
            flow = db.execute(
                select(OnboardingFlow)
                .where(OnboardingFlow.slug == flow_slug)
                .where(OnboardingFlow.workspace_id == workspace_id)
            ).scalar_one_or_none()
        else:
            return {"status": "failed", "error": "Must specify flow_id or flow_slug"}

        if not flow:
            return {"status": "failed", "error": "Flow not found"}

        if not flow.is_active:
            return {"status": "skipped", "message": "Flow is not active"}

        # Check if progress already exists
        existing = db.execute(
            select(OnboardingProgress)
            .where(OnboardingProgress.flow_id == flow.id)
            .where(OnboardingProgress.user_id == user_id)
        ).scalar_one_or_none()

        if existing:
            if existing.status == OnboardingStatus.COMPLETED.value:
                return {"status": "skipped", "message": "Already completed"}
            # Reset progress
            existing.status = OnboardingStatus.IN_PROGRESS.value
            existing.current_step = 0
            existing.completed_steps = []
            existing.started_at = datetime.now(timezone.utc)
            existing.next_step_scheduled = datetime.now(timezone.utc)
            db.commit()
            return {"status": "success", "progress_id": existing.id, "restarted": True}

        # Create new progress
        from uuid import uuid4

        now = datetime.now(timezone.utc)
        progress = OnboardingProgress(
            id=str(uuid4()),
            flow_id=flow.id,
            user_id=user_id,
            record_id=record_id,
            status=OnboardingStatus.IN_PROGRESS.value,
            current_step=0,
            completed_steps=[],
            started_at=now,
            next_step_scheduled=now,
        )
        db.add(progress)
        db.commit()

        logger.info(f"Created onboarding progress {progress.id} for user {user_id}")

        # Schedule first step processing
        process_onboarding_step(progress.id)

        return {"status": "success", "progress_id": progress.id}


def process_onboarding_step(progress_id: str) -> dict:
    """
    Process the current onboarding step and schedule the next one.

    Args:
        progress_id: Onboarding progress ID

    Returns:
        Dict with result
    """
    logger.info(f"Processing onboarding step for progress {progress_id}")

    with get_sync_session() as db:
        from aexy.models.email_marketing import OnboardingProgress, OnboardingFlow, OnboardingStatus

        progress = db.execute(
            select(OnboardingProgress)
            .where(OnboardingProgress.id == progress_id)
        ).scalar_one_or_none()

        if not progress:
            return {"status": "error", "message": "Progress not found"}

        if progress.status != OnboardingStatus.IN_PROGRESS.value:
            return {"status": "skipped", "message": f"Status is {progress.status}"}

        flow = db.execute(
            select(OnboardingFlow)
            .where(OnboardingFlow.id == progress.flow_id)
        ).scalar_one_or_none()

        if not flow or not flow.is_active:
            return {"status": "skipped", "message": "Flow not active"}

        steps = flow.steps or []
        if progress.current_step >= len(steps):
            # Completed
            progress.status = OnboardingStatus.COMPLETED.value
            progress.completed_at = datetime.now(timezone.utc)
            db.commit()
            return {"status": "completed"}

        step = steps[progress.current_step]
        step_id = step.get("id", f"step_{progress.current_step}")
        step_type = step.get("type", "email")
        step_config = step.get("config", {})

        now = datetime.now(timezone.utc)

        # Process step based on type
        if step_type == "email":
            # Send email
            from aexy.models.developer import Developer

            user = db.execute(
                select(Developer).where(Developer.id == progress.user_id)
            ).scalar_one_or_none()

            if user and user.email:
                subject = step_config.get("subject", "Onboarding Step")
                template_slug = step_config.get("template_slug")

                send_workflow_email(
                    workspace_id=flow.workspace_id,
                    to=user.email,
                    subject=subject,
                    body=step_config.get("body", f"<p>Step {progress.current_step + 1}</p>"),
                    record_id=progress.record_id,
                )

        elif step_type == "wait":
            # Wait step - just schedule next
            pass

        elif step_type == "milestone":
            # Wait for milestone - don't auto-advance
            return {"status": "waiting", "waiting_for": step_config.get("milestone_slug")}

        # Mark step complete and advance
        completed = list(progress.completed_steps)
        completed.append(step_id)
        progress.completed_steps = completed
        progress.last_step_at = now
        progress.current_step += 1

        # Check if done
        if progress.current_step >= len(steps):
            progress.status = OnboardingStatus.COMPLETED.value
            progress.completed_at = now
            progress.next_step_scheduled = None
            db.commit()
            logger.info(f"Onboarding completed for progress {progress_id}")
            return {"status": "completed"}

        # Schedule next step
        next_step = steps[progress.current_step]
        delay = next_step.get("delay", flow.delay_between_steps)
        progress.next_step_scheduled = now + timedelta(seconds=delay)
        db.commit()

        # Queue next step (Temporal handles scheduling with delays)
        process_onboarding_step(progress_id)

        return {"status": "success", "step_completed": step_id, "next_step": progress.current_step}


def complete_onboarding_step(
    progress_id: str | None = None,
    flow_id: str | None = None,
    user_id: str | None = None,
    step_id: str | None = None,
) -> dict:
    """
    Complete a specific onboarding step.

    Args:
        progress_id: Progress ID (or use flow_id + user_id)
        flow_id: Flow ID
        user_id: User ID
        step_id: Optional specific step ID

    Returns:
        Dict with result
    """
    with get_sync_session() as db:
        from aexy.models.email_marketing import OnboardingProgress

        if progress_id:
            progress = db.execute(
                select(OnboardingProgress)
                .where(OnboardingProgress.id == progress_id)
            ).scalar_one_or_none()
        elif flow_id and user_id:
            progress = db.execute(
                select(OnboardingProgress)
                .where(OnboardingProgress.flow_id == flow_id)
                .where(OnboardingProgress.user_id == user_id)
            ).scalar_one_or_none()
        else:
            return {"status": "error", "message": "Must specify progress_id or (flow_id + user_id)"}

        if not progress:
            return {"status": "error", "message": "Progress not found"}

        # Trigger step processing
        process_onboarding_step(progress.id)

        return {"status": "success", "progress_id": progress.id}


def check_due_onboarding_steps() -> dict:
    """
    Check for and process any due onboarding steps.

    This task runs periodically to catch any steps that weren't processed.
    """
    logger.info("Checking for due onboarding steps")

    with get_sync_session() as db:
        from aexy.models.email_marketing import OnboardingProgress, OnboardingFlow, OnboardingStatus

        now = datetime.now(timezone.utc)

        due_progress = list(db.execute(
            select(OnboardingProgress)
            .join(OnboardingFlow)
            .where(OnboardingProgress.status == OnboardingStatus.IN_PROGRESS.value)
            .where(OnboardingProgress.next_step_scheduled <= now)
            .where(OnboardingFlow.is_active == True)
            .limit(100)
        ).scalars().all())

        queued = 0
        for progress in due_progress:
            process_onboarding_step(progress.id)
            queued += 1

        logger.info(f"Queued {queued} due onboarding steps")
        return {"queued": queued}


# =============================================================================
# VISUAL BUILDER TASKS
# =============================================================================

def seed_default_blocks() -> dict:
    """
    Seed default system blocks for the visual email builder.

    This task creates the default block templates if they don't exist.
    """
    logger.info("Seeding default visual builder blocks")

    with get_sync_session() as db:
        from aexy.models.email_marketing import VisualTemplateBlock
        from aexy.services.visual_builder_service import DEFAULT_BLOCKS

        created = 0
        for block_data in DEFAULT_BLOCKS:
            # Check if exists
            existing = db.execute(
                select(VisualTemplateBlock)
                .where(VisualTemplateBlock.workspace_id.is_(None))
                .where(VisualTemplateBlock.slug == block_data["slug"])
            ).scalar_one_or_none()

            if existing:
                continue

            # Get default HTML template
            service_instance = None
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
            db.add(block)
            created += 1

        db.commit()
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
        "hero": '''<table width="100%" cellpadding="0" cellspacing="0" style="background-color: {{backgroundColor|default('#f8f9fa')}};">
    <tr><td style="padding: {{padding|default('60px 20px')}}; text-align: center;">
        {% if image %}<img src="{{image}}" alt="" style="max-width: 100%; margin-bottom: 20px;">{% endif %}
        <h1 style="color: {{titleColor|default('#333')}}; margin: 0 0 15px 0;">{{title}}</h1>
        {% if subtitle %}<p style="color: {{subtitleColor|default('#666')}}; font-size: 18px; margin: 0 0 25px 0;">{{subtitle}}</p>{% endif %}
        {% if buttonText %}<a href="{{buttonHref|default('#')}}" style="display: inline-block; padding: 14px 32px; background-color: {{buttonColor|default('#007bff')}}; color: #fff; text-decoration: none; border-radius: 4px;">{{buttonText}}</a>{% endif %}
    </td></tr>
</table>''',
        "footer": '''<table width="100%" cellpadding="0" cellspacing="0" style="background-color: {{backgroundColor|default('#f8f9fa')}};">
    <tr><td style="padding: {{padding|default('30px 20px')}}; text-align: center;">
        <p style="color: {{textColor|default('#999')}}; font-size: 12px; margin: 0;">{{text}}</p>
        {% if unsubscribeUrl %}<p style="margin: 10px 0 0 0;"><a href="{{unsubscribeUrl}}" style="color: {{linkColor|default('#999')}}; font-size: 12px;">Unsubscribe</a></p>{% endif %}
    </td></tr>
</table>''',
        "social": '''<div style="text-align: {{align|default('center')}};">
    {% for link in links %}
    <a href="{{link.url}}" style="display: inline-block; margin: 0 8px;">
        <img src="{{link.icon}}" alt="{{link.name}}" width="24" height="24">
    </a>
    {% endfor %}
</div>''',
        "variable": '{{{{value}}}}',
        "conditional": '{% if {{condition}} %}{{children}}{% endif %}',
        "loop": '{% for item in {{items}} %}{{children}}{% endfor %}',
    }
    return defaults.get(block_type, '<div>{{children}}</div>')
