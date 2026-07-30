"""Temporal activities for the Bimaplan Service Desk."""

import logging
from dataclasses import dataclass

from temporalio import activity

logger = logging.getLogger(__name__)


@dataclass
class SendServiceDeskDigestInput:
    pass


@activity.defn
async def send_service_desk_digest(input: SendServiceDeskDigestInput) -> int:
    """Send per-KAM + Ops Head open-ticket digests for every workspace.

    Scheduled thrice daily (see temporal/schedules.py). Returns the number of
    digest emails dispatched.
    """
    from aexy.core.database import get_async_session
    from aexy.services.service_desk_digest_service import ServiceDeskDigestService

    async with get_async_session() as session:
        sent = await ServiceDeskDigestService(session).send_all()
        await session.commit()
    logger.info("Service desk digest: dispatched %s emails", sent)
    return sent
