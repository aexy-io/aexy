"""Unit tests for the Service Desk intake service.

Covers domain-based auto-assignment (account → vendor → internal → random KAM
fallback), first pending-with segment creation, reply threading, and
idempotency. AI classification and the receipt email are best-effort hooks and
are stubbed out here.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.google_integration import GoogleIntegration
from aexy.models.organization import Department, DepartmentMember
from aexy.models.service_desk import (
    ServiceDeskIngestedMessage,
    ServiceDeskStakeholder,
    ServiceDeskVendor,
    ServiceDeskVendorDomain,
    ServiceDeskProduct,
    ServiceDeskMailbox,
    ServiceDeskAccount,
    ServiceDeskAccountDomain,
    ServiceDeskTicket,
    TicketPendingSegment,
)
from aexy.models.ticketing import Ticket, TicketResponse
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.schemas.service_desk import InboundAttachment, InboundEmail, MailboxCreate
from aexy.services import service_desk_intake_service as sd_mod
from aexy.services import service_desk_mailer as mailer
from aexy.services.service_desk_intake_service import ServiceDeskIntakeService
from aexy.services.service_desk_service import ServiceDeskService
from tests.conftest import seed_service_desk_taxonomy

_REAL_CLASSIFY = ServiceDeskIntakeService._classify
_REAL_SEND_RECEIPT = ServiceDeskIntakeService._send_receipt


@pytest.fixture(autouse=True)
def _stub_best_effort(monkeypatch):
    async def _no_candidates(self, *a, **k):
        return [], False

    async def _noop(self, *a, **k):
        return None

    monkeypatch.setattr(ServiceDeskIntakeService, "_classify", _no_candidates)
    monkeypatch.setattr(ServiceDeskIntakeService, "_send_receipt", _noop)


async def _workspace(db: AsyncSession, slug: str) -> Workspace:
    owner = Developer(email=f"owner-{slug}@example.com", name=f"Owner {slug}")
    db.add(owner)
    await db.flush()
    ws = Workspace(name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(ws)
    await db.commit()
    await db.refresh(ws)
    # Stakeholders/request types are per-workspace rows now, not an enum, so a
    # bare workspace has no taxonomy and the service layer refuses to file a
    # ticket into one. Seeds the legacy insurance slugs these tests assert on.
    await seed_service_desk_taxonomy(db, ws.id)

    return ws


async def _mailbox(
    db: AsyncSession, ws: Workspace, address: str = "operations@example.com"
) -> ServiceDeskMailbox:
    mb = ServiceDeskMailbox(workspace_id=ws.id, address=address, channel="webhook")
    db.add(mb)
    await db.commit()
    await db.refresh(mb)
    return mb


async def _google_integration(
    db: AsyncSession, ws: Workspace, address: str = "operations@bimaplan.co"
) -> GoogleIntegration:
    integration = GoogleIntegration(
        workspace_id=ws.id,
        access_token="access-token",
        refresh_token="refresh-token",
        token_expiry=datetime.now(timezone.utc),
        google_email=address,
        gmail_sync_enabled=True,
    )
    db.add(integration)
    await db.commit()
    await db.refresh(integration)
    return integration


@pytest.mark.asyncio
async def test_gmail_mailbox_auto_links_to_matching_google_account(db_session: AsyncSession):
    ws = await _workspace(db_session, "gmail-create")
    integration = await _google_integration(db_session, ws)

    mailbox = await ServiceDeskService(db_session).create_mailbox(
        ws.id,
        MailboxCreate(address=integration.google_email, channel="gmail_sync"),
    )

    assert mailbox.integration_id == integration.id


@pytest.mark.asyncio
async def test_gmail_sync_backfills_existing_matching_mailbox(db_session: AsyncSession):
    ws = await _workspace(db_session, "gmail-backfill")
    integration = await _google_integration(db_session, ws)
    mailbox = ServiceDeskMailbox(
        workspace_id=ws.id,
        address=integration.google_email,
        channel="gmail_sync",
    )
    db_session.add(mailbox)
    await db_session.commit()

    found = await ServiceDeskIntakeService.find_mailbox_by_integration(db_session, integration.id)

    assert found is not None
    assert found.id == mailbox.id
    assert found.integration_id == integration.id


async def _ops_kam(db: AsyncSession, ws: Workspace, n: int = 2) -> list[str]:
    dept = Department(
        workspace_id=ws.id, name="KAM", slug="kam", function_key="ops_kam", path="/kam/", depth=0
    )
    db.add(dept)
    await db.flush()
    ids = []
    for i in range(n):
        dev = Developer(email=f"kam{i}-{ws.slug}@example.com", name=f"KAM{i}")
        db.add(dev)
        await db.flush()
        db.add(DepartmentMember(workspace_id=ws.id, department_id=dept.id, developer_id=dev.id))
        # A KAM must also be an active workspace member — auto-assignment skips
        # department rows left behind by people who have left the workspace.
        db.add(
            WorkspaceMember(
                workspace_id=ws.id, developer_id=dev.id, role="member", status="active"
            )
        )
        ids.append(dev.id)
    await db.commit()
    return ids


def _email(**kw) -> InboundEmail:
    base = dict(to="operations@example.com", from_email="x@example.com", subject="Help", body_text="Body")
    base.update(kw)
    return InboundEmail(**base)


async def _sd_for(db: AsyncSession, ticket_id: str) -> ServiceDeskTicket:
    return (
        await db.execute(select(ServiceDeskTicket).where(ServiceDeskTicket.ticket_id == ticket_id))
    ).scalar_one()


async def _ai_workspace(
    db: AsyncSession, slug: str, auto_split: bool = False
) -> tuple[Workspace, ServiceDeskMailbox]:
    """Create an AI-enabled workspace where the sender is a known partner."""
    ws = await _workspace(db, slug)
    ws.settings = {
        "service_desk": {
            "ai_classification_enabled": True,
            "auto_split_enabled": auto_split,
        }
    }
    # The desk's own domain must differ from the partner's, or every message from
    # the partner reads as internal mail and is flagged for triage before the
    # classifier ever runs.
    mb = await _mailbox(db, ws, address="operations@desk.example")
    partner = ServiceDeskAccount(workspace_id=ws.id, name="Known Partner")
    db.add(partner)
    await db.flush()
    db.add(
        ServiceDeskAccountDomain(
            workspace_id=ws.id,
            account_id=partner.id,
            domain="example.com",
        )
    )
    await db.commit()
    return ws, mb


@pytest.mark.asyncio
async def test_partner_domain_match_assigns_mapped_kam(db_session: AsyncSession):
    ws = await _workspace(db_session, "sd-a")
    mb = await _mailbox(db_session, ws)
    kam = Developer(email="neha@example.com", name="Neha")
    db_session.add(kam)
    await db_session.flush()
    account = ServiceDeskAccount(workspace_id=ws.id, name="ABC Finance", assigned_owner_id=kam.id)
    db_session.add(account)
    await db_session.flush()
    db_session.add(ServiceDeskAccountDomain(workspace_id=ws.id, account_id=account.id, domain="abcfinance.com"))
    await db_session.commit()

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _email(from_email="rahul@abcfinance.com", message_id="m1"), mb, "service_desk_webhook"
    )
    await db_session.commit()

    assert ticket is not None
    assert ticket.assignee_id == kam.id
    sd = await _sd_for(db_session, ticket.id)
    assert sd.account_id == account.id
    assert sd.pending_with == "kam"
    # This workspace has not opted in to AI, so nothing set the LOB or confirmed
    # the request type — the ticket is owned, but a KAM still has to finish it.
    assert sd.needs_triage is True
    # first ledger segment opened
    seg = (
        await db_session.execute(select(TicketPendingSegment).where(TicketPendingSegment.ticket_id == ticket.id))
    ).scalars().all()
    assert len(seg) == 1 and seg[0].pending_with == "kam" and seg[0].exited_at is None


@pytest.mark.asyncio
async def test_attachment_context_is_persisted_on_the_primary_ticket(
    db_session: AsyncSession,
):
    ws = await _workspace(db_session, "sd-attachment-context")
    mb = await _mailbox(db_session, ws)

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _email(
            message_id="attachment-context-1",
            attachments=[
                InboundAttachment(
                    filename="members.csv",
                    content_type="text/csv",
                    size_bytes=42,
                    preview='[["policy_no"], ["P-1"]]',
                )
            ],
        ),
        mb,
        "service_desk_gmail",
    )
    await db_session.commit()

    assert ticket is not None
    assert ticket.field_values["attachments"] == [
        {
            "filename": "members.csv",
            "content_type": "text/csv",
            "size_bytes": 42,
            "preview": '[["policy_no"], ["P-1"]]',
            "attachment_id": None,
            # Stamped so a file arriving on a later reply can still be re-fetched
            # from its own message rather than the ticket's first one.
            "message_id": "attachment-context-1",
        }
    ]


@pytest.mark.asyncio
async def test_high_confidence_candidates_never_create_children_in_a0(
    db_session: AsyncSession,
    monkeypatch,
):
    ws, mb = await _ai_workspace(db_session, "sd-a0-no-children")
    db_session.add_all(
        [
            ServiceDeskProduct(workspace_id=ws.id, name="GMC/GHI"),
            ServiceDeskProduct(workspace_id=ws.id, name="Personal Accident"),
        ]
    )
    await db_session.commit()

    class Gateway:
        async def call_llm(self, *args, **kwargs):
            return (
                '{"issues":['
                '{"summary":"Issue attached policies","request_type":"policy_issuance",'
                '"product":"GMC/GHI","confidence":0.94,"split_reason":"Policy workflow"},'
                '{"summary":"Investigate claim C-9","request_type":"claims",'
                '"product":"Personal Accident","confidence":0.91,'
                '"split_reason":"Claims workflow"}'
                "]}",
            )

    monkeypatch.setattr(ServiceDeskIntakeService, "_classify", _REAL_CLASSIFY)
    monkeypatch.setattr("aexy.llm.gateway.get_llm_gateway", lambda: Gateway())

    primary = await ServiceDeskIntakeService(db_session).ingest(
        _email(message_id="a0-no-children-1"),
        mb,
        "service_desk_gmail",
    )
    await db_session.commit()

    tickets = (
        await db_session.execute(select(Ticket).where(Ticket.workspace_id == ws.id))
    ).scalars().all()
    sd = await _sd_for(db_session, primary.id)

    assert len(tickets) == 1
    assert sd.needs_triage is True
    assert len(primary.field_values["detected_issues"]) == 2
    assert "issues_overflow" not in primary.field_values


@pytest.mark.asyncio
async def test_candidate_overflow_is_recorded_before_candidates_are_capped(
    db_session: AsyncSession,
    monkeypatch,
):
    ws, mb = await _ai_workspace(db_session, "sd-a0-overflow")
    issues = [
        {
            "summary": f"Independent request {index}",
            "request_type": "claims" if index % 2 else "query",
            "product": None,
            "confidence": 0.95,
            "split_reason": "Different requested outcome",
        }
        for index in range(6)
    ]

    class Gateway:
        async def call_llm(self, *args, **kwargs):
            return (json.dumps({"issues": issues}),)

    monkeypatch.setattr(ServiceDeskIntakeService, "_classify", _REAL_CLASSIFY)
    monkeypatch.setattr("aexy.llm.gateway.get_llm_gateway", lambda: Gateway())

    primary = await ServiceDeskIntakeService(db_session).ingest(
        _email(message_id="a0-overflow-1"),
        mb,
        "service_desk_gmail",
    )
    await db_session.commit()

    tickets = (
        await db_session.execute(select(Ticket).where(Ticket.workspace_id == ws.id))
    ).scalars().all()
    sd = await _sd_for(db_session, primary.id)

    assert len(tickets) == 1
    assert len(primary.field_values["detected_issues"]) == 5
    assert primary.field_values["issues_overflow"] is True
    assert sd.needs_triage is True


@pytest.mark.asyncio
async def test_provider_failure_keeps_one_primary_ticket_and_marks_triage(
    db_session: AsyncSession,
    monkeypatch,
):
    ws, mb = await _ai_workspace(db_session, "sd-a0-provider-failure")

    class Gateway:
        async def call_llm(self, *args, **kwargs):
            raise RuntimeError("provider unavailable")

    monkeypatch.setattr(ServiceDeskIntakeService, "_classify", _REAL_CLASSIFY)
    monkeypatch.setattr("aexy.llm.gateway.get_llm_gateway", lambda: Gateway())

    primary = await ServiceDeskIntakeService(db_session).ingest(
        _email(message_id="a0-provider-failure-1"),
        mb,
        "service_desk_gmail",
    )
    await db_session.commit()

    tickets = (
        await db_session.execute(select(Ticket).where(Ticket.workspace_id == ws.id))
    ).scalars().all()
    sd = await _sd_for(db_session, primary.id)

    assert len(tickets) == 1
    assert sd.needs_triage is True
    assert "detected_issues" not in primary.field_values


@pytest.mark.parametrize(
    "model_response",
    [
        "not-json",
        '{"issues": invalid}',
        '{"issues": []}',
    ],
    ids=["missing-json", "invalid-json", "empty-candidates"],
)
@pytest.mark.asyncio
async def test_model_or_parse_failure_keeps_primary_ticket_and_marks_triage(
    db_session: AsyncSession,
    monkeypatch,
    model_response: str,
):
    ws, mb = await _ai_workspace(db_session, "sd-a0-model-failure")

    class Gateway:
        async def call_llm(self, *args, **kwargs):
            return (model_response,)

    monkeypatch.setattr(ServiceDeskIntakeService, "_classify", _REAL_CLASSIFY)
    monkeypatch.setattr("aexy.llm.gateway.get_llm_gateway", lambda: Gateway())

    primary = await ServiceDeskIntakeService(db_session).ingest(
        _email(message_id="a0-model-failure-1"),
        mb,
        "service_desk_gmail",
    )
    await db_session.commit()

    tickets = (
        await db_session.execute(select(Ticket).where(Ticket.workspace_id == ws.id))
    ).scalars().all()
    sd = await _sd_for(db_session, primary.id)

    assert len(tickets) == 1
    assert sd.needs_triage is True


# --------------------------------------------------------------- A1 auto-split


def _two_issue_gateway(
    first_type: str = "policy_issuance",
    second_type: str = "claims",
    first_confidence: float = 0.94,
    second_confidence: float = 0.91,
    extra: list[dict] | None = None,
):
    """A model that reports two (or more) independently actionable requests."""
    issues = [
        {
            "summary": "Issue the attached policies",
            "request_type": first_type,
            "product": "GMC/GHI",
            "confidence": first_confidence,
            "split_reason": "Policy workflow",
        },
        {
            "summary": "Investigate claim C-9",
            "request_type": second_type,
            "product": "Personal Accident",
            "confidence": second_confidence,
            "split_reason": "Claims workflow",
        },
    ] + (extra or [])

    class Gateway:
        async def call_llm(self, *args, **kwargs):
            return (json.dumps({"issues": issues}),)

    return Gateway()


async def _lobs(db: AsyncSession, ws: Workspace) -> None:
    db.add_all(
        [
            ServiceDeskProduct(workspace_id=ws.id, name="GMC/GHI"),
            ServiceDeskProduct(workspace_id=ws.id, name="Personal Accident"),
        ]
    )
    await db.commit()


async def _tickets_of(db: AsyncSession, ws: Workspace) -> list[Ticket]:
    return list(
        (await db.execute(select(Ticket).where(Ticket.workspace_id == ws.id))).scalars().all()
    )


@pytest.mark.asyncio
async def test_auto_split_disabled_keeps_two_confident_requests_as_one_ticket(
    db_session: AsyncSession,
    monkeypatch,
):
    """The setting is the gate: off means one triage ticket, however sure the model is."""
    ws, mb = await _ai_workspace(db_session, "sd-a1-split-off")
    await _lobs(db_session, ws)
    monkeypatch.setattr(ServiceDeskIntakeService, "_classify", _REAL_CLASSIFY)
    monkeypatch.setattr("aexy.llm.gateway.get_llm_gateway", _two_issue_gateway)

    primary = await ServiceDeskIntakeService(db_session).ingest(
        _email(message_id="a1-split-off-1"), mb, "service_desk_gmail"
    )
    await db_session.commit()

    sd = await _sd_for(db_session, primary.id)
    assert len(await _tickets_of(db_session, ws)) == 1
    assert sd.needs_triage is True
    assert len(primary.field_values["detected_issues"]) == 2
    assert "split_children" not in primary.field_values


@pytest.mark.asyncio
async def test_auto_split_enabled_creates_exactly_one_child_ticket(
    db_session: AsyncSession,
    monkeypatch,
):
    ws, mb = await _ai_workspace(db_session, "sd-a1-split-on", auto_split=True)
    await _lobs(db_session, ws)
    monkeypatch.setattr(ServiceDeskIntakeService, "_classify", _REAL_CLASSIFY)
    monkeypatch.setattr("aexy.llm.gateway.get_llm_gateway", _two_issue_gateway)

    primary = await ServiceDeskIntakeService(db_session).ingest(
        _email(message_id="a1-split-on-1", thread_id="T-split"), mb, "service_desk_gmail"
    )
    await db_session.commit()

    tickets = await _tickets_of(db_session, ws)
    assert len(tickets) == 2
    child = next(t for t in tickets if t.id != primary.id)
    child_sd = await _sd_for(db_session, child.id)
    primary_sd = await _sd_for(db_session, primary.id)

    # Both halves are cleanly classified, so neither needs a human to untangle it.
    assert primary_sd.request_type == "policy_issuance"
    assert child_sd.request_type == "claims"
    assert primary_sd.needs_triage is False and child_sd.needs_triage is False
    # The child inherits the owner, so it lands in the same KAM's queue (B7).
    assert child.assignee_id == primary.assignee_id
    assert child.field_values["split_from_ticket_id"] == primary.id
    assert primary.field_values["split_children"] == [
        {"ticket_id": child.id, "display_id": f"SD-{child.ticket_number}"}
    ]
    # Only the primary carries the thread: a reply must not match two tickets.
    assert primary_sd.thread_ref == "T-split" and child_sd.thread_ref is None
    # Its own ledger segment opens, so the breach clock runs on the child too.
    segments = (
        await db_session.execute(
            select(TicketPendingSegment).where(TicketPendingSegment.ticket_id == child.id)
        )
    ).scalars().all()
    assert len(segments) == 1 and segments[0].exited_at is None


@pytest.mark.parametrize(
    ("gateway_kwargs", "reason"),
    [
        ({"second_type": "policy_issuance"}, "same request type twice"),
        ({"second_confidence": 0.84}, "one candidate below the confidence floor"),
        (
            {
                "extra": [
                    {
                        "summary": "Release the pending payout",
                        "request_type": "payout",
                        "product": None,
                        "confidence": 0.93,
                        "split_reason": "Payout workflow",
                    }
                ]
            },
            "three confident candidates",
        ),
    ],
    ids=["same-request-type", "low-confidence", "three-candidates"],
)
@pytest.mark.asyncio
async def test_anything_short_of_the_contract_stays_one_triage_ticket(
    db_session: AsyncSession,
    monkeypatch,
    gateway_kwargs: dict,
    reason: str,
):
    """Ambiguity is resolved by a human, never by creating more tickets."""
    ws, mb = await _ai_workspace(db_session, f"sd-a1-{reason.replace(' ', '-')}", auto_split=True)
    await _lobs(db_session, ws)
    monkeypatch.setattr(ServiceDeskIntakeService, "_classify", _REAL_CLASSIFY)
    monkeypatch.setattr(
        "aexy.llm.gateway.get_llm_gateway", lambda: _two_issue_gateway(**gateway_kwargs)
    )

    primary = await ServiceDeskIntakeService(db_session).ingest(
        _email(message_id=f"a1-{reason}"), mb, "service_desk_gmail"
    )
    await db_session.commit()

    sd = await _sd_for(db_session, primary.id)
    assert len(await _tickets_of(db_session, ws)) == 1, reason
    assert sd.needs_triage is True
    assert "split_children" not in primary.field_values


@pytest.mark.asyncio
async def test_child_failure_rolls_back_and_leaves_one_intact_triage_ticket(
    db_session: AsyncSession,
    monkeypatch,
):
    """A half-created split is the one outcome worse than not splitting."""
    ws, mb = await _ai_workspace(db_session, "sd-a1-child-failure", auto_split=True)
    await _lobs(db_session, ws)

    async def explode(self, *a, **k):
        # Raised after the child ticket row is inserted, so this proves the
        # savepoint takes that row back rather than leaving an orphan.
        raise RuntimeError("child creation failed")

    monkeypatch.setattr(ServiceDeskIntakeService, "_classify", _REAL_CLASSIFY)
    monkeypatch.setattr(ServiceDeskIntakeService, "_product_id", explode)
    monkeypatch.setattr("aexy.llm.gateway.get_llm_gateway", _two_issue_gateway)

    primary = await ServiceDeskIntakeService(db_session).ingest(
        _email(message_id="a1-child-failure-1"), mb, "service_desk_gmail"
    )
    await db_session.commit()

    sd = await _sd_for(db_session, primary.id)
    assert len(await _tickets_of(db_session, ws)) == 1
    assert sd.needs_triage is True
    assert "split_children" not in primary.field_values
    service_desk_rows = (
        await db_session.execute(
            select(ServiceDeskTicket).where(ServiceDeskTicket.workspace_id == ws.id)
        )
    ).scalars().all()
    assert len(service_desk_rows) == 1


@pytest.mark.asyncio
async def test_one_acknowledgement_names_the_primary_and_every_child(
    db_session: AsyncSession,
    monkeypatch,
):
    """The requester wrote once, so they are told once — about both tickets."""
    ws, mb = await _ai_workspace(db_session, "sd-a1-one-ack", auto_split=True)
    await _lobs(db_session, ws)
    monkeypatch.setattr(ServiceDeskIntakeService, "_classify", _REAL_CLASSIFY)
    monkeypatch.setattr(ServiceDeskIntakeService, "_send_receipt", _REAL_SEND_RECEIPT)
    monkeypatch.setattr("aexy.llm.gateway.get_llm_gateway", _two_issue_gateway)

    service = ServiceDeskIntakeService(db_session)
    primary = await service.ingest(_email(message_id="a1-one-ack-1"), mb, "service_desk_gmail")
    await db_session.commit()

    tickets = await _tickets_of(db_session, ws)
    child = next(t for t in tickets if t.id != primary.id)
    queued = service._pending_notifications

    assert len(queued) == 1
    assert queued[0]["vars"]["display_id"] == f"SD-{primary.ticket_number}"
    assert f"SD-{child.ticket_number}" in queued[0]["vars"]["additional_tickets"]


@pytest.mark.asyncio
async def test_single_ticket_acknowledgement_mentions_no_other_ticket(
    db_session: AsyncSession,
    monkeypatch,
):
    ws = await _workspace(db_session, "sd-a1-plain-ack")
    mb = await _mailbox(db_session, ws)
    monkeypatch.setattr(ServiceDeskIntakeService, "_send_receipt", _REAL_SEND_RECEIPT)

    service = ServiceDeskIntakeService(db_session)
    await service.ingest(_email(message_id="a1-plain-ack-1"), mb, "service_desk_webhook")
    await db_session.commit()

    assert service._pending_notifications[0]["vars"]["additional_tickets"] == ""


# ------------------------------------------------- A1 automatic-response guards


@pytest.mark.asyncio
async def test_automatic_response_is_never_split_or_classified(
    db_session: AsyncSession,
    monkeypatch,
):
    ws, mb = await _ai_workspace(db_session, "sd-a1-auto-response", auto_split=True)
    await _lobs(db_session, ws)
    monkeypatch.setattr(ServiceDeskIntakeService, "_classify", _REAL_CLASSIFY)
    monkeypatch.setattr(ServiceDeskIntakeService, "_send_receipt", _REAL_SEND_RECEIPT)
    monkeypatch.setattr("aexy.llm.gateway.get_llm_gateway", _two_issue_gateway)

    service = ServiceDeskIntakeService(db_session)
    primary = await service.ingest(
        _email(
            message_id="a1-auto-response-1",
            subject="Automatic reply: Out of office",
            headers={"Auto-Submitted": "auto-replied; owner-email=partner@example.com"},
        ),
        mb,
        "service_desk_gmail",
    )
    await db_session.commit()

    sd = await _sd_for(db_session, primary.id)
    assert len(await _tickets_of(db_session, ws)) == 1
    assert sd.needs_triage is True
    # Nothing was read from it, so no request type or LOB was invented.
    assert "detected_issues" not in primary.field_values
    assert sd.product_id is None and sd.ai_confidence is None
    # Acknowledging an auto-responder is how mail loops start.
    assert service._pending_notifications == []


@pytest.mark.parametrize(
    "email_kwargs",
    [
        {"headers": {"auto-submitted": "auto-generated"}},
        {"headers": {"X-Autoreply": "yes"}},
        {"headers": {"X-Autorespond": "replied"}},
        {"headers": {"Precedence": "bulk"}},
        {"subject": "Out of Office: Re: SD-1 policy query"},
        {"subject": "Automatic reply: your request"},
    ],
    ids=["auto-submitted", "x-autoreply", "x-autorespond", "precedence", "ooo-subject", "auto-reply-subject"],
)
@pytest.mark.asyncio
async def test_automatic_response_does_not_reopen_a_closed_ticket(
    db_session: AsyncSession,
    email_kwargs: dict,
):
    """An away message is not the requester disputing a closure."""
    ws = await _workspace(db_session, f"sd-a1-no-reopen-{abs(hash(str(email_kwargs))) % 10000}")
    mb = await _mailbox(db_session, ws)
    service = ServiceDeskIntakeService(db_session)

    first = await service.ingest(
        _email(message_id="a1-no-reopen-1", thread_id="T-closed"), mb, "service_desk_webhook"
    )
    sd = await _sd_for(db_session, first.id)
    sd.pending_with = "closed"
    await db_session.commit()

    await service.ingest(
        _email(message_id="a1-no-reopen-2", thread_id="T-closed", body_text="I am away", **email_kwargs),
        mb,
        "service_desk_webhook",
    )
    await db_session.commit()
    await db_session.refresh(sd)

    assert sd.pending_with == "closed"
    # Still filed as correspondence, so the exchange is not lost.
    responses = (
        await db_session.execute(select(TicketResponse).where(TicketResponse.ticket_id == first.id))
    ).scalars().all()
    assert len(responses) == 1


@pytest.mark.asyncio
async def test_ordinary_reply_still_reopens_a_closed_ticket(db_session: AsyncSession):
    """The guard must not swallow a real requester chasing a closed ticket."""
    ws = await _workspace(db_session, "sd-a1-reopen")
    mb = await _mailbox(db_session, ws)
    service = ServiceDeskIntakeService(db_session)

    first = await service.ingest(
        _email(message_id="a1-reopen-1", thread_id="T-reopen"), mb, "service_desk_webhook"
    )
    sd = await _sd_for(db_session, first.id)
    sd.pending_with = "closed"
    await db_session.commit()

    await service.ingest(
        _email(message_id="a1-reopen-2", thread_id="T-reopen", body_text="Still broken"),
        mb,
        "service_desk_webhook",
    )
    await db_session.commit()
    await db_session.refresh(sd)

    assert sd.pending_with == "kam"


@pytest.mark.asyncio
async def test_our_own_outbound_mail_is_skipped_before_any_ticket_exists(
    db_session: AsyncSession,
):
    """The synced mailbox sends our receipts, so they come back in — and stop here."""
    ws = await _workspace(db_session, "sd-a1-self-loop")
    mb = await _mailbox(db_session, ws)

    result = await ServiceDeskIntakeService(db_session).ingest(
        _email(
            from_email="operations@bimaplan.co",
            message_id="a1-self-loop-1",
            subject="SD-1 Your request",
            headers={sd_mod.OUTBOUND_MARKER_HEADER: "1"},
        ),
        mb,
        "service_desk_gmail",
    )
    await db_session.commit()

    assert result is None
    assert await _tickets_of(db_session, ws) == []
    # Not even the idempotency claim is written, so nothing has to be cleaned up.
    assert (
        await db_session.execute(
            select(ServiceDeskIngestedMessage).where(
                ServiceDeskIngestedMessage.workspace_id == ws.id
            )
        )
    ).scalars().all() == []


@pytest.mark.asyncio
async def test_partner_mail_from_the_same_domain_is_still_ingested(db_session: AsyncSession):
    """The loop guard is the marker header — not the sender's domain."""
    ws = await _workspace(db_session, "sd-a1-same-domain")
    mb = await _mailbox(db_session, ws)
    await _ops_kam(db_session, ws)

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _email(from_email="priya@bimaplan.co", message_id="a1-same-domain-1"),
        mb,
        "service_desk_gmail",
    )
    await db_session.commit()

    assert ticket is not None


