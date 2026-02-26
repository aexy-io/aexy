"""Customer success activities: health scoring, drop detection, expansion playbooks.

Activities:
    - score_customer_health: Score a single customer's health
    - batch_score_customer_health: Batch score all customers
    - detect_health_drops: Detect health score drops and emit alerts
    - evaluate_expansion_triggers: Evaluate expansion playbook triggers
    - advance_expansion_step: Advance an expansion enrollment to next step
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
class ScoreCustomerHealthInput:
    workspace_id: str
    record_id: str


@dataclass
class BatchScoreCustomerHealthInput:
    workspace_id: str = ""


@dataclass
class DetectHealthDropsInput:
    workspace_id: str = ""


@dataclass
class EvaluateExpansionTriggersInput:
    workspace_id: str
    record_id: str
    health_score: int = 0


@dataclass
class AdvanceExpansionStepInput:
    workspace_id: str
    enrollment_id: str


# =============================================================================
# ACTIVITIES
# =============================================================================

@activity.defn(name="score_customer_health")
async def score_customer_health(input: ScoreCustomerHealthInput) -> dict:
    """Score a single customer's health."""
    from aexy.services.health_scoring_service import HealthScoringService

    logger.info(f"Scoring health for record_id={input.record_id}")

    async with async_session_maker() as db:
        service = HealthScoringService(db)
        score = await service.score_customer(input.workspace_id, input.record_id)

    return {"record_id": input.record_id, "total_score": score.total_score, "status": score.health_status}


@activity.defn(name="batch_score_customer_health")
async def batch_score_customer_health(input: BatchScoreCustomerHealthInput) -> dict:
    """Batch score all customers in a workspace."""
    from aexy.services.health_scoring_service import HealthScoringService

    logger.info(f"Batch scoring customer health for workspace {input.workspace_id}")

    if input.workspace_id:
        async with async_session_maker() as db:
            service = HealthScoringService(db)
            count = await service.batch_score_customers(input.workspace_id)
    else:
        async with async_session_maker() as db:
            from aexy.models.workspace import Workspace
            from sqlalchemy import select
            ws_result = await db.execute(select(Workspace.id))
            ws_ids = [ws_id for (ws_id,) in ws_result.all()]

        count = 0
        for ws_id in ws_ids:
            try:
                async with async_session_maker() as db:
                    service = HealthScoringService(db)
                    count += await service.batch_score_customers(ws_id)
                activity.heartbeat(f"Scored health for workspace {ws_id}")
            except Exception:
                logger.exception(f"Health scoring failed for workspace {ws_id}")

    return {"scored": count}


@activity.defn(name="detect_health_drops")
async def detect_health_drops(input: DetectHealthDropsInput) -> dict:
    """Detect health score drops and emit alerts."""
    from aexy.services.health_scoring_service import HealthScoringService

    logger.info("Detecting health drops")

    if input.workspace_id:
        async with async_session_maker() as db:
            service = HealthScoringService(db)
            alerts = await service.detect_health_drops(input.workspace_id)
    else:
        async with async_session_maker() as db:
            from aexy.models.workspace import Workspace
            from sqlalchemy import select
            ws_result = await db.execute(select(Workspace.id))
            ws_ids = [ws_id for (ws_id,) in ws_result.all()]

        alerts = []
        for ws_id in ws_ids:
            try:
                async with async_session_maker() as db:
                    service = HealthScoringService(db)
                    alerts.extend(await service.detect_health_drops(ws_id))
            except Exception:
                logger.exception(f"Health drop detection failed for workspace {ws_id}")

    return {"alerts_sent": len(alerts)}


@activity.defn(name="evaluate_expansion_triggers")
async def evaluate_expansion_triggers(input: EvaluateExpansionTriggersInput) -> dict:
    """Evaluate expansion playbook triggers for a customer after health scoring."""
    from aexy.services.expansion_playbook_service import ExpansionPlaybookService

    logger.info(f"Evaluating expansion triggers for record_id={input.record_id}")

    async with async_session_maker() as db:
        service = ExpansionPlaybookService(db)
        matching = await service.evaluate_triggers(
            input.workspace_id, input.record_id, input.health_score,
        )
        enrolled = []
        for playbook_id in matching:
            enrollment = await service.enroll_customer(
                input.workspace_id, playbook_id, input.record_id,
            )
            if enrollment:
                enrolled.append(enrollment.id)

    return {"matching_playbooks": len(matching), "enrolled": len(enrolled)}


@activity.defn(name="advance_expansion_step")
async def advance_expansion_step(input: AdvanceExpansionStepInput) -> dict:
    """Advance an expansion enrollment to the next step."""
    from aexy.services.expansion_playbook_service import ExpansionPlaybookService

    async with async_session_maker() as db:
        service = ExpansionPlaybookService(db)
        enrollment = await service.advance_enrollment(input.workspace_id, input.enrollment_id)

    if enrollment:
        return {"status": enrollment.status, "step": enrollment.current_step_index}
    return {"status": "not_found"}
