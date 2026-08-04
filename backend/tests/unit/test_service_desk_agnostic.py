"""The Service Desk is a product, not one customer's insurance desk.

Everything here guards a specific way the module used to be Bimaplan-shaped:

* ``RequestType`` and ``PendingWith`` were Python enums, so no workspace could
  add a stakeholder or a request type without a release.
* ``INTERNAL_PENDING_WITH`` wired row-level visibility to department function
  keys like ``ops_kam`` — a dict no admin could see, let alone change.
* Intake filed every new ticket as ``kam`` / ``query``.
* The digest went out at 09:00/13:00/17:00 Asia/Kolkata for every workspace on
  the deployment.

The insurance parity tests matter most: a live desk holds the legacy slugs in
``service_desk_tickets.pending_with``, so the ``insurance_broking`` template has
to reproduce the old enums exactly or existing tickets stop resolving.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.organization import Department, DepartmentMember
from aexy.models.service_desk import (
    ServiceDeskMailbox,
    ServiceDeskRequestType,
    ServiceDeskStakeholder,
)
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.schemas.service_desk import (
    ServiceDeskSettingsUpdate,
    StakeholderCreate,
    StakeholderUpdate,
)
from aexy.services.service_desk_digest_service import ServiceDeskDigestService
from aexy.services.service_desk_industry_templates import (
    DEFAULT_TERMINOLOGY,
    INDUSTRY_TEMPLATES,
    SEMANTIC_CLOSED,
    SEMANTIC_INTERNAL,
    get_template,
    list_templates,
)
from aexy.services.service_desk_service import ServiceDeskService, describe_scope
from aexy.services.service_desk_taxonomy import load_taxonomy, seed_taxonomy


async def _ws(db: AsyncSession, slug: str, *, settings: dict | None = None) -> Workspace:
    owner = Developer(id=str(uuid4()), email=f"o-{slug}@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    ws = Workspace(
        id=str(uuid4()), name=f"WS {slug}", slug=f"{slug}-{uuid4().hex[:6]}",
        owner_id=owner.id, settings=settings or {},
    )
    db.add(ws)
    db.add(WorkspaceMember(workspace_id=ws.id, developer_id=owner.id, role="admin", status="active"))
    await db.flush()
    return ws


# --------------------------------------------------------------- the catalogue

def test_no_template_carries_company_identifying_data():
    """A template describes a shape. Names and addresses are the customer's.

    The script this replaced shipped four real staff first names, three named
    partner companies, eight of one broker's product lines and an
    ``@bimaplan.co`` mailbox — in a file every deployment ran.
    """
    banned = ("bimaplan", "neha", "nehal", "aakanksha", "paramita", "abc finance", "xyz nbfc", "pqr")
    for template in INDUSTRY_TEMPLATES:
        haystack = " ".join(
            [template.slug, template.name, template.description]
            + [s.label for s in template.stakeholders]
            + [s.slug for s in template.stakeholders]
            + [r.label for r in template.request_types]
            + [d.name for d in template.departments]
            + list(template.terminology.values())
        ).lower()
        for word in banned:
            assert word not in haystack, f"{template.slug} leaks {word!r}"
        assert "@" not in haystack, f"{template.slug} contains an email address"


def test_every_template_is_self_consistent():
    """Guards the shape the module depends on, for templates added later too."""
    for t in INDUSTRY_TEMPLATES:
        closed = [s for s in t.stakeholders if s.semantics == SEMANTIC_CLOSED]
        assert len(closed) == 1, f"{t.slug} needs exactly one terminal stakeholder"
        # An internal bucket routes to a department; without one, visibility
        # resolves to nobody and the queue is empty with nothing explaining why.
        provided = {d.function_key for d in t.departments}
        for s in t.stakeholders:
            if s.semantics == SEMANTIC_INTERNAL:
                assert s.function_key, f"{t.slug}/{s.slug} has no function_key"
                assert s.function_key in provided, f"{t.slug}/{s.slug} routes nowhere"
        assert t.default_request_type is not None
        # Terminology falls back, so a template need only name what differs.
        assert set(t.resolved_terminology()) == set(DEFAULT_TERMINOLOGY)


def test_insurance_template_reproduces_the_legacy_enums_exactly():
    """The compatibility contract for every desk already in production.

    Live rows in ``service_desk_tickets.pending_with`` and
    ``ticket_pending_segments`` hold these strings. If this template drifts, those
    tickets land in buckets their own workspace no longer recognises — they vanish
    from every queue and their TAT history stops adding up.
    """
    t = get_template("insurance_broking")
    assert t is not None
    assert {s.slug for s in t.stakeholders} == {
        "kam", "insurer", "partner", "sales", "third_party", "finance", "marketing", "closed",
    }
    assert {r.slug for r in t.request_types} == {"query", "policy_issuance", "claims", "payout"}
    assert t.default_request_type.slug == "query"
    # The old INTERNAL_PENDING_WITH dict, verbatim.
    assert {
        s.slug: s.function_key for s in t.stakeholders if s.semantics == SEMANTIC_INTERNAL
    } == {"kam": "ops_kam", "sales": "sales", "finance": "finance", "marketing": "marketing"}


# ------------------------------------------------------------------- seeding

@pytest.mark.asyncio
async def test_seeding_is_idempotent_and_never_relabels_existing_buckets(db_session: AsyncSession):
    ws = await _ws(db_session, "seed")
    template = get_template("insurance_broking")

    added_s, added_r = await seed_taxonomy(db_session, ws.id, template)
    assert (added_s, added_r) == (8, 4)

    # Someone renames a bucket for their own team.
    row = (
        await db_session.execute(
            select(ServiceDeskStakeholder).where(
                ServiceDeskStakeholder.workspace_id == ws.id,
                ServiceDeskStakeholder.slug == "kam",
            )
        )
    ).scalar_one()
    row.label = "Account Manager"
    await db_session.flush()

    # Re-applying the template must add nothing and overwrite nothing: this is
    # the supported way to pick up a stakeholder added to a template later.
    assert await seed_taxonomy(db_session, ws.id, template) == (0, 0)
    taxonomy = await load_taxonomy(db_session, ws.id)
    assert taxonomy.stakeholder("kam").label == "Account Manager"


@pytest.mark.asyncio
async def test_lazy_seeding_honours_the_configured_template_and_never_guesses(
    db_session: AsyncSession,
):
    """A workspace's industry is asked for, not inferred from its tickets."""
    configured = await _ws(
        db_session, "configured",
        settings={"service_desk": {"industry_template": "software_support"}},
    )
    taxonomy = await load_taxonomy(db_session, configured.id)
    assert taxonomy.has_stakeholder("engineering")
    assert not taxonomy.has_stakeholder("insurer")
    assert taxonomy.default_request_type_slug == "question"

    # With nothing configured it is the neutral template, not an industry guess.
    blank = await _ws(db_session, "blank")
    assert (await load_taxonomy(db_session, blank.id)).default_request_type_slug == "request"


