"""Intelligence activities: intent signals, competitor tracking, SEO, content gaps.

Activities:
    - collect_intent_signals: Collect intent signals from external sources
    - match_intent_signals_to_records: Match unprocessed signals to CRM records
    - check_competitor_changes: Check tracked competitors for page changes
    - generate_battle_card: Generate LLM-powered battle card
    - run_seo_audit: Run full SEO audit
    - run_content_gap_analysis: Run content gap analysis
"""

import logging
from dataclasses import dataclass

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


# =============================================================================
# INPUT DATACLASSES
# =============================================================================

@dataclass
class CollectIntentSignalsInput:
    workspace_id: str = ""


@dataclass
class MatchIntentSignalsInput:
    workspace_id: str


@dataclass
class CheckCompetitorChangesInput:
    workspace_id: str = ""


@dataclass
class GenerateBattleCardInput:
    workspace_id: str
    competitor_id: str


@dataclass
class RunSEOAuditInput:
    audit_id: str
    max_pages: int = 20


@dataclass
class RunContentGapAnalysisInput:
    analysis_id: str


# =============================================================================
# ACTIVITIES
# =============================================================================

@activity.defn(name="collect_intent_signals")
async def collect_intent_signals(input: CollectIntentSignalsInput) -> dict:
    """Collect intent signals from external sources."""
    from aexy.services.intent_signal_service import IntentSignalService

    logger.info("Collecting intent signals")

    async with async_session_maker() as db:
        service = IntentSignalService(db)
        if input.workspace_id:
            jobs = await service.collect_job_posting_signals(input.workspace_id)
            tech = await service.collect_tech_change_signals(input.workspace_id)
            matched = await service.match_signals_to_records(input.workspace_id)
        else:
            from aexy.models.workspace import Workspace
            from sqlalchemy import select
            ws_result = await db.execute(select(Workspace.id))
            jobs, tech, matched = 0, 0, 0
            for (ws_id,) in ws_result.all():
                jobs += await service.collect_job_posting_signals(ws_id)
                tech += await service.collect_tech_change_signals(ws_id)
                matched += await service.match_signals_to_records(ws_id)

    return {"job_signals": jobs, "tech_signals": tech, "matched": matched}


@activity.defn(name="match_intent_signals_to_records")
async def match_intent_signals_to_records(input: MatchIntentSignalsInput) -> dict:
    """Match unprocessed intent signals to CRM records."""
    from aexy.services.intent_signal_service import IntentSignalService

    async with async_session_maker() as db:
        service = IntentSignalService(db)
        count = await service.match_signals_to_records(input.workspace_id)

    return {"matched": count}


@activity.defn(name="check_competitor_changes")
async def check_competitor_changes(input: CheckCompetitorChangesInput) -> dict:
    """Check all tracked competitors for page changes."""
    from aexy.services.competitor_intel_service import CompetitorIntelService

    logger.info("Checking competitor changes")

    async with async_session_maker() as db:
        service = CompetitorIntelService(db)
        if input.workspace_id:
            competitors = await service.list_competitors(input.workspace_id)
            total_changes = 0
            for comp in competitors:
                changes = await service.check_for_changes(input.workspace_id, comp.id)
                total_changes += len(changes)
        else:
            from aexy.models.workspace import Workspace
            from aexy.models.gtm_competitor import CompetitorProfile
            from sqlalchemy import select
            ws_result = await db.execute(select(Workspace.id))
            total_changes = 0
            for (ws_id,) in ws_result.all():
                competitors = await service.list_competitors(ws_id)
                for comp in competitors:
                    changes = await service.check_for_changes(ws_id, comp.id)
                    total_changes += len(changes)

    return {"changes_detected": total_changes}


@activity.defn(name="generate_battle_card")
async def generate_battle_card(input: GenerateBattleCardInput) -> dict:
    """Generate an LLM-powered battle card for a competitor."""
    from aexy.services.competitor_intel_service import CompetitorIntelService

    logger.info(f"Generating battle card for competitor_id={input.competitor_id}")

    async with async_session_maker() as db:
        service = CompetitorIntelService(db)
        card = await service.generate_battle_card(input.workspace_id, input.competitor_id)

    if card:
        return {"card_id": card.id, "status": card.status}
    return {"status": "failed"}


@activity.defn(name="run_seo_audit")
async def run_seo_audit(input: RunSEOAuditInput) -> dict:
    """Run a full SEO audit (crawl + analysis)."""
    from aexy.services.seo_audit_service import SEOAuditService

    logger.info(f"Running SEO audit id={input.audit_id}")

    async with async_session_maker() as db:
        service = SEOAuditService(db)
        await service.run_audit(input.audit_id, max_pages=input.max_pages)

    return {"audit_id": input.audit_id, "status": "completed"}


@activity.defn(name="run_content_gap_analysis")
async def run_content_gap_analysis(input: RunContentGapAnalysisInput) -> dict:
    """Run content gap analysis (sitemap crawl + topic extraction)."""
    from aexy.services.content_gap_service import ContentGapService

    logger.info(f"Running content gap analysis id={input.analysis_id}")

    async with async_session_maker() as db:
        service = ContentGapService(db)
        await service.run_analysis(input.analysis_id)

    return {"analysis_id": input.analysis_id, "status": "completed"}
