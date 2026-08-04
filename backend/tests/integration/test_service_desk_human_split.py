"""Focused API coverage for transactional human splitting of detected issues."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.models.developer import Developer
from aexy.models.service_desk import ServiceDeskTicket, TicketPendingSegment
from aexy.models.ticketing import Ticket, TicketResponse
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.service_desk_intake_service import ServiceDeskIntakeService

settings = get_settings()


def _auth(developer_id: str) -> dict[str, str]:
    payload = {
        "sub": developer_id,
        "type": "access",
        "exp": datetime.now(timezone.utc).timestamp() + 1800,
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
    return {"Authorization": f"Bearer {token}"}


def _base(workspace_id: str) -> str:
    return f"/api/v1/workspaces/{workspace_id}/service-desk"


def _issues() -> list[dict]:
    return [
        {
            "summary": "Check the policy status",
            "request_type": "query",
            "lob": None,
            "confidence": 0.91,
            "split_reason": None,
        },
        {
            "summary": "Investigate claim C-9",
            "request_type": "claims",
            "lob": None,
            "confidence": 0.88,
            "split_reason": "A separate claims workflow is required",
        },
        {
            "summary": "Release payout P-4",
            "request_type": "payout",
            "lob": None,
            "confidence": 0.86,
            "split_reason": "A separate finance outcome is required",
        },
    ]


@pytest_asyncio.fixture
async def split_context(client, db_session: AsyncSession):
    developer = Developer(
        id=str(uuid4()), email=f"split-{uuid4().hex[:6]}@bimaplan.co", name="Triage User"
    )
    db_session.add(developer)
    await db_session.flush()
    workspace = Workspace(
        id=str(uuid4()),
        name="Split Workspace",
        slug=f"split-{uuid4().hex[:6]}",
        owner_id=developer.id,
    )
    db_session.add(workspace)
    await db_session.flush()
    db_session.add(
        WorkspaceMember(
            workspace_id=workspace.id,
            developer_id=developer.id,
            role="admin",
            status="active",
        )
    )
    await db_session.commit()

    headers = _auth(developer.id)
    response = await client.post(
        _base(workspace.id) + "/tickets/manual",
        headers=headers,
        json={"subject": "Original combined request", "request_type": "query"},
    )
    assert response.status_code == 201, response.text
    ticket_id = response.json()["ticket_id"]
    primary = await db_session.get(Ticket, ticket_id)
    assert primary is not None
    primary.field_values = {**primary.field_values, "detected_issues": _issues()}
    service_desk_ticket = (
        await db_session.execute(
            select(ServiceDeskTicket).where(ServiceDeskTicket.ticket_id == ticket_id)
        )
    ).scalar_one()
    service_desk_ticket.needs_triage = True
    await db_session.commit()

    return {
        "workspace": workspace,
        "developer": developer,
        "headers": headers,
        "ticket_id": ticket_id,
    }


@pytest.mark.asyncio
async def test_human_split_preserves_primary_and_records_actor(client, db_session, split_context):
    workspace = split_context["workspace"]
    ticket_id = split_context["ticket_id"]
    response = await client.post(
        f"{_base(workspace.id)}/tickets/{ticket_id}/split",
        headers=split_context["headers"],
        json={"issue_indexes": [2, 3]},
    )

    assert response.status_code == 200, response.text
    created_ids = response.json()["created_ticket_ids"]
    assert len(created_ids) == 2
    assert len(response.json()["created_ticket_display_ids"]) == 2

    primary = await db_session.get(Ticket, ticket_id)
    assert primary is not None
    assert primary.field_values["subject"] == "Original combined request"
    assert primary.field_values["split_done_indexes"] == [2, 3]
    assert [item["ticket_id"] for item in primary.field_values["split_children"]] == created_ids

    children = list(
        (
            await db_session.execute(select(Ticket).where(Ticket.id.in_(created_ids)))
        ).scalars().all()
    )
    assert {child.field_values["subject"] for child in children} == {
        "Investigate claim C-9",
        "Release payout P-4",
    }
    child_segments = list(
        (
            await db_session.execute(
                select(TicketPendingSegment).where(TicketPendingSegment.ticket_id.in_(created_ids))
            )
        ).scalars().all()
    )
    assert len(child_segments) == 2
    assert all(segment.changed_by_id == split_context["developer"].id for segment in child_segments)
    assert all("Split by Triage User" in (segment.note or "") for segment in child_segments)

    audit = (
        await db_session.execute(
            select(TicketResponse).where(
                TicketResponse.ticket_id == ticket_id,
                TicketResponse.author_id == split_context["developer"].id,
            )
        )
    ).scalar_one()
    assert "Split issues 2, 3" in audit.content

    detail = await client.get(
        f"{_base(workspace.id)}/tickets/{ticket_id}", headers=split_context["headers"]
    )
    assert detail.status_code == 200
    assert len(detail.json()["detected_issues"]) == 3
    assert detail.json()["split_done_indexes"] == [2, 3]


@pytest.mark.parametrize(
    ("indexes", "expected_status"),
    [([2, 2], 400), ([1], 400), ([4], 400)],
    ids=["duplicate", "primary-index", "out-of-range"],
)
@pytest.mark.asyncio
async def test_invalid_indexes_create_nothing(
    client, db_session, split_context, indexes, expected_status
):
    workspace = split_context["workspace"]
    ticket_id = split_context["ticket_id"]
    response = await client.post(
        f"{_base(workspace.id)}/tickets/{ticket_id}/split",
        headers=split_context["headers"],
        json={"issue_indexes": indexes},
    )

    assert response.status_code == expected_status
    tickets = list(
        (
            await db_session.execute(select(Ticket).where(Ticket.workspace_id == workspace.id))
        ).scalars().all()
    )
    assert [ticket.id for ticket in tickets] == [ticket_id]
    primary = await db_session.get(Ticket, ticket_id)
    assert "split_done_indexes" not in primary.field_values


@pytest.mark.asyncio
async def test_previously_split_index_is_rejected_without_another_child(
    client, db_session, split_context
):
    workspace = split_context["workspace"]
    ticket_id = split_context["ticket_id"]
    path = f"{_base(workspace.id)}/tickets/{ticket_id}/split"

    first = await client.post(
        path, headers=split_context["headers"], json={"issue_indexes": [2]}
    )
    assert first.status_code == 200
    second = await client.post(
        path, headers=split_context["headers"], json={"issue_indexes": [2]}
    )

    assert second.status_code == 409
    tickets = list(
        (
            await db_session.execute(select(Ticket).where(Ticket.workspace_id == workspace.id))
        ).scalars().all()
    )
    assert len(tickets) == 2


@pytest.mark.asyncio
async def test_child_failure_rolls_back_every_attempted_child(
    client, db_session, split_context, monkeypatch
):
    workspace = split_context["workspace"]
    ticket_id = split_context["ticket_id"]
    original = ServiceDeskIntakeService._create_child_ticket
    calls = 0

    async def fail_after_second_child(self, *args, **kwargs):
        nonlocal calls
        calls += 1
        child = await original(self, *args, **kwargs)
        if calls == 2:
            raise RuntimeError("second child failed")
        return child

    monkeypatch.setattr(
        ServiceDeskIntakeService, "_create_child_ticket", fail_after_second_child
    )
    response = await client.post(
        f"{_base(workspace.id)}/tickets/{ticket_id}/split",
        headers=split_context["headers"],
        json={"issue_indexes": [2, 3]},
    )

    assert response.status_code == 500
    tickets = list(
        (
            await db_session.execute(select(Ticket).where(Ticket.workspace_id == workspace.id))
        ).scalars().all()
    )
    assert [ticket.id for ticket in tickets] == [ticket_id]
    primary = await db_session.get(Ticket, ticket_id)
    await db_session.refresh(primary)
    assert "split_done_indexes" not in primary.field_values
    audits = list(
        (
            await db_session.execute(
                select(TicketResponse).where(TicketResponse.ticket_id == ticket_id)
            )
        ).scalars().all()
    )
    assert audits == []
