"""Row visibility across the three Service Desk roles.

The desk has two row scopes and three roles:

* **Ops KAM** — ``can_view_service_desk`` only. Sees the tickets assigned to
  them and nothing else. In particular *not* every other KAM's ticket: every
  unhandled ticket sits "pending with KAM", so treating that as a queue would
  show each KAM the whole desk.
* **Ops Lead** — adds ``can_view_all_service_desk``. Sees every ticket and can
  change none of them: oversight, not ownership.
* **Ops Head** — adds ``can_manage_service_desk``. Sees everything and holds the
  configuration authority.

Non-Ops functions (Finance, Sales, …) keep their pending-with queues, which is a
different thing entirely from peer-KAM access.

All of it resolves through ``resolve_scope_clause``, so these tests exercise the
paths that consume it — including the generic ticketing module and Ask AI, which
read the same underlying table and would otherwise hand out what the desk hides.
"""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from jose import jwt
from sqlalchemy import event, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.models.developer import Developer
from aexy.models.organization import Department, DepartmentMember
from aexy.models.workspace import Workspace, WorkspaceMember
from tests.conftest import seed_service_desk_taxonomy

settings = get_settings()


def _auth(developer_id: str) -> dict:
    payload = {"sub": developer_id, "type": "access", "exp": datetime.now(timezone.utc).timestamp() + 1800}
    return {"Authorization": f"Bearer {jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)}"}


def _sd(ws_id: str) -> str:
    return f"/api/v1/workspaces/{ws_id}/service-desk"


async def _developer(db: AsyncSession, label: str) -> Developer:
    dev = Developer(id=str(uuid4()), email=f"{label}-{uuid4().hex[:6]}@bimaplan.co", name=label)
    db.add(dev)
    await db.flush()
    return dev


async def _department(db: AsyncSession, ws_id: str, function_key: str, members: list[str]) -> None:
    dept = Department(
        id=str(uuid4()),
        workspace_id=ws_id,
        name=function_key,
        slug=f"{function_key}-{uuid4().hex[:6]}",
        function_key=function_key,
        path=f"/{function_key}/",
        depth=0,
    )
    db.add(dept)
    await db.flush()
    for dev_id in members:
        db.add(
            DepartmentMember(
                id=str(uuid4()), workspace_id=ws_id, department_id=dept.id, developer_id=dev_id
            )
        )


@pytest_asyncio.fixture
async def desk(db_session: AsyncSession):
    """One workspace, one Ops Head, two KAMs and a Finance member.

    The Ops Lead starts as a plain member: the grant/revoke test is what turns
    them into a lead, through the same custom-role flow an admin would use.
    """
    head = await _developer(db_session, "ops-head")
    lead = await _developer(db_session, "ops-lead")
    kam_a = await _developer(db_session, "kam-a")
    kam_b = await _developer(db_session, "kam-b")
    finance = await _developer(db_session, "finance")

    ws = Workspace(id=str(uuid4()), name="Bimaplan", slug=f"bp-{uuid4().hex[:6]}", owner_id=head.id)
    db_session.add(ws)
    await db_session.flush()
    # Stakeholders and request types are per-workspace rows rather than an enum,
    # so a desk has to be set up before tickets can be filed. These tests assert
    # on the legacy insurance slugs ("kam", "claims"), which is that template.
    await seed_service_desk_taxonomy(db_session, ws.id)

    db_session.add_all(
        [
            WorkspaceMember(workspace_id=ws.id, developer_id=head.id, role="admin", status="active"),
            # "member" maps to the developer template: can_view_service_desk, no
            # can_view_all_service_desk and no can_manage_service_desk.
            WorkspaceMember(workspace_id=ws.id, developer_id=lead.id, role="member", status="active"),
            WorkspaceMember(workspace_id=ws.id, developer_id=kam_a.id, role="member", status="active"),
            WorkspaceMember(workspace_id=ws.id, developer_id=kam_b.id, role="member", status="active"),
            WorkspaceMember(workspace_id=ws.id, developer_id=finance.id, role="member", status="active"),
        ]
    )

    await _department(db_session, ws.id, "ops_kam", [kam_a.id, kam_b.id])
    await _department(db_session, ws.id, "finance", [finance.id])
    await db_session.commit()

    return {
        "ws": ws.id,
        "head_id": head.id,
        "lead_id": lead.id,
        "kam_a_id": kam_a.id,
        "kam_b_id": kam_b.id,
        "head": _auth(head.id),
        "lead": _auth(lead.id),
        "kam_a": _auth(kam_a.id),
        "kam_b": _auth(kam_b.id),
        "finance": _auth(finance.id),
    }