@pytest.mark.asyncio
async def test_reply_typed_in_gmail_from_the_desk_never_opens_a_ticket(
    db_session: AsyncSession,
):
    """A colleague answering from Gmail carries no marker header.

    The incremental sync walks History ``messagesAdded``, which includes SENT, so
    that reply comes back in as if inbound. Ingesting it made the desk its own
    requester — a ticket whose submitter was the desk, acknowledged to the desk.
    """
    ws = await _workspace(db_session, "sd-a1-desk-reply-new")
    mb = await _mailbox(db_session, ws)
    await _ops_kam(db_session, ws)

    result = await ServiceDeskIntakeService(db_session).ingest(
        _email(
            from_email=f"Bimaplan Operations <{mb.address}>",
            to="requester@partner.example",
            message_id="a1-desk-reply-1",
            thread_id="T-unknown",
            body_text="Hi, I got it.",
        ),
        mb,
        "service_desk_gmail",
    )
    await db_session.commit()

    assert result is None
    assert await _tickets_of(db_session, ws) == []


@pytest.mark.asyncio
async def test_reply_typed_in_gmail_from_the_desk_is_filed_as_outgoing(
    db_session: AsyncSession,
):
    """It belongs on the ticket it answers, so the timeline holds the whole thread."""
    ws = await _workspace(db_session, "sd-a1-desk-reply-thread")
    mb = await _mailbox(db_session, ws)
    await _ops_kam(db_session, ws)
    service = ServiceDeskIntakeService(db_session)

    ticket = await service.ingest(
        _email(
            from_email="bhanu@partner.example",
            message_id="a1-desk-thread-1",
            thread_id="T-desk",
        ),
        mb,
        "service_desk_gmail",
    )
    await db_session.commit()

    same = await service.ingest(
        _email(
            from_email=mb.address,
            to="bhanu@partner.example",
            message_id="a1-desk-thread-2",
            thread_id="T-desk",
            body_text="Hi, I got it.",
        ),
        mb,
        "service_desk_gmail",
    )
    await db_session.commit()

    assert same is not None
    assert same.id == ticket.id
    assert len(await _tickets_of(db_session, ws)) == 1
    responses = (
        await db_session.execute(
            select(TicketResponse).where(TicketResponse.ticket_id == ticket.id)
        )
    ).scalars().all()
    assert [r.author_email for r in responses] == [mb.address]
    assert "Hi, I got it." in responses[0].content


