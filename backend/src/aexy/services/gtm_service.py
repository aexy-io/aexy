"""GTM service — provider config CRUD, dashboard aggregation, ICP CRUD."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select, and_, func, delete, update, case
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.encryption import encrypt_credentials, decrypt_credentials
from aexy.integrations.registry import ProviderRegistry
from aexy.models.gtm import (
    GTMProviderConfig,
    BehavioralEvent,
    VisitorSession,
    VisitorIdentification,
    ICPTemplate,
    LeadScore,
)

logger = logging.getLogger(__name__)


class GTMProviderService:
    """CRUD for GTM provider configurations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_providers(
        self, workspace_id: str, slot: str | None = None,
    ) -> list[GTMProviderConfig]:
        """List configured providers for a workspace."""
        query = select(GTMProviderConfig).where(
            GTMProviderConfig.workspace_id == workspace_id
        ).order_by(GTMProviderConfig.slot, GTMProviderConfig.provider_name)

        if slot:
            query = query.where(GTMProviderConfig.slot == slot)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_provider(
        self, workspace_id: str, slot: str, provider_name: str,
    ) -> GTMProviderConfig | None:
        """Get a specific provider config."""
        result = await self.db.execute(
            select(GTMProviderConfig).where(
                and_(
                    GTMProviderConfig.workspace_id == workspace_id,
                    GTMProviderConfig.slot == slot,
                    GTMProviderConfig.provider_name == provider_name,
                )
            )
        )
        return result.scalar_one_or_none()

    async def create_provider(
        self, workspace_id: str, data: dict[str, Any],
    ) -> GTMProviderConfig:
        """Create a new provider configuration."""
        # Encrypt credentials
        credentials = data.pop("credentials", {})
        encrypted = encrypt_credentials(credentials) if credentials else {}

        # Look up provider class for metadata
        klass = ProviderRegistry.get_class(data["slot"], data["provider_name"])

        # If credentials were provided, mark as active immediately
        initial_status = "active" if credentials else "pending_setup"

        config = GTMProviderConfig(
            id=str(uuid4()),
            workspace_id=workspace_id,
            credentials=encrypted,
            monthly_cost_cents=klass.MONTHLY_COST_CENTS if klass else 0,
            status=initial_status,
            **data,
        )

        # If setting as default, unset other defaults in same slot
        if data.get("is_default"):
            await self._clear_slot_default(workspace_id, data["slot"])

        self.db.add(config)
        await self.db.flush()
        return config

    async def update_provider(
        self, workspace_id: str, slot: str, provider_name: str, data: dict[str, Any],
    ) -> GTMProviderConfig | None:
        """Update an existing provider configuration."""
        config = await self.get_provider(workspace_id, slot, provider_name)
        if not config:
            return None

        # Handle credentials update
        if "credentials" in data and data["credentials"] is not None:
            config.credentials = encrypt_credentials(data.pop("credentials"))
            # Mark as active when credentials are (re-)provided
            if config.status in ("pending_setup", "error"):
                config.status = "active"
                config.last_error = None

        # Handle default toggle
        if data.get("is_default"):
            await self._clear_slot_default(workspace_id, slot)

        _PROVIDER_UPDATABLE = {
            "display_name", "config", "is_default", "status", "last_error",
        }
        for key, value in data.items():
            if value is not None and key in _PROVIDER_UPDATABLE:
                setattr(config, key, value)

        config.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return config

    async def delete_provider(
        self, workspace_id: str, slot: str, provider_name: str,
    ) -> bool:
        """Delete a provider configuration."""
        result = await self.db.execute(
            delete(GTMProviderConfig).where(
                and_(
                    GTMProviderConfig.workspace_id == workspace_id,
                    GTMProviderConfig.slot == slot,
                    GTMProviderConfig.provider_name == provider_name,
                )
            )
        )
        return result.rowcount > 0

    async def test_provider(
        self, workspace_id: str, slot: str, provider_name: str,
    ) -> dict[str, Any]:
        """Test a provider's connection."""
        config = await self.get_provider(workspace_id, slot, provider_name)
        if not config:
            return {"success": False, "message": "Provider not found"}

        provider = await ProviderRegistry.get_provider(
            self.db, workspace_id, slot, provider_name,
        )
        if not provider:
            return {"success": False, "message": "Provider class not registered"}

        result = await provider.test_connection()

        # Update status based on test
        config.last_tested_at = datetime.now(timezone.utc)
        if result.get("success"):
            config.status = "active"
            config.last_error = None
        else:
            config.status = "error"
            config.last_error = result.get("message", "Unknown error")

        await self.db.flush()
        return result

    async def set_default(
        self, workspace_id: str, slot: str, provider_name: str,
    ) -> bool:
        """Set a provider as default for a slot."""
        config = await self.get_provider(workspace_id, slot, provider_name)
        if not config:
            return False

        await self._clear_slot_default(workspace_id, slot)
        config.is_default = True
        await self.db.flush()
        return True

    async def _clear_slot_default(self, workspace_id: str, slot: str) -> None:
        """Clear the default flag for all providers in a slot."""
        await self.db.execute(
            update(GTMProviderConfig)
            .where(
                and_(
                    GTMProviderConfig.workspace_id == workspace_id,
                    GTMProviderConfig.slot == slot,
                    GTMProviderConfig.is_default == True,
                )
            )
            .values(is_default=False)
        )