async def _ticket(client, desk, subject: str, *, assignee: str | None = None, pending: str | None = None) -> str:
    """Log a ticket as the Ops Head, then place it deterministically."""
    ws, h = desk["ws"], desk["head"]
    r = await client.post(
        _sd(ws) + "/tickets/manual",
        headers=h,
        json={"subject": subject, "body": "body", "request_type": "claims"},
    )
    assert r.status_code == 201, r.text
    ticket_id = r.json()["ticket_id"]
    # Manual intake picks a random KAM; pin it so the assertions mean something.
    r = await client.patch(
        f"{_sd(ws)}/tickets/{ticket_id}", headers=h, json={"assigned_owner_id": assignee}
    )
    assert r.status_code == 200, r.text
    if pending:
        r = await client.patch(
            f"{_sd(ws)}/tickets/{ticket_id}/pending-with", headers=h, json={"pending_with": pending}
        )
        assert r.status_code == 200, r.text
    return ticket_id


@pytest_asyncio.fixture
async def tickets(client, desk):
    """One ticket per KAM (both pending with KAM) plus one pending with Finance."""
    return {
        "a": await _ticket(client, desk, "KAM A ticket", assignee=desk["kam_a_id"]),
        "b": await _ticket(client, desk, "KAM B ticket", assignee=desk["kam_b_id"]),
        "finance": await _ticket(client, desk, "Finance ticket", assignee=desk["kam_a_id"], pending="finance"),
    }


async def _grant_view_all(client, desk, developer_id: str) -> str:
    """Grant full view through the native custom-role + member flow."""
    ws, h = desk["ws"], desk["head"]
    role = await client.post(
        f"/api/v1/workspaces/{ws}/roles",
        headers=h,
        json={
            "name": f"Ops Lead {uuid4().hex[:6]}",
            "permissions": ["can_view_service_desk", "can_view_all_service_desk"],
        },
    )
    assert role.status_code == 201, role.text
    role_id = role.json()["id"]
    assigned = await client.patch(
        f"/api/v1/workspaces/{ws}/members/{developer_id}", headers=h, json={"role_id": role_id}
    )
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["role_id"] == role_id
    return role_id


# --------------------------------------------------------------------- KAM


@pytest.mark.asyncio
async def test_kam_sees_only_their_own_tickets(client, desk, tickets):
    """The core rule: pending-with KAM is not a shared queue."""
    ws = desk["ws"]
    b = _sd(ws)

    listed = await client.get(f"{b}/tickets", headers=desk["kam_a"])
    assert listed.status_code == 200
    # The finance ticket is still assigned to KAM A, so assignment — not the
    # pending-with stage — is what decides.
    assert {t["ticket_id"] for t in listed.json()} == {tickets["a"], tickets["finance"]}

    other = await client.get(f"{b}/tickets", headers=desk["kam_b"])
    assert {t["ticket_id"] for t in other.json()} == {tickets["b"]}

    # ...and the dashboard agrees with the list.
    dash = await client.get(f"{b}/dashboard", headers=desk["kam_b"])
    assert {t["ticket_id"] for t in dash.json()["tickets"]} == {tickets["b"]}

    scope = await client.get(f"{b}/settings", headers=desk["kam_b"])
    assert scope.json()["scope"] == "assigned"


