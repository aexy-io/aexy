"""Gmail push notifications — Service Desk intake in seconds rather than minutes.

Intake polls: a schedule checks every minute and syncs a desk mailbox on its own
interval, so a request waits up to that interval before it becomes a ticket.
Gmail can push instead, and this is where those notifications land.

Three things worth knowing about the shape:

* **Push is a shortcut, never the only path.** Polling stays on. A watch lapses
  after seven days, a Pub/Sub delivery can be dropped, and a deployment may not
  have a topic at all — in every one of those cases the desk must still receive
  its mail, just later. That makes this endpoint an optimisation whose failure
  mode is latency rather than lost tickets, which is the only version worth
  shipping.

* **The notification carries no mail.** Gmail sends an address and a history id,
  nothing more. The work is the same incremental sync the poller runs, so this
  hands off to it rather than reimplementing intake — and hands off through
  Temporal, so a slow mailbox cannot hold the HTTP response open and make
  Pub/Sub retry a sync that is already running.

* **Anything unrecognised is acknowledged, not retried.** Pub/Sub redelivers on
  a non-2xx, so answering 404 for a mailbox nobody watches any more (a
  disconnected account whose watch outlived it) would produce an infinite
  retry loop against a request that can never succeed.

Turning it on is deployment work, not a per-workspace setting — one topic serves
every desk on the deployment:

1. Create a Pub/Sub topic, and grant ``gmail-api-push@system.gserviceaccount.com``
   the Pub/Sub Publisher role on it. Gmail publishes as that account; without the
   grant ``users.watch`` fails and every desk quietly stays on polling.
2. Create a **push** subscription delivering to
   ``https://<host>/api/v1/webhooks/gmail/push?token=<secret>``.
3. Set ``GMAIL_PUSH_TOPIC`` (``projects/<project>/topics/<topic>``) and
   ``GMAIL_PUSH_TOKEN`` (the same secret) in the backend environment.

Watches are then registered by the daily ``renew-gmail-watches`` schedule, which
also picks up desk mailboxes connected later. Leave the two settings unset and
nothing here activates.
"""

from __future__ import annotations

import base64
import binascii
import hmac
import json
import logging

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.core.database import get_db
from aexy.models.google_integration import GoogleIntegration
from aexy.models.service_desk import MailboxChannel, ServiceDeskMailbox

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks/gmail", tags=["Gmail Push"])


def _authorised(token: str | None) -> bool:
    """Whether this request carries the shared secret the subscription was given.

    Compared in constant time, and refused outright when the deployment has not
    configured one: an endpoint that accepts anything because it was never set
    up is worse than one that is switched off, since it would let anybody
    trigger syncs by guessing an address.
    """
    expected = get_settings().gmail_push_token
    if not expected:
        return False
    return hmac.compare_digest(token or "", expected)


def _decode(message: dict) -> dict:
    """The JSON Gmail base64-encoded into the Pub/Sub envelope."""
    raw = (message or {}).get("data")
    if not raw:
        return {}
    try:
        return json.loads(base64.b64decode(raw).decode("utf-8"))
    except (binascii.Error, UnicodeDecodeError, ValueError) as exc:
        logger.info("Gmail push: undecodable payload (%s)", exc)
        return {}


@router.post("/push", status_code=status.HTTP_204_NO_CONTENT)
async def receive_gmail_push(
    token: str | None = Query(default=None),
    envelope: dict = Body(default_factory=dict),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Handle one Pub/Sub delivery for a watched Gmail mailbox."""
    if not _authorised(token):
        # 403, and this one *is* worth Pub/Sub retrying — a misconfigured
        # subscription is a state somebody can fix, unlike an unknown mailbox.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid push token")

    payload = _decode(envelope.get("message") or {})
    address = str(payload.get("emailAddress") or "").strip().lower()
    if not address:
        logger.info("Gmail push: notification with no address, ignoring")
        return

    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    integration_id = (
        (
            await db.execute(
                select(GoogleIntegration.id)
                .join(
                    ServiceDeskMailbox,
                    ServiceDeskMailbox.integration_id == GoogleIntegration.id,
                )
                .where(
                    func.lower(GoogleIntegration.google_email) == address,
                    GoogleIntegration.is_active.is_(True),
                    GoogleIntegration.gmail_sync_enabled.is_(True),
                    ServiceDeskMailbox.is_active.is_(True),
                    ServiceDeskMailbox.channel == MailboxChannel.GMAIL_SYNC.value,
                )
                .limit(1)
            )
        ).scalars().first()
    )

    if integration_id is None:
        # Acknowledged, not retried. A watch outlives the integration it was
        # made for whenever somebody disconnects an account, and Pub/Sub would
        # otherwise redeliver that notification until it expired.
        logger.info("Gmail push: no watched desk mailbox for %s", address)
        return

    from aexy.temporal.activities.google_sync import SyncGmailPushInput

    await dispatch(
        "sync_gmail_push",
        SyncGmailPushInput(integration_id=str(integration_id)),
        task_queue=TaskQueue.SYNC,
        # One in-flight sync per mailbox. Gmail fans out a notification per
        # change, so a five-message burst arrives as five deliveries — without
        # this they would run concurrently against the same history cursor and
        # each re-ingest what the others had already claimed.
        workflow_id=f"gmail-push-{integration_id}",
    )
