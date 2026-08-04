"""Unit tests for Service Desk Phase 4 — RBAC scoping + digest builder."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.organization import Department, DepartmentMember
from aexy.models.service_desk import ServiceDeskTicket, TicketPendingSegment
from aexy.models.ticketing import Ticket, TicketForm
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.service_desk_digest_service import ServiceDeskDigestService
from aexy.services.service_desk_service import ServiceDeskService
from tests.conftest import seed_service_desk_taxonomy

_form_id: dict[str, str] = {}
_counter: dict[str, int] = {}


async def _ws(db: AsyncSession, slug: str) -> Workspace:
    owner = Developer(email=f"o-{slug}@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    ws = Workspace(name=slug, slug=slug, owner_id=owner.id)
    db.add(ws)
    await db.flush()
    form = TicketForm(id=str(uuid4()), workspace_id=ws.id, name="SD", slug="service-desk", created_by_id=owner.id)
    db.add(form)
    await db.commit()
    _form_id[ws.id] = form.id
    _counter[ws.id] = 0
    # Stakeholders/request types are per-workspace rows now, not an enum, so a
    # bare workspace has no taxonomy and the service layer refuses to file a
    # ticket into one. Seeds the legacy insurance slugs these tests assert on.
    await seed_service_desk_taxonomy(db, ws.id)

    return ws


async def _dev(db: AsyncSession, name: str) -> Developer:
    d = Developer(email=f"{name}@example.com", name=name)
    db.add(d)
    await db.flush()
    return d


async def _member(db: AsyncSession, ws: Workspace, dev: Developer, role: str) -> None:
    db.add(WorkspaceMember(workspace_id=ws.id, developer_id=dev.id, role=role, status="active"))
    await db.flush()


async def _dept(db: AsyncSession, ws: Workspace, fn: str, head_id: str | None = None) -> Department:
    d = Department(workspace_id=ws.id, name=fn, slug=fn, function_key=fn, path=f"/{fn}/", depth=0, head_id=head_id)
    db.add(d)
    await db.flush()
    return d


async def _join(db: AsyncSession, ws: Workspace, dept: Department, dev: Developer) -> None:
    db.add(DepartmentMember(workspace_id=ws.id, department_id=dept.id, developer_id=dev.id))
    await db.flush()


async def _ticket(db: AsyncSession, ws: Workspace, pending_with: str, assignee_id: str | None, *, stage_age_days: float = 0.0) -> Ticket:
    _counter[ws.id] += 1
    t = Ticket(
        id=str(uuid4()), form_id=_form_id[ws.id], workspace_id=ws.id, ticket_number=_counter[ws.id],
        submitter_email="req@x.com", field_values={"subject": "s"}, status="in_progress",
        source="service_desk_webhook", assignee_id=assignee_id,
    )
    db.add(t)
    await db.flush()
    db.add(ServiceDeskTicket(id=str(uuid4()), ticket_id=t.id, workspace_id=ws.id, pending_with=pending_with, request_type="query"))
    db.add(TicketPendingSegment(
        id=str(uuid4()), workspace_id=ws.id, ticket_id=t.id, pending_with=pending_with,
        entered_at=datetime.now(timezone.utc) - timedelta(days=stage_age_days),
    ))
    await db.flush()
    return t


@pytest.mark.asyncio
async def test_manager_sees_all(db_session: AsyncSession):
    ws = await _ws(db_session, "p4-a")
    mgr = await _dev(db_session, "mgr")
    await _member(db_session, ws, mgr, "manager")
    await _ticket(db_session, ws, "finance", None)
    await _ticket(db_session, ws, "kam", None)
    await db_session.commit()

    rows = await ServiceDeskService(db_session).list_tickets(ws.id, developer_id=mgr.id)
    assert len(rows) == 2


@pytest.mark.asyncio
async def test_finance_member_scoped(db_session: AsyncSession):
    ws = await _ws(db_session, "p4-b")
    fin = await _dev(db_session, "fin")
    await _member(db_session, ws, fin, "member")
    dept = await _dept(db_session, ws, "finance")
    await _join(db_session, ws, dept, fin)
    await _ticket(db_session, ws, "finance", None)
    await _ticket(db_session, ws, "kam", None)
    await _ticket(db_session, ws, "insurer", None)
    await db_session.commit()

    rows = await ServiceDeskService(db_session).list_tickets(ws.id, developer_id=fin.id)
    assert {r.pending_with for r in rows} == {"finance"}


@pytest.mark.asyncio
async def test_kam_sees_own_and_kam_queue(db_session: AsyncSession):
    ws = await _ws(db_session, "p4-c")
    kam = await _dev(db_session, "neha")
    other = await _dev(db_session, "other")
    await _member(db_session, ws, kam, "member")
    dept = await _dept(db_session, ws, "ops_kam")
    await _join(db_session, ws, dept, kam)
    await _ticket(db_session, ws, "kam", None)               # kam queue — visible
    await _ticket(db_session, ws, "insurer", kam.id)          # assigned to me — visible
    await _ticket(db_session, ws, "insurer", other.id)        # someone else's — hidden
    await db_session.commit()

    rows = await ServiceDeskService(db_session).list_tickets(ws.id, developer_id=kam.id)
    assert len(rows) == 2


@pytest.mark.asyncio
async def test_unrelated_member_sees_nothing(db_session: AsyncSession):
    ws = await _ws(db_session, "p4-d")
    nobody = await _dev(db_session, "nobody")
    await _member(db_session, ws, nobody, "member")
    await _ticket(db_session, ws, "kam", None)
    await db_session.commit()

    rows = await ServiceDeskService(db_session).list_tickets(ws.id, developer_id=nobody.id)
    assert rows == []


@pytest.mark.asyncio
async def test_digest_builder(db_session: AsyncSession):
    ws = await _ws(db_session, "p4-e")
    head = await _dev(db_session, "opshead")
    neha = await _dev(db_session, "neha2")
    nehal = await _dev(db_session, "nehal2")
    dept = await _dept(db_session, ws, "ops_kam", head_id=head.id)
    # Digest recipients must still be on the team: department rows survive
    # someone leaving the workspace, so a departed employee would otherwise keep
    # receiving the desk's open-ticket list (subjects, partners) three times a
    # day. Membership is therefore part of the setup, not incidental to it.
    await _member(db_session, ws, neha, "member")
    await _member(db_session, ws, nehal, "member")
    await _join(db_session, ws, dept, neha)
    await _join(db_session, ws, dept, nehal)
    # 7 calendar days is five business days whatever weekday the suite runs on.
    # `3` passed on a Thursday and failed on a Monday, because the breach clock
    # only accrues working hours — the same trap already fixed in
    # test_service_desk_tat.py, missed here.
    await _ticket(db_session, ws, "insurer", neha.id, stage_age_days=7)  # breaching, neha
    await _ticket(db_session, ws, "kam", neha.id)                         # neha
    await _ticket(db_session, ws, "finance", nehal.id)                    # nehal
    await db_session.commit()

    digests = await ServiceDeskDigestService(db_session).build_digests(ws.id)
    by_email = {d.recipient_email: d for d in digests}

    assert by_email["neha2@example.com"].total_open == 2
    assert by_email["neha2@example.com"].breaching == 1
    assert by_email["nehal2@example.com"].total_open == 1
    ops = by_email["opshead@example.com"]
    assert ops.is_desk_lead and ops.total_open == 3


@pytest.mark.asyncio
async def test_digest_skips_people_who_left_the_workspace(db_session: AsyncSession):
    """A departed KAM keeps their department row but must stop being mailed."""
    ws = await _ws(db_session, "p4-left")
    head = await _dev(db_session, "opshead-left")
    gone = await _dev(db_session, "departed")
    dept = await _dept(db_session, ws, "ops_kam", head_id=head.id)
    await _member(db_session, ws, gone, "member")
    await _join(db_session, ws, dept, gone)
    await _ticket(db_session, ws, "kam", gone.id)
    await db_session.commit()

    emails = {d.recipient_email for d in await ServiceDeskDigestService(db_session).build_digests(ws.id)}
    assert "departed@example.com" in emails

    member = (
        await db_session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == ws.id,
                WorkspaceMember.developer_id == gone.id,
            )
        )
    ).scalar_one()
    member.status = "removed"
    await db_session.commit()

    emails = {d.recipient_email for d in await ServiceDeskDigestService(db_session).build_digests(ws.id)}
    assert "departed@example.com" not in emails


@pytest.mark.asyncio
async def test_ai_toggle_gates_classification(db_session: AsyncSession, monkeypatch):
    """_classify must only run when the workspace has AI enabled."""
    from aexy.schemas.service_desk import InboundEmail
    from aexy.services.service_desk_intake_service import ServiceDeskIntakeService
    from aexy.services.service_desk_service import ServiceDeskService
    from aexy.models.service_desk import ServiceDeskMailbox

    ws = await _ws(db_session, "p4-ai")
    mb = ServiceDeskMailbox(workspace_id=ws.id, address="operations@example.com", channel="webhook")
    db_session.add(mb)
    await db_session.commit()

    calls: list[str] = []

    async def spy(self, *a, **k):
        calls.append("classified")

    monkeypatch.setattr(ServiceDeskIntakeService, "_classify", spy)
    monkeypatch.setattr(ServiceDeskIntakeService, "_send_receipt", lambda self, *a, **k: _noop())

    async def _noop():
        return None

    svc = ServiceDeskIntakeService(db_session)
    # default OFF → no classification
    await svc.ingest(InboundEmail(to="operations@example.com", from_email="x@new.io", subject="s", message_id="ai-1"), mb, "service_desk_webhook")
    await db_session.commit()
    assert calls == []

    # enable at org level → classification runs
    await ServiceDeskService(db_session).update_settings(ws.id, True)
    await db_session.commit()
    await svc.ingest(InboundEmail(to="operations@example.com", from_email="y@new.io", subject="s", message_id="ai-2"), mb, "service_desk_webhook")
    await db_session.commit()
    assert calls == ["classified"]


@pytest.mark.asyncio
async def test_editable_templates_default_and_override(db_session: AsyncSession):
    from aexy.services.service_desk_templates import (
        list_sd_templates,
        render_sd,
        upsert_sd_template,
    )

    ws = await _ws(db_session, "p4-tmpl")

    # default (no row yet) still renders with the built-in copy
    subject, body = await render_sd(db_session, ws.id, "receipt", {"display_id": "BSD-7", "subject": "Hi", "requester_name": "Ravi"})
    # The built-in copy signs off with the workspace's own name. It used to say
    # "Bimaplan Operations" literally, so every other company sent
    # Bimaplan-branded acknowledgements until someone edited three templates.
    assert "BSD-7" in subject and "Ravi" in body
    assert ws.name in body and "Bimaplan Operations" not in body

    tmpls = await list_sd_templates(db_session, ws.id)
    assert {t["key"] for t in tmpls} == {"receipt", "closure", "digest"}
    assert all(t["customised"] is False for t in tmpls)

    # Ops customises the receipt copy
    await upsert_sd_template(db_session, ws.id, "receipt", "Ticket {{display_id}} logged", "Namaste {{requester_name}}!", None)
    await db_session.commit()

    subject2, body2 = await render_sd(db_session, ws.id, "receipt", {"display_id": "BSD-8", "requester_name": "Asha"})
    assert subject2 == "Ticket BSD-8 logged"
    assert body2 == "Namaste Asha!"
    tmpls2 = await list_sd_templates(db_session, ws.id)
    assert next(t for t in tmpls2 if t["key"] == "receipt")["customised"] is True


@pytest.mark.asyncio
async def test_generic_tickets_list_excludes_service_desk(db_session: AsyncSession):
    """Service Desk tickets must not leak into the generic tickets list/stats."""
    from aexy.services.ticket_service import TicketService

    ws = await _ws(db_session, "p4-leak")
    # a normal (form) ticket + a service-desk ticket, both real Ticket rows
    normal = Ticket(
        id=str(uuid4()), form_id=_form_id[ws.id], workspace_id=ws.id, ticket_number=101,
        field_values={"subject": "normal"}, status="new", source="form",
    )
    sd = Ticket(
        id=str(uuid4()), form_id=_form_id[ws.id], workspace_id=ws.id, ticket_number=102,
        field_values={"subject": "sd"}, status="new", source="service_desk_webhook",
    )
    db_session.add_all([normal, sd])
    await db_session.commit()

    svc = TicketService(db_session)
    tickets, total = await svc.list_tickets(ws.id)
    ids = {t.id for t in tickets}
    assert normal.id in ids and sd.id not in ids and total == 1

    stats = await svc.get_stats(ws.id)
    assert stats["total_tickets"] == 1  # SD excluded


@pytest.mark.asyncio
async def test_convert_to_task(db_session: AsyncSession):
    from fastapi import HTTPException
    from aexy.models.sprint import SprintTask
    from aexy.services.service_desk_ticket_service import ServiceDeskTicketService
    from sqlalchemy import select as _select

    from aexy.models.team import Team

    ws = await _ws(db_session, "p4-conv")
    ticket = await _ticket(db_session, ws, "kam", None)
    # A real project in THIS workspace — convert-to-task validates the target
    # rather than trusting the caller's project_id.
    team = Team(id=str(uuid4()), workspace_id=ws.id, name="Ops Followups", slug="ops-followups")
    db_session.add(team)
    await db_session.commit()

    project_id = team.id
    svc = ServiceDeskTicketService(db_session)
    res = await svc.convert_to_task(ws.id, ticket.id, project_id=project_id, title="Do the thing")
    await db_session.commit()

    assert res["linked"] is True and res["task_id"]
    task = (await db_session.execute(_select(SprintTask).where(SprintTask.id == res["task_id"]))).scalar_one()
    assert str(task.team_id) == project_id and task.source_type == "ticket" and str(task.source_id) == ticket.id
    t = await db_session.get(Ticket, ticket.id)
    assert str(t.linked_task_id) == res["task_id"]

    # second conversion is rejected
    with pytest.raises(HTTPException) as ei:
        await svc.convert_to_task(ws.id, ticket.id, project_id=project_id)
    assert ei.value.status_code == 400
