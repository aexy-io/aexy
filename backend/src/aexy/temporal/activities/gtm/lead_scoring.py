"""Lead scoring and visitor identification activities.

Activities:
    - identify_visitor_session: Call Snitcher to identify a visitor by IP
    - process_visitor_events: Aggregate events into sessions, trigger identification
    - verify_email_address: Call MillionVerifier to verify an email
    - score_lead: Score a single lead against ICP template
    - batch_score_leads: Score multiple leads in batch
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


# =============================================================================
# INPUT DATACLASSES
# =============================================================================

@dataclass
class IdentifyVisitorSessionInput:
    workspace_id: str
    session_id: str


@dataclass
class ProcessVisitorEventsInput:
    workspace_id: str
    anonymous_id: str
    event_count: int = 0


@dataclass
class VerifyEmailInput:
    workspace_id: str
    email: str
    record_id: str | None = None


@dataclass
class ScoreLeadInput:
    workspace_id: str
    record_id: str
    icp_template_id: str | None = None


@dataclass
class BatchScoreLeadsInput:
    workspace_id: str
    record_ids: list[str] = field(default_factory=list)
    icp_template_id: str | None = None


# =============================================================================
# ACTIVITIES
# =============================================================================

@activity.defn
async def identify_visitor_session(input: IdentifyVisitorSessionInput) -> dict:
    """Identify a visitor session via Snitcher (or configured provider).

    Calls the visitor_identification provider to resolve IP to company,
    stores the result, and triggers identity resolution.
    """
    from sqlalchemy import select, and_

    from aexy.integrations.registry import ProviderRegistry
    from aexy.integrations.providers.visitor_identification import SnitcherProvider  # noqa: F401
    from aexy.models.gtm import VisitorSession, VisitorIdentification
    from aexy.services.identity_resolution_service import IdentityResolutionService

    async with async_session_maker() as db:
        # Get the session
        session = (await db.execute(
            select(VisitorSession).where(
                and_(
                    VisitorSession.workspace_id == input.workspace_id,
                    VisitorSession.id == input.session_id,
                )
            )
        )).scalar_one_or_none()

        if not session or not session.ip_address:
            return {"success": False, "reason": "No session or IP"}

        # Get the identification provider
        provider = await ProviderRegistry.get_provider(
            db, input.workspace_id, "visitor_identification",
        )
        if not provider:
            return {"success": False, "reason": "No visitor_identification provider configured"}

        # Call the provider
        result = await provider.identify(str(session.ip_address))

        # Store the identification
        identification = VisitorIdentification(
            id=str(uuid4()),
            workspace_id=input.workspace_id,
            session_id=input.session_id,
            ip_address=str(session.ip_address),
            provider_name=provider.NAME if hasattr(provider, 'NAME') else "unknown",
            company_name=result.company_name,
            company_domain=result.company_domain,
            industry=result.industry,
            employee_range=result.employee_range,
            revenue_range=result.revenue_range,
            company_type=result.company_type,
            headquarters_location=result.headquarters_location,
            confidence=result.confidence,
            raw_response=result.raw_response,
        )
        db.add(identification)

        # Update session with identification
        if result.success and result.company_name:
            session.identification_status = "company_identified"
            session.identified_company = result.company_name
            session.identified_domain = result.company_domain

            # Attempt identity resolution via company domain match
            if result.company_domain:
                resolver = IdentityResolutionService(db)
                record_id = await resolver.resolve_by_company_match(
                    input.workspace_id, input.session_id, result.company_domain,
                )
                if record_id:
                    identification.matched_record_id = record_id

        await db.commit()

    return {
        "success": result.success,
        "company_name": result.company_name,
        "company_domain": result.company_domain,
        "confidence": result.confidence,
    }


@activity.defn
async def process_visitor_events(input: ProcessVisitorEventsInput) -> dict:
    """Aggregate behavioral events into sessions and trigger identification.

    Called after event ingestion to:
    1. Find or create a visitor session for the anonymous_id
    2. Update session metrics (page count, duration, etc.)
    3. Link events to session
    4. Trigger Snitcher identification for new IPs
    """
    from sqlalchemy import select, and_, func, update

    from aexy.models.gtm import BehavioralEvent, VisitorSession

    async with async_session_maker() as db:
        # Get recent events for this anonymous_id (unlinked to a session)
        events = (await db.execute(
            select(BehavioralEvent)
            .where(
                and_(
                    BehavioralEvent.workspace_id == input.workspace_id,
                    BehavioralEvent.anonymous_id == input.anonymous_id,
                    BehavioralEvent.session_id.is_(None),
                )
            )
            .order_by(BehavioralEvent.occurred_at.asc())
        )).scalars().all()

        if not events:
            return {"success": True, "new_session": False, "events_processed": 0}

        # Find or create session (30-min inactivity = new session)
        session_gap = timedelta(minutes=30)
        latest_session = (await db.execute(
            select(VisitorSession)
            .where(
                and_(
                    VisitorSession.workspace_id == input.workspace_id,
                    VisitorSession.anonymous_id == input.anonymous_id,
                )
            )
            .order_by(VisitorSession.last_activity_at.desc())
            .limit(1)
        )).scalar_one_or_none()

        now = datetime.now(timezone.utc)
        first_event = events[0]
        new_session = False

        if (
            not latest_session
            or (first_event.occurred_at - latest_session.last_activity_at) > session_gap
        ):
            # Create new session
            session = VisitorSession(
                id=str(uuid4()),
                workspace_id=input.workspace_id,
                anonymous_id=input.anonymous_id,
                ip_address=first_event.ip_address,
                user_agent=first_event.user_agent,
                first_page_url=first_event.page_url,
                entry_referrer=first_event.referrer,
                utm_source=first_event.utm_source,
                utm_medium=first_event.utm_medium,
                utm_campaign=first_event.utm_campaign,
                started_at=first_event.occurred_at,
                last_activity_at=first_event.occurred_at,
            )
            db.add(session)
            await db.flush()
            new_session = True
        else:
            session = latest_session

        # Update session metrics
        page_views = sum(1 for e in events if e.event_type == "page_view")
        session.page_count = (session.page_count or 0) + page_views
        session.event_count = (session.event_count or 0) + len(events)
        session.last_page_url = events[-1].page_url
        session.last_activity_at = events[-1].occurred_at

        # Calculate duration
        if session.started_at and events[-1].occurred_at:
            duration = (events[-1].occurred_at - session.started_at).total_seconds()
            session.duration_seconds = max(int(duration), session.duration_seconds or 0)

        # Update max scroll depth
        for e in events:
            if e.properties and e.properties.get("scroll_depth"):
                depth = int(e.properties["scroll_depth"])
                session.max_scroll_depth = max(session.max_scroll_depth or 0, depth)

        # Link events to session
        event_ids = [e.id for e in events]
        await db.execute(
            update(BehavioralEvent)
            .where(BehavioralEvent.id.in_(event_ids))
            .values(session_id=session.id)
        )

        await db.commit()

        # Trigger identification for new sessions with IPs
        if new_session and session.ip_address:
            try:
                from aexy.temporal.dispatch import dispatch
                from aexy.temporal.task_queues import TaskQueue

                await dispatch(
                    "identify_visitor_session",
                    IdentifyVisitorSessionInput(
                        workspace_id=input.workspace_id,
                        session_id=str(session.id),
                    ),
                    task_queue=TaskQueue.INTEGRATIONS,
                )
            except Exception:
                logger.exception("Failed to dispatch identification")

    return {
        "success": True,
        "new_session": new_session,
        "session_id": str(session.id),
        "events_processed": len(events),
    }


@activity.defn
async def verify_email_address(input: VerifyEmailInput) -> dict:
    """Verify an email address via MillionVerifier (or configured provider)."""
    from aexy.integrations.registry import ProviderRegistry
    from aexy.integrations.providers.email_verification import MillionVerifierProvider  # noqa: F401

    async with async_session_maker() as db:
        provider = await ProviderRegistry.get_provider(
            db, input.workspace_id, "email_verification",
        )
        if not provider:
            return {"success": False, "reason": "No email_verification provider configured"}

        result = await provider.verify(input.email)

        return {
            "email": result.email,
            "is_valid": result.is_valid,
            "result_code": result.result_code,
            "quality_score": result.quality_score,
            "is_disposable": result.is_disposable,
            "is_role_based": result.is_role_based,
            "error": result.error,
        }


@activity.defn
async def score_lead(input: ScoreLeadInput) -> dict:
    """Score a single lead against ICP template (deterministic, not LLM).

    Scoring breakdown:
    - Firmographic: 0-40 (company size, industry, location match)
    - Behavioral: 0-35 (page views, session duration, scroll depth)
    - Engagement: 0-25 (email opens, form submissions, return visits)
    """
    from sqlalchemy import select, and_, func

    from aexy.models.gtm import (
        ICPTemplate,
        LeadScore,
        VisitorSession,
        BehavioralEvent,
        VisitorIdentification,
    )

    async with async_session_maker() as db:
        # Get ICP template (use default if not specified)
        if input.icp_template_id:
            template = (await db.execute(
                select(ICPTemplate).where(ICPTemplate.id == input.icp_template_id)
            )).scalar_one_or_none()
        else:
            template = (await db.execute(
                select(ICPTemplate).where(
                    and_(
                        ICPTemplate.workspace_id == input.workspace_id,
                        ICPTemplate.is_default == True,
                    )
                )
            )).scalar_one_or_none()

        # Calculate firmographic score (0-40)
        firmo_score = 0
        firmo_factors = {}

        # Get identification data for this record
        sessions = (await db.execute(
            select(VisitorSession).where(
                and_(
                    VisitorSession.workspace_id == input.workspace_id,
                    VisitorSession.record_id == input.record_id,
                )
            )
        )).scalars().all()

        # Get identifications
        session_ids = [s.id for s in sessions]
        identifications = []
        if session_ids:
            identifications = (await db.execute(
                select(VisitorIdentification).where(
                    VisitorIdentification.session_id.in_(session_ids)
                )
            )).scalars().all()

        if identifications:
            best_ident = max(identifications, key=lambda i: i.confidence)
            # Industry match
            if template and best_ident.industry:
                target_industries = template.target_industries or []
                if best_ident.industry.lower() in [i.lower() for i in target_industries]:
                    firmo_score += 15
                    firmo_factors["industry_match"] = True
                elif target_industries:
                    firmo_score += 5  # partial credit for having data
                    firmo_factors["industry_match"] = False

            # Company size match
            if template and best_ident.employee_range:
                target_ranges = template.target_employee_ranges or []
                if best_ident.employee_range in target_ranges:
                    firmo_score += 15
                    firmo_factors["size_match"] = True
                elif target_ranges:
                    firmo_score += 5
                    firmo_factors["size_match"] = False

            # Has domain (basic data quality)
            if best_ident.company_domain:
                firmo_score += 10
                firmo_factors["has_domain"] = True

        # Calculate behavioral score (0-35)
        behav_score = 0
        behav_factors = {}

        total_page_views = sum(s.page_count for s in sessions)
        total_duration = sum(s.duration_seconds for s in sessions)
        max_scroll = max((s.max_scroll_depth for s in sessions), default=0)

        # Page view scoring (up to 15 points)
        if total_page_views >= 10:
            behav_score += 15
        elif total_page_views >= 5:
            behav_score += 10
        elif total_page_views >= 2:
            behav_score += 5
        behav_factors["page_views"] = total_page_views

        # Duration scoring (up to 10 points)
        if total_duration >= 300:  # 5+ minutes
            behav_score += 10
        elif total_duration >= 120:  # 2+ minutes
            behav_score += 7
        elif total_duration >= 30:
            behav_score += 3
        behav_factors["duration_seconds"] = total_duration

        # Scroll depth scoring (up to 10 points)
        if max_scroll >= 80:
            behav_score += 10
        elif max_scroll >= 50:
            behav_score += 7
        elif max_scroll >= 25:
            behav_score += 3
        behav_factors["max_scroll_depth"] = max_scroll

        # Calculate engagement score (0-25)
        engage_score = 0
        engage_factors = {}

        # Return visits
        if len(sessions) >= 3:
            engage_score += 15
        elif len(sessions) >= 2:
            engage_score += 10
        elif len(sessions) >= 1:
            engage_score += 5
        engage_factors["session_count"] = len(sessions)

        # Form submissions
        form_count = 0
        if session_ids:
            form_result = await db.execute(
                select(func.count(BehavioralEvent.id)).where(
                    and_(
                        BehavioralEvent.workspace_id == input.workspace_id,
                        BehavioralEvent.record_id == input.record_id,
                        BehavioralEvent.event_type == "form_submit",
                    )
                )
            )
            form_count = form_result.scalar() or 0
        if form_count > 0:
            engage_score += 10
        engage_factors["form_submissions"] = form_count

        total_score = min(firmo_score + behav_score + engage_score, 100)

        # Determine lifecycle stage
        if total_score >= (template.sql_threshold if template else 70):
            lifecycle = "sql"
        elif total_score >= (template.mql_threshold if template else 40):
            lifecycle = "mql"
        elif total_score > 0:
            lifecycle = "lead"
        elif sessions:
            lifecycle = "known"
        else:
            lifecycle = "anonymous"

        # Upsert lead score
        existing = (await db.execute(
            select(LeadScore).where(
                and_(
                    LeadScore.workspace_id == input.workspace_id,
                    LeadScore.record_id == input.record_id,
                    LeadScore.icp_template_id == (input.icp_template_id or (template.id if template else None)),
                )
            )
        )).scalar_one_or_none()

        now = datetime.now(timezone.utc)

        if existing:
            # Append to history
            history = list(existing.score_history or [])
            history.append({
                "date": now.isoformat(),
                "total": total_score,
                "previous": existing.total_score,
                "reason": "Rescored",
            })
            # Keep last 50 entries
            history = history[-50:]

            existing.total_score = total_score
            existing.firmographic_score = firmo_score
            existing.behavioral_score = behav_score
            existing.engagement_score = engage_score
            existing.lifecycle_stage = lifecycle
            existing.score_history = history
            existing.scoring_factors = {
                "firmographic": firmo_factors,
                "behavioral": behav_factors,
                "engagement": engage_factors,
            }
            existing.last_scored_at = now
        else:
            lead_score = LeadScore(
                id=str(uuid4()),
                workspace_id=input.workspace_id,
                record_id=input.record_id,
                icp_template_id=input.icp_template_id or (template.id if template else None),
                total_score=total_score,
                firmographic_score=firmo_score,
                behavioral_score=behav_score,
                engagement_score=engage_score,
                lifecycle_stage=lifecycle,
                score_history=[{
                    "date": now.isoformat(),
                    "total": total_score,
                    "reason": "Initial score",
                }],
                scoring_factors={
                    "firmographic": firmo_factors,
                    "behavioral": behav_factors,
                    "engagement": engage_factors,
                },
                last_scored_at=now,
            )
            db.add(lead_score)

        await db.commit()

    return {
        "record_id": input.record_id,
        "total_score": total_score,
        "firmographic": firmo_score,
        "behavioral": behav_score,
        "engagement": engage_score,
        "lifecycle_stage": lifecycle,
    }


@activity.defn
async def batch_score_leads(input: BatchScoreLeadsInput) -> dict:
    """Score multiple leads in batch."""
    results = []
    for i, record_id in enumerate(input.record_ids):
        result = await score_lead(ScoreLeadInput(
            workspace_id=input.workspace_id,
            record_id=record_id,
            icp_template_id=input.icp_template_id,
        ))
        results.append(result)
        # Send heartbeat every 10 records so Temporal doesn't cancel the activity
        if (i + 1) % 10 == 0:
            activity.heartbeat(f"Scored {i + 1}/{len(input.record_ids)} leads")

    return {
        "scored": len(results),
        "results": results,
    }
