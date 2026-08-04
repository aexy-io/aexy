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
from aexy.models.email_infrastructure import (
    DomainStatus,
    SendingDomain,
    SendingIdentity,
    SendingPool,
    SendingPoolMember,
)
from aexy.models.email_marketing import CampaignStatus, EmailCampaign, EmailTemplate
from aexy.models.workspace import Workspace
from aexy.schemas.email_infrastructure import RoutingConfigUpdate
from aexy.services.campaign_service import CampaignService
from aexy.services.domain_service import DomainService
from aexy.services.email_campaign_service import EmailCampaignService
from aexy.services.routing_service import RoutingService


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


async def _crm_audience(db_session, ws_id, size: int = 2):
    """A CRM list with `size` records on it, for the paths that need an audience.

    `schedule_campaign` refuses a campaign with no recipients, so anything testing
    scheduling needs somebody to send to.
    """
    obj = CRMObject(id=str(uuid4()), workspace_id=ws_id, name="Contact",
                    slug=f"contact-{uuid4().hex[:6]}", plural_name="Contacts",
                    object_type="standard")
    db_session.add(obj)
    await db_session.flush()
    recs = [
        CRMRecord(id=str(uuid4()), workspace_id=ws_id, object_id=obj.id,
                  values={"email": f"{uuid4().hex[:6]}@ex.com"})
        for _ in range(size)
    ]
    db_session.add_all(recs)
    lst = CRMList(id=str(uuid4()), workspace_id=ws_id, name="L",
                  slug=f"l-{uuid4().hex[:6]}", object_id=obj.id)
    db_session.add(lst)
    await db_session.flush()
    db_session.add_all(
        [CRMListEntry(id=str(uuid4()), list_id=lst.id, record_id=r.id) for r in recs]
    )
    await db_session.commit()
    return lst


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
    good = await _campaign_with_template(db_session, ws.id, from_email="hello@acme.com")
    bad = await _campaign_with_template(db_session, ws.id, from_email="hello@nope.com")
    svc = CampaignService(db_session)

    ok = await svc.sender_status(good)
    assert ok["can_send"] is True
    assert ok["mode"] == "from_email"
    assert ok["domain"] == "acme.com"
    assert ok["reason"] is None

    nope = await svc.sender_status(bad)
    assert nope["can_send"] is False
    assert nope["domain"] is None
    assert "No sending domain" in nope["reason"]


# --- sending pools --------------------------------------------------------
#
# Pool routing existed from the start and could never run: `sending_pool_id` was
# on the model but on no schema and no endpoint, so it was always NULL — and the
# branch behind it called `route_email` and `get_fallback_domain` with wrong
# signatures and treated a Pydantic `RoutingDecision` as a dict.


def _pool(ws_id, name="Marketing", strategy="health_based", **kw):
    return SendingPool(
        id=str(uuid4()), workspace_id=ws_id, name=name, routing_strategy=strategy, **kw
    )


def _member(pool_id, domain_id, **kw):
    return SendingPoolMember(id=str(uuid4()), pool_id=pool_id, domain_id=domain_id, **kw)


@pytest.mark.asyncio
async def test_route_email_picks_a_pool_member(db_session, ws):
    d1 = _domain(ws.id, DomainStatus.VERIFIED.value, domain="one.com", health_score=90)
    d2 = _domain(ws.id, DomainStatus.VERIFIED.value, domain="two.com", health_score=40)
    outside = _domain(ws.id, DomainStatus.VERIFIED.value, domain="outside.com", health_score=99)
    pool = _pool(ws.id)
    db_session.add_all([d1, d2, outside, pool])
    await db_session.flush()
    db_session.add_all([_member(pool.id, d1.id), _member(pool.id, d2.id)])
    await db_session.commit()

    decision = await RoutingService(db_session).route_email(
        workspace_id=ws.id, recipient_email="someone@gmail.com", pool_id=pool.id
    )
    assert decision is not None
    # A `RoutingDecision`, not a dict — the caller used to do `.get("domain_id")`.
    assert decision.domain_id in {d1.id, d2.id}
    # The healthiest *member*, never the healthier domain outside the pool.
    assert decision.domain != "outside.com"
    # No identity exists, so the From address falls back to the chosen domain.
    assert decision.from_email.endswith(f"@{decision.domain}")


