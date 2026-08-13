"""Temporal activities for the Service Desk."""

import logging
from dataclasses import dataclass

from temporalio import activity

logger = logging.getLogger(__name__)


@dataclass
class SendServiceDeskDigestInput:
    pass


@dataclass
class SendServiceDeskReceiptInput:
    ticket_id: str


@activity.defn
async def send_service_desk_receipt(input: SendServiceDeskReceiptInput) -> str:
    """Acknowledge a manually logged ticket, after its request has returned.

    The operator is on the phone when they log a call, so the SMTP round trip
    does not belong in their request. It was a FastAPI background task first,
    which took it off the critical path but tied it to the lifetime of the
    process that served the request: a deploy or a crash in the seconds after
    the ticket was created dropped the receipt with nothing to say so.

    Raising on a failed send is the point of running here — ``STANDARD_RETRY``
    then tries again with backoff. Anything that was never going to be sent
    returns ``ACK_NOTHING_TO_DO`` instead and burns no retries: a call with no
    address to answer, a colleague who replied by hand first, or a deployment
    with no channel to send on. It is logged as itself rather than as a send,
    so a receipt nobody received never reads as one that went out.
    """
    from aexy.core.database import get_async_session
    from aexy.services.service_desk_intake_service import (
        ACK_FAILED,
        ServiceDeskIntakeService,
    )

    async with get_async_session() as session:
        outcome = await ServiceDeskIntakeService(session).acknowledge_ticket(input.ticket_id)
    if outcome == ACK_FAILED:
        raise RuntimeError(
            f"Service desk receipt for ticket {input.ticket_id} was not delivered"
        )
    logger.info("Service desk receipt for %s: %s", input.ticket_id, outcome)
    return outcome


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