@pytest.mark.asyncio
async def test_read_only_paths_do_not_seed(db_session: AsyncSession):
    """`seed=False` exists for the schedules that walk every workspace.

    A digest run must not create rows as a side effect of reporting.
    """
    ws = await _ws(db_session, "noseed")
    taxonomy = await load_taxonomy(db_session, ws.id, seed=False)
    assert taxonomy.is_empty
    assert (
        await db_session.execute(
            select(ServiceDeskStakeholder).where(ServiceDeskStakeholder.workspace_id == ws.id)
        )
    ).first() is None


# ------------------------------------------------------------------- semantics

@pytest.mark.asyncio
async def test_tat_and_open_queues_branch_on_semantics_not_the_slug(db_session: AsyncSession):
    """Renaming the terminal bucket must not change what "closed" means.

    The old code compared against the literal ``"closed"`` in eight places.
    """
    ws = await _ws(db_session, "semantics")
    await seed_taxonomy(db_session, ws.id, get_template("software_support"))

    row = (
        await db_session.execute(
            select(ServiceDeskStakeholder).where(
                ServiceDeskStakeholder.workspace_id == ws.id,
                ServiceDeskStakeholder.semantics == SEMANTIC_CLOSED,
            )
        )
    ).scalar_one()
    row.slug, row.label = "resolved", "Resolved"
    await db_session.flush()

    taxonomy = await load_taxonomy(db_session, ws.id)
    assert taxonomy.closed_slug == "resolved"
    assert taxonomy.is_closed("resolved")
    # ...and the word "closed" now means nothing in this workspace.
    assert not taxonomy.is_closed("closed")
    assert "resolved" not in taxonomy.open_slugs