@pytest.mark.asyncio
async def test_route_email_tolerates_a_member_without_a_provider(db_session, ws):
    """`RoutingDecision.provider_id` was non-optional but the column is nullable."""
    d = _domain(ws.id, DomainStatus.VERIFIED.value, domain="one.com")
    pool = _pool(ws.id)
    db_session.add_all([d, pool])
    await db_session.flush()
    db_session.add(_member(pool.id, d.id))
    await db_session.commit()

    decision = await RoutingService(db_session).route_email(
        workspace_id=ws.id, recipient_email="x@gmail.com", pool_id=pool.id
    )
    assert decision is not None and decision.provider_id is None


@pytest.mark.asyncio
async def test_fallback_stays_inside_the_pool(db_session, ws):
    """A pool says which domains a campaign may use; fallback must respect it."""
    exhausted = _domain(
        ws.id, DomainStatus.VERIFIED.value, domain="one.com", daily_limit=5, daily_sent=5
    )
    spare = _domain(ws.id, DomainStatus.VERIFIED.value, domain="two.com")
    outside = _domain(ws.id, DomainStatus.VERIFIED.value, domain="outside.com")
    pool = _pool(ws.id)
    db_session.add_all([exhausted, spare, outside, pool])
    await db_session.flush()
    db_session.add_all([_member(pool.id, exhausted.id), _member(pool.id, spare.id)])
    await db_session.commit()

    svc = RoutingService(db_session)
    fallback = await svc.get_fallback_domain(
        workspace_id=ws.id, exclude_domain_ids=[exhausted.id], pool_id=pool.id
    )
    assert fallback is not None and fallback.domain == "two.com"

    # With every pool member excluded there is no fallback — it must not escape
    # to `outside.com`, which is what omitting pool_id would have done.
    none_left = await svc.get_fallback_domain(
        workspace_id=ws.id,
        exclude_domain_ids=[exhausted.id, spare.id],
        pool_id=pool.id,
    )
    assert none_left is None


@pytest.mark.asyncio
async def test_pooled_campaign_gate_checks_the_pool_not_from_email(db_session, ws):
    """A pooled campaign's From comes from the pool, so from_email is not the test."""
    d = _domain(ws.id, DomainStatus.VERIFIED.value, domain="one.com")
    pool = _pool(ws.id)
    db_session.add_all([d, pool])
    await db_session.flush()
    db_session.add(_member(pool.id, d.id))
    c = await _campaign_with_template(
        db_session,
        ws.id,
        # Deliberately an address no domain in the workspace covers.
        from_email="hello@unrelated.com",
        sending_pool_id=pool.id,
    )

    status = await CampaignService(db_session).sender_status(c)
    assert status["mode"] == "pool"
    assert status["can_send"] is True, status["reason"]

    # Past the sender gate → the next refusal is the empty audience.
    with pytest.raises(ValueError, match="recipients"):
        await CampaignService(db_session).start_sending(c.id, ws.id)


@pytest.mark.asyncio
async def test_pooled_campaign_is_refused_when_no_member_can_send(db_session, ws):
    pending = _domain(ws.id, DomainStatus.PENDING.value, domain="one.com")
    pool = _pool(ws.id, name="Cold")
    db_session.add_all([pending, pool])
    await db_session.flush()
    db_session.add(_member(pool.id, pending.id))
    c = await _campaign_with_template(db_session, ws.id, sending_pool_id=pool.id)

    with pytest.raises(ValueError, match="No domain in 'Cold' can send"):
        await CampaignService(db_session).start_sending(c.id, ws.id)


