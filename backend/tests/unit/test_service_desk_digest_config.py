"""Configuring the digest that arrives three times a day.

`digest_hours` existed in the API and in the TypeScript client, and nothing
rendered a control for it — the only way to change when the digest arrived was a
raw PATCH. Worse, there was no value at all that turned it off: an empty hour
list fell back to the default and the validator refused to store one, so the
escape route was a mail filter.

Recipients were derived entirely from the desk department, so a manager outside
it could not be added and a member who did not want three emails a day could
only leave the department — which changes how work is routed.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.organization import Department, DepartmentMember
from aexy.models.service_desk import ServiceDeskMailbox, ServiceDeskTicket
from aexy.models.ticketing import Ticket, TicketForm
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.service_desk_digest_service import ServiceDeskDigestService
from aexy.services.service_desk_service import ServiceDeskService
from tests.conftest import seed_service_desk_taxonomy


class _Desk:
    ws: Workspace
    kam: Developer
    quiet: Developer


async def _desk(db: AsyncSession, slug: str) -> _Desk:
    d = _Desk()
    owner = Developer(id=str(uuid4()), email=f"owner-{slug}@desk.example", name="Owner")
    d.kam = Developer(id=str(uuid4()), email=f"kam-{slug}@desk.example", name="KAM")
    d.quiet = Developer(id=str(uuid4()), email=f"quiet-{slug}@desk.example", name="Quiet KAM")
    db.add_all([owner, d.kam, d.quiet])
    await db.flush()
    d.ws = Workspace(id=str(uuid4()), name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(d.ws)
    await db.flush()
    db.add(
        ServiceDeskMailbox(
            id=str(uuid4()), workspace_id=d.ws.id, address="ops@desk.example", channel="webhook"
        )
    )
    dept = Department(
        id=str(uuid4()), workspace_id=d.ws.id, name="Ops", slug=f"ops-{slug}",
        function_key="operations", path="/ops/", depth=0,
    )
    db.add(dept)
    await db.flush()
    for dev in (d.kam, d.quiet):
        db.add(
            WorkspaceMember(
                id=str(uuid4()), workspace_id=d.ws.id, developer_id=dev.id, status="active"
            )
        )
        db.add(
            DepartmentMember(
                id=str(uuid4()), workspace_id=d.ws.id, department_id=dept.id, developer_id=dev.id
            )
        )
    form = TicketForm(
        id=str(uuid4()), workspace_id=d.ws.id, name="SD", slug=f"sd-{slug}", created_by_id=owner.id
    )
    db.add(form)
    await db.flush()
    ticket = Ticket(
        id=str(uuid4()), workspace_id=d.ws.id, form_id=form.id, ticket_number=1,
        assignee_id=d.kam.id, field_values={"subject": "Open one"},
    )
    db.add(ticket)
    await db.flush()
    db.add(
        ServiceDeskTicket(
            id=str(uuid4()), ticket_id=ticket.id, workspace_id=d.ws.id,
            request_type="query", pending_with="kam",
        )
    )
    await db.commit()
    await seed_service_desk_taxonomy(db, d.ws.id)
    return d


async def _recipients(db: AsyncSession, ws_id: str) -> set[str]:
    return {d.recipient_email for d in await ServiceDeskDigestService(db).build_digests(ws_id)}


# ------------------------------------------------------------- the off switch


@pytest.mark.asyncio
async def test_a_desk_that_never_chose_still_gets_its_digest(db_session: AsyncSession):
    """On by default. Silence is worse than being told what is open."""
    d = await _desk(db_session, "dg-default")

    at_nine = datetime(2026, 8, 20, 3, 35, tzinfo=timezone.utc)  # 09:05 Asia/Kolkata
    assert await ServiceDeskDigestService(db_session).is_due(d.ws.id, at_nine) is True


@pytest.mark.asyncio
async def test_switching_it_off_stops_it(db_session: AsyncSession):
    """There was previously no value that did this."""
    d = await _desk(db_session, "dg-off")
    await ServiceDeskService(db_session).update_settings(d.ws.id, digest_enabled_value=False)
    await db_session.commit()

    at_nine = datetime(2026, 8, 20, 3, 35, tzinfo=timezone.utc)
    assert await ServiceDeskDigestService(db_session).is_due(d.ws.id, at_nine) is False


@pytest.mark.asyncio
async def test_send_now_respects_the_off_switch(db_session: AsyncSession):
    """It ignores the schedule, not the setting. A desk that turned the digest
    off is not asking to be surprised by one."""
    d = await _desk(db_session, "dg-off-now")
    await ServiceDeskService(db_session).update_settings(d.ws.id, digest_enabled_value=False)
    await db_session.commit()

    assert await ServiceDeskDigestService(db_session).send_for_workspace_now(d.ws.id) == 0


# -------------------------------------------------------------- recipients


@pytest.mark.asyncio
async def test_a_member_can_opt_out_without_leaving_the_department(
    db_session: AsyncSession,
):
    """Department membership routes work. It is not a statement about wanting
    three emails a day, and leaving to escape them changes routing."""
    d = await _desk(db_session, "dg-optout")
    assert d.quiet.email in await _recipients(db_session, d.ws.id)

    await ServiceDeskService(db_session).update_settings(
        d.ws.id, digest_excluded_recipients=[d.quiet.id]
    )
    await db_session.commit()

    recipients = await _recipients(db_session, d.ws.id)
    assert d.quiet.email not in recipients
    assert d.kam.email in recipients


@pytest.mark.asyncio
async def test_someone_outside_the_department_can_be_added(db_session: AsyncSession):
    d = await _desk(db_session, "dg-extra")

    await ServiceDeskService(db_session).update_settings(
        d.ws.id, digest_extra_recipients=["  Head.Of.Ops@Example.COM  ", "not-an-address"]
    )
    await db_session.commit()

    recipients = await _recipients(db_session, d.ws.id)
    assert "head.of.ops@example.com" in recipients
    assert "not-an-address" not in recipients


@pytest.mark.asyncio
async def test_an_extra_recipient_who_is_already_on_the_list_is_not_doubled(
    db_session: AsyncSession,
):
    d = await _desk(db_session, "dg-extra-dupe")
    await ServiceDeskService(db_session).update_settings(
        d.ws.id, digest_extra_recipients=[d.kam.email]
    )
    await db_session.commit()

    everyone = [
        digest.recipient_email
        for digest in await ServiceDeskDigestService(db_session).build_digests(d.ws.id)
    ]

    assert everyone.count(d.kam.email) == 1


# ----------------------------------------------------------------- preview


@pytest.mark.asyncio
async def test_the_preview_answers_what_the_settings_page_is_asked(
    db_session: AsyncSession,
):
    """Who receives this, when, and what does it say — every one of which used to
    require waiting until 5pm to find out."""
    d = await _desk(db_session, "dg-preview")

    preview = await ServiceDeskDigestService(db_session).preview(d.ws.id, d.kam.id)

    assert preview["enabled"] is True
    assert preview["hours"] == [9, 13, 17]
    assert preview["timezone"]
    assert d.kam.email in preview["recipients"]
    assert "Open one" not in (preview["body"] or "")  # the block lists ids, not subjects
    assert "SD-1" in (preview["body"] or "")


@pytest.mark.asyncio
async def test_the_preview_shows_the_callers_copy_and_nobody_elses(
    db_session: AsyncSession,
):
    """A KAM seeing the desk lead's whole-desk digest would mail around the row
    scope every other read enforces."""
    d = await _desk(db_session, "dg-preview-scope")

    preview = await ServiceDeskDigestService(db_session).preview(d.ws.id, d.quiet.id)

    # `quiet` owns nothing, so their own copy is empty rather than the desk's.
    assert "(no open tickets)" in (preview["body"] or "")


@pytest.mark.asyncio
async def test_the_subject_distinguishes_three_sends_in_one_day(
    db_session: AsyncSession,
):
    """Every send said "Daily … — <today>". Identical subjects thread together in
    a mail client, so the 5pm summary hid inside the 9am one."""
    d = await _desk(db_session, "dg-subject")

    preview = await ServiceDeskDigestService(db_session).preview(d.ws.id, d.kam.id)

    assert "Daily" not in (preview["subject"] or "")
    assert ":" in (preview["subject"] or "")  # carries a local HH:MM
