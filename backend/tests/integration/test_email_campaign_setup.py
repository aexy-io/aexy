"""E2.3 audience-from-CRM + E2.6 sender gating.

The sender gate used to ask "does this workspace have *any* verified domain?",
which let a campaign send as `sender@somewhere-else.com` on the strength of an
unrelated verified domain — and was the only sender validation anywhere, since
nothing compared `from_email` to a domain. It now resolves the campaign's own
`from_email` to a domain, which is the same resolution the send path uses to pick
the provider, so the gate and the delivery agree.
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.crm import CRMList, CRMListEntry, CRMObject, CRMRecord
from aexy.models.developer import Developer
from aexy.models.email_infrastructure import DomainStatus, SendingDomain
from aexy.models.email_marketing import CampaignStatus, EmailCampaign, EmailTemplate
from aexy.models.workspace import Workspace
from aexy.services.campaign_service import CampaignService
from aexy.services.domain_service import DomainService
from aexy.services.email_campaign_service import EmailCampaignService


@pytest_asyncio.fixture
async def ws(db_session: AsyncSession):
    dev = Developer(id=str(uuid4()), email=f"d-{uuid4().hex[:6]}@t.com", name="D")
    db_session.add(dev)
    await db_session.flush()
    w = Workspace(id=str(uuid4()), name="W", slug=f"w-{uuid4().hex[:6]}", owner_id=dev.id)
    db_session.add(w)
    await db_session.commit()
    return w


def _domain(ws_id, status, domain: str | None = None, **kw):
    return SendingDomain(
        id=str(uuid4()),
        workspace_id=ws_id,
        domain=domain or f"{uuid4().hex[:6]}.com",
        status=status,
        **kw,
    )


# --- E2.3: audience from a CRM list ---------------------------------------

@pytest.mark.asyncio
async def test_calculate_audience_counts_crm_list_members(db_session, ws):
    obj = CRMObject(id=str(uuid4()), workspace_id=ws.id, name="Contact",
                    slug="contact", plural_name="Contacts", object_type="standard")
    db_session.add(obj)
    await db_session.flush()
    recs = [CRMRecord(id=str(uuid4()), workspace_id=ws.id, object_id=obj.id,
                      values={"email": f"{i}@ex.com"}) for i in range(3)]
    db_session.add_all(recs)
    lst = CRMList(id=str(uuid4()), workspace_id=ws.id, name="VIPs", slug="vips", object_id=obj.id)
    db_session.add(lst)
    await db_session.flush()
    # Only 2 of the 3 records are on the list.
    db_session.add_all([
        CRMListEntry(id=str(uuid4()), list_id=lst.id, record_id=recs[0].id),
        CRMListEntry(id=str(uuid4()), list_id=lst.id, record_id=recs[1].id),
    ])
    campaign = EmailCampaign(id=str(uuid4()), workspace_id=ws.id, name="C", list_id=lst.id,
                             from_name="Sender", from_email="sender@ex.com")
    db_session.add(campaign)
    await db_session.commit()

    count = await CampaignService(db_session).calculate_audience(campaign)
    assert count == 2


# --- resolving from_email to a sending domain -----------------------------

@pytest.mark.asyncio
async def test_resolve_domain_for_email_matches_apex(db_session, ws):
    d = _domain(ws.id, DomainStatus.VERIFIED.value, domain="acme.com")
    db_session.add(d)
    await db_session.commit()

    svc = DomainService(db_session)
    assert (await svc.resolve_domain_for_email(ws.id, "hello@acme.com")).id == d.id


@pytest.mark.asyncio
async def test_resolve_domain_for_email_matches_subdomain_and_apex(db_session, ws):
    d = _domain(ws.id, DomainStatus.VERIFIED.value, domain="acme.com", subdomain="mail")
    db_session.add(d)
    await db_session.commit()

    svc = DomainService(db_session)
    # The DNS records are published against the apex, so both forms are ours.
    assert (await svc.resolve_domain_for_email(ws.id, "hi@mail.acme.com")).id == d.id
    assert (await svc.resolve_domain_for_email(ws.id, "hi@acme.com")).id == d.id


@pytest.mark.asyncio
async def test_resolve_domain_for_email_rejects_a_near_miss(db_session, ws):
    db_session.add(_domain(ws.id, DomainStatus.VERIFIED.value, domain="acme.com"))
    await db_session.commit()

    svc = DomainService(db_session)
    # A suffix match is not a match: notacme.com is somebody else's domain.
    assert await svc.resolve_domain_for_email(ws.id, "hi@notacme.com") is None
    assert await svc.resolve_domain_for_email(ws.id, "hi@acme.com.evil.test") is None


@pytest.mark.asyncio
async def test_resolve_domain_prefers_the_exact_row_over_a_parent_subdomain(db_session, ws):
    """Two rows can match the same address, and the exact one should win.

    `(workspace_id, domain)` is unique so there are no duplicate rows for a domain,
    but a row for `acme.com` carrying subdomain `mail` and a separate row for
    `mail.acme.com` both cover `hi@mail.acme.com`. The latter is the row whose DNS
    was verified for that name, so it is the one to send through.
    """
    parent = _domain(ws.id, DomainStatus.VERIFIED.value, domain="acme.com", subdomain="mail")
    exact = _domain(ws.id, DomainStatus.VERIFIED.value, domain="mail.acme.com")
    db_session.add_all([parent, exact])
    await db_session.commit()

    svc = DomainService(db_session)
    assert (await svc.resolve_domain_for_email(ws.id, "hi@mail.acme.com")).id == exact.id
    # The apex still resolves to the row that owns it.
    assert (await svc.resolve_domain_for_email(ws.id, "hi@acme.com")).id == parent.id


# --- E2.6: the sender gate ------------------------------------------------

async def _campaign_with_template(db_session, ws_id, from_email="sender@ex.com", **kw):
    tmpl = EmailTemplate(
        id=str(uuid4()), workspace_id=ws_id, name="T", slug=f"t-{uuid4().hex[:6]}",
        subject_template="Hi", body_html="<p>hi</p>", template_type="html", variables=[],
    )
    db_session.add(tmpl)
    await db_session.flush()
    c = EmailCampaign(id=str(uuid4()), workspace_id=ws_id, name="C",
                      template_id=tmpl.id, status=kw.pop("status", "draft"),
                      from_name="Sender", from_email=from_email, **kw)
    db_session.add(c)
    await db_session.commit()
    return c


@pytest.mark.asyncio
async def test_start_sending_blocked_without_any_domain(db_session, ws):
    c = await _campaign_with_template(db_session, ws.id)
    with pytest.raises(ValueError, match="No sending domain"):
        await CampaignService(db_session).start_sending(c.id, ws.id)


@pytest.mark.asyncio
async def test_start_sending_blocked_for_pending_domain(db_session, ws):
    db_session.add(_domain(ws.id, DomainStatus.PENDING.value, domain="ex.com"))
    c = await _campaign_with_template(db_session, ws.id, from_email="sender@ex.com")
    with pytest.raises(ValueError, match="cannot send"):
        await CampaignService(db_session).start_sending(c.id, ws.id)


@pytest.mark.asyncio
async def test_start_sending_blocked_when_from_email_is_not_ours(db_session, ws):
    """The hole this closes: a verified domain the campaign does not send from.

    Under the old workspace-wide count this passed the gate, so a campaign could
    claim any address at all provided the workspace had verified something.
    """
    db_session.add(_domain(ws.id, DomainStatus.VERIFIED.value, domain="acme.com"))
    c = await _campaign_with_template(db_session, ws.id, from_email="sender@somewhere-else.com")
    with pytest.raises(ValueError, match="No sending domain"):
        await CampaignService(db_session).start_sending(c.id, ws.id)


@pytest.mark.asyncio
async def test_start_sending_passes_gate_for_own_verified_domain(db_session, ws):
    db_session.add(_domain(ws.id, DomainStatus.VERIFIED.value, domain="acme.com"))
    c = await _campaign_with_template(db_session, ws.id, from_email="sender@acme.com")
    # Past the sender gate → fails later on empty audience, proving it let it through.
    with pytest.raises(ValueError, match="recipients"):
        await CampaignService(db_session).start_sending(c.id, ws.id)


@pytest.mark.asyncio
async def test_start_sending_accepts_a_warming_domain(db_session, ws):
    """Warming is mid-ramp-up, not unverified — `can_send` allows it."""
    db_session.add(_domain(ws.id, DomainStatus.WARMING.value, domain="acme.com", daily_limit=50))
    c = await _campaign_with_template(db_session, ws.id, from_email="sender@acme.com")
    with pytest.raises(ValueError, match="recipients"):
        await CampaignService(db_session).start_sending(c.id, ws.id)


@pytest.mark.asyncio
async def test_start_sending_blocked_when_daily_limit_reached(db_session, ws):
    db_session.add(
        _domain(ws.id, DomainStatus.VERIFIED.value, domain="acme.com", daily_limit=10, daily_sent=10)
    )
    c = await _campaign_with_template(db_session, ws.id, from_email="sender@acme.com")
    with pytest.raises(ValueError, match="Daily limit"):
        await CampaignService(db_session).start_sending(c.id, ws.id)


@pytest.mark.asyncio
async def test_sender_status_shape(db_session, ws):
    db_session.add(_domain(ws.id, DomainStatus.VERIFIED.value, domain="acme.com"))
    await db_session.commit()
    svc = CampaignService(db_session)

    ok = await svc.sender_status(ws.id, "hello@acme.com")
    assert ok["can_send"] is True
    assert ok["domain"] == "acme.com"
    assert ok["reason"] is None

    bad = await svc.sender_status(ws.id, "hello@nope.com")
    assert bad["can_send"] is False
    assert bad["domain"] is None
    assert "No sending domain" in bad["reason"]


# --- the scheduled path ---------------------------------------------------

@pytest.mark.asyncio
async def test_schedule_is_refused_without_a_verified_sender(db_session, ws):
    """Refuse at schedule time, not an hour later inside the poller."""
    c = await _campaign_with_template(db_session, ws.id)
    with pytest.raises(ValueError, match="No sending domain"):
        await CampaignService(db_session).schedule_campaign(
            c.id, ws.id, datetime.now(timezone.utc) + timedelta(hours=1)
        )


@pytest.mark.asyncio
async def test_due_campaign_without_verified_sender_is_not_reported_sent(db_session, ws):
    """The bug this closes.

    `check_scheduled_campaigns` flipped the status to `sending` and dispatched by
    hand, skipping both the sender gate and `populate_recipients`. With no
    recipient rows the send activity found nothing pending and marked the campaign
    `sent` — a campaign that had delivered to nobody reporting success.
    """
    c = await _campaign_with_template(
        db_session,
        ws.id,
        status=CampaignStatus.SCHEDULED.value,
        scheduled_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )

    result = await EmailCampaignService(db_session).check_scheduled_campaigns()
    assert result["started"] == 0

    refreshed = (
        await db_session.execute(select(EmailCampaign).where(EmailCampaign.id == c.id))
    ).scalar_one()
    assert refreshed.status != CampaignStatus.SENT.value
    assert refreshed.status != CampaignStatus.SENDING.value
    assert refreshed.last_error and "No sending domain" in refreshed.last_error