@pytest.mark.asyncio
async def test_empty_pool_is_refused(db_session, ws):
    pool = _pool(ws.id, name="Empty")
    db_session.add(pool)
    c = await _campaign_with_template(db_session, ws.id, sending_pool_id=pool.id)

    with pytest.raises(ValueError, match="has no active domains"):
        await CampaignService(db_session).start_sending(c.id, ws.id)


@pytest.mark.asyncio
async def test_routing_refuses_a_pool_from_another_workspace(db_session, ws):
    """Both columns FK to their own table, not to anything workspace-scoped."""
    other_dev = Developer(id=str(uuid4()), email=f"o-{uuid4().hex[:6]}@t.com", name="O")
    db_session.add(other_dev)
    await db_session.flush()
    other = Workspace(
        id=str(uuid4()), name="Other", slug=f"o-{uuid4().hex[:6]}", owner_id=other_dev.id
    )
    db_session.add(other)
    await db_session.flush()
    foreign_pool = _pool(other.id, name="Theirs")
    db_session.add(foreign_pool)
    await db_session.commit()

    svc = CampaignService(db_session)
    with pytest.raises(ValueError, match="not found in this workspace"):
        await svc.update_routing(
            (await _campaign_with_template(db_session, ws.id)).id,
            ws.id,
            RoutingConfigUpdate(sending_pool_id=foreign_pool.id),
        )


@pytest.mark.asyncio
async def test_routing_refuses_both_a_pool_and_an_identity(db_session, ws):
    d = _domain(ws.id, DomainStatus.VERIFIED.value, domain="one.com")
    pool = _pool(ws.id)
    db_session.add_all([d, pool])
    await db_session.flush()
    identity = SendingIdentity(
        id=str(uuid4()),
        workspace_id=ws.id,
        domain_id=d.id,
        email="hi@one.com",
        display_name="Acme",
    )
    db_session.add(identity)
    c = await _campaign_with_template(db_session, ws.id)
    await db_session.commit()

    with pytest.raises(ValueError, match="not both"):
        await CampaignService(db_session).update_routing(
            c.id,
            ws.id,
            RoutingConfigUpdate(sending_pool_id=pool.id, sending_identity_id=identity.id),
        )


@pytest.mark.asyncio
async def test_identity_mode_checks_the_identity_not_from_email(db_session, ws):
    """An identity pins the address, so that address is what must be sendable."""
    d = _domain(ws.id, DomainStatus.VERIFIED.value, domain="one.com")
    db_session.add(d)
    await db_session.flush()
    identity = SendingIdentity(
        id=str(uuid4()),
        workspace_id=ws.id,
        domain_id=d.id,
        email="hi@one.com",
        display_name="Acme",
    )
    db_session.add(identity)
    c = await _campaign_with_template(
        db_session,
        ws.id,
        from_email="hello@unrelated.com",
        sending_identity_id=identity.id,
    )

    status = await CampaignService(db_session).sender_status(c)
    assert status["mode"] == "identity"
    assert status["can_send"] is True, status["reason"]
    assert status["domain"] == "one.com"


@pytest.mark.asyncio
async def test_deleting_a_pool_is_refused_while_a_campaign_uses_it(db_session, ws):
    """A campaign's `sending_pool_id` FKs only to `sending_pools.id`.

    Deleting the pool underneath it would leave the campaign pointing at nothing
    and silently fall back to the platform mailer at send time.
    """
    pool = _pool(ws.id, name="Marketing")
    db_session.add(pool)
    await db_session.flush()
    await _campaign_with_template(db_session, ws.id, sending_pool_id=pool.id)

    svc = RoutingService(db_session)
    with pytest.raises(ValueError, match="still send through 'Marketing'"):
        await svc.delete_pool(pool.id, ws.id)


