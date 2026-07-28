"""Idempotent handoff to an external messaging provider.

Sending is two steps that cannot be made one: hand the message to the provider,
then record locally that it went. Anything failing in between leaves the system
unsure — and a retry that assumes "not sent" sends the customer a second copy.

Email solves this with the outbox plus a step claim taken before the provider
call. SMS had nothing: the handler called Twilio and returned "accepted", so a
failed write afterwards meant the retry re-sent. Twilio's Messages API has no
idempotency key, so the claim has to be ours.

The claim is an INSERT against a unique key, which is what makes it safe under
concurrency: two callers racing on the same (run, step, recipient) cannot both
win, and the loser reads back what the winner recorded. Three answers come out:

    send          — nothing has been tried; go ahead
    already_sent  — a previous attempt succeeded; return that, send nothing
    uncertain     — a previous attempt reached the provider and never finished
                    recording; refuse, because it may well have been delivered

"uncertain" deliberately requires a human. Retrying risks a duplicate message
and giving up risks a silent non-delivery; only someone who can look at the
provider's own logs can tell which happened.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from aexy.models.crm import CRMAutomationDeliveryAttempt


@dataclass
class DeliveryClaim:
    """What the caller should do, and the prior outcome if there was one."""

    decision: str  # "send" | "already_sent" | "uncertain"
    attempt_id: str | None = None
    provider_message_id: str | None = None


def delivery_key(channel: str, run_id: str, step: str, recipient: str) -> str:
    """Identity that survives a retry of the same step but nothing more.

    A genuine second run of the automation gets a different run id, and a
    different recipient gets a different key, so neither is mistaken for a
    duplicate.
    """
    return f"{channel}:{run_id}:{step}:{recipient}"


async def claim_delivery(
    db, *, channel: str, key: str, recipient: str
) -> DeliveryClaim:
    """Reserve the right to contact the provider for this exact message."""
    attempt = CRMAutomationDeliveryAttempt(
        id=str(uuid4()),
        idempotency_key=key,
        channel=channel,
        recipient=recipient,
        status="sending",
    )
    try:
        # A savepoint, so losing the race does not tear down the caller's
        # transaction along with the run it is in the middle of recording.
        async with db.begin_nested():
            db.add(attempt)
        return DeliveryClaim(decision="send", attempt_id=attempt.id)
    except IntegrityError:
        pass

    existing = (
        await db.execute(
            select(CRMAutomationDeliveryAttempt).where(
                CRMAutomationDeliveryAttempt.idempotency_key == key
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        # The row vanished between the conflict and the read — nothing to
        # honour, so treat it as unsent rather than blocking a real send.
        return DeliveryClaim(decision="send", attempt_id=None)
    if existing.status == "sent":
        return DeliveryClaim(
            decision="already_sent",
            attempt_id=existing.id,
            provider_message_id=existing.provider_message_id,
        )
    if existing.status == "failed":
        # The provider refused outright, so nothing was delivered and trying
        # again is safe.
        existing.status = "sending"
        existing.error = None
        return DeliveryClaim(decision="send", attempt_id=existing.id)
    return DeliveryClaim(decision="uncertain", attempt_id=existing.id)


async def mark_delivered(
    db, attempt_id: str | None, provider_message_id: str | None
) -> None:
    if not attempt_id:
        return
    attempt = await db.get(CRMAutomationDeliveryAttempt, attempt_id)
    if attempt is not None:
        attempt.status = "sent"
        attempt.provider_message_id = provider_message_id
        attempt.completed_at = datetime.now(timezone.utc)


async def mark_refused(db, attempt_id: str | None, error: str) -> None:
    """Record a provider refusal — nothing was delivered, so a retry is safe."""
    if not attempt_id:
        return
    attempt = await db.get(CRMAutomationDeliveryAttempt, attempt_id)
    if attempt is not None:
        attempt.status = "failed"
        attempt.error = str(error)[:500]
        attempt.completed_at = datetime.now(timezone.utc)