class GTMDashboardService:
    """Dashboard aggregation for GTM module."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_overview(
        self, workspace_id: str, days: int = 30,
    ) -> dict[str, Any]:
        """Get dashboard overview KPIs."""
        now = datetime.now(timezone.utc)
        period_start = now - timedelta(days=days)
        prev_start = period_start - timedelta(days=days)

        # Current period counts
        visitors_q = select(func.count(VisitorSession.id)).where(
            and_(
                VisitorSession.workspace_id == workspace_id,
                VisitorSession.started_at >= period_start,
            )
        )
        companies_q = select(func.count(VisitorSession.id)).where(
            and_(
                VisitorSession.workspace_id == workspace_id,
                VisitorSession.started_at >= period_start,
                VisitorSession.identification_status != "anonymous",
            )
        )
        leads_q = select(func.count(LeadScore.id)).where(
            and_(
                LeadScore.workspace_id == workspace_id,
                LeadScore.created_at >= period_start,
                LeadScore.lifecycle_stage.in_(["lead", "mql", "sql"]),
            )
        )

        # Previous period for comparison
        prev_visitors_q = select(func.count(VisitorSession.id)).where(
            and_(
                VisitorSession.workspace_id == workspace_id,
                VisitorSession.started_at >= prev_start,
                VisitorSession.started_at < period_start,
            )
        )
        prev_companies_q = select(func.count(VisitorSession.id)).where(
            and_(
                VisitorSession.workspace_id == workspace_id,
                VisitorSession.started_at >= prev_start,
                VisitorSession.started_at < period_start,
                VisitorSession.identification_status != "anonymous",
            )
        )

        results = await self.db.execute(visitors_q)
        total_visitors = results.scalar() or 0
        results = await self.db.execute(companies_q)
        identified_companies = results.scalar() or 0
        results = await self.db.execute(leads_q)
        new_leads = results.scalar() or 0
        results = await self.db.execute(prev_visitors_q)
        prev_visitors = results.scalar() or 0
        results = await self.db.execute(prev_companies_q)
        prev_companies = results.scalar() or 0

        def pct_change(current: int, previous: int) -> float:
            if previous == 0:
                return 100.0 if current > 0 else 0.0
            return round(((current - previous) / previous) * 100, 1)

        return {
            "total_visitors": total_visitors,
            "identified_companies": identified_companies,
            "new_leads": new_leads,
            "active_sequences": 0,  # Phase 4
            "visitors_change_pct": pct_change(total_visitors, prev_visitors),
            "companies_change_pct": pct_change(identified_companies, prev_companies),
            "leads_change_pct": 0.0,
        }

    async def get_funnel(self, workspace_id: str) -> list[dict[str, Any]]:
        """Get funnel stage data."""
        # Count leads by lifecycle stage
        stages = ["anonymous", "known", "lead", "mql", "sql", "opportunity", "customer"]
        stage_counts = {}

        for stage in stages:
            if stage == "anonymous":
                # Count anonymous sessions
                q = select(func.count(VisitorSession.id)).where(
                    and_(
                        VisitorSession.workspace_id == workspace_id,
                        VisitorSession.identification_status == "anonymous",
                    )
                )
            else:
                q = select(func.count(LeadScore.id)).where(
                    and_(
                        LeadScore.workspace_id == workspace_id,
                        LeadScore.lifecycle_stage == stage,
                    )
                )
            result = await self.db.execute(q)
            stage_counts[stage] = result.scalar() or 0

        funnel = []
        prev_count = None
        for stage in stages:
            count = stage_counts[stage]
            rate = 0.0
            if prev_count and prev_count > 0:
                rate = round((count / prev_count) * 100, 1)
            funnel.append({
                "stage": stage,
                "count": count,
                "conversion_rate": rate,
            })
            prev_count = count

        return funnel

    async def get_recent_visitors(
        self, workspace_id: str, limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Get recent identified visitors."""
        query = (
            select(VisitorSession)
            .where(
                and_(
                    VisitorSession.workspace_id == workspace_id,
                    VisitorSession.identification_status != "anonymous",
                )
            )
            .order_by(VisitorSession.started_at.desc())
            .limit(limit)
        )
        result = await self.db.execute(query)
        sessions = result.scalars().all()

        return [
            {
                "session_id": str(s.id),
                "company_name": s.identified_company,
                "company_domain": s.identified_domain,
                "page_count": s.page_count,
                "duration_seconds": s.duration_seconds,
                "identification_status": s.identification_status,
                "utm_source": s.utm_source,
                "country_code": s.country_code,
                "started_at": s.started_at.isoformat() if s.started_at else None,
            }
            for s in sessions
        ]