@pytest.mark.asyncio
async def test_kam_reaching_a_peer_ticket_by_id_gets_404_everywhere(client, desk, tickets):
    """Knowing the id must not be enough — on reads or on mutations."""
    ws, h = desk["ws"], desk["kam_a"]
    b = _sd(ws)
    peer = tickets["b"]

    attempts = {
        "detail": await client.get(f"{b}/tickets/{peer}", headers=h),
        "patch fields": await client.patch(f"{b}/tickets/{peer}", headers=h, json={"request_type": "payout"}),
        "pending-with": await client.patch(
            f"{b}/tickets/{peer}/pending-with", headers=h, json={"pending_with": "closed"}
        ),
        "convert to task": await client.post(
            f"{b}/tickets/{peer}/convert-to-task", headers=h, json={"project_id": str(uuid4())}
        ),
        "split": await client.post(f"{b}/tickets/{peer}/split", headers=h, json={"issue_indexes": [2]}),
        # A read path like any other: the files on a peer's ticket are as much
        # out of scope as the ticket, and a 404 here keeps the id unenumerable
        # even though the endpoint returns bytes rather than JSON.
        "attachment download": await client.get(f"{b}/tickets/{peer}/attachments/0", headers=h),
    }
    for label, resp in attempts.items():
        assert resp.status_code == 404, f"KAM A reached peer ticket via {label}: {resp.status_code}"

    # The peer ticket is untouched: still open, still pending with KAM.
    still = await client.get(f"{b}/tickets/{peer}", headers=desk["head"])
    assert still.json()["pending_with"] == "kam"


@pytest.mark.asyncio
async def test_the_generic_ticket_module_cannot_be_used_to_walk_around_the_scope(
    client, desk, tickets
):
    """Service Desk tickets are rows in the generic ticketing table.

    Every by-id path there — read, update, assign, comment, attach, convert —
    would otherwise be an unscoped back door onto the same ticket, and the
    generic list opts Service Desk rows back in as soon as a form_id is given.
    """
    ws, h = desk["ws"], desk["kam_a"]
    g = f"/api/v1/workspaces/{ws}/tickets"
    peer = tickets["b"]

    attempts = {
        "detail": await client.get(f"{g}/{peer}", headers=h),
        "update": await client.patch(f"{g}/{peer}", headers=h, json={"priority": "urgent"}),
        "assign": await client.post(f"{g}/{peer}/assign", headers=h, json={"assignee_id": desk["kam_a_id"]}),
        "responses": await client.get(f"{g}/{peer}/responses", headers=h),
        "comment": await client.post(f"{g}/{peer}/responses", headers=h, json={"content": "mine now"}),
        "attachments": await client.get(f"{g}/{peer}/attachments/{uuid4()}", headers=h),
        "share link": await client.post(f"{g}/{peer}/share", headers=h, json={}),
        "create task": await client.post(
            f"{g}/{peer}/create-task", headers=h, json={"project_id": str(uuid4())}
        ),
    }
    for label, resp in attempts.items():
        assert resp.status_code == 404, f"generic tickets leaked the peer ticket via {label}: {resp.status_code}"

    # The form_id filter must not re-admit what the scope excludes.
    detail = await client.get(f"{g}/{tickets['a']}", headers=h)
    assert detail.status_code == 200
    form_id = detail.json()["form_id"]
    listed = await client.get(f"{g}?form_id={form_id}", headers=h)
    assert listed.status_code == 200
    assert {t["id"] for t in listed.json()["tickets"]} == {tickets["a"], tickets["finance"]}

    # The Ops Head, who may see everything, still can.
    assert (await client.get(f"{g}/{peer}", headers=desk["head"])).status_code == 200


