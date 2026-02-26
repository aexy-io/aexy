"""ABM (Account-Based Marketing) activities.

Activities:
    - recalculate_abm_engagement: Recalculate engagement scores for ABM accounts
    - refresh_dynamic_abm_lists: Refresh dynamic ABM target lists
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
class RecalculateABMEngagementInput:
    workspace_id: str = ""


@dataclass
class RefreshDynamicABMListsInput:
    workspace_id: str = ""


# =============================================================================
# ACTIVITIES
# =============================================================================

@activity.defn(name="recalculate_abm_engagement")
async def recalculate_abm_engagement(input: RecalculateABMEngagementInput) -> dict:
    """Recalculate engagement scores for all ABM accounts."""
    from aexy.services.abm_service import ABMService

    logger.info("Recalculating ABM engagement scores")

    async with async_session_maker() as db:
        service = ABMService(db)
        if input.workspace_id:
            count = await service.batch_recalculate_engagement(input.workspace_id)
        else:
            from aexy.models.workspace import Workspace
            from sqlalchemy import select
            ws_result = await db.execute(select(Workspace.id))
            count = 0
            for (ws_id,) in ws_result.all():
                count += await service.batch_recalculate_engagement(ws_id)

    return {"recalculated": count}


@activity.defn(name="refresh_dynamic_abm_lists")
async def refresh_dynamic_abm_lists(input: RefreshDynamicABMListsInput) -> dict:
    """Refresh dynamic ABM target lists."""
    from aexy.services.abm_service import ABMService

    logger.info("Refreshing dynamic ABM lists")

    async with async_session_maker() as db:
        service = ABMService(db)
        if input.workspace_id:
            from aexy.models.gtm_abm import ABMTargetList
            from sqlalchemy import select, and_
            result = await db.execute(
                select(ABMTargetList).where(
                    and_(ABMTargetList.workspace_id == input.workspace_id, ABMTargetList.is_dynamic == True)
                )
            )
            count = 0
            for lst in result.scalars().all():
                await service.refresh_dynamic_list(input.workspace_id, lst.id)
                count += 1
        else:
            from aexy.models.gtm_abm import ABMTargetList
            from sqlalchemy import select
            result = await db.execute(select(ABMTargetList).where(ABMTargetList.is_dynamic == True))
            count = 0
            for lst in result.scalars().all():
                await service.refresh_dynamic_list(lst.workspace_id, lst.id)
                count += 1

    return {"refreshed": count}
