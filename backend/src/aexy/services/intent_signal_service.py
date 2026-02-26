"""Service for intent signal detection, tracking, and scoring."""

import logging
from typing import Any
from uuid import uuid4

from sqlalchemy import select, and_, func, update, or_
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.gtm_intent import IntentSignal, IntentSignalConfig
from aexy.models.crm import CRMRecord

logger = logging.getLogger(__name__)


class IntentSignalService:
    """Manage buying-intent signals and their configuration."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # Signal CRUD
    # ------------------------------------------------------------------

    async def create_signal(self, workspace_id: str, data: dict[str, Any]) -> IntentSignal:
        """Create a new intent signal from a dict."""
        signal = IntentSignal(
            id=str(uuid4()),
            workspace_id=workspace_id,
            **{k: v for k, v in data.items() if hasattr(IntentSignal, k) and k not in ("id", "workspace_id")},
        )
        self.db.add(signal)
        await self.db.commit()
        await self.db.refresh(signal)
        logger.info("Created intent signal %s type=%s", signal.id, signal.signal_type)
        return signal

    async def list_signals(
        self,
        workspace_id: str,
        page: int = 1,
        per_page: int = 50,
        signal_type: str | None = None,
        intent_strength: str | None = None,
        is_dismissed: bool = False,
    ) -> tuple[list[IntentSignal], int]:
        """Return paginated signals with optional filters."""
        filters = [
            IntentSignal.workspace_id == workspace_id,
            IntentSignal.is_dismissed == is_dismissed,
        ]
        if signal_type:
            filters.append(IntentSignal.signal_type == signal_type)
        if intent_strength:
            filters.append(IntentSignal.intent_strength == intent_strength)

        where = and_(*filters)

        total = await self.db.scalar(
            select(func.count(IntentSignal.id)).where(where)
        )

        rows = (
            await self.db.scalars(
                select(IntentSignal)
                .where(where)
                .order_by(IntentSignal.detected_at.desc())
                .offset((page - 1) * per_page)
                .limit(per_page)
            )
        ).all()

        return list(rows), total or 0

    async def dismiss_signal(self, workspace_id: str, signal_id: str) -> IntentSignal | None:
        """Mark a signal as dismissed."""
        await self.db.execute(
            update(IntentSignal)
            .where(and_(IntentSignal.id == signal_id, IntentSignal.workspace_id == workspace_id))
            .values(is_dismissed=True)
        )
        await self.db.commit()
        return await self.db.get(IntentSignal, signal_id)

    async def get_signal(self, workspace_id: str, signal_id: str) -> IntentSignal | None:
        """Return a single intent signal by ID."""
        return await self.db.scalar(
            select(IntentSignal).where(and_(
                IntentSignal.workspace_id == workspace_id,
                IntentSignal.id == signal_id,
            ))
        )

    async def get_signals_for_record(self, workspace_id: str, record_id: str) -> list[IntentSignal]:
        """Return all signals linked to a CRM record."""
        rows = (
            await self.db.scalars(
                select(IntentSignal)
                .where(and_(
                    IntentSignal.workspace_id == workspace_id,
                    IntentSignal.record_id == record_id,
                ))
                .order_by(IntentSignal.detected_at.desc())
            )
        ).all()
        return list(rows)

    # ------------------------------------------------------------------
    # Config
    # ------------------------------------------------------------------

    async def get_config(self, workspace_id: str) -> IntentSignalConfig | None:
        """Return the workspace intent-signal config, or None."""
        return await self.db.scalar(
            select(IntentSignalConfig).where(IntentSignalConfig.workspace_id == workspace_id)
        )

    async def upsert_config(self, workspace_id: str, data: dict[str, Any]) -> IntentSignalConfig:
        """Create or update the workspace intent-signal config."""
        config = await self.get_config(workspace_id)
        if config is None:
            config = IntentSignalConfig(
                id=str(uuid4()),
                workspace_id=workspace_id,
            )
            self.db.add(config)

        for key, value in data.items():
            if hasattr(config, key) and key not in ("id", "workspace_id"):
                setattr(config, key, value)

        await self.db.commit()
        await self.db.refresh(config)
        logger.info("Upserted intent signal config for workspace %s", workspace_id)
        return config

    # ------------------------------------------------------------------
    # Collection placeholders
    # ------------------------------------------------------------------

    async def collect_job_posting_signals(self, workspace_id: str) -> int:
        """Scrape careers/jobs pages for monitored domains and create intent signals.

        Fetches ``https://{domain}/careers`` (and common variants) looking for
        job titles or technology keywords from the workspace config.  Each match
        becomes an intent signal.
        """
        import httpx
        import re

        config = await self.get_config(workspace_id)
        if not config or not config.monitored_domains:
            logger.info("No monitored domains configured for workspace %s", workspace_id)
            return 0

        keywords = set(k.lower() for k in (config.job_title_keywords or []))
        tech_kw = set(k.lower() for k in (config.tech_keywords or []))
        all_keywords = keywords | tech_kw
        if not all_keywords:
            logger.info("No job/tech keywords configured for workspace %s", workspace_id)
            return 0

        careers_paths = ["/careers", "/jobs", "/open-positions"]
        created = 0

        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            for domain in config.monitored_domains:
                for path in careers_paths:
                    url = f"https://{domain}{path}"
                    try:
                        resp = await client.get(url)
                        if resp.status_code != 200:
                            continue
                        text = resp.text.lower()
                    except Exception:
                        continue

                    # Look for keyword matches in the page
                    matched = [kw for kw in all_keywords if kw in text]
                    if not matched:
                        continue

                    # Deduplicate: skip if we already have a recent signal for this domain+type
                    existing = await self.db.scalar(
                        select(func.count(IntentSignal.id)).where(and_(
                            IntentSignal.workspace_id == workspace_id,
                            IntentSignal.company_domain == domain,
                            IntentSignal.signal_type == "job_posting",
                            IntentSignal.is_dismissed == False,  # noqa: E712
                        ))
                    )
                    if existing and existing > 0:
                        continue

                    # Determine strength by number of keyword matches
                    strength = "low" if len(matched) < 2 else ("medium" if len(matched) < 4 else "high")

                    signal = IntentSignal(
                        id=str(uuid4()),
                        workspace_id=workspace_id,
                        company_domain=domain,
                        company_name=domain.split(".")[0].title(),
                        signal_type="job_posting",
                        title=f"Job postings mention: {', '.join(matched[:5])}",
                        description=f"Careers page at {url} mentions keywords relevant to your product.",
                        source_url=url,
                        source_name="careers_page",
                        confidence_score=min(0.9, 0.4 + 0.1 * len(matched)),
                        intent_strength=strength,
                        signal_data={"matched_keywords": matched[:20], "url": url},
                    )
                    self.db.add(signal)
                    created += 1
                    break  # Found careers page for this domain, move to next

        if created:
            await self.db.commit()

        logger.info(
            "Collected %d job posting signals for %d domains in workspace %s",
            created, len(config.monitored_domains), workspace_id,
        )
        return created

    async def collect_tech_change_signals(self, workspace_id: str) -> int:
        """Detect technology-stack clues from monitored domain homepages.

        Performs lightweight checks for technology keywords (from config) in
        page HTML meta tags and script sources.  More accurate results would
        come from a BuiltWith or Wappalyzer-style provider integration.
        """
        import httpx
        import re

        config = await self.get_config(workspace_id)
        if not config or not config.monitored_domains:
            logger.info("No monitored domains configured for workspace %s", workspace_id)
            return 0

        tech_kw = set(k.lower() for k in (config.tech_keywords or []))
        if not tech_kw:
            return 0

        created = 0
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            for domain in config.monitored_domains:
                url = f"https://{domain}"
                try:
                    resp = await client.get(url)
                    if resp.status_code != 200:
                        continue
                    text = resp.text.lower()
                except Exception:
                    continue

                matched = [kw for kw in tech_kw if kw in text]
                if not matched:
                    continue

                # Skip if we already have a recent tech_change signal for this domain
                existing = await self.db.scalar(
                    select(func.count(IntentSignal.id)).where(and_(
                        IntentSignal.workspace_id == workspace_id,
                        IntentSignal.company_domain == domain,
                        IntentSignal.signal_type == "tech_change",
                        IntentSignal.is_dismissed == False,  # noqa: E712
                    ))
                )
                if existing and existing > 0:
                    continue

                signal = IntentSignal(
                    id=str(uuid4()),
                    workspace_id=workspace_id,
                    company_domain=domain,
                    company_name=domain.split(".")[0].title(),
                    signal_type="tech_change",
                    title=f"Tech stack mentions: {', '.join(matched[:5])}",
                    description=f"Homepage of {domain} references technologies relevant to your product.",
                    source_url=url,
                    source_name="homepage_scan",
                    confidence_score=min(0.8, 0.3 + 0.1 * len(matched)),
                    intent_strength="low" if len(matched) < 2 else "medium",
                    signal_data={"matched_keywords": matched[:20], "url": url},
                )
                self.db.add(signal)
                created += 1

        if created:
            await self.db.commit()

        logger.info(
            "Collected %d tech change signals for %d domains in workspace %s",
            created, len(config.monitored_domains), workspace_id,
        )
        return created

    # ------------------------------------------------------------------
    # Scoring
    # ------------------------------------------------------------------

    async def calculate_intent_score_boost(self, workspace_id: str, record_id: str) -> int:
        """Calculate a 0-25 score boost from unprocessed strong signals.

        Uses signal_weights from config to weight each signal type,
        then clamps the total to a max of 25.
        """
        config = await self.get_config(workspace_id)
        weights = config.signal_weights if config else {
            "job_posting": 15,
            "tech_change": 10,
            "review_activity": 8,
            "competitor_eval": 20,
            "funding_event": 12,
        }

        # Fetch unprocessed, non-dismissed signals for the record
        signals = (
            await self.db.scalars(
                select(IntentSignal).where(and_(
                    IntentSignal.workspace_id == workspace_id,
                    IntentSignal.record_id == record_id,
                    IntentSignal.is_processed == False,  # noqa: E712
                    IntentSignal.is_dismissed == False,  # noqa: E712
                ))
            )
        ).all()

        if not signals:
            return 0

        total = 0.0
        for sig in signals:
            weight = weights.get(sig.signal_type, 5)
            # Scale by confidence
            total += weight * sig.confidence_score

        return min(int(total), 25)

    # ------------------------------------------------------------------
    # Matching
    # ------------------------------------------------------------------

    async def match_signals_to_records(self, workspace_id: str) -> int:
        """Match unprocessed signals to CRM records by company_domain.

        Looks for CRM records whose JSONB ``values`` contain a matching
        domain or website field.  Marks all signals as processed and
        links matched ones to their record.
        """
        unprocessed = (
            await self.db.scalars(
                select(IntentSignal).where(and_(
                    IntentSignal.workspace_id == workspace_id,
                    IntentSignal.is_processed == False,  # noqa: E712
                    IntentSignal.company_domain.isnot(None),
                ))
            )
        ).all()

        if not unprocessed:
            return 0

        # Collect unique domains
        domains = {s.company_domain for s in unprocessed}

        # For each domain, try to find a matching CRM record via JSONB values.
        # CRM records store attributes in values JSONB as {slug: value}.
        # We check common keys: "domain", "website", "company_domain".
        domain_to_record: dict[str, str] = {}
        for domain in domains:
            record = await self.db.scalar(
                select(CRMRecord).where(and_(
                    CRMRecord.workspace_id == workspace_id,
                    CRMRecord.is_archived == False,  # noqa: E712
                    or_(
                        CRMRecord.values["domain"].astext == domain,
                        CRMRecord.values["company_domain"].astext == domain,
                        CRMRecord.values["website"].astext.contains(domain),
                    ),
                )).limit(1)
            )
            if record is not None:
                domain_to_record[domain] = record.id

        # Update signals
        matched = 0
        for sig in unprocessed:
            record_id = domain_to_record.get(sig.company_domain)
            if record_id:
                sig.record_id = record_id
                matched += 1
            sig.is_processed = True

        await self.db.commit()
        logger.info(
            "Matched %d / %d signals to CRM records in workspace %s",
            matched,
            len(unprocessed),
            workspace_id,
        )
        return matched

    # ------------------------------------------------------------------
    # Summary / analytics
    # ------------------------------------------------------------------

    async def get_summary(self, workspace_id: str) -> dict[str, Any]:
        """Return an analytics summary of intent signals for the workspace."""
        base = IntentSignal.workspace_id == workspace_id

        total_signals = await self.db.scalar(
            select(func.count(IntentSignal.id)).where(base)
        ) or 0

        unprocessed_count = await self.db.scalar(
            select(func.count(IntentSignal.id)).where(and_(
                base,
                IntentSignal.is_processed == False,  # noqa: E712
            ))
        ) or 0

        # By type
        type_rows = (
            await self.db.execute(
                select(IntentSignal.signal_type, func.count(IntentSignal.id))
                .where(base)
                .group_by(IntentSignal.signal_type)
            )
        ).all()
        by_type = {row[0]: row[1] for row in type_rows}

        # By strength
        strength_rows = (
            await self.db.execute(
                select(IntentSignal.intent_strength, func.count(IntentSignal.id))
                .where(base)
                .group_by(IntentSignal.intent_strength)
            )
        ).all()
        by_strength = {row[0]: row[1] for row in strength_rows}

        # Top companies by signal count
        company_rows = (
            await self.db.execute(
                select(IntentSignal.company_name, func.count(IntentSignal.id).label("cnt"))
                .where(and_(base, IntentSignal.company_name.isnot(None)))
                .group_by(IntentSignal.company_name)
                .order_by(func.count(IntentSignal.id).desc())
                .limit(10)
            )
        ).all()
        top_companies = [{"company": row[0], "signal_count": row[1]} for row in company_rows]

        return {
            "total_signals": total_signals,
            "unprocessed_count": unprocessed_count,
            "by_type": by_type,
            "by_strength": by_strength,
            "top_companies": top_companies,
        }
