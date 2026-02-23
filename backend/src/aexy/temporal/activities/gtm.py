"""Temporal activities for GTM (Go-To-Market) operations.

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
from typing import Any
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
    for record_id in input.record_ids:
        result = await score_lead(ScoreLeadInput(
            workspace_id=input.workspace_id,
            record_id=record_id,
            icp_template_id=input.icp_template_id,
        ))
        results.append(result)

    return {
        "scored": len(results),
        "results": results,
    }


# =============================================================================
# DEDUP ACTIVITIES
# =============================================================================

@dataclass
class BulkDedupInput:
    workspace_id: str
    limit: int = 100


@activity.defn(name="bulk_find_duplicates")
async def bulk_find_duplicates(input: BulkDedupInput) -> dict:
    """Find duplicates across workspace -- scheduled weekly."""
    from aexy.services.dedup_service import DedupService

    async with async_session_maker() as db:
        svc = DedupService(db)
        dupes = await svc.bulk_find_duplicates(input.workspace_id, limit=input.limit)
        return {"found": len(dupes), "duplicates": dupes}


# =============================================================================
# OUTREACH SEQUENCE DATACLASSES
# =============================================================================

@dataclass
class OutreachEnrollmentInput:
    enrollment_id: str
    workspace_id: str
    sequence_id: str
    steps: list  # JSONB step definitions


@dataclass
class ExecuteStepInput:
    enrollment_id: str
    workspace_id: str
    step_index: int
    channel: str
    action: str
    config: dict


@dataclass
class FinalizeEnrollmentInput:
    enrollment_id: str
    exit_reason: str  # "completed", "replied", "bounced", "unsubscribed", "exited"


# =============================================================================
# OUTREACH SEQUENCE ACTIVITIES
# =============================================================================

@activity.defn
async def execute_outreach_step(input: ExecuteStepInput) -> dict:
    """Execute a single outreach step (email, LinkedIn, SMS).

    1. Get enrollment from DB
    2. Run compliance check
    3. Dispatch via appropriate channel provider
    4. Create OutreachStepExecution record
    5. Update enrollment.current_step_index
    """
    from sqlalchemy import select, and_

    from aexy.integrations.registry import ProviderRegistry
    from aexy.models.gtm_outreach import (
        OutreachEnrollment,
        OutreachStepExecution,
        StepExecutionStatus,
    )
    from aexy.services.gtm_compliance_service import GTMComplianceService
    from aexy.services.email_campaign_service import EmailCampaignService

    async with async_session_maker() as db:
        # 1. Get enrollment
        enrollment = (await db.execute(
            select(OutreachEnrollment).where(
                and_(
                    OutreachEnrollment.id == input.enrollment_id,
                    OutreachEnrollment.workspace_id == input.workspace_id,
                )
            )
        )).scalar_one_or_none()

        if not enrollment:
            return {"success": False, "reason": "Enrollment not found"}

        # 2. Compliance check
        compliance = GTMComplianceService(db)
        permission = await compliance.check_send_permission(
            input.workspace_id, enrollment.email, enrollment.record_id,
        )
        if not permission.get("allowed"):
            # Record a skipped execution
            execution = OutreachStepExecution(
                id=str(uuid4()),
                enrollment_id=input.enrollment_id,
                workspace_id=input.workspace_id,
                step_index=input.step_index,
                channel=input.channel,
                action=input.action,
                status=StepExecutionStatus.SKIPPED.value,
                error_message=f"Compliance blocked: {permission.get('reason', 'unknown')}",
            )
            db.add(execution)
            await db.commit()
            return {
                "success": False,
                "reason": f"Compliance blocked: {permission.get('reason')}",
                "execution_id": execution.id,
            }

        # 3. Execute based on channel/action
        provider_message_id = None
        error_message = None
        status = StepExecutionStatus.SENT.value
        sent_at = datetime.now(timezone.utc)

        try:
            if input.channel == "email" and input.action == "send_email":
                config = input.config
                from_email = config.get("from_email")
                from_name = config.get("from_name")

                # Inbox rotation: if no explicit from_email, use RoutingService
                if not from_email:
                    try:
                        from aexy.services.routing_service import RoutingService
                        routing = RoutingService(db)
                        decision = await routing.route_email(
                            workspace_id=input.workspace_id,
                            recipient_email=enrollment.email,
                            pool_id=config.get("sending_pool_id"),
                        )
                        if decision:
                            from_email = decision.from_email
                            logger.info(
                                f"Inbox rotation: selected {from_email} "
                                f"(domain={decision.domain}) for {enrollment.email}"
                            )
                    except Exception as e:
                        logger.warning(f"Inbox rotation fallback: {e}")

                email_svc = EmailCampaignService(db)
                result = await email_svc.send_workflow_email(
                    workspace_id=input.workspace_id,
                    to_email=enrollment.email,
                    subject=config.get("subject", ""),
                    html_body=config.get("html_body", ""),
                    from_name=from_name,
                    from_email=from_email,
                    record_id=enrollment.record_id,
                    track_opens=config.get("track_opens", True),
                    track_clicks=config.get("track_clicks", True),
                    sending_pool_id=config.get("sending_pool_id"),
                )
                provider_message_id = result.get("message_id")
                if not result.get("success"):
                    status = StepExecutionStatus.FAILED.value
                    error_message = result.get("error", "Email send failed")

            elif input.channel == "linkedin":
                provider = await ProviderRegistry.get_provider(
                    db, input.workspace_id, "linkedin_automation",
                )
                if not provider:
                    status = StepExecutionStatus.FAILED.value
                    error_message = "No linkedin_automation provider configured"
                else:
                    config = input.config
                    if input.action == "linkedin_connect":
                        result = await provider.send_connection_request(
                            linkedin_url=config.get("profile_url", ""),
                            message=config.get("message", ""),
                        )
                    elif input.action == "linkedin_message":
                        result = await provider.send_message(
                            linkedin_url=config.get("profile_url", ""),
                            message=config.get("message", ""),
                        )
                    elif input.action == "linkedin_view":
                        result = await provider.view_profile(
                            linkedin_url=config.get("profile_url", ""),
                        )
                    else:
                        status = StepExecutionStatus.FAILED.value
                        error_message = f"Unknown LinkedIn action: {input.action}"
                        result = {}

                    if result and not result.success:
                        status = StepExecutionStatus.FAILED.value
                        error_message = result.error or "LinkedIn action failed"

            elif input.channel == "sms" and input.action == "send_sms":
                provider = await ProviderRegistry.get_provider(
                    db, input.workspace_id, "sms",
                )
                if not provider:
                    status = StepExecutionStatus.FAILED.value
                    error_message = "No sms provider configured"
                else:
                    config = input.config
                    result = await provider.send_sms(
                        to_number=config.get("phone_number", ""),
                        body=config.get("message", ""),
                    )
                    provider_message_id = result.message_id
                    if not result.success:
                        status = StepExecutionStatus.FAILED.value
                        error_message = result.error or "SMS send failed"

            else:
                status = StepExecutionStatus.FAILED.value
                error_message = f"Unknown channel/action: {input.channel}/{input.action}"

        except Exception as e:
            status = StepExecutionStatus.FAILED.value
            error_message = str(e)
            logger.exception(
                f"Error executing outreach step {input.step_index} "
                f"for enrollment {input.enrollment_id}"
            )

        # 4. Create step execution record
        execution = OutreachStepExecution(
            id=str(uuid4()),
            enrollment_id=input.enrollment_id,
            workspace_id=input.workspace_id,
            step_index=input.step_index,
            channel=input.channel,
            action=input.action,
            status=status,
            provider_message_id=provider_message_id,
            error_message=error_message,
            sent_at=sent_at if status != StepExecutionStatus.FAILED.value else None,
        )
        db.add(execution)

        # 5. Update enrollment step index
        enrollment.current_step_index = input.step_index + 1
        await db.commit()

    return {
        "success": status == StepExecutionStatus.SENT.value,
        "execution_id": execution.id,
        "status": status,
        "provider_message_id": provider_message_id,
        "error": error_message,
    }


@activity.defn
async def finalize_enrollment(input: FinalizeEnrollmentInput) -> dict:
    """Mark an enrollment as completed or exited and update sequence stats.

    Updates:
    - enrollment.status and completed_at
    - sequence denormalized counters
    """
    from sqlalchemy import select, update

    from aexy.models.gtm_outreach import (
        OutreachEnrollment,
        OutreachSequence,
        EnrollmentStatus,
    )

    async with async_session_maker() as db:
        enrollment = (await db.execute(
            select(OutreachEnrollment).where(OutreachEnrollment.id == input.enrollment_id)
        )).scalar_one_or_none()

        if not enrollment:
            return {"success": False, "reason": "Enrollment not found"}

        now = datetime.now(timezone.utc)

        # Map exit_reason to enrollment status
        status_map = {
            "completed": EnrollmentStatus.COMPLETED.value,
            "replied": EnrollmentStatus.REPLIED.value,
            "bounced": EnrollmentStatus.BOUNCED.value,
            "unsubscribed": EnrollmentStatus.UNSUBSCRIBED.value,
            "exited": EnrollmentStatus.EXITED.value,
            "failed": EnrollmentStatus.FAILED.value,
        }
        new_status = status_map.get(input.exit_reason, EnrollmentStatus.COMPLETED.value)

        enrollment.status = new_status
        enrollment.exit_reason = input.exit_reason
        enrollment.completed_at = now

        # Update sequence stats
        sequence = (await db.execute(
            select(OutreachSequence).where(OutreachSequence.id == enrollment.sequence_id)
        )).scalar_one_or_none()

        if sequence:
            # Decrement active, increment the appropriate counter
            sequence.active_count = max(0, sequence.active_count - 1)
            if input.exit_reason == "completed":
                sequence.completed_count += 1
            elif input.exit_reason == "replied":
                sequence.replied_count += 1
            elif input.exit_reason == "bounced":
                sequence.bounced_count += 1

        await db.commit()

    logger.info(
        f"Finalized enrollment {input.enrollment_id} with reason: {input.exit_reason}"
    )
    return {
        "success": True,
        "enrollment_id": input.enrollment_id,
        "status": new_status,
        "exit_reason": input.exit_reason,
    }


# =============================================================================
# WEEKLY REPORT
# =============================================================================

@dataclass
class GenerateWeeklyReportInput:
    """Input for weekly GTM report generation."""
    workspace_id: str = ""


@activity.defn(name="generate_weekly_gtm_report")
async def generate_weekly_gtm_report(input: GenerateWeeklyReportInput) -> dict:
    """Generate and email the weekly GTM report for a workspace.

    If workspace_id is empty, generates reports for all workspaces.
    """
    from aexy.core.database import async_session_maker as async_session_factory
    from aexy.services.gtm_analytics_service import GTMAnalyticsService

    logger.info(f"Generating weekly GTM report for workspace: {input.workspace_id or 'all'}")

    async with async_session_factory() as db:
        if input.workspace_id:
            workspace_ids = [input.workspace_id]
        else:
            # Get all workspaces with GTM activity
            from aexy.models import LeadScore
            result = await db.execute(
                select(LeadScore.workspace_id).distinct()
            )
            workspace_ids = [row[0] for row in result.all()]

        reports_generated = 0
        for ws_id in workspace_ids:
            try:
                service = GTMAnalyticsService(db)
                report_data = await service.get_weekly_report_data(ws_id)

                # Log the report (email delivery can be added later)
                summary = report_data.get("summary", {})
                logger.info(
                    f"Weekly GTM report for {ws_id}: "
                    f"pipeline={summary.get('total_leads', 0)} leads, "
                    f"sent={summary.get('total_sent', 0)}, "
                    f"replies={summary.get('total_replies', 0)}"
                )
                reports_generated += 1
            except Exception:
                logger.exception(f"Failed to generate report for workspace {ws_id}")

    return {"reports_generated": reports_generated, "workspace_ids": workspace_ids}


# =============================================================================
# REPLY CLASSIFICATION
# =============================================================================

@dataclass
class ClassifyReplyInput:
    """Input for reply classification."""
    workspace_id: str
    enrollment_id: str
    reply_text: str
    reply_from: str = ""


@activity.defn(name="classify_outreach_reply")
async def classify_outreach_reply(input: ClassifyReplyInput) -> dict:
    """Classify an outreach reply using LLM and execute auto-actions."""
    from aexy.core.database import async_session_maker as async_session_factory
    from aexy.services.reply_classification_service import ReplyClassificationService

    logger.info(f"Classifying reply for enrollment {input.enrollment_id}")

    async with async_session_factory() as db:
        service = ReplyClassificationService(db)
        result = await service.classify_reply(
            workspace_id=input.workspace_id,
            enrollment_id=input.enrollment_id,
            reply_text=input.reply_text,
            reply_from=input.reply_from,
        )
        await db.commit()

    return result


# =============================================================================
# OUTREACH PERSONALIZATION
# =============================================================================

@dataclass
class PersonalizeOutreachBatchInput:
    """Input for batch personalization."""
    workspace_id: str
    sequence_id: str
    step_index: int = 0
    limit: int = 50


@activity.defn(name="personalize_outreach_batch")
async def personalize_outreach_batch(input: PersonalizeOutreachBatchInput) -> dict:
    """Batch pre-generate personalized content for sequence enrollments."""
    from aexy.services.outreach_personalization_service import OutreachPersonalizationService

    logger.info(f"Batch personalizing sequence {input.sequence_id} step {input.step_index}")

    async with async_session_maker() as db:
        service = OutreachPersonalizationService(db)
        result = await service.batch_personalize(
            workspace_id=input.workspace_id,
            sequence_id=input.sequence_id,
            step_index=input.step_index,
            limit=input.limit,
        )
        await db.commit()

    return result


# =============================================================================
# BULK IMPORT
# =============================================================================

@dataclass
class BulkImportInput:
    """Input for bulk CSV import."""
    workspace_id: str
    csv_content: str
    verify_emails: bool = True
    skip_duplicates: bool = True
    sequence_id: str = ""
    object_slug: str = "person"


@activity.defn(name="run_bulk_import")
async def run_bulk_import(input: BulkImportInput) -> dict:
    """Run bulk CSV import as a background activity."""
    from aexy.services.bulk_import_service import BulkImportService

    logger.info(f"Running bulk import for workspace {input.workspace_id}")

    async with async_session_maker() as db:
        service = BulkImportService(db)
        job = await service.run_import(
            workspace_id=input.workspace_id,
            csv_content=input.csv_content,
            verify_emails=input.verify_emails,
            skip_duplicates=input.skip_duplicates,
            sequence_id=input.sequence_id or None,
            object_slug=input.object_slug,
        )

    return service.get_job_summary(job)
