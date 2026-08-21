"""Free mode — the desk must work end to end with AI switched off.

A desk that has AI switched off has to stand on its own: an email still becomes
a tracked ticket, the owner is still chosen by rule (partner mapping, else the
KAM pool), the clock still starts — and nothing in the path reaches a model or
opens a file.

"Off" is now stated rather than assumed. The desk follows the workspace's AI
switch, so these workspaces set the desk's own veto explicitly; relying on a
default meant that when the default changed the suite still passed — the model
call was made, raised, and was swallowed by the classifier's best-effort
``except``, which is precisely the regression these tests exist to catch.

These tests deliberately do NOT stub the classifier. They install a gateway and
an attachment fetcher that raise on use, so any AI or file read that creeps back
into the default path fails here instead of in front of an insurance customer.
"""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.organization import Department, DepartmentMember
from aexy.models.service_desk import (
    ServiceDeskMailbox,
    ServiceDeskAccount,
    ServiceDeskAccountDomain,
    ServiceDeskTicket,
    TicketPendingSegment,
)
from aexy.models.ticketing import Ticket
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.schemas.service_desk import InboundEmail
from aexy.services.gmail_sync_service import GmailSyncService
from aexy.services.service_desk_intake_service import ServiceDeskIntakeService
from tests.conftest import seed_service_desk_taxonomy


@pytest.fixture(autouse=True)
def _no_ai_no_mail(monkeypatch):
    """Any model call is a failure; acknowledgement mail is out of scope here."""

    class _AIWasReached(BaseException):
        """Deliberately not an ``Exception``.

        The classifier wraps its whole body in a best-effort ``except
        Exception``, so an AssertionError raised here was caught, logged as a
        skipped classification, and the test passed while the model call had in
        fact been attempted. Only something outside that hierarchy escapes.
        """

    def _forbidden():
        raise _AIWasReached("AI must not be reached when this desk has AI switched off")

    async def _noop(self, *a, **k):
        return None

    monkeypatch.setattr("aexy.llm.gateway.get_llm_gateway", _forbidden)
    monkeypatch.setattr(ServiceDeskIntakeService, "_send_receipt", _noop)


async def _desk(
    db: AsyncSession, slug: str, kam_count: int = 2
) -> tuple[Workspace, ServiceDeskMailbox, list[str]]:
    """A workspace with a shared mailbox and optional KAM pool. AI vetoed."""
    owner = Developer(email=f"owner-{slug}@bimaplan.co", name="Owner")
    db.add(owner)
    await db.flush()
    ws = Workspace(
        name=f"WS {slug}",
        slug=slug,
        owner_id=owner.id,
        settings={"service_desk": {"ai_classification_enabled": False}},
    )
    db.add(ws)
    await db.flush()
    # Stakeholders and request types are per-workspace rows now, not an enum, so
    # a bare workspace has no taxonomy and the service layer refuses to file a
    # ticket into one. Seeds the legacy insurance slugs these tests assert on.
    await seed_service_desk_taxonomy(db, ws.id)

    mailbox = ServiceDeskMailbox(
        workspace_id=ws.id, address="operations@bimaplan.co", channel="webhook"
    )
    db.add(mailbox)

    dept = Department(
        workspace_id=ws.id, name="KAM", slug="kam", function_key="ops_kam", path="/kam/", depth=0
    )
    db.add(dept)
    await db.flush()

    kam_ids: list[str] = []
    for i in range(kam_count):
        kam = Developer(email=f"kam{i}-{slug}@bimaplan.co", name=f"KAM{i}")
        db.add(kam)
        await db.flush()
        db.add(DepartmentMember(workspace_id=ws.id, department_id=dept.id, developer_id=kam.id))
        db.add(
            WorkspaceMember(
                workspace_id=ws.id, developer_id=kam.id, role="member", status="active"
            )
        )
        kam_ids.append(kam.id)

    await db.commit()
    await db.refresh(ws)
    await db.refresh(mailbox)
    return ws, mailbox, kam_ids


def _email(**kw) -> InboundEmail:
    base = dict(
        to="operations@bimaplan.co",
        from_email="rahul@abcfinance.com",
        subject="Policy status please",
        body_text="Any update?",
    )
    base.update(kw)
    return InboundEmail(**base)


async def _sd(db: AsyncSession, ticket_id: str) -> ServiceDeskTicket:
    return (
        await db.execute(select(ServiceDeskTicket).where(ServiceDeskTicket.ticket_id == ticket_id))
    ).scalar_one()


