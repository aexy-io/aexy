"""Seed a Google integration and some synced mail, for the exclusions E2E.

There is no API that creates a `GoogleIntegration` without completing a real
Google OAuth round trip, so a live-mode E2E for Gmail exclusions has no way to
arrange its own fixtures. This writes them directly.

    docker exec aexy-backend python scripts/seed_gmail_exclusions_e2e.py <workspace-id>

Idempotent: re-running resets the integration and its synced mail to the same
starting state, so a failed spec does not poison the next run.
"""

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import delete, select

from aexy.core.database import get_async_session
from aexy.models.google_integration import (
    GoogleIntegration,
    GoogleSyncExclusionRule,
    GoogleSyncHiddenMessage,
    SyncedEmail,
)
from aexy.models.workspace import Workspace

SEEDED_EMAIL = "e2e-exclusions@example.test"

# One from a domain the spec excludes, one that must survive it, and one whose
# only link to the excluded domain is a recipient — that last is the case
# sender-only matching would miss.
# "me" is the connected address itself, so the sent message is genuinely
# self-sent — which is what exercises the follow-up naming the other party
# rather than offering to exclude your own domain.
MESSAGES = [
    ("e2e-msg-acme-1", "bob@acme.com", [SEEDED_EMAIL], "Quote for renewal"),
    ("e2e-msg-keep-1", "sue@elsewhere.test", [SEEDED_EMAIL], "Lunch?"),
    ("e2e-msg-acme-2", SEEDED_EMAIL, ["sue@acme.com"], "Re: Quote for renewal"),
]


async def main(workspace_id: str) -> None:
    async with get_async_session() as db:
        workspace = (
            await db.execute(select(Workspace).where(Workspace.id == workspace_id))
        ).scalar_one_or_none()
        if workspace is None:
            raise SystemExit(f"No workspace {workspace_id}")

        integration = (
            await db.execute(
                select(GoogleIntegration).where(
                    GoogleIntegration.workspace_id == workspace_id
                )
            )
        ).scalar_one_or_none()

        if integration is None:
            integration = GoogleIntegration(
                id=str(uuid4()),
                workspace_id=workspace_id,
                # The owner, so the spec's token is allowed to manage exclusions.
                connected_by_id=str(workspace.owner_id),
                google_email=SEEDED_EMAIL,
                access_token="e2e-not-a-real-token",
                refresh_token="e2e-not-a-real-token",
                token_expiry=datetime.now(timezone.utc) + timedelta(days=365),
                gmail_sync_enabled=True,
                calendar_sync_enabled=False,
                is_active=True,
            )
            db.add(integration)
        else:
            integration.connected_by_id = str(workspace.owner_id)
            integration.google_email = SEEDED_EMAIL
            integration.gmail_sync_enabled = True
            integration.is_active = True
        await db.flush()

        # Reset anything a previous run left behind.
        await db.execute(
            delete(GoogleSyncHiddenMessage).where(
                GoogleSyncHiddenMessage.integration_id == integration.id
            )
        )
        await db.execute(
            delete(GoogleSyncExclusionRule).where(
                GoogleSyncExclusionRule.integration_id == integration.id
            )
        )
        await db.execute(
            delete(SyncedEmail).where(SyncedEmail.integration_id == integration.id)
        )

        for gmail_id, from_email, to_emails, subject in MESSAGES:
            db.add(
                SyncedEmail(
                    id=str(uuid4()),
                    workspace_id=workspace_id,
                    integration_id=integration.id,
                    gmail_id=gmail_id,
                    gmail_thread_id=f"thread-{gmail_id}",
                    subject=subject,
                    from_email=from_email,
                    # {"name", "email"} dicts — the shape `_parse_email_list`
                    # writes, and the shape the API's EmailRecipient expects.
                    to_emails=[{"name": None, "email": a} for a in to_emails],
                    body_text="Seeded for the Gmail exclusions E2E.",
                    gmail_date=datetime.now(timezone.utc),
                )
            )

        await db.commit()
        print(f"Seeded integration {integration.id} ({SEEDED_EMAIL})")
        print(f"  {len(MESSAGES)} synced messages, 0 rules, 0 tombstones")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("usage: seed_gmail_exclusions_e2e.py <workspace-id>")
    asyncio.run(main(sys.argv[1]))