@pytest.mark.asyncio
async def test_a_pool_can_be_deleted_once_nothing_routes_through_it(db_session, ws):
    pool = _pool(ws.id, name="Marketing")
    d = _domain(ws.id, DomainStatus.VERIFIED.value, domain="one.com")
    db_session.add_all([pool, d])
    await db_session.flush()
    db_session.add(_member(pool.id, d.id))
    c = await _campaign_with_template(db_session, ws.id, sending_pool_id=pool.id)

    # Point the campaign away, exactly as the UI's "clear routing" does.
    await CampaignService(db_session).update_routing(c.id, ws.id, RoutingConfigUpdate())

    assert await RoutingService(db_session).delete_pool(pool.id, ws.id) is True
    # Members go with it via cascade.
    remaining = (
        await db_session.execute(
            select(SendingPoolMember).where(SendingPoolMember.pool_id == pool.id)
        )
    ).scalars().all()
    assert remaining == []


@pytest.mark.asyncio
async def test_a_sent_campaign_does_not_block_deleting_its_pool(db_session, ws):
    """History should not pin a pool forever — only unfinished sends do."""
    pool = _pool(ws.id, name="Old")
    db_session.add(pool)
    await db_session.flush()
    await _campaign_with_template(
        db_session, ws.id, sending_pool_id=pool.id, status=CampaignStatus.SENT.value
    )

    assert await RoutingService(db_session).delete_pool(pool.id, ws.id) is True


@pytest.mark.asyncio
async def test_update_routing_preserves_unrelated_routing_config(db_session, ws):
    """`fallback_enabled` is read by the send path and is not in this schema."""
    pool = _pool(ws.id)
    db_session.add(pool)
    c = await _campaign_with_template(db_session, ws.id)
    c.routing_config = {"fallback_enabled": False}
    await db_session.commit()

    updated = await CampaignService(db_session).update_routing(
        c.id, ws.id, RoutingConfigUpdate(sending_pool_id=pool.id, min_health_score=80)
    )
    assert updated.sending_pool_id == pool.id
    assert updated.routing_config["min_health_score"] == 80
    assert updated.routing_config["fallback_enabled"] is False


# --- the scheduled path ---------------------------------------------------

@pytest.mark.asyncio
async def test_scheduling_is_allowed_while_dns_propagates(db_session, ws):
    """Scheduling does not require a sender yet — the poller owns that gate.

    DNS propagation takes hours, sometimes a day, and scheduling next week's
    newsletter during it is legitimate. Refusing here would have been the stricter
    choice but not the more useful one: the poller holds a campaign it cannot send
    and records why, so nothing goes out unverified either way. What scheduling does
    do is say up front what it is waiting for.
    """
    lst = await _crm_audience(db_session, ws.id)
    c = await _campaign_with_template(db_session, ws.id, list_id=lst.id)

    scheduled = await CampaignService(db_session).schedule_campaign(
        c.id, ws.id, datetime.now(timezone.utc) + timedelta(hours=1)
    )

    assert scheduled.status == CampaignStatus.SCHEDULED.value
    assert "No sending domain" in (scheduled.last_error or "")


@pytest.mark.asyncio
async def test_scheduling_clears_a_stale_sender_problem(db_session, ws):
    """A domain verified since the last attempt leaves no complaint behind."""
    db_session.add(_domain(ws.id, DomainStatus.VERIFIED.value, domain="ex.com"))
    lst = await _crm_audience(db_session, ws.id)
    c = await _campaign_with_template(
        db_session, ws.id, from_email="sender@ex.com", list_id=lst.id
    )
    c.last_error = "No sending domain in this workspace covers sender@ex.com"
    await db_session.commit()

    scheduled = await CampaignService(db_session).schedule_campaign(
        c.id, ws.id, datetime.now(timezone.utc) + timedelta(hours=1)
    )
    assert scheduled.last_error is None


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


