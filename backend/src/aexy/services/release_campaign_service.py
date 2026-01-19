"""Service for managing release announcement campaigns."""

import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.email_marketing import (
    EmailCampaign,
    EmailTemplate,
    CampaignStatus,
    CampaignRecipient,
    RecipientStatus,
    EmailSubscriber,
    SubscriberStatus,
    SubscriptionCategory,
    SubscriptionPreference,
)
from aexy.models.crm import CRMAutomationTriggerType

logger = logging.getLogger(__name__)


class ReleaseCampaignService:
    """Service for creating and managing release announcement campaigns."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_release_campaign(
        self,
        workspace_id: str,
        release_name: str,
        release_version: str,
        release_notes: str,
        template_id: str | None = None,
        from_name: str = "Product Team",
        from_email: str | None = None,
        target_tags: list[str] | None = None,
        target_segments: list[str] | None = None,
        schedule_at: datetime | None = None,
        created_by_id: str | None = None,
    ) -> EmailCampaign:
        """
        Create a release announcement campaign.

        Args:
            workspace_id: Workspace ID
            release_name: Name of the release
            release_version: Version string (e.g., "2.0.0")
            release_notes: HTML release notes content
            template_id: Optional template ID (uses default if not provided)
            from_name: Sender name
            from_email: Sender email
            target_tags: Optional list of subscriber tags to target
            target_segments: Optional list of segment IDs to target
            schedule_at: Optional schedule time
            created_by_id: Creator user ID

        Returns:
            Created campaign
        """
        # Get or create release template
        if template_id:
            result = await self.db.execute(
                select(EmailTemplate)
                .where(EmailTemplate.id == template_id)
                .where(EmailTemplate.workspace_id == workspace_id)
            )
            template = result.scalar_one_or_none()
            if not template:
                raise ValueError(f"Template {template_id} not found")
        else:
            # Use default release template or create one
            template = await self._get_or_create_release_template(workspace_id)

        # Build audience filters
        audience_filters = []

        if target_tags:
            audience_filters.append({
                "attribute": "tags",
                "operator": "contains_any",
                "value": target_tags,
            })

        if target_segments:
            audience_filters.append({
                "attribute": "segment_id",
                "operator": "in",
                "value": target_segments,
            })

        # Create campaign
        campaign = EmailCampaign(
            id=str(uuid4()),
            workspace_id=workspace_id,
            template_id=template.id,
            name=f"Release Announcement: {release_name} v{release_version}",
            description=f"Announcing {release_name} version {release_version}",
            campaign_type="one_time",
            status=CampaignStatus.DRAFT.value,
            from_name=from_name,
            from_email=from_email or f"releases@{workspace_id[:8]}.example.com",
            template_context={
                "release_name": release_name,
                "release_version": release_version,
                "release_notes": release_notes,
            },
            audience_filters=audience_filters,
            scheduled_at=schedule_at,
            created_by_id=created_by_id,
        )
        self.db.add(campaign)
        await self.db.commit()
        await self.db.refresh(campaign)

        logger.info(f"Created release campaign: {campaign.id} for {release_name} v{release_version}")

        return campaign

    async def create_from_release(
        self,
        workspace_id: str,
        release_id: str,
        template_id: str | None = None,
        from_name: str = "Product Team",
        from_email: str | None = None,
        schedule_at: datetime | None = None,
        created_by_id: str | None = None,
    ) -> EmailCampaign:
        """
        Create a release campaign from an existing release record.

        Args:
            workspace_id: Workspace ID
            release_id: Release ID from releases table
            template_id: Optional template ID
            from_name: Sender name
            from_email: Sender email
            schedule_at: Optional schedule time
            created_by_id: Creator user ID

        Returns:
            Created campaign
        """
        # Get release record
        from aexy.models.sprint_planning import Release

        result = await self.db.execute(
            select(Release)
            .where(Release.id == release_id)
            .where(Release.workspace_id == workspace_id)
        )
        release = result.scalar_one_or_none()

        if not release:
            raise ValueError(f"Release {release_id} not found")

        # Build release notes from release data
        release_notes = self._format_release_notes(release)

        # Target subscribers with "releases" or "product_updates" category
        target_tags = ["releases", "product_updates", "announcements"]

        return await self.create_release_campaign(
            workspace_id=workspace_id,
            release_name=release.name,
            release_version=release.version or "1.0",
            release_notes=release_notes,
            template_id=template_id,
            from_name=from_name,
            from_email=from_email,
            target_tags=target_tags,
            schedule_at=schedule_at,
            created_by_id=created_by_id,
        )

    async def trigger_release_event(
        self,
        workspace_id: str,
        release_id: str,
        release_name: str,
        release_version: str,
        context: dict | None = None,
    ) -> dict:
        """
        Trigger a release.published event for workflow automations.

        Args:
            workspace_id: Workspace ID
            release_id: Release ID
            release_name: Release name
            release_version: Release version
            context: Additional context

        Returns:
            Dict with triggered workflows
        """
        event_data = {
            "release_id": release_id,
            "release_name": release_name,
            "release_version": release_version,
            **(context or {}),
        }

        # Trigger workflows
        try:
            from aexy.services.workflow_service import WorkflowService
            workflow_service = WorkflowService(self.db)

            triggered = await workflow_service.trigger_by_event(
                workspace_id=workspace_id,
                event_type=CRMAutomationTriggerType.RELEASE_PUBLISHED.value,
                event_data=event_data,
            )

            logger.info(f"Triggered {len(triggered)} workflows for release {release_name}")

            return {
                "event": "release.published",
                "workflows_triggered": len(triggered),
            }
        except Exception as e:
            logger.error(f"Failed to trigger release event: {e}")
            return {
                "event": "release.published",
                "workflows_triggered": 0,
                "error": str(e),
            }

    async def get_subscribed_recipients(
        self,
        workspace_id: str,
        category_slug: str = "releases",
    ) -> list[dict]:
        """
        Get all subscribers who are subscribed to release announcements.

        Args:
            workspace_id: Workspace ID
            category_slug: Category slug to check (default: "releases")

        Returns:
            List of subscriber dicts with email and metadata
        """
        # Get category
        result = await self.db.execute(
            select(SubscriptionCategory)
            .where(SubscriptionCategory.workspace_id == workspace_id)
            .where(SubscriptionCategory.slug == category_slug)
            .where(SubscriptionCategory.is_active == True)
        )
        category = result.scalar_one_or_none()

        if not category:
            # If no release category, get all active subscribers
            result = await self.db.execute(
                select(EmailSubscriber)
                .where(EmailSubscriber.workspace_id == workspace_id)
                .where(EmailSubscriber.status == SubscriberStatus.ACTIVE.value)
            )
            subscribers = result.scalars().all()
            return [
                {"email": s.email, "subscriber_id": s.id, "record_id": s.record_id}
                for s in subscribers
            ]

        # Get subscribers with this category preference
        result = await self.db.execute(
            select(EmailSubscriber)
            .join(SubscriptionPreference)
            .where(EmailSubscriber.workspace_id == workspace_id)
            .where(EmailSubscriber.status == SubscriberStatus.ACTIVE.value)
            .where(SubscriptionPreference.category_id == category.id)
            .where(SubscriptionPreference.is_subscribed == True)
        )
        subscribers = result.scalars().all()

        return [
            {"email": s.email, "subscriber_id": s.id, "record_id": s.record_id}
            for s in subscribers
        ]

    async def populate_campaign_recipients(
        self,
        campaign_id: str,
        workspace_id: str,
    ) -> int:
        """
        Populate campaign recipients from subscribed users.

        Args:
            campaign_id: Campaign ID
            workspace_id: Workspace ID

        Returns:
            Number of recipients added
        """
        # Get campaign
        result = await self.db.execute(
            select(EmailCampaign)
            .where(EmailCampaign.id == campaign_id)
            .where(EmailCampaign.workspace_id == workspace_id)
        )
        campaign = result.scalar_one_or_none()

        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Get subscribed recipients
        recipients = await self.get_subscribed_recipients(workspace_id, "releases")

        # Add recipients to campaign
        added = 0
        for r in recipients:
            # Check if already exists
            existing = await self.db.execute(
                select(CampaignRecipient)
                .where(CampaignRecipient.campaign_id == campaign_id)
                .where(CampaignRecipient.email == r["email"])
            )
            if existing.scalar_one_or_none():
                continue

            recipient = CampaignRecipient(
                id=str(uuid4()),
                campaign_id=campaign_id,
                record_id=r.get("record_id"),
                subscriber_id=r.get("subscriber_id"),
                email=r["email"],
                status=RecipientStatus.PENDING.value,
            )
            self.db.add(recipient)
            added += 1

        campaign.total_recipients = added
        await self.db.commit()

        logger.info(f"Added {added} recipients to release campaign {campaign_id}")

        return added

    # =========================================================================
    # HELPERS
    # =========================================================================

    async def _get_or_create_release_template(
        self,
        workspace_id: str,
    ) -> EmailTemplate:
        """Get or create default release announcement template."""
        # Check for existing
        result = await self.db.execute(
            select(EmailTemplate)
            .where(EmailTemplate.workspace_id == workspace_id)
            .where(EmailTemplate.slug == "release-announcement")
            .where(EmailTemplate.is_active == True)
        )
        template = result.scalar_one_or_none()

        if template:
            return template

        # Create default template
        template = EmailTemplate(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name="Release Announcement",
            slug="release-announcement",
            description="Default template for release announcements",
            template_type="code",
            category="release",
            subject_template="🎉 {{release_name}} v{{release_version}} is here!",
            body_html=DEFAULT_RELEASE_TEMPLATE_HTML,
            body_text=DEFAULT_RELEASE_TEMPLATE_TEXT,
            preview_text="Check out what's new in {{release_name}} v{{release_version}}",
            variables=[
                {"name": "release_name", "type": "string", "required": True},
                {"name": "release_version", "type": "string", "required": True},
                {"name": "release_notes", "type": "string", "required": True},
                {"name": "unsubscribe_url", "type": "url", "required": False},
            ],
            is_active=True,
        )
        self.db.add(template)
        await self.db.commit()
        await self.db.refresh(template)

        return template

    def _format_release_notes(self, release) -> str:
        """Format release notes from a release record."""
        notes = f"<h2>{release.name}</h2>"

        if release.description:
            notes += f"<p>{release.description}</p>"

        if release.release_notes:
            notes += f"<div>{release.release_notes}</div>"

        # Add changelog if available
        if hasattr(release, "changelog") and release.changelog:
            notes += "<h3>Changelog</h3><ul>"
            for item in release.changelog:
                notes += f"<li>{item}</li>"
            notes += "</ul>"

        return notes


# =========================================================================
# DEFAULT TEMPLATES
# =========================================================================

DEFAULT_RELEASE_TEMPLATE_HTML = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{release_name}} v{{release_version}}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 20px;
            text-align: center;
            border-radius: 8px 8px 0 0;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
        }
        .version {
            display: inline-block;
            background: rgba(255,255,255,0.2);
            padding: 5px 15px;
            border-radius: 20px;
            margin-top: 10px;
            font-size: 14px;
        }
        .content {
            background: white;
            padding: 30px;
            border-radius: 0 0 8px 8px;
        }
        .release-notes {
            margin: 20px 0;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 6px;
        }
        .cta-button {
            display: inline-block;
            background: #667eea;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
        }
        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 12px;
        }
        .footer a {
            color: #666;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 {{release_name}}</h1>
            <span class="version">Version {{release_version}}</span>
        </div>
        <div class="content">
            <p>We're excited to announce the release of <strong>{{release_name}} v{{release_version}}</strong>!</p>

            <div class="release-notes">
                {{release_notes}}
            </div>

            <p>
                <a href="#" class="cta-button">Learn More</a>
            </p>

            <p>Thank you for being part of our journey!</p>

            <p>— The Product Team</p>
        </div>
        <div class="footer">
            <p>You received this email because you're subscribed to release announcements.</p>
            {% if unsubscribe_url %}
            <p><a href="{{unsubscribe_url}}">Manage preferences</a> | <a href="{{unsubscribe_url}}/unsubscribe">Unsubscribe</a></p>
            {% endif %}
        </div>
    </div>
</body>
</html>
"""

DEFAULT_RELEASE_TEMPLATE_TEXT = """
🎉 {{release_name}} v{{release_version}} is here!

We're excited to announce the release of {{release_name}} v{{release_version}}!

What's New:
{{release_notes}}

Thank you for being part of our journey!

— The Product Team

---
You received this email because you're subscribed to release announcements.
{% if unsubscribe_url %}To manage your preferences, visit: {{unsubscribe_url}}{% endif %}
"""