class ICPTemplateService:
    """CRUD for ICP templates."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_templates(self, workspace_id: str) -> list[ICPTemplate]:
        """List all ICP templates for a workspace."""
        result = await self.db.execute(
            select(ICPTemplate)
            .where(ICPTemplate.workspace_id == workspace_id)
            .order_by(ICPTemplate.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_template(self, workspace_id: str, template_id: str) -> ICPTemplate | None:
        result = await self.db.execute(
            select(ICPTemplate).where(
                and_(
                    ICPTemplate.workspace_id == workspace_id,
                    ICPTemplate.id == template_id,
                )
            )
        )
        return result.scalar_one_or_none()

    async def create_template(
        self, workspace_id: str, data: dict[str, Any], created_by: str | None = None,
    ) -> ICPTemplate:
        # If setting as default, clear others
        if data.get("is_default"):
            await self._clear_default(workspace_id)

        # Convert criteria from Pydantic model if needed
        criteria = data.pop("criteria", {})
        if hasattr(criteria, "model_dump"):
            criteria = criteria.model_dump()

        template = ICPTemplate(
            id=str(uuid4()),
            workspace_id=workspace_id,
            criteria=criteria,
            created_by=created_by,
            **data,
        )
        self.db.add(template)
        await self.db.flush()
        return template

    async def update_template(
        self, workspace_id: str, template_id: str, data: dict[str, Any],
    ) -> ICPTemplate | None:
        template = await self.get_template(workspace_id, template_id)
        if not template:
            return None

        if data.get("is_default"):
            await self._clear_default(workspace_id)

        _TEMPLATE_UPDATABLE = {
            "name", "description", "is_default", "criteria", "weights",
        }
        for key, value in data.items():
            if value is not None and key in _TEMPLATE_UPDATABLE:
                if key == "criteria" and hasattr(value, "model_dump"):
                    value = value.model_dump()
                setattr(template, key, value)

        template.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return template

    async def delete_template(self, workspace_id: str, template_id: str) -> bool:
        result = await self.db.execute(
            delete(ICPTemplate).where(
                and_(
                    ICPTemplate.workspace_id == workspace_id,
                    ICPTemplate.id == template_id,
                )
            )
        )
        return result.rowcount > 0

    async def _clear_default(self, workspace_id: str) -> None:
        await self.db.execute(
            update(ICPTemplate)
            .where(
                and_(
                    ICPTemplate.workspace_id == workspace_id,
                    ICPTemplate.is_default == True,
                )
            )
            .values(is_default=False)
        )


class GTMScoringService:
    """Aggregation for lead scoring data."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_scoring_overview(
        self, workspace_id: str,
    ) -> dict[str, Any]:
        """Get scoring overview for dashboard.

        Returns:
            total_scored, avg_score, score_distribution, lifecycle_breakdown, top_leads
        """
        # Total scored records
        total_q = select(func.count(LeadScore.id)).where(
            LeadScore.workspace_id == workspace_id,
        )
        total_scored = (await self.db.execute(total_q)).scalar() or 0

        # Average score
        avg_q = select(func.avg(LeadScore.total_score)).where(
            LeadScore.workspace_id == workspace_id,
        )
        avg_score = (await self.db.execute(avg_q)).scalar() or 0.0

        # Score distribution (0-20, 21-40, 41-60, 61-80, 81-100)
        buckets = [
            ("0-20", 0, 20),
            ("21-40", 21, 40),
            ("41-60", 41, 60),
            ("61-80", 61, 80),
            ("81-100", 81, 100),
        ]
        score_distribution = []
        for label, lo, hi in buckets:
            cnt_q = select(func.count(LeadScore.id)).where(
                and_(
                    LeadScore.workspace_id == workspace_id,
                    LeadScore.total_score >= lo,
                    LeadScore.total_score <= hi,
                )
            )
            cnt = (await self.db.execute(cnt_q)).scalar() or 0
            score_distribution.append({"range": label, "count": cnt})

        # Lifecycle breakdown
        lifecycle_q = (
            select(
                LeadScore.lifecycle_stage,
                func.count(LeadScore.id).label("cnt"),
            )
            .where(LeadScore.workspace_id == workspace_id)
            .group_by(LeadScore.lifecycle_stage)
        )
        lifecycle_result = await self.db.execute(lifecycle_q)
        lifecycle_breakdown = [
            {"stage": row.lifecycle_stage, "count": row.cnt}
            for row in lifecycle_result
        ]

        # Top leads (top 10 by score)
        top_q = (
            select(LeadScore)
            .where(LeadScore.workspace_id == workspace_id)
            .order_by(LeadScore.total_score.desc())
            .limit(10)
        )
        top_result = await self.db.execute(top_q)
        top_leads = [
            {
                "record_id": str(ls.record_id),
                "total_score": ls.total_score,
                "firmographic_score": ls.firmographic_score,
                "behavioral_score": ls.behavioral_score,
                "engagement_score": ls.engagement_score,
                "lifecycle_stage": ls.lifecycle_stage,
                "last_scored_at": ls.last_scored_at.isoformat() if ls.last_scored_at else None,
            }
            for ls in top_result.scalars()
        ]

        return {
            "total_scored": total_scored,
            "avg_score": round(float(avg_score), 2),
            "score_distribution": score_distribution,
            "lifecycle_breakdown": lifecycle_breakdown,
            "top_leads": top_leads,
        }

    async def list_scores(
        self,
        workspace_id: str,
        page: int = 1,
        per_page: int = 25,
        min_score: int | None = None,
        max_score: int | None = None,
        lifecycle_stage: str | None = None,
        sort_by: str = "total_score",
        sort_dir: str = "desc",
    ) -> tuple[list[dict[str, Any]], int]:
        """List lead scores with filters and pagination."""
        query = select(LeadScore).where(
            LeadScore.workspace_id == workspace_id,
        )

        if min_score is not None:
            query = query.where(LeadScore.total_score >= min_score)
        if max_score is not None:
            query = query.where(LeadScore.total_score <= max_score)
        if lifecycle_stage:
            query = query.where(LeadScore.lifecycle_stage == lifecycle_stage)

        # Count total before pagination
        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar() or 0

        # Sort
        sort_col_map = {
            "total_score": LeadScore.total_score,
            "firmographic_score": LeadScore.firmographic_score,
            "behavioral_score": LeadScore.behavioral_score,
            "engagement_score": LeadScore.engagement_score,
            "last_scored_at": LeadScore.last_scored_at,
            "created_at": LeadScore.created_at,
        }
        sort_col = sort_col_map.get(sort_by, LeadScore.total_score)
        if sort_dir == "asc":
            query = query.order_by(sort_col.asc())
        else:
            query = query.order_by(sort_col.desc())

        # Paginate
        query = query.offset((page - 1) * per_page).limit(per_page)

        result = await self.db.execute(query)
        leads = [
            {
                "record_id": str(ls.record_id),
                "total_score": ls.total_score,
                "firmographic_score": ls.firmographic_score,
                "behavioral_score": ls.behavioral_score,
                "engagement_score": ls.engagement_score,
                "lifecycle_stage": ls.lifecycle_stage,
                "last_scored_at": ls.last_scored_at.isoformat() if ls.last_scored_at else None,
            }
            for ls in result.scalars()
        ]
        return leads, total

    async def get_score_detail(
        self, workspace_id: str, record_id: str,
    ) -> dict[str, Any] | None:
        """Get detailed score for a single record including history."""
        query = select(LeadScore).where(
            and_(
                LeadScore.workspace_id == workspace_id,
                LeadScore.record_id == record_id,
            )
        )
        result = await self.db.execute(query)
        ls = result.scalar_one_or_none()
        if not ls:
            return None

        return {
            "record_id": str(ls.record_id),
            "icp_template_id": str(ls.icp_template_id) if ls.icp_template_id else None,
            "total_score": ls.total_score,
            "firmographic_score": ls.firmographic_score,
            "behavioral_score": ls.behavioral_score,
            "engagement_score": ls.engagement_score,
            "lifecycle_stage": ls.lifecycle_stage,
            "scoring_factors": ls.scoring_factors,
            "score_history": ls.score_history,
            "last_scored_at": ls.last_scored_at.isoformat() if ls.last_scored_at else None,
            "created_at": ls.created_at.isoformat() if ls.created_at else None,
            "updated_at": ls.updated_at.isoformat() if ls.updated_at else None,
        }