@pytest.mark.asyncio
async def test_known_partner_domain_assigns_its_mapped_kam_without_ai(db_session: AsyncSession):
    ws, mailbox, kam_ids = await _desk(db_session, "noai-partner")
    mapped, other = kam_ids
    partner = ServiceDeskAccount(workspace_id=ws.id, name="ABC Finance", assigned_owner_id=mapped)
    db_session.add(partner)
    await db_session.flush()
    db_session.add(
        ServiceDeskAccountDomain(
            workspace_id=ws.id, account_id=partner.id, domain="abcfinance.com"
        )
    )
    await db_session.commit()

    ticket = await ServiceDeskIntakeService(db_session).ingest(_email(), mailbox, source="test")
    await db_session.commit()

    assert ticket is not None
    assert ticket.assignee_id == mapped, "the partner's own KAM must own the ticket"
    assert ticket.assignee_id != other

    sd = await _sd(db_session, ticket.id)
    assert sd.account_id == partner.id, "partner is filled from the sender's domain"
    assert sd.pending_with == "kam"
    assert sd.request_type == "query"
    assert sd.ai_confidence is None, "nothing was inferred, so no confidence exists"
    assert sd.product_id is None, "the LOB is the KAM's to set by hand in free mode"
    assert sd.needs_triage is True, "free-mode tickets are queued for a human to complete"


@pytest.mark.asyncio
async def test_unknown_domain_falls_back_to_the_kam_pool_and_is_never_left_unowned(
    db_session: AsyncSession,
):
    ws, mailbox, kam_ids = await _desk(db_session, "noai-unknown")

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _email(from_email="contact@newpartner.io"), mailbox, source="test"
    )
    await db_session.commit()

    assert ticket is not None
    assert ticket.assignee_id in kam_ids, "an unmatched sender still lands in someone's queue"

    sd = await _sd(db_session, ticket.id)
    assert sd.account_id is None
    assert sd.needs_triage is True, "the Ops Head needs to see that the mapping is missing"


@pytest.mark.asyncio
async def test_workspace_owner_is_assigned_when_the_kam_pool_is_empty(
    db_session: AsyncSession,
):
    ws, mailbox, _ = await _desk(db_session, "noai-owner", kam_count=0)

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _email(from_email="contact@newpartner.io"), mailbox, source="test"
    )
    await db_session.commit()

    assert ticket is not None
    assert ticket.assignee_id == ws.owner_id


@pytest.mark.asyncio
async def test_the_clock_starts_on_creation_without_ai(db_session: AsyncSession):
    ws, mailbox, _ = await _desk(db_session, "noai-clock")

    ticket = await ServiceDeskIntakeService(db_session).ingest(_email(), mailbox, source="test")
    await db_session.commit()
    assert ticket is not None

    segments = (
        await db_session.execute(
            select(TicketPendingSegment).where(TicketPendingSegment.ticket_id == ticket.id)
        )
    ).scalars().all()
    assert len(segments) == 1
    assert segments[0].pending_with == "kam"
    assert segments[0].exited_at is None, "the first stage is still running"
    assert segments[0].entered_at is not None


@pytest.mark.asyncio
async def test_one_email_is_never_split_into_two_tickets_without_ai(db_session: AsyncSession):
    """Splitting is an AI behaviour; free mode gives one email exactly one ticket."""
    ws, mailbox, _ = await _desk(db_session, "noai-nosplit")

    await ServiceDeskIntakeService(db_session).ingest(
        _email(
            subject="New GPA onboarding and a pending claim document",
            body_text="Please onboard GPA for our new branch. Separately, share the claim form.",
        ),
        mailbox,
        source="test",
    )
    await db_session.commit()

    tickets = (
        await db_session.execute(select(Ticket).where(Ticket.workspace_id == ws.id))
    ).scalars().all()
    assert len(tickets) == 1


@pytest.mark.asyncio
async def test_attachments_are_listed_but_never_opened_without_ai():
    """Names and sizes come from the message itself; only a preview costs a download."""

    async def _forbidden_fetch(self, *a, **k):
        raise AssertionError("no attachment may be downloaded when AI is off")

    service = GmailSyncService.__new__(GmailSyncService)
    payload = {
        "parts": [
            {
                "filename": "claims.xlsx",
                "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "body": {"size": 4096, "attachmentId": "att-1"},
            }
        ]
    }

    original = GmailSyncService.gmail_attachment_bytes
    GmailSyncService.gmail_attachment_bytes = _forbidden_fetch
    try:
        context = await service._service_desk_attachment_context(
            integration=None, message_id="m-1", payload=payload, with_previews=False
        )
    finally:
        GmailSyncService.gmail_attachment_bytes = original

    assert len(context) == 1
    assert context[0]["filename"] == "claims.xlsx"
    assert context[0]["size_bytes"] == 4096
    assert "preview" not in context[0], "no file contents are read in free mode"