@pytest.mark.asyncio
async def test_a_blocked_schedule_is_held_then_handed_back(db_session, ws):
    """Held while the cause can plausibly be fixed, not forever.

    Holding lets a domain finish verifying, which takes hours. A week later nobody
    is coming, and a campaign still reading "scheduled" for a date long past is
    lying about its own state — so it goes back to draft carrying the reason.
    """
    svc = EmailCampaignService(db_session)

    held = await _campaign_with_template(
        db_session,
        ws.id,
        status=CampaignStatus.SCHEDULED.value,
        scheduled_at=datetime.now(timezone.utc) - timedelta(minutes=5),
    )
    result = await svc.check_scheduled_campaigns()
    assert (result["blocked"], result["expired"]) == (1, 0)
    await db_session.refresh(held)
    assert held.status == CampaignStatus.SCHEDULED.value
    assert held.scheduled_at is not None

    # Past the grace period, the same refusal ends it.
    held.scheduled_at = datetime.now(timezone.utc) - (svc.SCHEDULE_GRACE_PERIOD + timedelta(hours=1))
    await db_session.commit()

    result = await svc.check_scheduled_campaigns()
    assert result["expired"] == 1
    await db_session.refresh(held)
    assert held.status == CampaignStatus.DRAFT.value
    assert held.scheduled_at is None
    assert "No sending domain" in (held.last_error or "")


# --- the address a send actually goes out as -------------------------------

@pytest.mark.asyncio
async def test_resolve_send_sender_uses_the_campaign_address_by_default(db_session, ws):
    d = _domain(ws.id, DomainStatus.VERIFIED.value, domain="acme.com")
    db_session.add(d)
    c = await _campaign_with_template(db_session, ws.id, from_email="hello@acme.com")

    resolved = await EmailCampaignService(db_session).resolve_send_sender(c, "to@x.com")
    assert resolved.from_email == "hello@acme.com"
    assert resolved.domain.id == d.id


@pytest.mark.asyncio
async def test_resolve_send_sender_uses_the_pools_address_not_the_campaigns(db_session, ws):
    """The bug in the test-send endpoint.

    A pooled campaign sends as the domain the router picked, so reporting
    `campaign.from_email` back to someone testing their setup showed an address the
    real send would never use — false reassurance from the one button whose whole
    job is reassurance.
    """
    d = _domain(ws.id, DomainStatus.VERIFIED.value, domain="pooled.com")
    pool = _pool(ws.id)
    db_session.add_all([d, pool])
    await db_session.flush()
    db_session.add(_member(pool.id, d.id))
    c = await _campaign_with_template(
        db_session,
        ws.id,
        from_email="hello@unrelated.com",
        sending_pool_id=pool.id,
    )

    resolved = await EmailCampaignService(db_session).resolve_send_sender(c, "to@x.com")
    assert resolved.domain.id == d.id
    assert resolved.from_email.endswith("@pooled.com")
    assert resolved.from_email != "hello@unrelated.com"


@pytest.mark.asyncio
async def test_resolve_send_sender_prefers_a_pinned_identity(db_session, ws):
    d = _domain(ws.id, DomainStatus.VERIFIED.value, domain="acme.com")
    db_session.add(d)
    await db_session.flush()
    identity = SendingIdentity(
        id=str(uuid4()), workspace_id=ws.id, domain_id=d.id,
        email="press@acme.com", display_name="Acme Press", reply_to="inbox@acme.com",
    )
    db_session.add(identity)
    c = await _campaign_with_template(
        db_session, ws.id, from_email="hello@acme.com", sending_identity_id=identity.id
    )

    resolved = await EmailCampaignService(db_session).resolve_send_sender(c, "to@x.com")
    assert (resolved.from_email, resolved.from_name, resolved.reply_to) == (
        "press@acme.com",
        "Acme Press",
        "inbox@acme.com",
    )


# --- the default pool is singular -----------------------------------------

@pytest.mark.asyncio
async def test_making_a_pool_default_unsets_the_previous_one(db_session, ws):
    """"Default" is singular, and PATCH is the path the UI's button takes."""
    svc = RoutingService(db_session)
    first = await svc.create_pool(ws.id, name="First", is_default=True)
    second = await svc.create_pool(ws.id, name="Second")

    await svc.update_pool(second.id, ws.id, is_default=True)

    await db_session.refresh(first)
    await db_session.refresh(second)
    assert (first.is_default, second.is_default) == (False, True)