@pytest.mark.asyncio
async def test_unknown_slug_is_not_treated_as_closed(db_session: AsyncSession):
    """A ticket holding a retired slug must keep accruing time, not drop out.

    Defaulting an unknown bucket to "closed" would silently stop the clock on
    exactly the tickets nobody is watching.
    """
    ws = await _ws(db_session, "unknown")
    await seed_taxonomy(db_session, ws.id, get_template("generic"))
    taxonomy = await load_taxonomy(db_session, ws.id)
    assert not taxonomy.is_closed("some_retired_bucket")
    assert taxonomy.semantics_of("some_retired_bucket") is None


@pytest.mark.asyncio
async def test_visibility_follows_the_workspaces_own_function_keys(db_session: AsyncSession):
    """The replacement for the hardcoded ``ops_kam`` coupling.

    A workspace that names its teams anything else used to get an empty queue
    with nothing on screen to explain it.
    """
    ws = await _ws(db_session, "scope")
    await seed_taxonomy(db_session, ws.id, get_template("software_support"))

    dev = Developer(id=str(uuid4()), email=f"eng-{uuid4().hex[:6]}@example.com", name="Eng")
    db_session.add(dev)
    await db_session.flush()
    db_session.add(
        WorkspaceMember(workspace_id=ws.id, developer_id=dev.id, role="member", status="active")
    )
    # "engineering" is a function key that only exists in this template.
    dept = Department(
        id=str(uuid4()), workspace_id=ws.id, name="Engineering", slug="engineering",
        function_key="engineering", path="/eng/", depth=0,
    )
    db_session.add(dept)
    await db_session.flush()
    db_session.add(
        DepartmentMember(
            id=str(uuid4()), workspace_id=ws.id, department_id=dept.id, developer_id=dev.id
        )
    )
    await db_session.flush()

    assert await describe_scope(db_session, ws.id, dev.id) == "function"

    # Someone in no department still sees nothing.
    stranger = Developer(id=str(uuid4()), email=f"n-{uuid4().hex[:6]}@example.com", name="N")
    db_session.add(stranger)
    await db_session.flush()
    db_session.add(
        WorkspaceMember(workspace_id=ws.id, developer_id=stranger.id, role="member", status="active")
    )
    await db_session.flush()
    assert await describe_scope(db_session, ws.id, stranger.id) == "none"


# ---------------------------------------------------------------- taxonomy CRUD

@pytest.mark.asyncio
async def test_terminal_stakeholder_cannot_be_removed_or_duplicated(db_session: AsyncSession):
    ws = await _ws(db_session, "terminal")
    svc = ServiceDeskService(db_session)
    await seed_taxonomy(db_session, ws.id, get_template("generic"))

    closed = (
        await db_session.execute(
            select(ServiceDeskStakeholder).where(
                ServiceDeskStakeholder.workspace_id == ws.id,
                ServiceDeskStakeholder.semantics == SEMANTIC_CLOSED,
            )
        )
    ).scalar_one()

    # A second terminal bucket makes "is this closed?" ambiguous for the clock.
    with pytest.raises(HTTPException) as exc:
        await svc.create_stakeholder(
            ws.id,
            StakeholderCreate(slug="done", label="Done", semantics="closed"),
        )
    assert exc.value.status_code == 409

    # Removing the only one leaves no way to close a ticket at all.
    with pytest.raises(HTTPException) as exc:
        await svc.delete_stakeholder(ws.id, closed.id)
    assert exc.value.status_code == 409

    with pytest.raises(HTTPException) as exc:
        await svc.update_stakeholder(ws.id, closed.id, StakeholderUpdate(is_active=False))
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_stakeholder_in_use_is_refused_not_orphaned(db_session: AsyncSession):
    """Deleting a bucket tickets sit in would hide them from every queue."""
    from aexy.models.service_desk import TicketPendingSegment

    ws = await _ws(db_session, "inuse")
    svc = ServiceDeskService(db_session)
    await seed_taxonomy(db_session, ws.id, get_template("generic"))

    support = (
        await db_session.execute(
            select(ServiceDeskStakeholder).where(
                ServiceDeskStakeholder.workspace_id == ws.id,
                ServiceDeskStakeholder.slug == "support",
            )
        )
    ).scalar_one()

    # History alone is enough to refuse: TAT figures are computed from it.
    db_session.add(
        TicketPendingSegment(
            id=str(uuid4()), workspace_id=ws.id, ticket_id=str(uuid4()),
            pending_with="support", entered_at=datetime.now(timezone.utc),
        )
    )
    await db_session.flush()

    with pytest.raises(HTTPException) as exc:
        await svc.delete_stakeholder(ws.id, support.id)
    assert exc.value.status_code == 409
    assert "Deactivate" in exc.value.detail

    # Deactivating is allowed: it hides the bucket from new work and keeps the
    # history readable.
    await svc.update_stakeholder(ws.id, support.id, StakeholderUpdate(is_active=False))
    assert not (await load_taxonomy(db_session, ws.id)).has_stakeholder("support")


