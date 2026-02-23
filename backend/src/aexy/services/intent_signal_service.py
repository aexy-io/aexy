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
        """Placeholder: scrape job postings for monitored domains.

        Real implementation would fetch careers pages / job board APIs
        for domains in the config and create signals.  Returns 0 for now.
        """
        config = await self.get_config(workspace_id)
        if not config or not config.monitored_domains:
            logger.info("No monitored domains configured for workspace %s", workspace_id)
            return 0

        logger.info(
            "Would collect job posting signals for %d domains in workspace %s",
            len(config.monitored_domains),
            workspace_id,
        )
        return 0

    async def collect_tech_change_signals(self, workspace_id: str) -> int:
        """Placeholder: detect technology-stack changes for monitored domains.

        Real implementation would use BuiltWith / Wappalyzer-style checks.
        Returns 0 for now.
        """
        config = await self.get_config(workspace_id)
        if not config or not config.monitored_domains:
            logger.info("No monitored domains configured for workspace %s", workspace_id)
            return 0

        logger.info(
            "Would collect tech change signals for %d domains in workspace %s",
            len(config.monitored_domains),
            workspace_id,
        )
        return 0

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