@pytest.mark.asyncio
async def test_ask_ai_list_tickets_respects_the_same_scope(client, db_session, desk, tickets):
    """The assistant reads the shared table directly, field_values and all."""
    from aexy.services.ask_tools import _list_tickets

    mine = await _list_tickets({}, db_session, desk["ws"], desk["kam_a_id"])
    assert {t["id"] for t in mine["result"]} == {tickets["a"], tickets["finance"]}

    everything = await _list_tickets({}, db_session, desk["ws"], desk["head_id"])
    assert {t["id"] for t in everything["result"]} == set(tickets.values())


# ---------------------------------------------------------------- Ops Lead


@pytest.mark.asyncio
async def test_ops_lead_sees_everything_but_cannot_configure_the_desk(client, desk, tickets):
    """Full visibility is a separate capability from any authority to change things.

    The Lead used to be able to work a ticket they could see. That was the
    reported defect: an oversight role could reclassify or hand off work it does
    not own, and hiding the buttons would not have stopped the request. Reading
    everything and writing nothing is now the whole role.
    """
    ws, h = desk["ws"], desk["lead"]
    b = _sd(ws)

    await _grant_view_all(client, desk, desk["lead_id"])

    listed = await client.get(f"{b}/tickets", headers=h)
    assert {t["ticket_id"] for t in listed.json()} == set(tickets.values())
    assert (await client.get(f"{b}/tickets/{tickets['b']}", headers=h)).status_code == 200

    reported = await client.get(f"{b}/settings", headers=h)
    assert reported.json()["scope"] == "all"
    # ...and the page is told, truthfully, that it is read-only for config.
    assert reported.json()["can_manage"] is False

    forbidden = {
        "create partner": await client.post(f"{b}/accounts", headers=h, json={"name": "X", "domains": ["x.com"]}),
        "create mailbox": await client.post(f"{b}/mailboxes", headers=h, json={"address": "x@bimaplan.co"}),
        "rewrite template": await client.patch(
            f"{b}/templates/receipt", headers=h, json={"subject": "x", "body": "y"}
        ),
        "flip AI toggle": await client.patch(f"{b}/settings", headers=h, json={"ai_classification_enabled": True}),
        "flip auto split": await client.patch(f"{b}/settings", headers=h, json={"auto_split_enabled": True}),
        "move the clock": await client.patch(f"{b}/settings", headers=h, json={"working_hours_start": "00:00"}),
    }
    for label, resp in forbidden.items():
        assert resp.status_code == 403, f"Ops Lead could {label}: {resp.status_code}"

    # ...and every write path on a ticket they can plainly see is refused, not
    # merely hidden — the UI never gets to be the only thing standing in the way.
    read_only = {
        "hand the ticket off": await client.patch(
            f"{b}/tickets/{tickets['b']}/pending-with", headers=h, json={"pending_with": "sales"}
        ),
        "reclassify it": await client.patch(
            f"{b}/tickets/{tickets['b']}", headers=h, json={"request_type": "payout"}
        ),
        "email a stakeholder": await client.post(
            f"{b}/tickets/{tickets['b']}/email",
            headers=h,
            json={"to": "someone@abc.com", "subject": "Hi", "body": "Hello"},
        ),
        "convert it to a task": await client.post(
            f"{b}/tickets/{tickets['b']}/convert-to-task", headers=h, json={"project_id": str(uuid4())}
        ),
    }
    for label, resp in read_only.items():
        assert resp.status_code == 403, f"Ops Lead could {label}: {resp.status_code} {resp.text}"


@pytest.mark.asyncio
async def test_ops_head_sees_everything_and_holds_configuration_authority(client, desk, tickets):
    ws, h = desk["ws"], desk["head"]
    b = _sd(ws)

    listed = await client.get(f"{b}/tickets", headers=h)
    assert {t["ticket_id"] for t in listed.json()} == set(tickets.values())

    reported = await client.get(f"{b}/settings", headers=h)
    assert (reported.json()["scope"], reported.json()["can_manage"]) == ("all", True)

    assert (
        await client.post(f"{b}/accounts", headers=h, json={"name": "ABC", "domains": ["abc.com"]})
    ).status_code == 201
    assert (
        await client.patch(f"{b}/settings", headers=h, json={"ai_classification_enabled": True})
    ).status_code == 200


