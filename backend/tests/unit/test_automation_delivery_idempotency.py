"""A provider acceptance must never be turned into two messages.

Sending is two steps that cannot be merged: hand the message over, then record
locally that it went. Anything failing in between leaves the outcome unknown,
and a retry that assumes "not sent" sends the customer a second copy. Email is
covered by the outbox plus its step claim; SMS called Twilio directly and
returned "accepted", so the retry re-sent — and Twilio has no idempotency key
to lean on.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from aexy.services.automation_delivery import (
    claim_delivery,
    delivery_key,
    mark_delivered,
    mark_refused,
)
from aexy.services.crm_automation_service import CRMAutomationService

pytestmark = pytest.mark.asyncio


def _record():
    return SimpleNamespace(
        id="rec-1", name="Acme", values={"phone": "+14155552671"}
    )


def _key(recipient="+14155552671"):
    return delivery_key("sms", f"run-{uuid4().hex[:8]}", "0", recipient)


async def test_a_fresh_recipient_is_cleared_to_send(db_session):
    claim = await claim_delivery(
        db_session, channel="sms", key=_key(), recipient="+14155552671"
    )
    assert claim.decision == "send"


async def test_a_delivered_message_is_never_sent_twice(db_session):
    key = _key()
    first = await claim_delivery(
        db_session, channel="sms", key=key, recipient="+14155552671"
    )
    await mark_delivered(db_session, first.attempt_id, "SM123")

    second = await claim_delivery(
        db_session, channel="sms", key=key, recipient="+14155552671"
    )

    assert second.decision == "already_sent"
    assert second.provider_message_id == "SM123"


async def test_an_unfinished_attempt_is_not_retried_automatically(db_session):
    """The dangerous case: the provider may already have delivered it.

    Retrying risks a duplicate and giving up risks a silent non-delivery, so
    this has to stop and ask for a human rather than guess.
    """
    key = _key()
    await claim_delivery(
        db_session, channel="sms", key=key, recipient="+14155552671"
    )

    second = await claim_delivery(
        db_session, channel="sms", key=key, recipient="+14155552671"
    )

    assert second.decision == "uncertain"


async def test_a_refused_message_may_be_retried(db_session):
    """A refusal means nothing was delivered, so trying again is safe."""
    key = _key()
    first = await claim_delivery(
        db_session, channel="sms", key=key, recipient="+14155552671"
    )
    await mark_refused(db_session, first.attempt_id, "invalid number")

    second = await claim_delivery(
        db_session, channel="sms", key=key, recipient="+14155552671"
    )

    assert second.decision == "send"


async def test_a_different_recipient_is_not_a_duplicate(db_session):
    run = f"run-{uuid4().hex[:8]}"
    a = await claim_delivery(
        db_session,
        channel="sms",
        key=delivery_key("sms", run, "0", "+14155552671"),
        recipient="+14155552671",
    )
    await mark_delivered(db_session, a.attempt_id, "SM1")

    b = await claim_delivery(
        db_session,
        channel="sms",
        key=delivery_key("sms", run, "0", "+14155559999"),
        recipient="+14155559999",
    )

    assert b.decision == "send"


async def test_the_sms_action_refuses_to_resend_after_an_uncertain_attempt(
    db_session,
):
    """End to end through the action, which is where the duplicate happened."""
    service = CRMAutomationService(db_session)
    config = {
        "recipient_type": "field",
        "phone_field": "phone",
        "message_template": "Hi {{record.values.phone}}",
    }
    provider = AsyncMock(return_value={"sid": "SM123", "status": "queued"})

    with patch(
        "aexy.services.twilio_service.TwilioService.send_sms", new=provider
    ):
        first = await service._action_send_sms(
            config, _record(), "ws-1", None, "run-9", 0
        )
        assert first["accepted"] is True
        assert provider.await_count == 1

        # Simulate the attempt never finishing its local write: the row stays
        # on "sending", which is exactly what a crash after handoff leaves.
        from sqlalchemy import select

        from aexy.models.crm import CRMAutomationDeliveryAttempt

        attempt = (
            await db_session.execute(select(CRMAutomationDeliveryAttempt))
        ).scalar_one()
        attempt.status = "sending"
        await db_session.flush()

        second = await service._action_send_sms(
            config, _record(), "ws-1", None, "run-9", 0
        )

    assert "error" in second
    assert second["needs_review"] is True
    assert provider.await_count == 1, "the provider was dialled a second time"


async def test_the_sms_action_returns_the_first_result_on_a_clean_retry(
    db_session,
):
    service = CRMAutomationService(db_session)
    config = {
        "recipient_type": "field",
        "phone_field": "phone",
        "message_template": "Hi",
    }
    provider = AsyncMock(return_value={"sid": "SM777", "status": "queued"})

    with patch(
        "aexy.services.twilio_service.TwilioService.send_sms", new=provider
    ):
        await service._action_send_sms(config, _record(), "ws-1", None, "run-7", 0)
        again = await service._action_send_sms(
            config, _record(), "ws-1", None, "run-7", 0
        )

    assert again["deduplicated"] is True
    assert again["provider_message_id"] == "SM777"
    assert provider.await_count == 1