@pytest.mark.asyncio
async def test_only_one_default_request_type_survives(db_session: AsyncSession):
    from aexy.schemas.service_desk import RequestTypeCreate

    ws = await _ws(db_session, "default")
    svc = ServiceDeskService(db_session)
    await seed_taxonomy(db_session, ws.id, get_template("generic"))

    await svc.create_request_type(
        ws.id, RequestTypeCreate(slug="urgent", label="Urgent", is_default=True)
    )
    defaults = [
        r.slug
        for r in (
            await db_session.execute(
                select(ServiceDeskRequestType).where(
                    ServiceDeskRequestType.workspace_id == ws.id,
                    ServiceDeskRequestType.is_default.is_(True),
                )
            )
        ).scalars().all()
    ]
    assert defaults == ["urgent"]
    assert (await load_taxonomy(db_session, ws.id)).default_request_type_slug == "urgent"


# ---------------------------------------------------------- applying templates

@pytest.mark.asyncio
async def test_applying_a_template_creates_the_departments_it_routes_to(db_session: AsyncSession):
    """Otherwise visibility resolves to nobody and the queue looks empty."""
    ws = await _ws(db_session, "apply")
    svc = ServiceDeskService(db_session)

    result = await svc.apply_industry_template(
        ws.id, "software_support", apply_terminology=True
    )
    assert result["stakeholders_added"] == 7
    assert set(result["departments_created"]) == {"Support", "Engineering", "Sales", "Finance"}

    keys = {
        d.function_key
        for d in (
            await db_session.execute(
                select(Department).where(Department.workspace_id == ws.id)
            )
        ).scalars().all()
    }
    assert {"support", "engineering", "sales", "finance"} <= keys

    settings = await svc.get_settings(ws.id)
    assert settings["industry_template"] == "software_support"
    assert settings["terminology"]["account"] == "Customer"


@pytest.mark.asyncio
async def test_unknown_template_is_rejected_with_the_known_ones(db_session: AsyncSession):
    ws = await _ws(db_session, "badtpl")
    with pytest.raises(HTTPException) as exc:
        await ServiceDeskService(db_session).apply_industry_template(ws.id, "cheese")
    assert exc.value.status_code == 404
    for t in list_templates():
        assert t.slug in exc.value.detail


# ------------------------------------------------------------------ settings

@pytest.mark.asyncio
async def test_terminology_patches_one_noun_without_clearing_the_rest(db_session: AsyncSession):
    ws = await _ws(db_session, "terms")
    svc = ServiceDeskService(db_session)
    await svc.apply_industry_template(ws.id, "insurance_broking", apply_terminology=True)

    await svc.update_settings(ws.id, terminology={"vendor": "Underwriter"})
    settings = await svc.get_settings(ws.id)
    assert settings["terminology"]["vendor"] == "Underwriter"
    # The rest of the insurance vocabulary survives the patch.
    assert settings["terminology"]["account"] == "Partner"
    assert settings["terminology"]["product"] == "Line of Business"

    # Blanking a key returns it to the generic default rather than storing "".
    await svc.update_settings(ws.id, terminology={"vendor": "  "})
    assert (await svc.get_settings(ws.id))["terminology"]["vendor"] == "Vendor"


def test_digest_hours_are_validated_at_the_schema():
    for bad in ([], [24], [-1], [9, 9]):
        with pytest.raises(ValueError):
            ServiceDeskSettingsUpdate(digest_hours=bad)
    assert ServiceDeskSettingsUpdate(digest_hours=[9, 17]).digest_hours == [9, 17]


def test_unknown_terminology_key_is_rejected():
    with pytest.raises(ValueError):
        ServiceDeskSettingsUpdate(terminology={"insurer": "Insurer"})


# -------------------------------------------------------------------- digest

