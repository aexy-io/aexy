"""Competitor Intelligence Service — track competitors, detect changes, manage battle cards."""

import hashlib
import logging
from datetime import datetime, timezone
from uuid import uuid4

import httpx
from sqlalchemy import select, and_, func, delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.url_validation import validate_url_for_fetch, SSRFError
from aexy.models.gtm_competitor import CompetitorProfile, CompetitorChange, BattleCard

logger = logging.getLogger(__name__)

# Map page labels to change types and severity levels.
_LABEL_CHANGE_TYPE: dict[str, str] = {
    "pricing": "pricing_change",
    "features": "feature_change",
    "product": "product_change",
    "homepage": "positioning_change",
    "about": "positioning_change",
    "blog": "content_change",
    "docs": "content_change",
    "changelog": "release_change",
    "careers": "hiring_change",
    "security": "security_change",
    "integrations": "integration_change",
}

_CHANGE_TYPE_SEVERITY: dict[str, str] = {
    "pricing_change": "critical",
    "feature_change": "high",
    "product_change": "high",
    "positioning_change": "medium",
    "release_change": "medium",
    "integration_change": "medium",
    "hiring_change": "low",
    "content_change": "low",
    "security_change": "medium",
}

# Change types that warrant an alert.
_CRITICAL_CHANGE_TYPES = {"pricing_change", "feature_change", "product_change"}