# --------------------------------------------------------- grant and revoke


@pytest.mark.asyncio
async def test_granting_and_revoking_view_all_moves_the_boundary(client, desk, tickets):
    """The permission has to be operable, not just present in the catalog."""
    ws = desk["ws"]
    b = _sd(ws)
    kam = desk["kam_b"]

    before = await client.get(f"{b}/tickets", headers=kam)
    assert {t["ticket_id"] for t in before.json()} == {tickets["b"]}

    role_id = await _grant_view_all(client, desk, desk["kam_b_id"])
    after = await client.get(f"{b}/tickets", headers=kam)
    assert {t["ticket_id"] for t in after.json()} == set(tickets.values())
    assert (await client.get(f"{b}/tickets/{tickets['a']}", headers=kam)).status_code == 200

    revoked = await client.patch(
        f"/api/v1/workspaces/{ws}/members/{desk['kam_b_id']}", headers=desk["head"], json={"role_id": None}
    )
    assert revoked.status_code == 200, revoked.text
    assert revoked.json()["role_id"] is None

    again = await client.get(f"{b}/tickets", headers=kam)
    assert {t["ticket_id"] for t in again.json()} == {tickets["b"]}
    assert (await client.get(f"{b}/tickets/{tickets['a']}", headers=kam)).status_code == 404
    assert role_id  # the role itself survives the revoke; only the assignment went


@pytest.mark.asyncio
async def test_a_role_from_another_workspace_cannot_be_assigned(client, db_session, desk):
    """Otherwise a role id would import another workspace's permission set."""
    ws = desk["ws"]
    other_owner = await _developer(db_session, "other-owner")
    other = Workspace(
        id=str(uuid4()), name="Other", slug=f"o-{uuid4().hex[:6]}", owner_id=other_owner.id
    )
    db_session.add(other)
    await db_session.flush()
    db_session.add(
        WorkspaceMember(workspace_id=other.id, developer_id=other_owner.id, role="admin", status="active")
    )
    await db_session.commit()

    foreign = await client.post(
        f"/api/v1/workspaces/{other.id}/roles",
        headers=_auth(other_owner.id),
        json={"name": "Foreign", "permissions": ["can_view_all_service_desk"]},
    )
    assert foreign.status_code == 201, foreign.text

    r = await client.patch(
        f"/api/v1/workspaces/{ws}/members/{desk['kam_a_id']}",
        headers=desk["head"],
        json={"role_id": foreign.json()["id"]},
    )
    assert r.status_code == 400, r.text


# ------------------------------------------------- reassignment + functions


@pytest.mark.asyncio
async def test_reassignment_moves_the_ticket_between_kam_scopes(client, desk, tickets):
    ws = desk["ws"]
    b = _sd(ws)
    moved = tickets["a"]

    r = await client.patch(
        f"{b}/tickets/{moved}", headers=desk["head"], json={"assigned_owner_id": desk["kam_b_id"]}
    )
    assert r.status_code == 200, r.text

    assert (await client.get(f"{b}/tickets/{moved}", headers=desk["kam_a"])).status_code == 404
    assert {t["ticket_id"] for t in (await client.get(f"{b}/tickets", headers=desk["kam_a"])).json()} == {
        tickets["finance"]
    }
    assert (await client.get(f"{b}/tickets/{moved}", headers=desk["kam_b"])).status_code == 200
    # The Ops Head saw it before and still does.
    assert {t["ticket_id"] for t in (await client.get(f"{b}/tickets", headers=desk["head"])).json()} == set(
        tickets.values()
    )