def _capture_receipt_sends(monkeypatch) -> list[tuple[str, str]]:
    """Collect what ``flush_notifications`` would put on the wire.

    Also stubs the thread lookahead to "nobody replied", so a test that wants the
    Gmail side of the check has to say so.
    """
    sent: list[tuple[str, str]] = []

    async def _send(db, mailbox, to_email, subject, body_text, thread_id=None):
        sent.append((to_email, subject))

    async def _nobody_replied(db, mailbox, thread_id, after=None):
        return False

    monkeypatch.setattr(mailer, "send_service_desk_email", _send)
    monkeypatch.setattr(mailer, "desk_replied_in_thread", _nobody_replied)
    return sent


@pytest.mark.asyncio
async def test_acknowledgement_still_reaches_a_requester_nobody_has_answered(
    db_session: AsyncSession,
    monkeypatch,
):
    """The control for the two suppression tests below."""
    ws = await _workspace(db_session, "sd-a1-ack-control")
    mb = await _mailbox(db_session, ws)
    await _ops_kam(db_session, ws)
    monkeypatch.setattr(ServiceDeskIntakeService, "_send_receipt", _REAL_SEND_RECEIPT)
    sent = _capture_receipt_sends(monkeypatch)

    service = ServiceDeskIntakeService(db_session)
    await service.ingest(
        _email(from_email="bhanu@partner.example", message_id="ack-control-1"),
        mb,
        "service_desk_gmail",
    )
    await db_session.commit()
    await service.flush_notifications()

    assert [to for to, _ in sent] == ["bhanu@partner.example"]


