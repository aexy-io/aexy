"""Service for managing email subscription preferences."""

import hashlib
import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select, and_, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.email_marketing import (
    SubscriptionCategory,
    EmailSubscriber,
    SubscriptionPreference,
    UnsubscribeEvent,
    SubscriberStatus,
    UnsubscribeSource,
)
from aexy.schemas.email_marketing import (
    SubscriptionCategoryCreate,
    SubscriptionCategoryUpdate,
    SubscriptionPreferenceUpdate,
)

logger = logging.getLogger(__name__)


class PreferenceService:
    """Service for managing email subscription preferences."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # CATEGORY MANAGEMENT
    # =========================================================================

    async def create_category(
        self,
        workspace_id: str,
        data: SubscriptionCategoryCreate,
    ) -> SubscriptionCategory:
        """Create a new subscription category."""
        # Generate slug if not provided
        slug = data.slug
        if not slug:
            slug = self._generate_slug(data.name)

        # Check slug uniqueness
        existing = await self.db.execute(
            select(SubscriptionCategory)
            .where(SubscriptionCategory.workspace_id == workspace_id)
            .where(SubscriptionCategory.slug == slug)
        )
        if existing.scalar_one_or_none():
            # Append number to make unique
            base_slug = slug
            counter = 1
            while True:
                slug = f"{base_slug}-{counter}"
                existing = await self.db.execute(
                    select(SubscriptionCategory)
                    .where(SubscriptionCategory.workspace_id == workspace_id)
                    .where(SubscriptionCategory.slug == slug)
                )
                if not existing.scalar_one_or_none():
                    break
                counter += 1

        category = SubscriptionCategory(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=data.name,
            slug=slug,
            description=data.description,
            default_subscribed=data.default_subscribed,
            required=data.required,
            display_order=data.display_order,
        )
        self.db.add(category)
        await self.db.commit()
        await self.db.refresh(category)

        return category

    async def get_category(
        self,
        category_id: str,
        workspace_id: str,
    ) -> SubscriptionCategory | None:
        """Get a category by ID."""
        result = await self.db.execute(
            select(SubscriptionCategory)
            .where(SubscriptionCategory.id == category_id)
            .where(SubscriptionCategory.workspace_id == workspace_id)
        )
        return result.scalar_one_or_none()

    async def list_categories(
        self,
        workspace_id: str,
        is_active: bool | None = None,
    ) -> list[SubscriptionCategory]:
        """List all categories for a workspace."""
        query = (
            select(SubscriptionCategory)
            .where(SubscriptionCategory.workspace_id == workspace_id)
            .order_by(SubscriptionCategory.display_order.asc())
        )

        if is_active is not None:
            query = query.where(SubscriptionCategory.is_active == is_active)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def update_category(
        self,
        category_id: str,
        workspace_id: str,
        data: SubscriptionCategoryUpdate,
    ) -> SubscriptionCategory | None:
        """Update a category."""
        category = await self.get_category(category_id, workspace_id)
        if not category:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(category, key, value)

        await self.db.commit()
        await self.db.refresh(category)
        return category

    async def delete_category(
        self,
        category_id: str,
        workspace_id: str,
    ) -> bool:
        """Delete a category."""
        category = await self.get_category(category_id, workspace_id)
        if not category:
            return False

        await self.db.delete(category)
        await self.db.commit()
        return True

    # =========================================================================
    # SUBSCRIBER MANAGEMENT
    # =========================================================================

    async def get_or_create_subscriber(
        self,
        workspace_id: str,
        email: str,
        record_id: str | None = None,
        auto_subscribe: bool = True,
    ) -> tuple[EmailSubscriber, bool]:
        """
        Get existing subscriber or create new one.

        Returns:
            Tuple of (subscriber, created)
        """
        email_hash = self._hash_email(email)

        # Try to find existing
        result = await self.db.execute(
            select(EmailSubscriber)
            .where(EmailSubscriber.workspace_id == workspace_id)
            .where(EmailSubscriber.email_hash == email_hash)
            .options(selectinload(EmailSubscriber.preferences))
        )
        subscriber = result.scalar_one_or_none()

        if subscriber:
            # Update record_id if provided and not set
            if record_id and not subscriber.record_id:
                subscriber.record_id = record_id
                await self.db.commit()
            return subscriber, False

        # Create new subscriber
        subscriber = EmailSubscriber(
            id=str(uuid4()),
            workspace_id=workspace_id,
            email=email,
            email_hash=email_hash,
            record_id=record_id,
            status=SubscriberStatus.ACTIVE.value,
            preference_token=str(uuid4()).replace("-", ""),
        )
        self.db.add(subscriber)
        await self.db.flush()

        # Auto-subscribe to default categories
        if auto_subscribe:
            categories = await self.list_categories(workspace_id, is_active=True)
            for category in categories:
                if category.default_subscribed:
                    preference = SubscriptionPreference(
                        id=str(uuid4()),
                        subscriber_id=subscriber.id,
                        category_id=category.id,
                        is_subscribed=True,
                    )
                    self.db.add(preference)

        await self.db.commit()
        await self.db.refresh(subscriber)

        return subscriber, True

    async def get_subscriber_by_id(
        self,
        subscriber_id: str,
        workspace_id: str | None = None,
    ) -> EmailSubscriber | None:
        """Get subscriber by ID."""
        query = (
            select(EmailSubscriber)
            .where(EmailSubscriber.id == subscriber_id)
            .options(selectinload(EmailSubscriber.preferences))
        )

        if workspace_id:
            query = query.where(EmailSubscriber.workspace_id == workspace_id)

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_subscriber_by_token(
        self,
        token: str,
    ) -> EmailSubscriber | None:
        """Get subscriber by preference token."""
        result = await self.db.execute(
            select(EmailSubscriber)
            .where(EmailSubscriber.preference_token == token)
            .options(selectinload(EmailSubscriber.preferences))
        )
        return result.scalar_one_or_none()

    async def get_subscriber_by_email(
        self,
        workspace_id: str,
        email: str,
    ) -> EmailSubscriber | None:
        """Get subscriber by email."""
        email_hash = self._hash_email(email)
        result = await self.db.execute(
            select(EmailSubscriber)
            .where(EmailSubscriber.workspace_id == workspace_id)
            .where(EmailSubscriber.email_hash == email_hash)
            .options(selectinload(EmailSubscriber.preferences))
        )
        return result.scalar_one_or_none()

    async def list_subscribers(
        self,
        workspace_id: str,
        status: str | None = None,
        search: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[EmailSubscriber], int]:
        """List subscribers for a workspace."""
        query = (
            select(EmailSubscriber)
            .where(EmailSubscriber.workspace_id == workspace_id)
        )

        if status:
            query = query.where(EmailSubscriber.status == status)

        if search:
            query = query.where(EmailSubscriber.email.ilike(f"%{search}%"))

        # Count total
        count_query = (
            select(func.count(EmailSubscriber.id))
            .where(EmailSubscriber.workspace_id == workspace_id)
        )
        if status:
            count_query = count_query.where(EmailSubscriber.status == status)
        if search:
            count_query = count_query.where(EmailSubscriber.email.ilike(f"%{search}%"))

        total = await self.db.execute(count_query)
        total_count = total.scalar() or 0

        # Fetch results
        query = (
            query
            .order_by(EmailSubscriber.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.db.execute(query)

        return list(result.scalars().all()), total_count

    async def update_subscriber_status(
        self,
        subscriber_id: str,
        status: str,
        reason: str | None = None,
    ) -> EmailSubscriber | None:
        """Update subscriber status."""
        result = await self.db.execute(
            select(EmailSubscriber)
            .where(EmailSubscriber.id == subscriber_id)
        )
        subscriber = result.scalar_one_or_none()

        if not subscriber:
            return None

        subscriber.status = status
        subscriber.status_changed_at = datetime.now(timezone.utc)
        subscriber.status_reason = reason

        await self.db.commit()
        await self.db.refresh(subscriber)

        return subscriber

    async def delete_subscriber(
        self,
        subscriber_id: str,
        workspace_id: str,
    ) -> bool:
        """Delete a subscriber (GDPR right to erasure)."""
        subscriber = await self.get_subscriber_by_id(subscriber_id, workspace_id)
        if not subscriber:
            return False

        await self.db.delete(subscriber)
        await self.db.commit()
        return True

    # =========================================================================
    # PREFERENCE MANAGEMENT
    # =========================================================================

    async def get_preference_center_data(
        self,
        token: str,
    ) -> dict | None:
        """Get all data needed for the preference center page."""
        subscriber = await self.get_subscriber_by_token(token)
        if not subscriber:
            return None

        # Get all active categories for this workspace
        categories = await self.list_categories(subscriber.workspace_id, is_active=True)

        # Build preferences map
        preferences_map = {}
        for pref in subscriber.preferences:
            preferences_map[pref.category_id] = {
                "is_subscribed": pref.is_subscribed,
                "frequency": pref.frequency,
            }

        # Add missing categories with default values
        for category in categories:
            if category.id not in preferences_map:
                preferences_map[category.id] = {
                    "is_subscribed": category.default_subscribed,
                    "frequency": None,
                }

        return {
            "subscriber_id": subscriber.id,
            "email": subscriber.email,
            "status": subscriber.status,
            "categories": categories,
            "preferences": preferences_map,
        }

    async def update_preferences(
        self,
        token: str,
        preferences: list[SubscriptionPreferenceUpdate],
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> EmailSubscriber | None:
        """Update subscriber preferences from preference center."""
        subscriber = await self.get_subscriber_by_token(token)
        if not subscriber:
            return None

        # Build map of existing preferences
        existing_prefs = {p.category_id: p for p in subscriber.preferences}

        for pref_update in preferences:
            if pref_update.category_id in existing_prefs:
                # Update existing
                pref = existing_prefs[pref_update.category_id]

                # Check if unsubscribing
                if pref.is_subscribed and not pref_update.is_subscribed:
                    # Log unsubscribe event
                    await self._log_unsubscribe_event(
                        subscriber_id=subscriber.id,
                        category_id=pref_update.category_id,
                        source=UnsubscribeSource.PREFERENCE_CENTER.value,
                        ip_address=ip_address,
                        user_agent=user_agent,
                    )

                pref.is_subscribed = pref_update.is_subscribed
                if pref_update.frequency:
                    pref.frequency = pref_update.frequency
            else:
                # Create new preference
                new_pref = SubscriptionPreference(
                    id=str(uuid4()),
                    subscriber_id=subscriber.id,
                    category_id=pref_update.category_id,
                    is_subscribed=pref_update.is_subscribed,
                    frequency=pref_update.frequency,
                )
                self.db.add(new_pref)

        await self.db.commit()
        await self.db.refresh(subscriber)

        return subscriber

    async def unsubscribe_all(
        self,
        token: str,
        source: str = UnsubscribeSource.PREFERENCE_CENTER.value,
        campaign_id: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> EmailSubscriber | None:
        """Unsubscribe from all categories."""
        subscriber = await self.get_subscriber_by_token(token)
        if not subscriber:
            return None

        # Update status
        subscriber.status = SubscriberStatus.UNSUBSCRIBED.value
        subscriber.status_changed_at = datetime.now(timezone.utc)
        subscriber.status_reason = f"unsubscribed_via_{source}"

        # Log event
        await self._log_unsubscribe_event(
            subscriber_id=subscriber.id,
            source=source,
            campaign_id=campaign_id,
            ip_address=ip_address,
            user_agent=user_agent,
            unsubscribe_type="all",
        )

        await self.db.commit()
        await self.db.refresh(subscriber)

        logger.info(f"Subscriber {subscriber.id} unsubscribed from all via {source}")
        return subscriber

    async def resubscribe(
        self,
        token: str,
    ) -> EmailSubscriber | None:
        """Resubscribe a previously unsubscribed user."""
        subscriber = await self.get_subscriber_by_token(token)
        if not subscriber:
            return None

        if subscriber.status != SubscriberStatus.UNSUBSCRIBED.value:
            return subscriber

        subscriber.status = SubscriberStatus.ACTIVE.value
        subscriber.status_changed_at = datetime.now(timezone.utc)
        subscriber.status_reason = "resubscribed"

        await self.db.commit()
        await self.db.refresh(subscriber)

        logger.info(f"Subscriber {subscriber.id} resubscribed")
        return subscriber

    # =========================================================================
    # SENDING ELIGIBILITY
    # =========================================================================

    async def can_send_to(
        self,
        workspace_id: str,
        email: str,
        category_slug: str | None = None,
    ) -> tuple[bool, str | None]:
        """
        Check if we can send to this email address.

        Args:
            workspace_id: Workspace ID
            email: Recipient email
            category_slug: Optional category to check subscription for

        Returns:
            Tuple of (can_send, reason)
        """
        subscriber = await self.get_subscriber_by_email(workspace_id, email)

        if not subscriber:
            # No subscriber record, can send
            return True, None

        # Check global status
        if subscriber.status == SubscriberStatus.UNSUBSCRIBED.value:
            return False, "unsubscribed"

        if subscriber.status == SubscriberStatus.BOUNCED.value:
            return False, "bounced"

        if subscriber.status == SubscriberStatus.COMPLAINED.value:
            return False, "complained"

        # If category specified, check category subscription
        if category_slug:
            category = await self.db.execute(
                select(SubscriptionCategory)
                .where(SubscriptionCategory.workspace_id == workspace_id)
                .where(SubscriptionCategory.slug == category_slug)
            )
            category = category.scalar_one_or_none()

            if category and not category.required:
                # Check if subscribed to this category
                pref = await self.db.execute(
                    select(SubscriptionPreference)
                    .where(SubscriptionPreference.subscriber_id == subscriber.id)
                    .where(SubscriptionPreference.category_id == category.id)
                )
                pref = pref.scalar_one_or_none()

                if pref and not pref.is_subscribed:
                    return False, f"unsubscribed_from_{category_slug}"

        return True, None

    def can_send_to_sync(
        self,
        workspace_id: str,
        email: str,
        category_slug: str | None = None,
    ) -> tuple[bool, str | None]:
        """Synchronous version for Celery tasks."""
        import asyncio

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(
                self.can_send_to(workspace_id, email, category_slug)
            )
        finally:
            loop.close()

    # =========================================================================
    # IMPORT/EXPORT
    # =========================================================================

    async def import_subscribers(
        self,
        workspace_id: str,
        subscribers: list[dict],
        category_ids: list[str] | None = None,
        skip_verification: bool = False,
    ) -> dict:
        """
        Import subscribers in bulk.

        Args:
            workspace_id: Workspace ID
            subscribers: List of subscriber dicts with at least 'email' key
            category_ids: Optional category IDs to subscribe to
            skip_verification: If True, mark as verified immediately

        Returns:
            Import results dict
        """
        imported = 0
        skipped = 0
        errors = []

        for sub_data in subscribers:
            email = sub_data.get("email", "").strip().lower()
            if not email or "@" not in email:
                errors.append({"email": email, "error": "Invalid email"})
                continue

            try:
                subscriber, created = await self.get_or_create_subscriber(
                    workspace_id=workspace_id,
                    email=email,
                    auto_subscribe=False,
                )

                if created:
                    imported += 1

                    if skip_verification:
                        subscriber.is_verified = True
                        subscriber.verified_at = datetime.now(timezone.utc)

                    # Subscribe to specified categories
                    if category_ids:
                        for cat_id in category_ids:
                            pref = SubscriptionPreference(
                                id=str(uuid4()),
                                subscriber_id=subscriber.id,
                                category_id=cat_id,
                                is_subscribed=True,
                            )
                            self.db.add(pref)
                else:
                    skipped += 1

            except Exception as e:
                errors.append({"email": email, "error": str(e)})

        await self.db.commit()

        return {
            "total": len(subscribers),
            "imported": imported,
            "skipped": skipped,
            "errors": errors,
        }

    async def export_subscribers(
        self,
        workspace_id: str,
        status: str | None = None,
    ) -> list[dict]:
        """Export subscribers as list of dicts."""
        query = (
            select(EmailSubscriber)
            .where(EmailSubscriber.workspace_id == workspace_id)
            .options(selectinload(EmailSubscriber.preferences))
        )

        if status:
            query = query.where(EmailSubscriber.status == status)

        result = await self.db.execute(query)
        subscribers = result.scalars().all()

        export_data = []
        for sub in subscribers:
            sub_dict = {
                "email": sub.email,
                "status": sub.status,
                "is_verified": sub.is_verified,
                "created_at": sub.created_at.isoformat() if sub.created_at else None,
                "preferences": {},
            }

            for pref in sub.preferences:
                sub_dict["preferences"][pref.category_id] = {
                    "is_subscribed": pref.is_subscribed,
                    "frequency": pref.frequency,
                }

            export_data.append(sub_dict)

        return export_data

    # =========================================================================
    # HELPERS
    # =========================================================================

    def _hash_email(self, email: str) -> str:
        """Hash email for storage."""
        normalized = email.strip().lower()
        return hashlib.sha256(normalized.encode()).hexdigest()

    def _generate_slug(self, name: str) -> str:
        """Generate slug from name."""
        import re
        slug = name.lower()
        slug = re.sub(r"[^a-z0-9]+", "-", slug)
        slug = slug.strip("-")
        return slug

    async def _log_unsubscribe_event(
        self,
        subscriber_id: str,
        source: str,
        category_id: str | None = None,
        campaign_id: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        unsubscribe_type: str = "category",
    ) -> None:
        """Log an unsubscribe event for compliance."""
        event = UnsubscribeEvent(
            id=str(uuid4()),
            subscriber_id=subscriber_id,
            campaign_id=campaign_id,
            category_id=category_id,
            unsubscribe_type=unsubscribe_type,
            source=source,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self.db.add(event)

    # =========================================================================
    # BOUNCE/COMPLAINT HANDLING
    # =========================================================================

    async def handle_bounce(
        self,
        workspace_id: str,
        email: str,
        bounce_type: str = "hard",
    ) -> EmailSubscriber | None:
        """Handle email bounce event."""
        subscriber = await self.get_subscriber_by_email(workspace_id, email)

        if not subscriber:
            # Create subscriber record for tracking
            subscriber, _ = await self.get_or_create_subscriber(
                workspace_id=workspace_id,
                email=email,
                auto_subscribe=False,
            )

        if bounce_type == "hard":
            subscriber.status = SubscriberStatus.BOUNCED.value
            subscriber.status_changed_at = datetime.now(timezone.utc)
            subscriber.status_reason = "hard_bounce"
        else:
            # Soft bounce - could implement counter logic
            pass

        await self.db.commit()
        await self.db.refresh(subscriber)

        logger.info(f"Recorded {bounce_type} bounce for {email}")
        return subscriber

    async def handle_complaint(
        self,
        workspace_id: str,
        email: str,
    ) -> EmailSubscriber | None:
        """Handle spam complaint event."""
        subscriber = await self.get_subscriber_by_email(workspace_id, email)

        if not subscriber:
            subscriber, _ = await self.get_or_create_subscriber(
                workspace_id=workspace_id,
                email=email,
                auto_subscribe=False,
            )

        subscriber.status = SubscriberStatus.COMPLAINED.value
        subscriber.status_changed_at = datetime.now(timezone.utc)
        subscriber.status_reason = "spam_complaint"

        # Log as unsubscribe event
        await self._log_unsubscribe_event(
            subscriber_id=subscriber.id,
            source=UnsubscribeSource.COMPLAINT.value,
            unsubscribe_type="all",
        )

        await self.db.commit()
        await self.db.refresh(subscriber)

        logger.warning(f"Recorded spam complaint for {email}")
        return subscriber