@pytest.mark.asyncio
async def test_non_kam_functions_keep_their_pending_with_queue(client, desk, tickets):
    """Finance sees what is pending with Finance — and nothing else.

    Dropping the KAM pending-with queue must not drop the others with it: a
    ticket handed to Finance is Finance's work regardless of who it is assigned
    to, which is exactly why the two rules are separate.
    """
    ws, h = desk["ws"], desk["finance"]
    b = _sd(ws)

    listed = await client.get(f"{b}/tickets", headers=h)
    assert {t["ticket_id"] for t in listed.json()} == {tickets["finance"]}
    assert (await client.get(f"{b}/settings", headers=h)).json()["scope"] == "function"

    # It is assigned to KAM A, but Finance still reaches it by id...
    assert (await client.get(f"{b}/tickets/{tickets['finance']}", headers=h)).status_code == 200
    # ...and gets nowhere near the KAM tickets it was never handed.
    assert (await client.get(f"{b}/tickets/{tickets['a']}", headers=h)).status_code == 404
    assert (await client.get(f"{b}/tickets/{tickets['b']}", headers=h)).status_code == 404


@pytest.mark.asyncio
async def test_split_family_reassignment_is_scoped_and_atomic(
    client, db_session, desk
):
    """Every assignment path moves the constrained split family or none of it."""
    from aexy.models.service_desk import ServiceDeskTicket
    from aexy.models.ticketing import Ticket

    ws = desk["ws"]
    b = _sd(ws)
    parent = await _ticket(client, desk, "Two requests in one mail", assignee=desk["kam_a_id"])

    row = await db_session.get(Ticket, parent)
    row.field_values = {
        **(row.field_values or {}),
        "detected_issues": [
            {
                "summary": "Keep the claim on the primary",
                "request_type": "claims",
                "product": None,
                "confidence": 0.9,
                "split_reason": None,
            },
            {
                "summary": "Payout goes to its own ticket",
                "request_type": "payout",
                "product": None,
                "confidence": 0.9,
                "split_reason": "Separate finance workflow",
            },
        ],
    }
    await db_session.commit()

    split = await client.post(f"{b}/tickets/{parent}/split", headers=desk["kam_a"], json={"issue_indexes": [2]})
    assert split.status_code == 200, split.text
    child = split.json()["created_ticket_ids"][0]

    child_sd = (
        await db_session.execute(
            select(ServiceDeskTicket).where(ServiceDeskTicket.ticket_id == child)
        )
    ).scalar_one()
    assert child_sd.split_parent_ticket_id == parent

    # The child initially inherits KAM A's assignment.
    assert (await client.get(f"{b}/tickets/{child}", headers=desk["kam_a"])).status_code == 200
    assert child in {t["ticket_id"] for t in (await client.get(f"{b}/tickets", headers=desk["kam_a"])).json()}
    assert (await client.get(f"{b}/tickets/{child}", headers=desk["kam_b"])).status_code == 404
    assert (await client.get(f"{b}/tickets/{child}", headers=desk["head"])).status_code == 200

    # Reassigning the primary through Service Desk moves the entire family.
    moved = await client.patch(
        f"{b}/tickets/{parent}",
        headers=desk["head"],
        json={"assigned_owner_id": desk["kam_b_id"]},
    )
    assert moved.status_code == 200, moved.text
    for ticket_id in (parent, child):
        assert (await client.get(f"{b}/tickets/{ticket_id}", headers=desk["kam_a"])).status_code == 404
        assert (await client.get(f"{b}/tickets/{ticket_id}", headers=desk["kam_b"])).status_code == 200
        assert (await client.get(f"{b}/tickets/{ticket_id}", headers=desk["head"])).status_code == 200
    # The test dependency shares one session across requests; commit here to
    # model the real get_db dependency, which commits every successful request.
    await db_session.commit()

    # A database failure while the child is dirty rolls the whole request back.
    def reject_child_update(session, _flush_context, _instances):
        for obj in session.dirty:
            if (
                isinstance(obj, Ticket)
                and str(obj.id) == child
                and inspect(obj).attrs.assignee_id.history.has_changes()
            ):
                raise RuntimeError("forced child assignment failure")

    event.listen(db_session.sync_session, "before_flush", reject_child_update)
    try:
        # A 500, not a raised RuntimeError. The exception is turned into a
        # response inside the CORS layer (see ErrorResponseMiddleware), which is
        # what a caller has always received — previously Starlette's own
        # ServerErrorMiddleware produced the 500 and then re-raised, and only an
        # in-process ASGI caller ever saw that second half. Asserting the status
        # is what the client actually observes; the rollback below is the point
        # of the test either way.
        failed = await client.patch(
            f"{b}/tickets/{parent}",
            headers=desk["head"],
            json={"assigned_owner_id": desk["kam_a_id"]},
        )
        assert failed.status_code == 500, failed.text
    finally:
        event.remove(db_session.sync_session, "before_flush", reject_child_update)
        await db_session.rollback()

    for ticket_id in (parent, child):
        row = await db_session.get(Ticket, ticket_id)
        assert row.assignee_id == desk["kam_b_id"]

    # The generic assign and generic update routes use the same family helper.
    generic = f"/api/v1/workspaces/{ws}/tickets"
    reassigned = await client.post(
        f"{generic}/{child}/assign",
        headers=desk["head"],
        json={"assignee_id": desk["kam_a_id"]},
    )
    assert reassigned.status_code == 200, reassigned.text
    updated = await client.patch(
        f"{generic}/{parent}",
        headers=desk["head"],
        json={"assignee_id": desk["kam_b_id"]},
    )
    assert updated.status_code == 200, updated.text
    for ticket_id in (parent, child):
        row = await db_session.get(Ticket, ticket_id)
        await db_session.refresh(row)
        assert row.assignee_id == desk["kam_b_id"]