@pytest.mark.asyncio
async def test_acknowledgement_stands_down_once_the_desk_has_answered_by_hand(
    db_session: AsyncSession,
    monkeypatch,
):
    """A person already replied, so "your request has been logged" is noise.

    Worse than noise: it arrives after the human answer and reads as though the
    desk never saw it.
    """
    ws = await _workspace(db_session, "sd-a1-ack-answered")
    mb = await _mailbox(db_session, ws)
    await _ops_kam(db_session, ws)
    monkeypatch.setattr(ServiceDeskIntakeService, "_send_receipt", _REAL_SEND_RECEIPT)
    sent = _capture_receipt_sends(monkeypatch)

    service = ServiceDeskIntakeService(db_session)
    await service.ingest(
        _email(
            from_email="bhanu@partner.example",
            message_id="ack-answered-1",
            thread_id="T-ack-answered",
        ),
        mb,
        "service_desk_gmail",
    )
    await service.ingest(
        _email(
            from_email=mb.address,
            to="bhanu@partner.example",
            message_id="ack-answered-2",
            thread_id="T-ack-answered",
            body_text="Hi, I got it.",
        ),
        mb,
        "service_desk_gmail",
    )
    await db_session.commit()
    await service.flush_notifications()

    assert sent == []


@pytest.mark.asyncio
async def test_acknowledgement_stands_down_when_the_account_shows_a_human_reply(
    db_session: AsyncSession,
    monkeypatch,
):
    """The reply may not be synced yet, so the account itself is asked."""
    ws = await _workspace(db_session, "sd-a1-ack-lookahead")
    mb = await _mailbox(db_session, ws)
    await _ops_kam(db_session, ws)
    monkeypatch.setattr(ServiceDeskIntakeService, "_send_receipt", _REAL_SEND_RECEIPT)
    sent = _capture_receipt_sends(monkeypatch)

    async def _somebody_replied(db, mailbox, thread_id, after=None):
        return True

    monkeypatch.setattr(mailer, "desk_replied_in_thread", _somebody_replied)

    service = ServiceDeskIntakeService(db_session)
    await service.ingest(
        _email(
            from_email="bhanu@partner.example",
            message_id="ack-lookahead-1",
            thread_id="T-ack-lookahead",
        ),
        mb,
        "service_desk_gmail",
    )
    await db_session.commit()
    await service.flush_notifications()

    assert sent == []