@pytest.mark.asyncio
async def test_digest_fires_on_the_workspaces_local_clock(db_session: AsyncSession):
    """Was one cron at 09:00/13:00/17:00 Asia/Kolkata for the whole deployment.

    A New York desk was therefore paged at 23:30 local.
    """
    ny = await _ws(
        db_session, "ny",
        settings={"service_desk": {"timezone": "America/New_York", "digest_hours": [9]}},
    )
    db_session.add(
        ServiceDeskMailbox(id=str(uuid4()), workspace_id=ny.id, address=f"d-{uuid4().hex[:6]}@example.com")
    )
    await db_session.flush()
    svc = ServiceDeskDigestService(db_session)

    # 13:00 UTC is 09:00 in New York (EDT, UTC-4) — due.
    assert await svc.is_due(ny.id, datetime(2026, 8, 4, 13, 0, tzinfo=timezone.utc))
    # 09:00 UTC is 05:00 in New York — not due, though the old cron's 09:00
    # Asia/Kolkata (03:30 UTC) would have sent here regardless.
    assert not await svc.is_due(ny.id, datetime(2026, 8, 4, 9, 0, tzinfo=timezone.utc))
    assert not await svc.is_due(ny.id, datetime(2026, 8, 4, 3, 30, tzinfo=timezone.utc))


@pytest.mark.asyncio
async def test_each_digest_hour_fires_once_per_hour(db_session: AsyncSession):
    """The schedule ticks every half hour; both ticks must not both send.

    Half-hourly rather than hourly so zones with a :30 offset get 09:00 local
    rather than 09:30 — which is exactly why the minute has to be checked.
    """
    ist = await _ws(
        db_session, "ist",
        settings={"service_desk": {"timezone": "Asia/Kolkata", "digest_hours": [9]}},
    )
    db_session.add(
        ServiceDeskMailbox(id=str(uuid4()), workspace_id=ist.id, address=f"i-{uuid4().hex[:6]}@example.com")
    )
    await db_session.flush()
    svc = ServiceDeskDigestService(db_session)

    # 03:30 UTC == 09:00 IST exactly.
    assert await svc.is_due(ist.id, datetime(2026, 8, 4, 3, 30, tzinfo=timezone.utc))
    # 04:00 UTC == 09:30 IST — same hour, already sent.
    assert not await svc.is_due(ist.id, datetime(2026, 8, 4, 4, 0, tzinfo=timezone.utc))


@pytest.mark.asyncio
async def test_digest_defaults_are_unchanged_for_existing_workspaces(db_session: AsyncSession):
    """No stored setting must keep behaving exactly as the old cron did."""
    ws = await _ws(db_session, "legacy")
    db_session.add(
        ServiceDeskMailbox(id=str(uuid4()), workspace_id=ws.id, address=f"l-{uuid4().hex[:6]}@example.com")
    )
    await db_session.flush()
    svc = ServiceDeskDigestService(db_session)

    # Defaults: 9/13/17 in Asia/Kolkata (03:30, 07:30, 11:30 UTC).
    for utc_hour, utc_min in ((3, 30), (7, 30), (11, 30)):
        assert await svc.is_due(ws.id, datetime(2026, 8, 4, utc_hour, utc_min, tzinfo=timezone.utc))
    assert not await svc.is_due(ws.id, datetime(2026, 8, 4, 5, 30, tzinfo=timezone.utc))


# ------------------------------------------------- reads must not configure

@pytest.mark.asyncio
async def test_listing_and_dashboard_do_not_seed_a_taxonomy(db_session: AsyncSession):
    """The first-run template picker depends on "no stakeholders" staying true.

    These paths used to call `load_taxonomy` with seeding on, so merely opening the
    Service Desk gave the workspace the neutral template. The picker then never
    appeared, and if someone applied a template afterwards the result was a
    *mixture* of the default and their choice — 11 stakeholders from two templates
    rather than the 8 they picked.
    """
    from aexy.services.service_desk_ticket_service import ServiceDeskTicketService

    ws = await _ws(db_session, "noseed-read")
    svc = ServiceDeskService(db_session)

    assert await svc.list_stakeholders(ws.id) == []
    assert await svc.list_request_types(ws.id) == []
    await ServiceDeskTicketService(db_session).get_dashboard(ws.id)
    await svc.get_settings(ws.id)

    still_empty = (
        await db_session.execute(
            select(ServiceDeskStakeholder).where(ServiceDeskStakeholder.workspace_id == ws.id)
        )
    ).first()
    assert still_empty is None, "a read created taxonomy rows"


