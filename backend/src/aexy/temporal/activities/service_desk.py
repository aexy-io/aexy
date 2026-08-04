"""Temporal activities for the Service Desk."""

import logging
from dataclasses import dataclass

from temporalio import activity

logger = logging.getLogger(__name__)


@dataclass
class SendServiceDeskDigestInput:
    pass


@activity.defn
async def send_service_desk_digest(input: SendServiceDeskDigestInput) -> int:
    """Send open-ticket digests for every workspace that is due one.

    The schedule fires every half hour (see temporal/schedules.py); each workspace
    is sent to only when its *own* local clock reaches one of its configured
    digest hours, so a desk is never paged in the middle of its night. Returns the
    number of digest emails dispatched.
    """
    from aexy.core.database import get_async_session
    from aexy.services.service_desk_digest_service import ServiceDeskDigestService

    async with get_async_session() as session:
        sent = await ServiceDeskDigestService(session).send_all()
        await session.commit()
    logger.info("Service desk digest: dispatched %s emails", sent)
    return sent