@pytest.mark.asyncio
async def test_the_desk_is_never_acknowledged_to_itself(
    db_session: AsyncSession,
    monkeypatch,
):
    """The guard behind the guard.

    ``ingest`` now refuses the desk's own mail outright, so this goes through
    ``create_ticket`` — the path a ticket written before that check, or logged by
    hand against the desk address, would take.
    """
    ws = await _workspace(db_session, "sd-a1-ack-self")
    mb = await _mailbox(db_session, ws)
    await _ops_kam(db_session, ws)
    monkeypatch.setattr(ServiceDeskIntakeService, "_send_receipt", _REAL_SEND_RECEIPT)

    service = ServiceDeskIntakeService(db_session)
    await service.create_ticket(
        ws.id,
        _email(from_email=mb.address, message_id="ack-self-1"),
        mb,
        "service_desk_manual",
    )
    await db_session.commit()

    assert service._pending_notifications == []


@pytest.mark.asyncio
async def test_desk_answering_its_own_mail_does_not_reopen_a_closed_ticket(
    db_session: AsyncSession,
):
    """Only the requester disputes a closure. The desk replying is not that."""
    ws = await _workspace(db_session, "sd-a1-desk-reply-closed")
    mb = await _mailbox(db_session, ws)
    await _ops_kam(db_session, ws)
    service = ServiceDeskIntakeService(db_session)

    ticket = await service.ingest(
        _email(message_id="a1-desk-closed-1", thread_id="T-desk-closed"),
        mb,
        "service_desk_gmail",
    )
    sd = await _sd_for(db_session, ticket.id)
    sd.pending_with = "closed"
    await db_session.commit()

    await service.ingest(
        _email(
            from_email=mb.address,
            message_id="a1-desk-closed-2",
            thread_id="T-desk-closed",
            body_text="Closing note sent by hand.",
        ),
        mb,
        "service_desk_gmail",
    )
    await db_session.commit()
    await db_session.refresh(sd)

    assert sd.pending_with == "closed"


