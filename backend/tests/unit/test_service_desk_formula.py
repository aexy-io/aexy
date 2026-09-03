"""Custom scorecard KPIs: the closed vocabulary and its interpreter.

The design test that decided this feature's shape gets its own test here:
**can the vocabulary express the KPIs we already ship?** If it cannot, it is not
expressive enough to be worth a screen. Four of the six came out cleanly and the
three that did not are the reason `relative_to_desk_average`, setting references
and the `own_queue` pseudo-field exist — so those three have tests too, because
they are the features most likely to be "simplified" away by someone who has not
read the plan.

The other half is what the vocabulary must *refuse*. There is no expression to
sanitise, so security here is entirely "every slot is checked against the same
list the builder was offered" — and that is only true if it is tested.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.services.service_desk_clock import Clock
from aexy.services.service_desk_formula import (
    evaluate,
    normalise_to_cohort,
    parse,
    validate,
    vocabulary,
)
from aexy.services.service_desk_reporting import TicketReportRow
from aexy.services.service_desk_taxonomy import load_taxonomy
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace
from tests.conftest import seed_service_desk_taxonomy

CLOCK = Clock()
BASE = datetime(2026, 7, 1, 5, 0, tzinfo=timezone.utc)


def _row(
    *,
    closed: bool = True,
    handshakes: int = 1,
    reopened: bool = False,
    zero_breach: bool = True,
    first_response_h: float | None = 2.0,
    max_stage_h: float = 3.0,
    kam_h: float = 1.0,
    insurer_h: float = 0.0,
    request_type: str = "query",
    pending_with: str = "closed",
    product: str | None = "Motor",
) -> TicketReportRow:
    """One folded ticket, in the shape `fold_ticket` produces."""
    return TicketReportRow(
        ticket_id=str(uuid4()),
        display_id="SD-1",
        subject="s",
        product=product,
        account="Acme",
        vendor=None,
        request_type=request_type,
        owner_id="owner-1",
        owner="Dana",
        pending_with=pending_with,
        created_at=BASE,
        closed_at=BASE + timedelta(hours=5) if closed else None,
        is_closed=closed,
        stakeholder_seconds={"kam": int(kam_h * 3600), "insurer": int(insurer_h * 3600)},
        overall_seconds=18000,
        current_stage_seconds=0,
        breach_level="green",
        handshakes=handshakes,
        reopened=reopened,
        max_stage_seconds=int(max_stage_h * 3600),
        zero_breach=zero_breach,
        first_response_seconds=None if first_response_h is None else int(first_response_h * 3600),
    )


@pytest.fixture
async def taxonomy(db_session: AsyncSession):
    owner = Developer(id=str(uuid4()), email=f"o-{uuid4().hex[:6]}@x.example", name="Owner")
    db_session.add(owner)
    await db_session.flush()
    ws = Workspace(id=str(uuid4()), name="WS", slug=f"f-{uuid4().hex[:6]}", owner_id=owner.id)
    # Terminology set explicitly: seeding a template does NOT apply it (that is
    # a separate opt-in on `apply_industry_template`). An insurance-worded desk
    # is what makes the label assertions below mean something — "Partner" can
    # only come from the workspace.
    ws.settings = {
        "service_desk": {
            "industry_template": "insurance_broking",
            "terminology": {"account": "Partner", "vendor": "Insurer", "product": "Line of Business"},
        }
    }
    db_session.add(ws)
    await db_session.flush()
    await seed_service_desk_taxonomy(db_session, ws.id)
    await db_session.commit()
    return await load_taxonomy(db_session, ws.id, seed=False)


# ---------------------------------------------------------------------------
# The sufficiency test
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_vocabulary_expresses_the_kpis_we_ship(taxonomy):
    """Four of the six, as sentences. This is the bar the design had to clear."""
    tickets = [
        _row(handshakes=1, reopened=False, first_response_h=2.0, kam_h=1.0),
        _row(handshakes=5, reopened=True, first_response_h=6.0, kam_h=3.0),
        _row(closed=False, handshakes=0, first_response_h=4.0, kam_h=2.0, pending_with="kam"),
    ]

    # First Time Response: average of the first segment.
    first_response = parse({"aggregation": "average", "field": "first_response"})
    validate(first_response, taxonomy)
    assert evaluate(first_response, tickets, taxonomy, CLOCK) == pytest.approx(4.0)

    # Handshake Efficiency: share of CLOSED tickets with <= 2 hand-offs.
    handshakes = parse(
        {
            "aggregation": "share",
            "condition": [{"field": "handshakes", "op": "lte", "value": 2}],
            "population": [{"field": "is_closed", "op": "eq", "value": True}],
        }
    )
    validate(handshakes, taxonomy)
    assert evaluate(handshakes, tickets, taxonomy, CLOCK) == pytest.approx(0.5)

    # Not Reopened: share of closed tickets that stayed closed.
    not_reopened = parse(
        {
            "aggregation": "share",
            "condition": [{"field": "reopened", "op": "eq", "value": False}],
            "population": [{"field": "is_closed", "op": "eq", "value": True}],
        }
    )
    validate(not_reopened, taxonomy)
    assert evaluate(not_reopened, tickets, taxonomy, CLOCK) == pytest.approx(0.5)

    # Zero-Breach, via a setting reference rather than a typed number.
    zero_breach = parse(
        {
            "aggregation": "share",
            "condition": [
                {"field": "longest_stage", "op": "lte", "value": {"setting": "breach_target_hours"}}
            ],
        }
    )
    validate(zero_breach, taxonomy)
    assert evaluate(zero_breach, tickets, taxonomy, CLOCK) == pytest.approx(1.0)


@pytest.mark.asyncio
async def test_setting_reference_tracks_the_live_setting(taxonomy):
    """The reason a filter can point at a setting instead of holding a number.

    A threshold typed today silently stops matching when Ops changes the shift.
    Pointing at the breach target means the KPI follows it.
    """
    tickets = [_row(max_stage_h=20.0)]  # 20h: over an 18h target, under a 90h one
    definition = parse(
        {
            "aggregation": "share",
            "condition": [
                {"field": "longest_stage", "op": "lte", "value": {"setting": "breach_target_hours"}}
            ],
        }
    )
    # Default clock: 2 working days x 9h = 18h.
    assert evaluate(definition, tickets, taxonomy, Clock()) == 0.0
    # Ops widens the target; the same KPI follows, with nothing re-saved.
    assert evaluate(definition, tickets, taxonomy, Clock(breach_red_days=10)) == 1.0


@pytest.mark.asyncio
async def test_own_queue_resolves_through_the_taxonomy(taxonomy):
    """"The desk's own queue", not a slug frozen when the KPI was written."""
    tickets = [_row(kam_h=3.0), _row(kam_h=5.0)]
    definition = parse({"aggregation": "average", "field": "own_queue"})
    validate(definition, taxonomy)
    # insurance_broking's default internal bucket is `kam`.
    assert evaluate(definition, tickets, taxonomy, CLOCK) == pytest.approx(4.0)


def test_relative_to_desk_average_needs_the_whole_desk():
    """The normaliser that makes Productivity-shaped KPIs possible.

    Deliberately not part of `evaluate`: one owner's tickets cannot answer "how
    does this compare to everyone", and computing it per owner would divide a
    number by itself and read 1.00 forever.
    """
    assert normalise_to_cohort({"a": 3.0, "b": 1.0}) == {"a": 1.5, "b": 0.5}
    # An owner with no eligible tickets stays None rather than becoming zero...
    assert normalise_to_cohort({"a": 2.0, "b": None}) == {"a": 1.0, "b": None}
    # ...and a desk where everyone scored zero has no meaningful ratio at all,
    # rather than everybody reading as exactly average.
    assert normalise_to_cohort({"a": 0.0, "b": 0.0}) == {"a": None, "b": None}
    assert normalise_to_cohort({"a": None}) == {"a": None}


# ---------------------------------------------------------------------------
# What it refuses
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_every_slot_is_checked_against_the_vocabulary(taxonomy):
    """The whole security story: nothing is parsed, so nothing can be smuggled.

    Each of these is a slot the builder would never have offered.
    """
    cases = [
        # An aggregation that does not exist.
        {"aggregation": "eval"},
        # A field that does not exist — including one shaped like an attack.
        {"aggregation": "average", "field": "__class__"},
        {"aggregation": "average", "field": "stakeholder:; DROP TABLE tickets"},
        # A stakeholder this workspace does not have.
        {"aggregation": "average", "field": "stakeholder:legal"},
        # Averaging a category is meaningless.
        {"aggregation": "average", "field": "request_type"},
        # Ordering comparison on a category.
        {
            "aggregation": "count",
            "population": [{"field": "request_type", "op": "gt", "value": "query"}],
        },
        # A setting that does not exist.
        {
            "aggregation": "count",
            "population": [{"field": "handshakes", "op": "lte", "value": {"setting": "secrets"}}],
        },
        # A share with nothing saying what counts.
        {"aggregation": "share"},
        # A field on an aggregation that counts tickets.
        {"aggregation": "count", "field": "handshakes"},
        # Wrong value type for the field's kind.
        {"aggregation": "count", "population": [{"field": "handshakes", "op": "lte", "value": "two"}]},
        {"aggregation": "count", "population": [{"field": "is_closed", "op": "eq", "value": "yes"}]},
    ]
    for case in cases:
        with pytest.raises(HTTPException) as excinfo:
            validate(parse(case), taxonomy)
        assert excinfo.value.status_code == 422, case


@pytest.mark.asyncio
async def test_vocabulary_follows_the_workspace(taxonomy, db_session: AsyncSession):
    """Stakeholder fields expand from the taxonomy, like the TAT report columns."""
    vocab = vocabulary(taxonomy, CLOCK)
    keys = {f["key"] for f in vocab["fields"]}

    assert "stakeholder:insurer" in keys
    assert "own_queue" in keys
    # The terminal bucket is not a field: time "in" closed is not time owed.
    assert "stakeholder:closed" not in keys

    labels = {f["key"]: f["label"] for f in vocab["fields"]}
    # The workspace's own noun, not the table name — an insurance desk building
    # a KPI picks "Partner", not "Account".
    assert labels["account"] == "Partner"
    assert labels["product"] == "Line of Business"
    assert labels["stakeholder:insurer"] == "Time in Insurer"

    # Category options come from the workspace too, so the builder offers real
    # values instead of a free-text box that never matches anything.
    assert {o["value"] for o in vocab["options"]["request_type"]} >= {"query", "claims"}
    # And the live settings a filter may point at.
    breach = next(s for s in vocab["settings"] if s["key"] == "breach_target_hours")
    assert breach["value"] == pytest.approx(18.0)  # 2 working days x 9h


@pytest.mark.asyncio
async def test_no_eligible_tickets_is_none_not_zero(taxonomy):
    """The distinction the whole feature preserves, at the evaluator level."""
    definition = parse(
        {
            "aggregation": "share",
            "condition": [{"field": "handshakes", "op": "lte", "value": 2}],
            "population": [{"field": "is_closed", "op": "eq", "value": True}],
        }
    )
    # Nothing closed: no denominator, so no figure — not a zero.
    assert evaluate(definition, [_row(closed=False)], taxonomy, CLOCK) is None
    assert evaluate(definition, [], taxonomy, CLOCK) is None

    # A field that is null on every ticket is likewise unanswerable.
    average = parse({"aggregation": "average", "field": "first_response"})
    assert evaluate(average, [_row(first_response_h=None)], taxonomy, CLOCK) is None


@pytest.mark.asyncio
async def test_filters_are_and_ed_and_narrow_the_population(taxonomy):
    definition = parse(
        {
            "aggregation": "count",
            "population": [
                {"field": "is_closed", "op": "eq", "value": True},
                {"field": "product", "op": "eq", "value": "Motor"},
            ],
        }
    )
    validate(definition, taxonomy)
    tickets = [
        _row(closed=True, product="Motor"),
        _row(closed=True, product="Health"),
        _row(closed=False, product="Motor"),
    ]
    assert evaluate(definition, tickets, taxonomy, CLOCK) == 1.0


@pytest.mark.asyncio
async def test_a_deleted_field_excludes_the_ticket_rather_than_crashing(taxonomy):
    """A stakeholder retired after a KPI referenced it.

    The ticket cannot match a question that no longer has an answer, but the
    report must still render — a settings change should not 500 the scorecard.
    """
    definition = parse(
        {
            "aggregation": "count",
            "population": [{"field": "stakeholder:gone", "op": "gt", "value": 0}],
        }
    )
    assert evaluate(definition, [_row()], taxonomy, CLOCK) is None


@pytest.mark.asyncio
async def test_is_not_matches_a_ticket_with_no_value(taxonomy):
    """A ticket with no account genuinely *is* "not Acme".

    Every operator used to fail on a null, which silently dropped unattributed
    tickets out of a population the author meant to include — and a desk has
    enough of them that the TAT report gives them their own bucket.
    """
    definition = parse(
        {
            "aggregation": "count",
            "population": [{"field": "account", "op": "ne", "value": "Acme"}],
        }
    )
    validate(definition, taxonomy)

    unattributed = _row()
    unattributed.account = None
    tickets = [_row(), unattributed, _row()]
    tickets[2].account = "Beta"

    # The unattributed one and Beta; Acme is excluded.
    assert evaluate(definition, tickets, taxonomy, CLOCK) == 2.0

    # `is` still needs something to compare, so a null never matches it.
    positive = parse(
        {
            "aggregation": "count",
            "population": [{"field": "account", "op": "eq", "value": "Acme"}],
        }
    )
    assert evaluate(positive, tickets, taxonomy, CLOCK) == 1.0


@pytest.mark.asyncio
async def test_a_blank_category_value_is_refused(taxonomy):
    """It is a string, so every other check passes — and it matches nothing."""
    for blank in ("", "   "):
        with pytest.raises(HTTPException) as excinfo:
            validate(
                parse(
                    {
                        "aggregation": "count",
                        "population": [{"field": "request_type", "op": "eq", "value": blank}],
                    }
                ),
                taxonomy,
            )
        assert excinfo.value.status_code == 422