class VisitorService:
    """Service for visitor sessions and events."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_sessions(
        self,
        workspace_id: str,
        page: int = 1,
        page_size: int = 25,
        status: str | None = None,
        utm_source: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> tuple[list[VisitorSession], int]:
        """List visitor sessions with filters."""
        query = select(VisitorSession).where(
            VisitorSession.workspace_id == workspace_id
        )

        if status:
            query = query.where(VisitorSession.identification_status == status)
        if utm_source:
            query = query.where(VisitorSession.utm_source == utm_source)
        if date_from:
            query = query.where(VisitorSession.started_at >= date_from)
        if date_to:
            query = query.where(VisitorSession.started_at <= date_to)

        # Count total
        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar() or 0

        # Paginate
        query = query.order_by(VisitorSession.started_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        sessions = list(result.scalars().all())

        return sessions, total

    async def get_session_detail(
        self, workspace_id: str, session_id: str,
    ) -> tuple[VisitorSession | None, list[BehavioralEvent], VisitorIdentification | None]:
        """Get session detail with events and identification."""
        # Session
        session = (await self.db.execute(
            select(VisitorSession).where(
                and_(
                    VisitorSession.workspace_id == workspace_id,
                    VisitorSession.id == session_id,
                )
            )
        )).scalar_one_or_none()

        if not session:
            return None, [], None

        # Events
        events_result = await self.db.execute(
            select(BehavioralEvent)
            .where(BehavioralEvent.session_id == session_id)
            .order_by(BehavioralEvent.occurred_at.asc())
        )
        events = list(events_result.scalars().all())

        # Identification
        ident = (await self.db.execute(
            select(VisitorIdentification).where(
                VisitorIdentification.session_id == session_id,
            ).order_by(VisitorIdentification.created_at.desc()).limit(1)
        )).scalar_one_or_none()

        return session, events, ident

    async def link_session_to_record(
        self, workspace_id: str, session_id: str, record_id: str,
    ) -> bool:
        """Link a visitor session (and all its events) to a CRM record."""
        session = (await self.db.execute(
            select(VisitorSession).where(
                and_(
                    VisitorSession.workspace_id == workspace_id,
                    VisitorSession.id == session_id,
                )
            )
        )).scalar_one_or_none()

        if not session:
            return False

        session.record_id = record_id
        session.identification_status = "contact_identified"

        # Update all events for this anonymous_id
        await self.db.execute(
            update(BehavioralEvent)
            .where(
                and_(
                    BehavioralEvent.workspace_id == workspace_id,
                    BehavioralEvent.anonymous_id == session.anonymous_id,
                )
            )
            .values(record_id=record_id)
        )

        await self.db.flush()
        return True