@pytest.mark.asyncio
async def test_insurer_domain_match_flags_triage(db_session: AsyncSession):
    ws = await _workspace(db_session, "sd-b")
    mb = await _mailbox(db_session, ws)
    await _ops_kam(db_session, ws)
    vendor = ServiceDeskVendor(workspace_id=ws.id, name="XYZ Life")
    db_session.add(vendor)
    await db_session.flush()
    db_session.add(ServiceDeskVendorDomain(workspace_id=ws.id, vendor_id=vendor.id, domain="xyzlifeinsurance.com"))
    await db_session.commit()

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _email(from_email="claims@xyzlifeinsurance.com", message_id="m2"), mb, "service_desk_webhook"
    )
    await db_session.commit()

    sd = await _sd_for(db_session, ticket.id)
    assert sd.vendor_id == vendor.id
    assert sd.account_id is None
    assert sd.needs_triage is True


@pytest.mark.asyncio
async def test_internal_sender_marks_internal(db_session: AsyncSession):
    ws = await _workspace(db_session, "sd-c")
    mb = await _mailbox(db_session, ws)
    kams = await _ops_kam(db_session, ws)

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _email(from_email="priya.sales@example.com", message_id="m3"), mb, "service_desk_webhook"
    )
    await db_session.commit()

    sd = await _sd_for(db_session, ticket.id)
    assert sd.origin == "internal"
    assert sd.needs_triage is True
    assert ticket.assignee_id in kams  # random fallback into Ops/KAM


