"""Tracking service for email opens, link clicks, and image views."""

import logging
import re
import hashlib
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode, urlparse, parse_qs, urlunparse
from uuid import uuid4

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from aexy.core.config import get_settings
from aexy.models.email_marketing import (
    EmailTrackingPixel,
    TrackedLink,
    LinkClick,
    HostedImage,
    CampaignRecipient,
    EmailCampaign,
    RecipientStatus,
)

logger = logging.getLogger(__name__)

# User-Agent patterns for device/client detection
EMAIL_CLIENT_PATTERNS = {
    "gmail": [
        r"GoogleImageProxy",
        r"Gmail",
    ],
    "outlook": [
        r"Microsoft Outlook",
        r"Outlook-iOS",
        r"Outlook-Android",
    ],
    "apple_mail": [
        r"AppleMail",
        r"Apple Mail",
        r"iPhone Mail",
        r"iPad Mail",
    ],
    "yahoo": [
        r"YahooMailProxy",
        r"Yahoo",
    ],
    "thunderbird": [
        r"Thunderbird",
    ],
    "samsung_mail": [
        r"Samsung Mail",
    ],
}

DEVICE_PATTERNS = {
    "mobile": [
        r"iPhone",
        r"Android.*Mobile",
        r"Mobile Safari",
        r"Windows Phone",
    ],
    "tablet": [
        r"iPad",
        r"Android(?!.*Mobile)",
        r"Tablet",
    ],
    "desktop": [
        r"Windows NT",
        r"Macintosh",
        r"Linux(?!.*Android)",
        r"X11",
    ],
}


