"""Regressions for the second hardening pass on the Service Desk / Organization.

Each test here pins a specific hole found in review, so the next change that
reopens one fails loudly rather than shipping:

* a mailbox pointed at another workspace's Google integration (inbound mail
  diverted, outbound mail sent as them),
* the same address claimed by two workspaces (whoever registered first won the
  inbound webhook),
* an unauthenticated post to the inbound-mail webhook,
* a department head or headcount seat filled by someone outside the workspace,
* two departments claiming the same routing function,
* a second `is_primary` department created by invite-accept,
* and the constants that used to be one customer's operation: ticket prefix,
  timezone, breach thresholds.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.google_integration import GoogleIntegration
from aexy.models.organization import Department, DepartmentMember
from aexy.models.service_desk import ServiceDeskMailbox
from aexy.models.workspace import Workspace, WorkspaceMember, WorkspacePendingInvite
from aexy.schemas.organization import DepartmentCreate, PositionCreate
from aexy.schemas.service_desk import MailboxCreate, ServiceDeskSettingsUpdate
from aexy.services.organization_service import OrganizationService
from aexy.services.service_desk_service import ServiceDeskService

_n = {"i": 0}


def _uniq(prefix: str) -> str:
    _n["i"] += 1
    return f"{prefix}-{_n['i']}"


async def _dev(db: AsyncSession, name: str) -> Developer:
    d = Developer(email=f"{_uniq(name)}@example.com", name=name)
    db.add(d)
    await db.flush()
    return d


async def _ws(db: AsyncSession) -> tuple[Workspace, Developer]:
    owner = await _dev(db, "owner")
    slug = _uniq("ws")
    ws = Workspace(name=slug, slug=slug, owner_id=owner.id)
    db.add(ws)
    await db.flush()
    db.add(
        WorkspaceMember(
            workspace_id=ws.id, developer_id=owner.id, role="owner", status="active"
        )
    )
    await db.flush()
    return ws, owner


async def _integration(db: AsyncSession, workspace_id: str) -> GoogleIntegration:
    integ = GoogleIntegration(
        id=str(uuid4()),
        workspace_id=workspace_id,
        google_email=f"{_uniq('gmail')}@example.com",
        access_token="tok",
        refresh_token="ref",
        token_expiry=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    db.add(integ)
    await db.flush()
    return integ


# ------------------------------------------------------- mailbox tenancy


@pytest.mark.asyncio
async def test_mailbox_cannot_use_another_workspaces_integration(db_session: AsyncSession):
    """The payoff was inbound mail filed into the wrong workspace and outbound
    mail sent out of somebody else's Google account."""
    victim, _ = await _ws(db_session)
    attacker, _ = await _ws(db_session)
    integ = await _integration(db_session, victim.id)

    with pytest.raises(HTTPException) as exc:
        await ServiceDeskService(db_session).create_mailbox(
            attacker.id,
            MailboxCreate(
                address=f"{_uniq('ops')}@attacker.test",
                channel="gmail_sync",
                integration_id=integ.id,
            ),
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_mailbox_accepts_its_own_workspaces_integration(db_session: AsyncSession):
    ws, _ = await _ws(db_session)
    integ = await _integration(db_session, ws.id)
    created = await ServiceDeskService(db_session).create_mailbox(
        ws.id,
        MailboxCreate(
            address="ops@mine.test", channel="gmail_sync", integration_id=integ.id
        ),
    )
    assert created.integration_id == integ.id


@pytest.mark.asyncio
async def test_two_workspaces_cannot_claim_the_same_address(db_session: AsyncSession):
    """The inbound webhook resolves `to` → mailbox across all workspaces, so a
    duplicate address let whoever registered it first receive the other's mail."""
    first, _ = await _ws(db_session)
    second, _ = await _ws(db_session)
    service = ServiceDeskService(db_session)

    await service.create_mailbox(first.id, MailboxCreate(address="desk@shared.test"))
    with pytest.raises(HTTPException) as exc:
        await service.create_mailbox(second.id, MailboxCreate(address="DESK@shared.test"))
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_integration_lookup_is_scoped_to_the_workspace(db_session: AsyncSession):
    """Belt to the create-time brace: a row written before that check existed
    must still not be honoured."""
    from aexy.services.service_desk_intake_service import ServiceDeskIntakeService

    victim, _ = await _ws(db_session)
    attacker, _ = await _ws(db_session)
    integ = await _integration(db_session, victim.id)
    db_session.add(
        ServiceDeskMailbox(
            id=str(uuid4()),
            workspace_id=attacker.id,  # the state the old code allowed
            address="stolen@attacker.test",
            channel="gmail_sync",
            integration_id=integ.id,
        )
    )
    await db_session.flush()

    found = await ServiceDeskIntakeService.find_mailbox_by_integration(
        db_session, integ.id, workspace_id=victim.id
    )
    assert found is None


# ------------------------------------------------- inbound webhook auth


def test_inbound_webhook_rejects_unsigned_posts_by_default(monkeypatch):
    """Creating tickets and mailing an attacker-chosen address must not be open.

    With nothing configured the repo's existing rule applies: reject in
    production (`webhooks_require_signing` defaults True) rather than fail open.
    """
    from types import SimpleNamespace

    from aexy.services import email_webhook_verify as verify

    monkeypatch.setattr(
        verify,
        "get_settings",
        lambda: SimpleNamespace(
            inbound_email_webhook_token="",
            postmark_webhook_basic_auth="",
            mailgun_webhook_signing_key="",
            webhooks_require_signing=True,
        ),
    )
    assert (
        verify.verify_inbound_email_request(
            authorization_header=None, token_header=None, token_query=None
        )
        is False
    )


def test_inbound_webhook_accepts_the_shared_token(monkeypatch):
    """SendGrid Inbound Parse does not sign at all, so a URL/header token is the
    only thing that can authenticate it."""
    from types import SimpleNamespace

    from aexy.services import email_webhook_verify as verify

    monkeypatch.setattr(
        verify,
        "get_settings",
        lambda: SimpleNamespace(
            inbound_email_webhook_token="s3cret",
            postmark_webhook_basic_auth="",
            mailgun_webhook_signing_key="",
            webhooks_require_signing=True,
        ),
    )
    assert verify.verify_inbound_email_request(
        authorization_header=None, token_header=None, token_query="s3cret"
    )
    assert verify.verify_inbound_email_request(
        authorization_header=None, token_header="s3cret", token_query=None
    )
    # A configured secret that doesn't match is a rejection, not missing config.
    assert (
        verify.verify_inbound_email_request(
            authorization_header=None, token_header="wrong", token_query=None
        )
        is False
    )


# --------------------------------------------------------- organization


@pytest.mark.asyncio
async def test_department_head_must_be_a_workspace_member(db_session: AsyncSession):
    """`head_id` is not cosmetic: the digest resolves it to decide who receives
    the whole desk's open-ticket list."""
    ws, _ = await _ws(db_session)
    outsider = await _dev(db_session, "outsider")

    with pytest.raises(HTTPException) as exc:
        await OrganizationService(db_session).create_department(
            ws.id, DepartmentCreate(name="Operations", head_id=outsider.id)
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_headcount_seat_holder_must_be_a_workspace_member(db_session: AsyncSession):
    ws, _ = await _ws(db_session)
    outsider = await _dev(db_session, "outsider")
    dept = await OrganizationService(db_session).create_department(
        ws.id, DepartmentCreate(name="Sales")
    )

    with pytest.raises(HTTPException) as exc:
        await OrganizationService(db_session).add_position(
            ws.id, dept.id, PositionCreate(title="AE", filled_by_id=outsider.id)
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_duplicate_function_key_is_a_409_not_a_500(db_session: AsyncSession):
    """The unique index would raise IntegrityError; the value is meaningful
    (Service Desk routes pending-with by it) so name the clash."""
    ws, _ = await _ws(db_session)
    service = OrganizationService(db_session)
    await service.create_department(ws.id, DepartmentCreate(name="Ops", function_key="ops_kam"))

    with pytest.raises(HTTPException) as exc:
        await service.create_department(
            ws.id, DepartmentCreate(name="Ops Two", function_key="ops_kam")
        )
    assert exc.value.status_code == 409
    assert "Ops" in exc.value.detail


@pytest.mark.asyncio
async def test_invite_accept_does_not_create_a_second_primary(db_session: AsyncSession):
    """One primary department per person. A second `is_primary` row violates
    uq_department_member_primary, and the placement is wrapped in a
    swallow-everything handler — so on a database with the index the person
    would have joined with no department at all.
    """
    from aexy.services.workspace_service import WorkspaceService

    ws, _ = await _ws(db_session)
    joiner = await _dev(db_session, "joiner")
    db_session.add(
        WorkspaceMember(
            workspace_id=ws.id, developer_id=joiner.id, role="member", status="active"
        )
    )
    first = Department(
        id=str(uuid4()), workspace_id=ws.id, name="Sales", slug="sales", path="/sales/"
    )
    second = Department(
        id=str(uuid4()), workspace_id=ws.id, name="Ops", slug="ops", path="/ops/"
    )
    db_session.add_all([first, second])
    await db_session.flush()
    db_session.add(
        DepartmentMember(
            id=str(uuid4()),
            workspace_id=ws.id,
            department_id=first.id,
            developer_id=joiner.id,
            is_primary=True,
        )
    )
    await db_session.flush()

    invite = WorkspacePendingInvite(
        workspace_id=ws.id,
        email="joiner@example.com",
        role="member",
        token=_uniq("tok"),
        department_id=second.id,
        status="pending",
    )
    db_session.add(invite)
    await db_session.flush()

    await WorkspaceService(db_session)._place_in_department(invite, joiner.id)
    await db_session.flush()

    from sqlalchemy import select

    primaries = (
        await db_session.execute(
            select(DepartmentMember).where(
                DepartmentMember.workspace_id == ws.id,
                DepartmentMember.developer_id == joiner.id,
                DepartmentMember.is_primary.is_(True),
            )
        )
    ).scalars().all()
    assert len(primaries) == 1
    assert primaries[0].department_id == first.id  # the existing one keeps it


# ------------------------------------------- per-workspace desk identity


@pytest.mark.asyncio
async def test_ticket_prefix_defaults_to_a_neutral_value(db_session: AsyncSession):
    """The default must not name a customer.

    It was "BSD" — one company's service desk — which every new workspace then
    inherited for its own ticket ids.
    """
    from aexy.services.service_desk_config import ticket_prefix, ticket_prefix_display

    ws, _ = await _ws(db_session)
    assert await ticket_prefix(db_session, ws.id) == "SD"
    assert await ticket_prefix_display(db_session, ws.id, 41) == "SD-41"


@pytest.mark.asyncio
async def test_ticket_prefix_is_configurable(db_session: AsyncSession):
    from aexy.services.service_desk_config import ticket_prefix_display

    ws, owner = await _ws(db_session)
    view = await ServiceDeskService(db_session).update_settings(
        ws.id, ticket_prefix="acme", developer_id=owner.id
    )
    assert view["ticket_prefix"] == "ACME"
    assert await ticket_prefix_display(db_session, ws.id, 41) == "ACME-41"


@pytest.mark.asyncio
async def test_subject_matching_accepts_only_this_workspaces_prefix(
    db_session: AsyncSession,
):
    """Threading is scoped to the workspace's own prefix.

    It briefly also accepted a hardcoded legacy prefix, to cover threads sent
    before the prefix was configurable. Nothing shipped, so no such threads exist,
    and a permanent second prefix would let mail quoting a foreign id thread into
    this desk.
    """
    from aexy.services.service_desk_config import ticket_number_in_subject

    ws, owner = await _ws(db_session)
    await ServiceDeskService(db_session).update_settings(
        ws.id, ticket_prefix="ACME", developer_id=owner.id
    )

    assert await ticket_number_in_subject(db_session, ws.id, "Re: ACME-41 query") == 41
    # Another desk's id must not thread into this one.
    assert await ticket_number_in_subject(db_session, ws.id, "Re: BSD-41 query") is None
    # Nor any hyphenated token — that would attach unrelated mail to a ticket.
    assert await ticket_number_in_subject(db_session, ws.id, "Re: INV-41 invoice") is None


@pytest.mark.asyncio
async def test_timezone_and_thresholds_are_per_workspace(db_session: AsyncSession):
    from aexy.services.service_desk_clock import load_clock

    ws, owner = await _ws(db_session)
    default = await load_clock(db_session, ws.id)
    assert str(default.tz) == "Asia/Kolkata"
    assert default.breach_red_days == 2.0

    await ServiceDeskService(db_session).update_settings(
        ws.id,
        timezone="America/New_York",
        breach_red_days=3.0,
        breach_amber_days=1.5,
        developer_id=owner.id,
    )
    clock = await load_clock(db_session, ws.id)
    assert str(clock.tz) == "America/New_York"
    assert clock.breach_red_days == 3.0
    assert clock.breach_amber_days == 1.5
    # And the thresholds are actually used, not just stored.
    assert clock.breach_level(int(clock.working_day_seconds * 2)) == "amber"
    assert clock.breach_level(int(clock.working_day_seconds * 3.5)) == "red"


@pytest.mark.asyncio
async def test_inverted_thresholds_are_refused(db_session: AsyncSession):
    """Amber is the warning before red; inverted, the colours mean nothing."""
    ws, owner = await _ws(db_session)
    with pytest.raises(HTTPException) as exc:
        await ServiceDeskService(db_session).update_settings(
            ws.id, breach_red_days=1.0, breach_amber_days=2.0, developer_id=owner.id
        )
    assert exc.value.status_code == 400


def test_settings_schema_rejects_an_unknown_timezone():
    import pydantic

    with pytest.raises(pydantic.ValidationError):
        ServiceDeskSettingsUpdate(timezone="Mars/Olympus_Mons")


@pytest.mark.asyncio
async def test_bad_prefix_is_refused(db_session: AsyncSession):
    ws, owner = await _ws(db_session)
    with pytest.raises(HTTPException) as exc:
        await ServiceDeskService(db_session).update_settings(
            ws.id, ticket_prefix="not a prefix!", developer_id=owner.id
        )
    assert exc.value.status_code == 400


# --------------------------------------------------------- template sandbox


def test_template_rendering_is_sandboxed():
    """Template bodies are authored through the API, so a plain Jinja
    environment let an author walk Python internals from an email template."""
    from aexy.models.email_marketing import EmailTemplate
    from aexy.services.template_service import TemplateService

    service = TemplateService(db=None)  # rendering needs no session
    tmpl = EmailTemplate(
        workspace_id="",
        name="probe",
        slug="probe",
        template_type="code",
        category="transactional",
        subject_template="probe",
        body_html="{{ ''.__class__.__mro__[1].__subclasses__() }}",
        body_text="{{ ''.__class__.__mro__[1].__subclasses__() }}",
        variables=[],
    )
    with pytest.raises(Exception) as exc:
        service.render_template(tmpl, {})
    assert "SecurityError" in type(exc.value).__name__ or "unsafe" in str(exc.value).lower()


# ------------------------------------------------- gmail_sync mailbox errors
#
# `google_integrations.workspace_id` is unique, so a workspace has exactly one
# Google account. Every one of these used to answer "Connect and enable Gmail
# sync for this mailbox address first" — advice that is wrong in three of the
# four cases, and in the second one describes a loop that cannot terminate.


@pytest.mark.asyncio
async def test_gmail_mailbox_without_any_integration_says_to_connect_one(
    db_session: AsyncSession,
):
    ws, _ = await _ws(db_session)
    with pytest.raises(HTTPException) as exc:
        await ServiceDeskService(db_session).create_mailbox(
            ws.id, MailboxCreate(address="ops@mine.test", channel="gmail_sync")
        )
    assert exc.value.status_code == 422
    assert "no Google account connected" in exc.value.detail


@pytest.mark.asyncio
async def test_gmail_mailbox_for_a_different_address_names_the_connected_one(
    db_session: AsyncSession,
):
    """The reported case: the address is connected as a developer, but the
    workspace syncs as somebody else, and no amount of reconnecting it helps."""
    ws, _ = await _ws(db_session)
    integ = await _integration(db_session, ws.id)
    integ.gmail_sync_enabled = True
    integ.is_active = True
    await db_session.flush()

    with pytest.raises(HTTPException) as exc:
        await ServiceDeskService(db_session).create_mailbox(
            ws.id, MailboxCreate(address="operations@other.test", channel="gmail_sync")
        )
    assert exc.value.status_code == 422
    # Names the address actually in use, and offers the channel that would work.
    assert integ.google_email in exc.value.detail
    assert "webhook" in exc.value.detail


@pytest.mark.asyncio
async def test_gmail_mailbox_with_sync_switched_off_says_so(db_session: AsyncSession):
    ws, _ = await _ws(db_session)
    integ = await _integration(db_session, ws.id)
    integ.gmail_sync_enabled = False
    integ.is_active = True
    await db_session.flush()

    with pytest.raises(HTTPException) as exc:
        await ServiceDeskService(db_session).create_mailbox(
            ws.id, MailboxCreate(address=integ.google_email, channel="gmail_sync")
        )
    assert exc.value.status_code == 422
    assert "switched off" in exc.value.detail


@pytest.mark.asyncio
async def test_gmail_mailbox_on_a_disconnected_integration_says_reconnect(
    db_session: AsyncSession,
):
    ws, _ = await _ws(db_session)
    integ = await _integration(db_session, ws.id)
    integ.gmail_sync_enabled = True
    integ.is_active = False
    await db_session.flush()

    with pytest.raises(HTTPException) as exc:
        await ServiceDeskService(db_session).create_mailbox(
            ws.id, MailboxCreate(address=integ.google_email, channel="gmail_sync")
        )
    assert exc.value.status_code == 422
    assert "disconnected" in exc.value.detail