@pytest.mark.asyncio
async def test_no_match_random_fallback(db_session: AsyncSession):
    ws = await _workspace(db_session, "sd-d")
    mb = await _mailbox(db_session, ws)
    kams = await _ops_kam(db_session, ws)

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _email(from_email="contact@newpartner.io", message_id="m4"), mb, "service_desk_webhook"
    )
    await db_session.commit()

    sd = await _sd_for(db_session, ticket.id)
    assert sd.needs_triage is True
    assert sd.account_id is None
    assert ticket.assignee_id in kams


@pytest.mark.asyncio
async def test_auto_assignment_follows_the_workspace_taxonomy_not_a_literal(
    db_session: AsyncSession,
):
    """A desk whose own vocabulary routes elsewhere still gets an owner.

    `_random_owner` compared `Department.function_key` to the literal "ops_kam" —
    a key only workspaces set up from the insurance-broking template ever had. Any
    other workspace had every piece of incoming mail arrive unassigned, with
    nothing on screen to say why. It now resolves the department behind the desk's
    own default stakeholder.
    """
    ws = await _workspace(db_session, "sd-taxonomy")
    mb = await _mailbox(db_session, ws)

    # This workspace calls its front line Support, and its first internal bucket
    # routes there rather than to an insurance KAM desk.
    kam = (
        await db_session.execute(
            select(ServiceDeskStakeholder).where(
                ServiceDeskStakeholder.workspace_id == ws.id,
                ServiceDeskStakeholder.slug == "kam",
            )
        )
    ).scalar_one()
    kam.function_key = "support"
    dept = Department(
        workspace_id=ws.id,
        name="Support",
        slug="support",
        function_key="support",
        path="/support/",
        depth=0,
    )
    db_session.add(dept)
    await db_session.flush()
    agent = Developer(email=f"agent-{ws.slug}@example.com", name="Agent")
    db_session.add(agent)
    await db_session.flush()
    db_session.add(
        DepartmentMember(workspace_id=ws.id, department_id=dept.id, developer_id=agent.id)
    )
    db_session.add(
        WorkspaceMember(
            workspace_id=ws.id, developer_id=agent.id, role="member", status="active"
        )
    )
    await db_session.commit()

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _email(from_email="someone@newcustomer.io", message_id="m-taxonomy"),
        mb,
        "service_desk_webhook",
    )
    await db_session.commit()

    assert ticket.assignee_id == agent.id