@pytest.mark.asyncio
async def test_applying_a_template_to_a_fresh_desk_yields_only_that_template(
    db_session: AsyncSession,
):
    """What the mixed-taxonomy bug actually broke."""
    ws = await _ws(db_session, "clean-apply")
    await ServiceDeskService(db_session).apply_industry_template(
        ws.id, "insurance_broking", apply_terminology=True
    )
    taxonomy = await load_taxonomy(db_session, ws.id, seed=False)
    assert {s.slug for s in taxonomy.stakeholders} == {
        "kam", "insurer", "partner", "sales", "third_party", "finance", "marketing", "closed",
    }
    # Exactly one terminal bucket — two would make "is this closed?" ambiguous.
    assert sum(1 for s in taxonomy.stakeholders if s.semantics == SEMANTIC_CLOSED) == 1


@pytest.mark.asyncio
async def test_inbound_mail_still_seeds_rather_than_being_dropped(db_session: AsyncSession):
    """The one place seeding survives, and why.

    Every other path reports an unconfigured desk honestly. Intake cannot: an
    email has already arrived, and refusing it loses a customer's message.
    """
    ws = await _ws(db_session, "intake-seeds")
    taxonomy = await load_taxonomy(db_session, ws.id, seed=True)
    assert taxonomy.default_stakeholder_slug is not None
    assert taxonomy.default_request_type_slug is not None


# ------------------------------------------------- master-data links (links_to)


@pytest.mark.asyncio
async def test_external_buckets_declare_which_master_data_table_they_speak_for(
    db_session: AsyncSession,
):
    """The link is declared, not guessed from the bucket's label.

    It used to be inferred by matching a stakeholder's label against the
    workspace's noun for accounts or vendors, which resolved to nothing the
    moment a desk renamed one noun and not the other — so a reply from a known
    counterparty silently stopped handing the ticket back.
    """
    from aexy.services.service_desk_taxonomy import external_slug_for

    ws = await _ws(db_session, "links")
    await seed_taxonomy(db_session, ws.id, get_template("insurance_broking"))
    await db_session.flush()
    taxonomy = await load_taxonomy(db_session, ws.id, seed=False)

    assert external_slug_for(taxonomy, "vendor") == "insurer"
    assert external_slug_for(taxonomy, "account") == "partner"

    # Renaming the bucket must not change which table it speaks for.
    row = (
        await db_session.execute(
            select(ServiceDeskStakeholder).where(
                ServiceDeskStakeholder.workspace_id == ws.id,
                ServiceDeskStakeholder.slug == "insurer",
            )
        )
    ).scalar_one()
    row.label = "Underwriter"
    await db_session.flush()

    renamed = await load_taxonomy(db_session, ws.id, seed=False)
    assert external_slug_for(renamed, "vendor") == "insurer"


@pytest.mark.asyncio
async def test_a_desk_seeded_before_links_to_still_resolves(db_session: AsyncSession):
    """Rows written before the column exists carry NULL, and must still work."""
    from aexy.services.service_desk_taxonomy import external_slug_for

    ws = await _ws(db_session, "links-legacy")
    await seed_taxonomy(db_session, ws.id, get_template("insurance_broking"))
    await db_session.flush()
    for row in (
        await db_session.execute(
            select(ServiceDeskStakeholder).where(ServiceDeskStakeholder.workspace_id == ws.id)
        )
    ).scalars().all():
        row.links_to = None
    await db_session.flush()

    taxonomy = await load_taxonomy(db_session, ws.id, seed=False)
    assert external_slug_for(taxonomy, "vendor") == "insurer"
    assert external_slug_for(taxonomy, "account") == "partner"


@pytest.mark.asyncio
async def test_a_generic_desk_claims_neither_table(db_session: AsyncSession):
    """No bucket claims a table, so callers get None rather than a wrong guess."""
    from aexy.services.service_desk_taxonomy import external_slug_for

    ws = await _ws(db_session, "links-generic")
    await seed_taxonomy(db_session, ws.id, get_template("generic"))
    await db_session.flush()
    taxonomy = await load_taxonomy(db_session, ws.id, seed=False)

    assert external_slug_for(taxonomy, "vendor") is None
    assert external_slug_for(taxonomy, "account") is None
