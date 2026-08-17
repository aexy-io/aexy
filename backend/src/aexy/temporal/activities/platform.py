"""Temporal activities for platform-level signup handling."""

import logging
from dataclasses import dataclass
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


@dataclass
class HandleNewSignupInput:
    developer_id: str
    email: str
    name: str | None
    avatar_url: str | None
    signup_provider: str  # "github" or "google"


@activity.defn
async def handle_new_signup(input: HandleNewSignupInput) -> dict[str, Any]:
    """Create CRM contact and start onboarding flow for a new signup."""
    logger.info(f"Handling new signup for {input.email} (provider={input.signup_provider})")

    from aexy.services.platform_service import PlatformService

    async with async_session_maker() as db:
        service = PlatformService(db)

        # Safety net — ensure setup ran (idempotent)
        await service.ensure_platform_setup()

        contact = await service.create_signup_contact(
            developer_id=input.developer_id,
            email=input.email,
            name=input.name,
            avatar_url=input.avatar_url,
            signup_provider=input.signup_provider,
        )

        onboarding = await service.start_signup_onboarding(input.developer_id)

        await db.commit()

    return {
        "status": "success",
        "contact_id": contact.id if contact else None,
        "onboarding": onboarding,
    }


@dataclass
class SendFeedbackDigestInput:
    """Nothing to configure — the window is the schedule's own interval."""

    hours: int = 24


@activity.defn
async def send_feedback_digest(input: SendFeedbackDigestInput) -> dict[str, Any]:
    """Mail the platform admins what people told us since yesterday.

    In-app notices already fire per item; this is the safety net that does not
    depend on anybody logging in. It goes to the ADMIN_EMAILS addresses rather
    than to a hardcoded inbox, so the people who can act on it are the people
    who get it, and adding an admin does not mean editing this.

    Sends nothing when nothing arrived: a daily "no feedback today" is how a
    digest teaches people to filter it.
    """
    from datetime import datetime, timedelta, timezone

    from aexy.core.config import get_settings
    from aexy.services.email_service import EmailService
    from aexy.services.feedback_service import FeedbackService

    settings = get_settings()
    recipients = settings.admin_email_list
    if not recipients:
        logger.info("Feedback digest: ADMIN_EMAILS is empty, nothing to send")
        return {"sent": 0, "items": 0}

    since = datetime.now(timezone.utc) - timedelta(hours=input.hours)

    async with async_session_maker() as db:
        service = FeedbackService(db)
        new_items = await service.since(since)
        if not new_items:
            logger.info("Feedback digest: nothing new since %s", since.isoformat())
            return {"sent": 0, "items": 0}

        top = await service.top_open(limit=5)

        lines = [f"{len(new_items)} new since {since:%Y-%m-%d %H:%M} UTC", ""]
        for item in new_items:
            lines.append(f"[{item.kind}] {item.subject}  ({item.vote_count} votes)")
            body = (item.body or "").strip().splitlines()
            if body:
                lines.append(f"    {body[0][:160]}")
        lines += ["", "Most wanted, still open:"]
        for item in top:
            lines.append(f"  {item.vote_count:>3} — {item.subject}")
        lines += ["", f"{settings.frontend_url}/admin/feedback"]
        body_text = "\n".join(lines)

        sent = 0
        for recipient in recipients:
            try:
                await EmailService().send_templated_email(
                    db=db,
                    recipient_email=recipient,
                    subject=f"Aexy feedback: {len(new_items)} new",
                    body_text=body_text,
                    auto_generated=True,
                )
                sent += 1
            except Exception as exc:  # noqa: BLE001 — one bad address is not the batch
                logger.warning("Feedback digest to %s failed: %s", recipient, exc)

    return {"sent": sent, "items": len(new_items)}
