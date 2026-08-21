"""A ticket's own headline, and what converting one to a task carries over.

`Ticket` had no title column. The subject lived in `field_values["subject"]`, so
the detail page headlined the *form* name — every ticket raised through one form
read identically — and sorting or searching by subject went through a JSONB
expression no index helps.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.service_desk import ServiceDeskMailbox
from aexy.models.sprint import SprintTask, TaskAssignee, TaskAttachment
from aexy.models.team import Team
from aexy.models.ticketing import Ticket
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.schemas.service_desk import InboundEmail, ManualTicketCreate
from aexy.services.service_desk_intake_service import ServiceDeskIntakeService
from aexy.services.service_desk_service import ServiceDeskService
from aexy.services.service_desk_ticket_service import ServiceDeskTicketService
from aexy.services.ticket_service import headline_from_field_values
from tests.conftest import seed_service_desk_taxonomy


class _Desk:
    ws: Workspace
    mailbox: ServiceDeskMailbox
    owner: Developer
    dev: Developer
    outsider: Developer
    team: Team


async def _desk(db: AsyncSession, slug: str) -> _Desk:
    d = _Desk()
    d.owner = Developer(id=str(uuid.uuid4()), name="Owner", email=f"o-{slug}@x.test")
    d.dev = Developer(id=str(uuid.uuid4()), name="Dev", email=f"d-{slug}@x.test")
    d.outsider = Developer(id=str(uuid.uuid4()), name="Outsider", email=f"x-{slug}@x.test")
    db.add_all([d.owner, d.dev, d.outsider])
    await db.flush()
    d.ws = Workspace(id=str(uuid.uuid4()), name=f"W {slug}", slug=slug, owner_id=d.owner.id)
    db.add(d.ws)
    await db.flush()
    for who in (d.owner, d.dev):
        db.add(
            WorkspaceMember(
                id=str(uuid.uuid4()), workspace_id=d.ws.id, developer_id=who.id, role="member"
            )
        )
    d.team = Team(id=str(uuid.uuid4()), workspace_id=d.ws.id, name="P", slug=f"p-{slug}")
    d.mailbox = ServiceDeskMailbox(
        id=str(uuid.uuid4()), workspace_id=d.ws.id, address="ops@desk.example", channel="webhook"
    )
    db.add_all([d.team, d.mailbox])
    await db.commit()
    await seed_service_desk_taxonomy(db, d.ws.id)
    return d


# ── the headline ─────────────────────────────────────────────────────────


def test_headline_prefers_title_then_subject_then_summary() -> None:
    """A form builder names the field whatever suits the form."""
    assert headline_from_field_values({"title": "A", "subject": "B"}) == "A"
    assert headline_from_field_values({"subject": "B", "summary": "C"}) == "B"
    assert headline_from_field_values({"summary": "C"}) == "C"


def test_headline_collapses_whitespace_and_rejects_blanks() -> None:
    """Email subjects arrive padded, and a blank must stay absent rather than
    becoming a title of ""."""
    assert headline_from_field_values({"subject": "  Cannot   log in \n"}) == "Cannot log in"
    assert headline_from_field_values({"subject": "   "}) is None
    assert headline_from_field_values({}) is None
    assert headline_from_field_values(None) is None


def test_headline_is_bounded_to_the_column() -> None:
    assert len(headline_from_field_values({"subject": "x" * 900}) or "") == 500


@pytest.mark.asyncio
async def test_an_email_ticket_gets_a_title(db_session: AsyncSession) -> None:
    d = await _desk(db_session, "tt-email")

    ticket = await ServiceDeskIntakeService(db_session).create_ticket(
        d.ws.id,
        InboundEmail(
            to="ops@desk.example", from_email="someone@partner.example",
            subject="  Renewal overdue  ", body_text="hello",
        ),
        d.mailbox,
        source="service_desk_email",
    )
    await db_session.commit()

    assert ticket.title == "Renewal overdue"
    # Still in the submission blob too — the form renderer and every existing
    # consumer read it from there.
    assert (ticket.field_values or {}).get("subject") == "  Renewal overdue  "


@pytest.mark.asyncio
async def test_a_logged_call_gets_a_title(db_session: AsyncSession) -> None:
    d = await _desk(db_session, "tt-manual")

    ticket_id = await ServiceDeskService(db_session).create_manual_ticket(
        d.ws.id, ManualTicketCreate(subject="Phone: cannot log in")
    )
    ticket = (
        await db_session.execute(select(Ticket).where(Ticket.id == ticket_id))
    ).scalar_one()
    assert ticket.title == "Phone: cannot log in"


# ── converting to a task ─────────────────────────────────────────────────


async def _ticket_with_files(db: AsyncSession, d: _Desk, files: list[dict]) -> Ticket:
    ticket_id = await ServiceDeskService(db).create_manual_ticket(
        d.ws.id, ManualTicketCreate(subject="Needs engineering", body="details")
    )
    ticket = (await db.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one()
    ticket.attachments = files
    await db.commit()
    return ticket


@pytest.mark.asyncio
async def test_converting_assigns_the_task_and_mirrors_the_row(
    db_session: AsyncSession,
) -> None:
    """The task used to land on nobody, so picking it up was a second trip to
    the board."""
    d = await _desk(db_session, "tt-assign")
    ticket = await _ticket_with_files(db_session, d, [])

    result = await ServiceDeskTicketService(db_session).convert_to_task(
        d.ws.id, ticket.id, d.team.id, None, None, "high", assignee_id=str(d.dev.id)
    )
    await db_session.commit()

    task = (
        await db_session.execute(select(SprintTask).where(SprintTask.id == result["task_id"]))
    ).scalar_one()
    assert str(task.assignee_id) == str(d.dev.id)

    # Mirrored, like every other creation path — otherwise the column is set and
    # the assignee list is empty.
    rows = (
        await db_session.execute(
            select(TaskAssignee).where(TaskAssignee.task_id == task.id)
        )
    ).scalars().all()
    assert [str(r.developer_id) for r in rows] == [str(d.dev.id)]
    assert rows[0].is_primary


@pytest.mark.asyncio
async def test_an_assignee_outside_the_workspace_is_refused(
    db_session: AsyncSession,
) -> None:
    """The id comes from the request body. Without the check a task lands on
    somebody with no access to it."""
    d = await _desk(db_session, "tt-outsider")
    ticket = await _ticket_with_files(db_session, d, [])

    with pytest.raises(HTTPException) as exc:
        await ServiceDeskTicketService(db_session).convert_to_task(
            d.ws.id, ticket.id, d.team.id, None, None, "medium",
            assignee_id=str(d.outsider.id),
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_the_tickets_files_land_on_the_task(db_session: AsyncSession) -> None:
    """Leaving them on the ticket meant whoever picked up the task had to find
    the ticket to see them — the hop converting is meant to remove."""
    d = await _desk(db_session, "tt-files")
    ticket = await _ticket_with_files(
        db_session, d,
        [
            {"id": str(uuid.uuid4()), "filename": "screenshot.png", "size": 12,
             "type": "image/png", "key": "ticket-attachments/x/screenshot.png"},
            {"id": str(uuid.uuid4()), "filename": "log.txt", "size": 34,
             "type": "text/plain", "key": "ticket-attachments/x/log.txt"},
        ],
    )

    result = await ServiceDeskTicketService(db_session).convert_to_task(
        d.ws.id, ticket.id, d.team.id, None, None, "medium"
    )
    await db_session.commit()

    rows = (
        await db_session.execute(
            select(TaskAttachment).where(TaskAttachment.task_id == result["task_id"])
        )
    ).scalars().all()
    assert {r.file_name for r in rows} == {"screenshot.png", "log.txt"}
    # The same stored objects — not re-uploaded, or the two copies would have
    # different keys and deleting one would leave the other resolving.
    assert {r.storage_key for r in rows} == {
        "ticket-attachments/x/screenshot.png",
        "ticket-attachments/x/log.txt",
    }
    # And they are still on the ticket.
    refreshed = (
        await db_session.execute(select(Ticket).where(Ticket.id == ticket.id))
    ).scalar_one()
    assert len(refreshed.attachments) == 2


@pytest.mark.asyncio
async def test_a_file_with_no_storage_key_is_skipped_not_fatal(
    db_session: AsyncSession,
) -> None:
    """An intake attachment can carry a provider message handle instead of a
    stored object. There is nothing durable to point a task row at, and the
    conversion must still succeed."""
    d = await _desk(db_session, "tt-nokey")
    ticket = await _ticket_with_files(
        db_session, d,
        [
            {"id": str(uuid.uuid4()), "filename": "inline.eml", "message_id": "m-1"},
            {"id": str(uuid.uuid4()), "filename": "real.txt", "size": 5,
             "type": "text/plain", "key": "ticket-attachments/x/real.txt"},
        ],
    )

    result = await ServiceDeskTicketService(db_session).convert_to_task(
        d.ws.id, ticket.id, d.team.id, None, None, "medium"
    )
    await db_session.commit()

    rows = (
        await db_session.execute(
            select(TaskAttachment).where(TaskAttachment.task_id == result["task_id"])
        )
    ).scalars().all()
    assert [r.file_name for r in rows] == ["real.txt"]


@pytest.mark.asyncio
async def test_the_task_title_comes_from_the_ticket_title(
    db_session: AsyncSession,
) -> None:
    d = await _desk(db_session, "tt-tasktitle")
    ticket = await _ticket_with_files(db_session, d, [])

    result = await ServiceDeskTicketService(db_session).convert_to_task(
        d.ws.id, ticket.id, d.team.id, None, None, "medium"
    )
    assert result["task_title"] == "Needs engineering"


# ---------------------------------------------------------------------------
# The two remaining creation paths: a public form submission, and the docx
# intake. `headline_from_field_values` is covered above; these cover the callers
# that have to end up with a title through it — or, in the intake's case, in
# spite of it.
# ---------------------------------------------------------------------------


async def _form(db_session: AsyncSession, slug: str):
    """A workspace with one ticket form on it."""
    from uuid import uuid4

    from aexy.models.developer import Developer
    from aexy.models.ticketing import TicketForm
    from aexy.models.workspace import Workspace

    owner = Developer(id=str(uuid4()), name="Owner", email=f"{slug}@example.com")
    db_session.add(owner)
    await db_session.flush()
    workspace = Workspace(
        id=str(uuid4()), name=slug, slug=slug, owner_id=owner.id
    )
    db_session.add(workspace)
    await db_session.flush()
    form = TicketForm(
        id=str(uuid4()),
        workspace_id=workspace.id,
        name="Bug Reports",
        slug=f"{slug}-bugs",
    )
    db_session.add(form)
    await db_session.flush()
    return workspace, form


@pytest.mark.asyncio
async def test_a_form_submission_gets_a_title(db_session: AsyncSession) -> None:
    """The public form path — the one the column was added for.

    Covered here because `create_ticket` is what every public submission goes
    through, and nothing asserted its title: the email and call paths above are
    different callers.
    """
    from aexy.schemas.ticketing import PublicTicketSubmission
    from aexy.services.ticket_service import TicketService

    workspace, form = await _form(db_session, "tt-form")

    ticket = await TicketService(db_session).create_ticket(
        form_id=form.id,
        workspace_id=workspace.id,
        submission=PublicTicketSubmission(
            field_values={"subject": "  Cannot log in  ", "detail": "500 on retry"}
        ),
    )

    assert ticket.title == "Cannot log in"
    # And the blob is untouched, because the form renderer reads it from there.
    assert ticket.field_values["subject"] == "  Cannot log in  "


@pytest.mark.asyncio
async def test_a_submission_with_no_headline_key_has_no_title(
    db_session: AsyncSession,
) -> None:
    # A form with no subject-ish field. The column is nullable and readers fall
    # back, so absent is the correct outcome — not an empty string, and not the
    # form's name.
    from aexy.schemas.ticketing import PublicTicketSubmission
    from aexy.services.ticket_service import TicketService

    workspace, form = await _form(db_session, "tt-nohead")

    ticket = await TicketService(db_session).create_ticket(
        form_id=form.id,
        workspace_id=workspace.id,
        submission=PublicTicketSubmission(field_values={"how_urgent": "very"}),
    )

    assert ticket.title is None


@pytest.mark.asyncio
async def test_an_intake_ticket_gets_a_title_despite_uuid_keys(
    db_session: AsyncSession,
) -> None:
    """The docx intake path, and the regression that made this test necessary.

    The intake reads the form's own fields and writes `field_values` keyed by
    each field's UUID — deliberately, because a form's labels are the
    workspace's to choose and could be in any language. So
    `headline_from_field_values` finds nothing, and without setting the title
    explicitly every ticket created from a document would headline its form name:
    exactly the bug the column was added to fix, walked back in through a door
    that did not exist when the fix was written.
    """
    from uuid import uuid4

    from aexy.models.ticketing import TicketFormField
    from aexy.services.docx_intake_service import (
        Candidate,
        CreateOptions,
        DocxIntakeService,
    )

    workspace, form = await _form(db_session, "tt-intake")
    # Two fields, which is the realistic shape: the intake puts the title in the
    # first single-line field and the body in the first multi-line one. Neither
    # key is title/subject/summary, so this is also the case where
    # `headline_from_field_values` can find nothing.
    db_session.add_all(
        [
            TicketFormField(
                id=str(uuid4()),
                form_id=form.id,
                name="What happened",
                field_key="what_happened",
                field_type="text",
                position=0,
            ),
            TicketFormField(
                id=str(uuid4()),
                form_id=form.id,
                name="Detail",
                field_key="detail",
                field_type="textarea",
                position=1,
            ),
        ]
    )
    await db_session.flush()

    class _Doc:
        id = str(uuid4())
        title = "Client review"
        workspace_id = workspace.id
        content_format = "docx"

    created = await DocxIntakeService(db_session)._create_tickets(
        workspace.id,
        _Doc(),  # type: ignore[arg-type]
        [Candidate(title="Extend the notice period", source="comments")],
        CreateOptions(form_id=form.id),
        created_by_id=None,
    )

    from aexy.models.ticketing import Ticket

    ticket = await db_session.get(Ticket, created[0]["id"])
    assert ticket is not None
    # The point: a title, not None, and not the form's name.
    assert ticket.title == "Extend the notice period"
    assert ticket.title != form.name
    # And it is addressed by the form's own `field_key`, which is what the
    # renderer reads. Keying this by `field.id` instead — as it did at first —
    # put a UUID in the blob matching no field on the form, so the text would
    # not have been displayed at all.
    assert ticket.field_values["what_happened"] == "Extend the notice period"
    # The body goes to the long field, and carries a way back to the document.
    assert "Client review" in ticket.field_values["detail"]


@pytest.mark.asyncio
async def test_the_intakes_own_title_wins_over_a_derived_one(
    db_session: AsyncSession,
) -> None:
    """Even when `create_ticket` derives something, the intake's title stands.

    Deriving means guessing at a key in the submission blob, which is the best
    available answer for a ticket that arrived from outside. Here the title is
    known — it is what the intake decided the issue is called.

    And on a single-field form the derived answer is actively wrong: the body is
    appended to the headline field, so the guess returns the title *and* the
    whole body as one heading.
    """
    from uuid import uuid4

    from aexy.models.ticketing import Ticket, TicketFormField
    from aexy.services.docx_intake_service import (
        Candidate,
        CreateOptions,
        DocxIntakeService,
    )

    workspace, form = await _form(db_session, "tt-derived")
    field = TicketFormField(
        id=str(uuid4()),
        form_id=form.id,
        name="Title",
        # The case where both mechanisms can fire: `create_ticket` derives a
        # title from this key, and the intake must not write over it.
        field_key="title",
        field_type="text",
        position=0,
    )
    db_session.add(field)
    await db_session.flush()

    class _Doc:
        id = str(uuid4())
        title = "Client review"
        workspace_id = workspace.id
        content_format = "docx"

    created = await DocxIntakeService(db_session)._create_tickets(
        workspace.id,
        _Doc(),  # type: ignore[arg-type]
        [Candidate(title="Extend the notice period", source="comments")],
        CreateOptions(form_id=form.id),
        created_by_id=None,
    )

    ticket = await db_session.get(Ticket, created[0]["id"])
    assert ticket is not None
    assert ticket.title == "Extend the notice period"
