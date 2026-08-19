"""How long a request waits before it is a ticket.

A Gmail-backed desk mailbox inherited ``GoogleIntegration.auto_sync_interval_
minutes`` — the setting a personal inbox uses for CRM enrichment, defaulting to
fifteen. Registering an address as Service Desk intake did not change it, so a
partner's email sat unticketed for up to a quarter of an hour and no Service
Desk page said so or could change it.

The desk interval is a **floor**: it only ever makes the check more frequent.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.workspace import Workspace
from aexy.services.service_desk_config import (
    DEFAULT_INTAKE_POLL_MINUTES,
    normalise_poll_minutes,
    intake_poll_minutes,
)


async def _workspace(db: AsyncSession, slug: str, desk: dict | None = None) -> Workspace:
    owner = Developer(id=str(uuid4()), email=f"owner-{slug}@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    ws = Workspace(
        id=str(uuid4()),
        name=f"WS {slug}",
        slug=slug,
        owner_id=owner.id,
        settings={"service_desk": desk} if desk is not None else None,
    )
    db.add(ws)
    await db.commit()
    return ws


@pytest.mark.asyncio
async def test_a_desk_that_never_chose_gets_the_fast_default(db_session: AsyncSession):
    ws = await _workspace(db_session, "poll-default")

    assert await intake_poll_minutes(db_session, ws.id) == DEFAULT_INTAKE_POLL_MINUTES
    assert DEFAULT_INTAKE_POLL_MINUTES <= 2  # the reported 10-minute wait is the bug


@pytest.mark.asyncio
async def test_a_configured_interval_is_honoured(db_session: AsyncSession):
    ws = await _workspace(db_session, "poll-set", {"intake_poll_minutes": 5})

    assert await intake_poll_minutes(db_session, ws.id) == 5


@pytest.mark.asyncio
async def test_an_out_of_range_value_falls_back_rather_than_disabling_intake(
    db_session: AsyncSession,
):
    """A junk value must not read as "never poll" — that is silent data loss."""
    ws = await _workspace(db_session, "poll-junk", {"intake_poll_minutes": 0})

    assert await intake_poll_minutes(db_session, ws.id) == DEFAULT_INTAKE_POLL_MINUTES


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (1, 1),
        (60, 60),
        (0, None),
        (61, None),
        (-5, None),
        (True, None),  # bool is an int in Python; it is not an interval
        ("5", None),
        (None, None),
    ],
)
def test_interval_validation(raw: object, expected: int | None):
    assert normalise_poll_minutes(raw) == expected


def test_the_effective_interval_is_a_floor_not_an_override():
    """The rule the auto-sync activity applies, stated on its own.

    An account already polling every minute for other reasons keeps doing so;
    the desk only ever shortens the wait.
    """

    def effective(integration_interval: int, desk_interval: int) -> int:
        return (
            min(integration_interval, desk_interval)
            if integration_interval > 0
            else desk_interval
        )

    assert effective(15, 2) == 2  # the reported case: 15-minute inbox, 2-minute desk
    assert effective(1, 2) == 1  # already faster — left alone
    assert effective(0, 2) == 2  # auto-sync off for the inbox, desk still polls