class TrackingService:
    """Service for email tracking (opens, clicks, images)."""

    def __init__(self, db: AsyncSession | Session):
        self.db = db
        self.settings = get_settings()

    # -------------------------------------------------------------------------
    # TRACKING PIXEL (Open Tracking)
    # -------------------------------------------------------------------------

    async def create_tracking_pixel(
        self,
        workspace_id: str,
        campaign_id: str | None = None,
        recipient_id: str | None = None,
        record_id: str | None = None,
    ) -> EmailTrackingPixel:
        """
        Create a tracking pixel for an email.

        Args:
            workspace_id: Workspace ID
            campaign_id: Optional campaign ID
            recipient_id: Optional recipient ID
            record_id: Optional CRM record ID

        Returns:
            Created tracking pixel
        """
        pixel = EmailTrackingPixel(
            id=str(uuid4()),
            workspace_id=workspace_id,
            campaign_id=campaign_id,
            recipient_id=recipient_id,
            record_id=record_id,
            opened=False,
            open_count=0,
        )

        self.db.add(pixel)
        await self.db.commit()
        await self.db.refresh(pixel)

        return pixel

    async def record_open(
        self,
        pixel_id: str,
        user_agent: str | None = None,
        ip_address: str | None = None,
    ) -> EmailTrackingPixel | None:
        """
        Record an email open event.

        Args:
            pixel_id: Tracking pixel ID
            user_agent: Request User-Agent header
            ip_address: Client IP address

        Returns:
            Updated pixel or None if not found
        """
        result = await self.db.execute(
            select(EmailTrackingPixel).where(EmailTrackingPixel.id == pixel_id)
        )
        pixel = result.scalar_one_or_none()

        if not pixel:
            return None

        now = datetime.now(timezone.utc)
        pixel.open_count += 1
        pixel.last_opened_at = now

        # First open - record metadata
        if not pixel.opened:
            pixel.opened = True
            pixel.first_opened_at = now
            pixel.user_agent = user_agent
            pixel.ip_address = ip_address

            # Parse device and client
            if user_agent:
                pixel.device_type = self._detect_device(user_agent)
                pixel.email_client = self._detect_email_client(user_agent)

            # Update recipient status if linked
            if pixel.recipient_id:
                await self._update_recipient_opened(pixel.recipient_id, now)

            # Update campaign stats
            if pixel.campaign_id:
                await self._increment_campaign_opens(pixel.campaign_id, is_first=True)
        else:
            # Subsequent opens
            if pixel.campaign_id:
                await self._increment_campaign_opens(pixel.campaign_id, is_first=False)

        await self.db.commit()
        return pixel

    def get_pixel_url(self, pixel_id: str) -> str:
        """Generate the tracking pixel URL."""
        base_url = self.settings.get_tracking_base_url()
        return f"{base_url}/api/v1/t/p/{pixel_id}.gif"

    def get_pixel_html(self, pixel_id: str) -> str:
        """Generate the tracking pixel HTML to inject into emails."""
        url = self.get_pixel_url(pixel_id)
        return f'<img src="{url}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />'

    # -------------------------------------------------------------------------
    # LINK TRACKING (Click Tracking)
    # -------------------------------------------------------------------------

    async def create_tracked_link(
        self,
        workspace_id: str,
        original_url: str,
        campaign_id: str | None = None,
        template_id: str | None = None,
        link_name: str | None = None,
    ) -> TrackedLink:
        """
        Create a tracked link.

        Args:
            workspace_id: Workspace ID
            original_url: Original destination URL
            campaign_id: Optional campaign ID
            template_id: Optional template ID
            link_name: Optional friendly name for the link

        Returns:
            Created tracked link
        """
        # Check if link already exists for this campaign/url
        if campaign_id:
            existing = await self.db.execute(
                select(TrackedLink).where(
                    and_(
                        TrackedLink.campaign_id == campaign_id,
                        TrackedLink.original_url == original_url,
                    )
                )
            )
            existing_link = existing.scalar_one_or_none()
            if existing_link:
                return existing_link

        link = TrackedLink(
            id=str(uuid4()),
            workspace_id=workspace_id,
            original_url=original_url,
            campaign_id=campaign_id,
            template_id=template_id,
            link_name=link_name,
            click_count=0,
            unique_click_count=0,
        )

        self.db.add(link)
        await self.db.commit()
        await self.db.refresh(link)

        return link

    async def record_click(
        self,
        link_id: str,
        recipient_id: str | None = None,
        record_id: str | None = None,
        user_agent: str | None = None,
        ip_address: str | None = None,
        referer: str | None = None,
    ) -> tuple[TrackedLink | None, str | None]:
        """
        Record a link click event.

        Args:
            link_id: Tracked link ID
            recipient_id: Optional recipient ID (for unique click tracking)
            record_id: Optional CRM record ID
            user_agent: Request User-Agent header
            ip_address: Client IP address
            referer: HTTP referer header

        Returns:
            Tuple of (tracked link, original URL to redirect to)
        """
        result = await self.db.execute(
            select(TrackedLink).where(TrackedLink.id == link_id)
        )
        link = result.scalar_one_or_none()

        if not link:
            return None, None

        # Check if this is a unique click
        is_unique = True
        if recipient_id:
            existing_click = await self.db.execute(
                select(LinkClick).where(
                    and_(
                        LinkClick.link_id == link_id,
                        LinkClick.recipient_id == recipient_id,
                    )
                )
            )
            is_unique = existing_click.scalar_one_or_none() is None

        # Create click record
        click = LinkClick(
            id=str(uuid4()),
            link_id=link_id,
            recipient_id=recipient_id,
            record_id=record_id,
            user_agent=user_agent,
            ip_address=ip_address,
            device_type=self._detect_device(user_agent) if user_agent else None,
            referer=referer,
        )
        self.db.add(click)

        # Update link stats
        link.click_count += 1
        if is_unique:
            link.unique_click_count += 1

        # Update recipient status if linked and unique
        if recipient_id and is_unique:
            await self._update_recipient_clicked(recipient_id)

        # Update campaign stats
        if link.campaign_id:
            await self._increment_campaign_clicks(link.campaign_id, is_unique)

        await self.db.commit()

        return link, link.original_url

    def get_tracked_link_url(
        self,
        link_id: str,
        recipient_id: str | None = None,
    ) -> str:
        """Generate the tracked link URL."""
        base_url = self.settings.get_tracking_base_url()
        url = f"{base_url}/api/v1/t/c/{link_id}"

        if recipient_id:
            url += f"?r={recipient_id}"

        return url

    # -------------------------------------------------------------------------
    # EMAIL BODY PROCESSING
    # -------------------------------------------------------------------------

    async def process_email_body(
        self,
        html_body: str,
        workspace_id: str,
        campaign_id: str | None = None,
        recipient_id: str | None = None,
        record_id: str | None = None,
        inject_pixel: bool = True,
        track_links: bool = True,
    ) -> tuple[str, str | None]:
        """
        Process email body to inject tracking pixel and rewrite links.

        Args:
            html_body: Original HTML body
            workspace_id: Workspace ID
            campaign_id: Optional campaign ID
            recipient_id: Optional recipient ID
            record_id: Optional CRM record ID
            inject_pixel: Whether to inject tracking pixel
            track_links: Whether to track links

        Returns:
            Tuple of (processed HTML, pixel_id if created)
        """
        if not self.settings.email_tracking_enabled:
            return html_body, None

        processed_html = html_body
        pixel_id = None

        # Inject tracking pixel
        if inject_pixel:
            pixel = await self.create_tracking_pixel(
                workspace_id=workspace_id,
                campaign_id=campaign_id,
                recipient_id=recipient_id,
                record_id=record_id,
            )
            pixel_id = pixel.id
            pixel_html = self.get_pixel_html(pixel_id)

            # Insert before </body> if exists, otherwise append
            if "</body>" in processed_html.lower():
                # Case-insensitive replacement
                import re
                processed_html = re.sub(
                    r"(</body>)",
                    f"{pixel_html}\\1",
                    processed_html,
                    flags=re.IGNORECASE,
                    count=1,
                )
            else:
                processed_html += pixel_html

        # Track links
        if track_links:
            processed_html = await self._rewrite_links(
                processed_html,
                workspace_id,
                campaign_id,
                recipient_id,
            )

        return processed_html, pixel_id

    async def _rewrite_links(
        self,
        html_body: str,
        workspace_id: str,
        campaign_id: str | None,
        recipient_id: str | None,
    ) -> str:
        """Rewrite all links in HTML to tracked versions."""
        # Match href attributes in anchor tags
        link_pattern = re.compile(
            r'<a\s+([^>]*?)href=["\']([^"\']+)["\']([^>]*?)>',
            re.IGNORECASE | re.DOTALL,
        )

        # Track which URLs we've already processed (for deduplication)
        url_to_link_id: dict[str, str] = {}

        async def replace_link(match: re.Match) -> str:
            prefix = match.group(1)
            original_url = match.group(2)
            suffix = match.group(3)

            # Skip certain URLs
            if self._should_skip_url(original_url):
                return match.group(0)

            # Get or create tracked link
            if original_url in url_to_link_id:
                link_id = url_to_link_id[original_url]
            else:
                link = await self.create_tracked_link(
                    workspace_id=workspace_id,
                    original_url=original_url,
                    campaign_id=campaign_id,
                )
                link_id = link.id
                url_to_link_id[original_url] = link_id

            # Generate tracked URL
            tracked_url = self.get_tracked_link_url(link_id, recipient_id)

            return f'<a {prefix}href="{tracked_url}"{suffix}>'

        # Process all links
        # Since we need async, we'll do this in a different way
        matches = list(link_pattern.finditer(html_body))
        replacements = []

        for match in matches:
            original_url = match.group(2)

            if self._should_skip_url(original_url):
                continue

            # Get or create tracked link
            if original_url in url_to_link_id:
                link_id = url_to_link_id[original_url]
            else:
                link = await self.create_tracked_link(
                    workspace_id=workspace_id,
                    original_url=original_url,
                    campaign_id=campaign_id,
                )
                link_id = link.id
                url_to_link_id[original_url] = link_id

            tracked_url = self.get_tracked_link_url(link_id, recipient_id)

            replacements.append((
                match.start(),
                match.end(),
                f'<a {match.group(1)}href="{tracked_url}"{match.group(3)}>',
            ))

        # Apply replacements in reverse order to preserve positions
        result = html_body
        for start, end, replacement in reversed(replacements):
            result = result[:start] + replacement + result[end:]

        return result

    def _should_skip_url(self, url: str) -> bool:
        """Check if a URL should be skipped from tracking."""
        # Skip mailto: links
        if url.startswith("mailto:"):
            return True

        # Skip tel: links
        if url.startswith("tel:"):
            return True

        # Skip javascript: links
        if url.startswith("javascript:"):
            return True

        # Skip anchor links
        if url.startswith("#"):
            return True

        # Skip unsubscribe links (preserve them)
        if "unsubscribe" in url.lower():
            return True

        # Skip preference center links
        if "preferences" in url.lower():
            return True

        return False

    # -------------------------------------------------------------------------
    # HOSTED IMAGES
    # -------------------------------------------------------------------------

    async def record_image_view(
        self,
        image_id: str,
    ) -> HostedImage | None:
        """Record an image view."""
        result = await self.db.execute(
            select(HostedImage).where(HostedImage.id == image_id)
        )
        image = result.scalar_one_or_none()

        if image:
            image.view_count += 1
            await self.db.commit()

        return image

    async def get_image(self, image_id: str) -> HostedImage | None:
        """Get a hosted image by ID."""
        result = await self.db.execute(
            select(HostedImage).where(HostedImage.id == image_id)
        )
        return result.scalar_one_or_none()

    # -------------------------------------------------------------------------
    # DEVICE/CLIENT DETECTION
    # -------------------------------------------------------------------------

    def _detect_device(self, user_agent: str) -> str:
        """Detect device type from User-Agent."""
        if not user_agent:
            return "unknown"

        for device_type, patterns in DEVICE_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, user_agent, re.IGNORECASE):
                    return device_type

        return "unknown"

    def _detect_email_client(self, user_agent: str) -> str:
        """Detect email client from User-Agent."""
        if not user_agent:
            return "unknown"

        for client, patterns in EMAIL_CLIENT_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, user_agent, re.IGNORECASE):
                    return client

        # Try to extract from generic browser info
        if "Chrome" in user_agent:
            return "web_chrome"
        if "Safari" in user_agent:
            return "web_safari"
        if "Firefox" in user_agent:
            return "web_firefox"

        return "unknown"

    # -------------------------------------------------------------------------
    # HELPER METHODS
    # -------------------------------------------------------------------------

    async def _update_recipient_opened(
        self,
        recipient_id: str,
        opened_at: datetime,
    ) -> None:
        """Update recipient record when email is opened."""
        result = await self.db.execute(
            select(CampaignRecipient).where(CampaignRecipient.id == recipient_id)
        )
        recipient = result.scalar_one_or_none()

        if recipient:
            recipient.open_count += 1
            if not recipient.first_opened_at:
                recipient.first_opened_at = opened_at
                # Update status if not already clicked
                if recipient.status != RecipientStatus.CLICKED.value:
                    recipient.status = RecipientStatus.OPENED.value

    async def _update_recipient_clicked(
        self,
        recipient_id: str,
    ) -> None:
        """Update recipient record when link is clicked."""
        result = await self.db.execute(
            select(CampaignRecipient).where(CampaignRecipient.id == recipient_id)
        )
        recipient = result.scalar_one_or_none()

        if recipient:
            recipient.click_count += 1
            now = datetime.now(timezone.utc)
            if not recipient.first_clicked_at:
                recipient.first_clicked_at = now
                recipient.status = RecipientStatus.CLICKED.value

    async def _increment_campaign_opens(
        self,
        campaign_id: str,
        is_first: bool,
    ) -> None:
        """Increment campaign open counts."""
        result = await self.db.execute(
            select(EmailCampaign).where(EmailCampaign.id == campaign_id)
        )
        campaign = result.scalar_one_or_none()

        if campaign:
            campaign.open_count += 1
            if is_first:
                campaign.unique_open_count += 1

    async def _increment_campaign_clicks(
        self,
        campaign_id: str,
        is_unique: bool,
    ) -> None:
        """Increment campaign click counts."""
        result = await self.db.execute(
            select(EmailCampaign).where(EmailCampaign.id == campaign_id)
        )
        campaign = result.scalar_one_or_none()

        if campaign:
            campaign.click_count += 1
            if is_unique:
                campaign.unique_click_count += 1

    # -------------------------------------------------------------------------
    # ANALYTICS HELPERS
    # -------------------------------------------------------------------------

    async def get_campaign_link_stats(
        self,
        campaign_id: str,
    ) -> list[dict]:
        """Get click statistics for all links in a campaign."""
        result = await self.db.execute(
            select(TrackedLink)
            .where(TrackedLink.campaign_id == campaign_id)
            .order_by(TrackedLink.click_count.desc())
        )
        links = result.scalars().all()

        return [
            {
                "id": link.id,
                "original_url": link.original_url,
                "link_name": link.link_name,
                "click_count": link.click_count,
                "unique_click_count": link.unique_click_count,
            }
            for link in links
        ]

    async def get_campaign_device_breakdown(
        self,
        campaign_id: str,
    ) -> dict:
        """Get device breakdown for campaign opens."""
        result = await self.db.execute(
            select(EmailTrackingPixel)
            .where(
                and_(
                    EmailTrackingPixel.campaign_id == campaign_id,
                    EmailTrackingPixel.opened == True,
                )
            )
        )
        pixels = result.scalars().all()

        device_counts = {"desktop": 0, "mobile": 0, "tablet": 0, "unknown": 0}
        client_counts: dict[str, int] = {}

        for pixel in pixels:
            device = pixel.device_type or "unknown"
            device_counts[device] = device_counts.get(device, 0) + 1

            client = pixel.email_client or "unknown"
            client_counts[client] = client_counts.get(client, 0) + 1

        return {
            "devices": device_counts,
            "clients": client_counts,
            "total_opens": len(pixels),
        }

    # -------------------------------------------------------------------------
    # SYNC METHODS (for Temporal activities)
    # -------------------------------------------------------------------------

    def process_email_body_sync(
        self,
        html_body: str,
        workspace_id: str,
        campaign_id: str | None = None,
        recipient_id: str | None = None,
        record_id: str | None = None,
        inject_pixel: bool = True,
        track_links: bool = True,
    ) -> tuple[str, str | None]:
        """
        Sync version of process_email_body for Temporal activities.

        Returns:
            Tuple of (processed HTML, pixel_id if created)
        """
        if not self.settings.email_tracking_enabled:
            return html_body, None

        processed_html = html_body
        pixel_id = None

        # Inject tracking pixel
        if inject_pixel:
            pixel = EmailTrackingPixel(
                id=str(uuid4()),
                workspace_id=workspace_id,
                campaign_id=campaign_id,
                recipient_id=recipient_id,
                record_id=record_id,
                opened=False,
                open_count=0,
            )
            self.db.add(pixel)
            self.db.commit()

            pixel_id = pixel.id
            pixel_html = self.get_pixel_html(pixel_id)

            # Insert before </body> if exists, otherwise append
            if "</body>" in processed_html.lower():
                processed_html = re.sub(
                    r"(</body>)",
                    f"{pixel_html}\\1",
                    processed_html,
                    flags=re.IGNORECASE,
                    count=1,
                )
            else:
                processed_html += pixel_html

        # Track links
        if track_links:
            processed_html = self._rewrite_links_sync(
                processed_html,
                workspace_id,
                campaign_id,
                recipient_id,
            )

        return processed_html, pixel_id

    def _rewrite_links_sync(
        self,
        html_body: str,
        workspace_id: str,
        campaign_id: str | None,
        recipient_id: str | None,
    ) -> str:
        """Sync version of link rewriting."""
        link_pattern = re.compile(
            r'<a\s+([^>]*?)href=["\']([^"\']+)["\']([^>]*?)>',
            re.IGNORECASE | re.DOTALL,
        )

        url_to_link_id: dict[str, str] = {}
        matches = list(link_pattern.finditer(html_body))
        replacements = []

        for match in matches:
            original_url = match.group(2)

            if self._should_skip_url(original_url):
                continue

            # Get or create tracked link
            if original_url in url_to_link_id:
                link_id = url_to_link_id[original_url]
            else:
                # Check for existing link
                if campaign_id:
                    existing = self.db.execute(
                        select(TrackedLink).where(
                            and_(
                                TrackedLink.campaign_id == campaign_id,
                                TrackedLink.original_url == original_url,
                            )
                        )
                    )
                    existing_link = existing.scalar_one_or_none()
                    if existing_link:
                        link_id = existing_link.id
                        url_to_link_id[original_url] = link_id
                    else:
                        link = TrackedLink(
                            id=str(uuid4()),
                            workspace_id=workspace_id,
                            original_url=original_url,
                            campaign_id=campaign_id,
                            click_count=0,
                            unique_click_count=0,
                        )
                        self.db.add(link)
                        self.db.commit()
                        link_id = link.id
                        url_to_link_id[original_url] = link_id
                else:
                    link = TrackedLink(
                        id=str(uuid4()),
                        workspace_id=workspace_id,
                        original_url=original_url,
                        campaign_id=campaign_id,
                        click_count=0,
                        unique_click_count=0,
                    )
                    self.db.add(link)
                    self.db.commit()
                    link_id = link.id
                    url_to_link_id[original_url] = link_id

            tracked_url = self.get_tracked_link_url(link_id, recipient_id)

            replacements.append((
                match.start(),
                match.end(),
                f'<a {match.group(1)}href="{tracked_url}"{match.group(3)}>',
            ))

        # Apply replacements in reverse order
        result = html_body
        for start, end, replacement in reversed(replacements):
            result = result[:start] + replacement + result[end:]

        return result
