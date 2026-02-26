"""Deduplication activities.

Activities:
    - bulk_find_duplicates: Find duplicates across workspace
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
class BulkDedupInput:
    workspace_id: str
    limit: int = 100


# =============================================================================
# ACTIVITIES
# =============================================================================

@activity.defn(name="bulk_find_duplicates")
async def bulk_find_duplicates(input: BulkDedupInput) -> dict:
    """Find duplicates across workspace -- scheduled weekly."""
    from aexy.services.dedup_service import DedupService

    async with async_session_maker() as db:
        svc = DedupService(db)
        dupes = await svc.bulk_find_duplicates(input.workspace_id, limit=input.limit)
        return {"found": len(dupes), "duplicates": dupes}