@pytest.mark.asyncio
async def test_a_retired_function_key_still_resolves(db_session: AsyncSession):
    """A workspace part-way through the key migration must not lose assignment.

    The department row still says `ops_kam` while the stakeholder has moved to
    `operations`; the two are edited on different screens, so this state is normal
    for a while rather than exceptional.
    """
    ws = await _workspace(db_session, "sd-retired")
    mb = await _mailbox(db_session, ws)
    kams = await _ops_kam(db_session, ws)  # department carries "ops_kam"

    kam = (
        await db_session.execute(
            select(ServiceDeskStakeholder).where(
                ServiceDeskStakeholder.workspace_id == ws.id,
                ServiceDeskStakeholder.slug == "kam",
            )
        )
    ).scalar_one()
    kam.function_key = "operations"
    await db_session.commit()

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _email(from_email="someone@newcustomer.io", message_id="m-retired"),
        mb,
        "service_desk_webhook",
    )
    await db_session.commit()

    assert ticket.assignee_id in kams


@pytest.mark.asyncio
async def test_threading_appends_reply(db_session: AsyncSession):
    ws = await _workspace(db_session, "sd-e")
    mb = await _mailbox(db_session, ws)
    await _ops_kam(db_session, ws)
    svc = ServiceDeskIntakeService(db_session)

    first = await svc.ingest(_email(from_email="a@newpartner.io", message_id="msg-1", thread_id="T1"), mb, "service_desk_webhook")
    await db_session.commit()

    # reply in the same thread
    second = await svc.ingest(
        _email(from_email="a@newpartner.io", message_id="msg-2", thread_id="T1", body_text="A reply"), mb, "service_desk_webhook"
    )
    await db_session.commit()

    assert second is not None and second.id == first.id
    tickets = (await db_session.execute(select(Ticket).where(Ticket.workspace_id == ws.id))).scalars().all()
    assert len(tickets) == 1  # no new ticket
    responses = (
        await db_session.execute(select(TicketResponse).where(TicketResponse.ticket_id == first.id))
    ).scalars().all()
    assert len(responses) == 1 and responses[0].content == "A reply"


@pytest.mark.asyncio
async def test_idempotent_on_message_id(db_session: AsyncSession):
    ws = await _workspace(db_session, "sd-f")
    mb = await _mailbox(db_session, ws)
    await _ops_kam(db_session, ws)
    svc = ServiceDeskIntakeService(db_session)

    t1 = await svc.ingest(_email(from_email="a@newpartner.io", message_id="dup-1"), mb, "service_desk_webhook")
    await db_session.commit()
    dup = await svc.ingest(_email(from_email="a@newpartner.io", message_id="dup-1"), mb, "service_desk_webhook")
    await db_session.commit()

    assert t1 is not None and dup is None
    count = (await db_session.execute(select(Ticket).where(Ticket.workspace_id == ws.id))).scalars().all()
    assert len(count) == 1


@pytest.mark.asyncio
async def test_subject_bsd_token_threads(db_session: AsyncSession):
    ws = await _workspace(db_session, "sd-g")
    mb = await _mailbox(db_session, ws)
    await _ops_kam(db_session, ws)
    svc = ServiceDeskIntakeService(db_session)

    first = await svc.ingest(_email(from_email="a@newpartner.io", message_id="s1", subject="Original"), mb, "service_desk_webhook")
    await db_session.commit()
    num = first.ticket_number

    second = await svc.ingest(
        _email(from_email="a@newpartner.io", message_id="s2", subject=f"Re: SD-{num} Original", body_text="threaded"), mb, "service_desk_webhook"
    )
    await db_session.commit()

    assert second is not None and second.id == first.id


@pytest.mark.asyncio
async def test_whole_address_key_beats_domain_key(db_session: AsyncSession):
    """A partner may be keyed on a whole address, not just a domain.

    Shared-domain providers (gmail.com) otherwise collapse every sender into one
    company, which makes multi-partner routing untestable from a single real
    mailbox. A plus-suffixed address must win over a record for its bare domain.
    """
    ws = await _workspace(db_session, "addrkey")
    mb = await _mailbox(db_session, ws)
    kams = await _ops_kam(db_session, ws)

    catch_all = ServiceDeskAccount(workspace_id=ws.id, name="Catch All", assigned_owner_id=kams[0])
    specific = ServiceDeskAccount(workspace_id=ws.id, name="Specific Co", assigned_owner_id=kams[1])
    db_session.add_all([catch_all, specific])
    await db_session.flush()
    db_session.add_all(
        [
            ServiceDeskAccountDomain(workspace_id=ws.id, account_id=catch_all.id, domain="gmail.com"),
            ServiceDeskAccountDomain(
                workspace_id=ws.id, account_id=specific.id, domain="me+specific@gmail.com"
            ),
        ]
    )
    await db_session.commit()

    svc = ServiceDeskIntakeService(db_session)

    # The suffixed address routes to its own company, not the domain catch-all,
    # and survives a display name and upper case on the way in.
    for raw in ("me+specific@gmail.com", "Someone <ME+SPECIFIC@GMAIL.COM>"):
        ticket = await svc.ingest(_email(from_email=raw, message_id=f"<{raw}>"), mb, "test")
        sd = await _sd_for(db_session, ticket.id)
        assert sd.account_id == specific.id, raw
        assert ticket.assignee_id == kams[1], raw

    # An address with no record of its own still falls back to the domain.
    ticket = await svc.ingest(
        _email(from_email="me+other@gmail.com", message_id="<other>"), mb, "test"
    )
    sd = await _sd_for(db_session, ticket.id)
    assert sd.account_id == catch_all.id
    assert ticket.assignee_id == kams[0]