@pytest.mark.asyncio
async def test_assigned_to_me_narrows_within_the_scope_never_past_it(client, desk, tickets):
    """The Home dashboard's filter is a filter, not a second way in.

    `assigned_to_me` exists so the personal work list can ask for one person's
    queue instead of pulling a KAM's whole account traffic. It is applied on top
    of `resolve_scope_clause`: an Ops Lead who can see every ticket still gets
    only their own back, and a KAM cannot reach a peer's ticket by asking for
    tickets assigned to them — the scope clause has already excluded it.
    """
    ws = desk["ws"]
    b = _sd(ws)

    # A KAM: same rows either way, because their scope is already their own work.
    scoped = await client.get(f"{b}/tickets?assigned_to_me=true", headers=desk["kam_a"])
    assert scoped.status_code == 200, scoped.text
    assert {t["ticket_id"] for t in scoped.json()} == {tickets["a"], tickets["finance"]}

    # KAM B asking for "mine" gets theirs, and nothing of KAM A's.
    other = await client.get(f"{b}/tickets?assigned_to_me=true", headers=desk["kam_b"])
    assert {t["ticket_id"] for t in other.json()} == {tickets["b"]}

    # The Ops Head sees every ticket unfiltered...
    everything = await client.get(f"{b}/tickets", headers=desk["head"])
    assert {t["ticket_id"] for t in everything.json()} == set(tickets.values())
    # ...and none of them once they ask for their own: they are assigned to KAMs.
    mine = await client.get(f"{b}/tickets?assigned_to_me=true", headers=desk["head"])
    assert mine.json() == []


@pytest.mark.asyncio
async def test_the_desk_list_can_be_capped(client, desk, tickets):
    """The dashboard asks for a page of work, not the desk's entire history."""
    ws = desk["ws"]
    capped = await client.get(f"{_sd(ws)}/tickets?limit=1", headers=desk["head"])
    assert capped.status_code == 200, capped.text
    assert len(capped.json()) == 1