class CompetitorIntelService:
    """Track competitors, detect page changes, and manage battle cards."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # COMPETITOR CRUD
    # =========================================================================

    async def create_competitor(self, workspace_id: str, data: dict) -> CompetitorProfile:
        """Create a new competitor profile."""
        tracked_pages = data.get("tracked_pages", [])
        # Ensure each tracked page has the expected structure.
        normalised_pages = []
        for page in tracked_pages:
            # Validate each tracked URL at creation time (SSRF protection)
            validate_url_for_fetch(page["url"])
            normalised_pages.append({
                "url": page["url"],
                "label": page.get("label", "other"),
                "last_hash": None,
                "last_checked_at": None,
            })

        profile = CompetitorProfile(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=data["name"],
            domain=data["domain"],
            tracked_pages=normalised_pages,
            current_snapshot=data.get("current_snapshot", {}),
            is_active=data.get("is_active", True),
        )
        self.db.add(profile)
        await self.db.commit()
        await self.db.refresh(profile)
        return profile

    async def update_competitor(
        self, workspace_id: str, competitor_id: str, data: dict,
    ) -> CompetitorProfile | None:
        """Update fields on an existing competitor profile."""
        result = await self.db.execute(
            select(CompetitorProfile).where(
                and_(
                    CompetitorProfile.workspace_id == workspace_id,
                    CompetitorProfile.id == competitor_id,
                )
            )
        )
        profile = result.scalar_one_or_none()
        if not profile:
            return None

        for key, value in data.items():
            if value is not None and hasattr(profile, key):
                setattr(profile, key, value)

        await self.db.commit()
        await self.db.refresh(profile)
        return profile

    async def delete_competitor(self, workspace_id: str, competitor_id: str) -> bool:
        """Delete a competitor profile (cascades to changes and battle cards)."""
        result = await self.db.execute(
            delete(CompetitorProfile).where(
                and_(
                    CompetitorProfile.workspace_id == workspace_id,
                    CompetitorProfile.id == competitor_id,
                )
            )
        )
        await self.db.commit()
        return result.rowcount > 0

    async def list_competitors(self, workspace_id: str) -> list[CompetitorProfile]:
        """Return all competitor profiles for the workspace."""
        result = await self.db.execute(
            select(CompetitorProfile)
            .where(CompetitorProfile.workspace_id == workspace_id)
            .order_by(CompetitorProfile.name.asc())
        )
        return list(result.scalars().all())

    async def get_competitor(
        self, workspace_id: str, competitor_id: str,
    ) -> CompetitorProfile | None:
        """Return a single competitor profile."""
        result = await self.db.execute(
            select(CompetitorProfile).where(
                and_(
                    CompetitorProfile.workspace_id == workspace_id,
                    CompetitorProfile.id == competitor_id,
                )
            )
        )
        return result.scalar_one_or_none()

    # =========================================================================
    # CHANGE DETECTION
    # =========================================================================

    async def check_for_changes(
        self, workspace_id: str, competitor_id: str,
    ) -> list[str]:
        """Fetch each tracked page, detect content changes, and persist them.

        Returns a list of newly-created CompetitorChange IDs.
        """
        profile = await self.get_competitor(workspace_id, competitor_id)
        if not profile:
            logger.warning(
                "check_for_changes: competitor %s not found in workspace %s",
                competitor_id, workspace_id,
            )
            return []

        tracked_pages: list[dict] = list(profile.tracked_pages or [])
        new_change_ids: list[str] = []
        now_iso = datetime.now(timezone.utc).isoformat()
        pages_updated = False

        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            for idx, page in enumerate(tracked_pages):
                url = page.get("url", "")
                label = page.get("label", "other")
                previous_hash = page.get("last_hash")

                # Validate URL before fetching (SSRF protection)
                try:
                    validate_url_for_fetch(url)
                except SSRFError:
                    logger.warning(
                        "Blocked SSRF attempt for competitor %s: %s",
                        competitor_id, url,
                    )
                    tracked_pages[idx]["last_checked_at"] = now_iso
                    pages_updated = True
                    continue

                try:
                    response = await client.get(url)
                    response.raise_for_status()
                    body = response.text
                except httpx.HTTPStatusError as exc:
                    logger.warning(
                        "HTTP %s fetching %s for competitor %s",
                        exc.response.status_code, url, competitor_id,
                    )
                    tracked_pages[idx]["last_checked_at"] = now_iso
                    pages_updated = True
                    continue
                except httpx.RequestError as exc:
                    logger.warning(
                        "Request error fetching %s for competitor %s: %s",
                        url, competitor_id, exc,
                    )
                    tracked_pages[idx]["last_checked_at"] = now_iso
                    pages_updated = True
                    continue

                current_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()

                # Update tracking metadata regardless of change.
                tracked_pages[idx]["last_hash"] = current_hash
                tracked_pages[idx]["last_checked_at"] = now_iso
                pages_updated = True

                if previous_hash is None:
                    # First check — store hash only, no change record.
                    continue

                if current_hash == previous_hash:
                    continue

                # Determine change_type and severity from the label.
                change_type = _LABEL_CHANGE_TYPE.get(label.lower(), "content_change")
                severity = _CHANGE_TYPE_SEVERITY.get(change_type, "info")

                change = CompetitorChange(
                    id=str(uuid4()),
                    workspace_id=workspace_id,
                    competitor_id=competitor_id,
                    page_url=url,
                    page_label=label,
                    change_type=change_type,
                    title=f"{profile.name}: {label} page changed",
                    description=f"Content change detected on {url}",
                    severity=severity,
                    previous_content_hash=previous_hash,
                    current_content_hash=current_hash,
                    diff_data={},
                )
                self.db.add(change)
                new_change_ids.append(change.id)

        # Persist updated tracked_pages back to the profile.
        if pages_updated:
            await self.db.execute(
                update(CompetitorProfile)
                .where(CompetitorProfile.id == competitor_id)
                .values(tracked_pages=tracked_pages)
            )

        if new_change_ids:
            await self.db.commit()

            # Emit GTM alerts for critical changes.
            critical_changes = [
                cid for cid, page in zip(
                    new_change_ids,
                    [p for p in tracked_pages if p.get("last_hash") != p.get("_prev")],
                    strict=False,
                )
                if True  # all new changes trigger evaluation below
            ]
            await self._emit_alerts_for_changes(workspace_id, competitor_id, profile.name, new_change_ids)
        elif pages_updated:
            await self.db.commit()

        return new_change_ids

    async def _emit_alerts_for_changes(
        self,
        workspace_id: str,
        competitor_id: str,
        competitor_name: str,
        change_ids: list[str],
    ) -> None:
        """Emit a competitor_alert GTM event for critical/high-severity changes."""
        try:
            from aexy.services.gtm_alert_service import GTMAlertService

            # Load the changes we just created.
            result = await self.db.execute(
                select(CompetitorChange).where(
                    and_(
                        CompetitorChange.id.in_(change_ids),
                        CompetitorChange.change_type.in_(list(_CRITICAL_CHANGE_TYPES)),
                    )
                )
            )
            critical = list(result.scalars().all())
            if not critical:
                return

            alert_svc = GTMAlertService(self.db)
            for change in critical:
                await alert_svc.emit_gtm_event(
                    workspace_id=workspace_id,
                    event_type="competitor_alert",
                    event_data={
                        "competitor_id": competitor_id,
                        "competitor_name": competitor_name,
                        "change_id": change.id,
                        "change_type": change.change_type,
                        "severity": change.severity,
                        "page_url": change.page_url,
                        "title": change.title,
                    },
                )
        except Exception:
            logger.exception("Failed to emit competitor alert for workspace %s", workspace_id)

    async def list_changes(
        self,
        workspace_id: str,
        competitor_id: str | None = None,
        page: int = 1,
        per_page: int = 50,
    ) -> tuple[list[CompetitorChange], int]:
        """Return paginated competitor changes. Optionally filter by competitor."""
        base_filter = CompetitorChange.workspace_id == workspace_id
        if competitor_id:
            base_filter = and_(base_filter, CompetitorChange.competitor_id == competitor_id)

        count_q = select(func.count(CompetitorChange.id)).where(base_filter)
        total: int = (await self.db.execute(count_q)).scalar() or 0

        q = (
            select(CompetitorChange)
            .where(base_filter)
            .order_by(CompetitorChange.detected_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
        result = await self.db.execute(q)
        return list(result.scalars().all()), total

    async def acknowledge_change(
        self, workspace_id: str, change_id: str,
    ) -> bool:
        """Mark a change as acknowledged. Returns True if the row was updated."""
        result = await self.db.execute(
            update(CompetitorChange)
            .where(
                and_(
                    CompetitorChange.workspace_id == workspace_id,
                    CompetitorChange.id == change_id,
                )
            )
            .values(is_acknowledged=True)
        )
        await self.db.commit()
        return result.rowcount > 0

    # =========================================================================
    # BATTLE CARDS
    # =========================================================================

    async def generate_battle_card(
        self, workspace_id: str, competitor_id: str,
    ) -> BattleCard | None:
        """Create or update a battle card for the competitor.

        Currently generates a placeholder card using snapshot data. In the
        future this will call the LLM gateway to produce real content.
        """
        profile = await self.get_competitor(workspace_id, competitor_id)
        if not profile:
            return None

        # Check for an existing card.
        result = await self.db.execute(
            select(BattleCard).where(
                and_(
                    BattleCard.workspace_id == workspace_id,
                    BattleCard.competitor_id == competitor_id,
                )
            ).order_by(BattleCard.version.desc()).limit(1)
        )
        existing = result.scalar_one_or_none()

        snapshot = profile.current_snapshot or {}
        now = datetime.now(timezone.utc)

        # Build placeholder content from available snapshot data.
        strengths = snapshot.get("key_features", [])
        if isinstance(strengths, str):
            strengths = [strengths]

        pricing_comparison = snapshot.get("pricing_tiers", {})
        if isinstance(pricing_comparison, list):
            pricing_comparison = {"tiers": pricing_comparison}

        positioning = snapshot.get("positioning", "")

        if existing:
            # Bump version and regenerate.
            existing.title = f"Battle Card: {profile.name}"
            existing.overview = (
                f"Competitive analysis for {profile.name} ({profile.domain}). "
                f"Positioning: {positioning or 'Unknown'}."
            )
            existing.strengths = strengths
            existing.weaknesses = existing.weaknesses or ["Needs analysis"]
            existing.our_advantages = existing.our_advantages or ["Needs analysis"]
            existing.objection_handling = existing.objection_handling or []
            existing.talk_tracks = existing.talk_tracks or []
            existing.pricing_comparison = pricing_comparison
            existing.version = existing.version + 1
            existing.status = "draft"
            existing.generated_at = now
            await self.db.commit()
            await self.db.refresh(existing)
            return existing

        card = BattleCard(
            id=str(uuid4()),
            workspace_id=workspace_id,
            competitor_id=competitor_id,
            title=f"Battle Card: {profile.name}",
            overview=(
                f"Competitive analysis for {profile.name} ({profile.domain}). "
                f"Positioning: {positioning or 'Unknown'}."
            ),
            strengths=strengths,
            weaknesses=["Needs analysis"],
            our_advantages=["Needs analysis"],
            objection_handling=[],
            talk_tracks=[],
            pricing_comparison=pricing_comparison,
            win_rate=0.0,
            total_deals=0,
            wins=0,
            losses=0,
            common_loss_reasons=[],
            common_win_reasons=[],
            status="draft",
            version=1,
            generated_at=now,
        )
        self.db.add(card)
        await self.db.commit()
        await self.db.refresh(card)
        return card

    async def get_battle_card(
        self, workspace_id: str, competitor_id: str,
    ) -> BattleCard | None:
        """Return the latest battle card for a competitor."""
        result = await self.db.execute(
            select(BattleCard).where(
                and_(
                    BattleCard.workspace_id == workspace_id,
                    BattleCard.competitor_id == competitor_id,
                )
            ).order_by(BattleCard.version.desc()).limit(1)
        )
        return result.scalar_one_or_none()

    async def update_battle_card(
        self,
        workspace_id: str,
        competitor_id: str,
        card_id: str,
        data: dict,
    ) -> BattleCard | None:
        """Update fields on an existing battle card."""
        result = await self.db.execute(
            select(BattleCard).where(
                and_(
                    BattleCard.workspace_id == workspace_id,
                    BattleCard.competitor_id == competitor_id,
                    BattleCard.id == card_id,
                )
            )
        )
        card = result.scalar_one_or_none()
        if not card:
            return None

        for key, value in data.items():
            if value is not None and hasattr(card, key) and key not in ("id", "workspace_id", "competitor_id"):
                setattr(card, key, value)

        await self.db.commit()
        await self.db.refresh(card)
        return card

    async def publish_battle_card(
        self,
        workspace_id: str,
        competitor_id: str,
        card_id: str,
    ) -> BattleCard | None:
        """Set a battle card's status to published."""
        result = await self.db.execute(
            select(BattleCard).where(
                and_(
                    BattleCard.workspace_id == workspace_id,
                    BattleCard.competitor_id == competitor_id,
                    BattleCard.id == card_id,
                )
            )
        )
        card = result.scalar_one_or_none()
        if not card:
            return None

        card.status = "published"
        await self.db.commit()
        await self.db.refresh(card)
        return card

    # =========================================================================
    # WIN/LOSS DATA
    # =========================================================================

    async def refresh_win_loss_data(
        self, workspace_id: str, competitor_id: str,
    ) -> BattleCard | None:
        """Refresh win/loss data from CRM deals for the competitor battle card.

        This is currently a placeholder. A full implementation would aggregate
        deal outcomes from the CRM where the competitor was tagged, compute
        win_rate, common_win_reasons, and common_loss_reasons, then update
        the battle card accordingly.
        """
        card = await self.get_battle_card(workspace_id, competitor_id)
        if not card:
            logger.info(
                "refresh_win_loss_data: no battle card for competitor %s, workspace %s",
                competitor_id, workspace_id,
            )
            return None

        # TODO: aggregate from CRM deals table once competitor tagging is available.
        # For now, return the existing card unmodified.
        return card
