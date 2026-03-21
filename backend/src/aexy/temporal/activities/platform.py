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
