"""Reporting, reply classification, personalization, and bulk import activities.

Activities:
    - generate_weekly_gtm_report: Generate weekly GTM report
    - classify_outreach_reply: Classify an outreach reply using LLM
    - personalize_outreach_batch: Batch pre-generate personalized content
    - run_bulk_import: Run bulk CSV import
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
class GenerateWeeklyReportInput:
    """Input for weekly GTM report generation."""
    workspace_id: str = ""


@dataclass
class ClassifyReplyInput:
    """Input for reply classification."""
    workspace_id: str
    enrollment_id: str
    reply_text: str
    reply_from: str = ""


@dataclass
class PersonalizeOutreachBatchInput:
    """Input for batch personalization."""
    workspace_id: str
    sequence_id: str
    step_index: int = 0
    limit: int = 50


@dataclass
class BulkImportInput:
    """Input for bulk CSV import."""
    workspace_id: str
    csv_content: str
    verify_emails: bool = True
    skip_duplicates: bool = True
    sequence_id: str = ""
    object_slug: str = "person"


# =============================================================================
# ACTIVITIES
# =============================================================================

@activity.defn(name="generate_weekly_gtm_report")
async def generate_weekly_gtm_report(input: GenerateWeeklyReportInput) -> dict:
    """Generate and email the weekly GTM report for a workspace.

    If workspace_id is empty, generates reports for all workspaces.
    """
    from sqlalchemy import select

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
