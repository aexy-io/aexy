"""The TAT report and the owner scorecard.

Both reports exist to replace a spreadsheet whose every threshold was a typed-in
number, so the properties worth testing are less about arithmetic than about
where the arithmetic gets its constants from:

* **The stakeholder columns follow the taxonomy.** Add a bucket, get a column.
  A fixed set would be right for one desk and wrong for every other.
* **Changing a benchmark changes the score.** If it does not, the number came
  from code and the settings page is decoration.
* **No data is not zero.** A KPI nobody has tickets for scores None and is left
  out of the weighted total, rather than dropping someone to Unsatisfactory for
  having had a quiet month.
* **The cohort is the desk, even when the rows are not.** An owner reading their
  own card is still measured against everyone.

Fixed dates throughout, and every timestamp inside the working window. A test
written as ``now - 3 days`` becomes weekday- and time-of-day dependent the
moment a working-hours clock is involved; 2026-07-01 is a Wednesday and 05:00
UTC is 10:30 IST, comfortably inside the 09:30-18:30 shift.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.service_desk import (
    ServiceDeskStakeholder,
    ServiceDeskTicket,
    TicketPendingSegment,
)
from aexy.models.ticketing import Ticket, TicketForm
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.service_desk_reporting import ServiceDeskReporting
from aexy.services.service_desk_scorecard import ServiceDeskScorecard
from aexy.services.service_desk_scorecard_config import (
    load_scorecard_config,
    replace_config,
    validate_config,
)
from tests.conftest import seed_service_desk_taxonomy

# Wednesday 2026-07-01, 10:30 IST. Inside the shift, so a duration added to it
# is not silently clipped at the 18:30 close.
BASE = datetime(2026, 7, 1, 5, 0, tzinfo=timezone.utc)


class _Desk:
    def __init__(self):
        self.ws: Workspace
        self.form: TicketForm
        self.neha: Developer
        self.nehal: Developer
        self.n = 0


async def _desk(db: AsyncSession, slug: str) -> _Desk:
    d = _Desk()
    d.neha = Developer(id=str(uuid4()), email=f"neha-{slug}@desk.example", name="Dana")
    d.nehal = Developer(id=str(uuid4()), email=f"nehal-{slug}@desk.example", name="Rowan")
    db.add_all([d.neha, d.nehal])
    await db.flush()
    d.ws = Workspace(id=str(uuid4()), name=f"WS {slug}", slug=slug, owner_id=d.neha.id)
    db.add(d.ws)
    await db.flush()
    for dev in (d.neha, d.nehal):
        db.add(
            WorkspaceMember(
                id=str(uuid4()), workspace_id=d.ws.id, developer_id=dev.id, status="active"
            )
        )
    d.form = TicketForm(
        id=str(uuid4()),
        workspace_id=d.ws.id,
        name="Service Desk",
        slug=f"sd-{slug}",
        created_by_id=d.neha.id,
    )
    db.add(d.form)
    await db.commit()
    # insurance_broking: its slugs (kam, insurer, partner, closed) are the legacy
    # enum values, which is what makes these fixtures readable.
    await seed_service_desk_taxonomy(db, d.ws.id)
    return d


async def _ticket(
    db: AsyncSession,
    d: _Desk,
    *,
    assignee: Developer,
    stages: list[tuple[str, float]],
    created_at: datetime = BASE,
    subject: str = "A request",
) -> Ticket:
    """A ticket whose ledger is ``stages`` — (stakeholder slug, hours in it).

    The final stage is left open unless it is the closed bucket, which mirrors
    how the intake and hand-off services actually write the ledger: exactly one
    segment has a null ``exited_at`` until the ticket is closed.
    """
    d.n += 1
    ticket = Ticket(
        id=str(uuid4()),
        workspace_id=d.ws.id,
        form_id=d.form.id,
        ticket_number=d.n,
        submitter_email="priya@acme.example",
        submitter_name="Sam",
        assignee_id=assignee.id,
        title=subject,
        field_values={"subject": subject},
    )
    db.add(ticket)
    await db.flush()
    ticket.created_at = created_at

    cursor = created_at
    final = stages[-1][0]
    for index, (slug, hours) in enumerate(stages):
        is_last = index == len(stages) - 1
        exited = None if is_last and slug != "closed" else cursor + timedelta(hours=hours)
        db.add(
            TicketPendingSegment(
                id=str(uuid4()),
                workspace_id=d.ws.id,
                ticket_id=ticket.id,
                pending_with=slug,
                entered_at=cursor,
                exited_at=exited,
            )
        )
        cursor = cursor + timedelta(hours=hours)

    if final == "closed":
        ticket.closed_at = cursor
    db.add(
        ServiceDeskTicket(
            id=str(uuid4()),
            ticket_id=ticket.id,
            workspace_id=d.ws.id,
            request_type="query",
            pending_with=final,
        )
    )
    await db.commit()
    return ticket


# ---------------------------------------------------------------------------
# TAT report
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stakeholder_columns_come_from_the_taxonomy(db_session: AsyncSession):
    """Adding a bucket adds a column, and the terminal bucket never gets one."""
    d = await _desk(db_session, "cols")
    report = await ServiceDeskReporting(db_session).tat_report(d.ws.id)
    keys = {c["key"] for c in report["columns"]}
    assert "stakeholder.kam" in keys
    assert "stakeholder.insurer" in keys
    # Time spent closed is not time anyone owed an action.
    assert "stakeholder.closed" not in keys

    db_session.add(
        ServiceDeskStakeholder(
            id=str(uuid4()),
            workspace_id=d.ws.id,
            slug="legal",
            label="Legal",
            semantics="internal",
            function_key="legal",
            position=99,
        )
    )
    await db_session.commit()

    report = await ServiceDeskReporting(db_session).tat_report(d.ws.id)
    legal = next(c for c in report["columns"] if c["key"] == "stakeholder.legal")
    # The workspace's own wording, not a slug and not a constant in the client.
    assert legal["label"] == "Legal (hrs)"


@pytest.mark.asyncio
async def test_handshakes_reopens_and_max_stage(db_session: AsyncSession):
    d = await _desk(db_session, "shape")
    # Closed, reopened by a reply, closed again: four hand-offs, two visits to
    # the terminal bucket.
    await _ticket(
        db_session,
        d,
        assignee=d.neha,
        stages=[("kam", 1), ("insurer", 2), ("closed", 0), ("kam", 1), ("closed", 0)],
    )
    report = await ServiceDeskReporting(db_session).tat_report(d.ws.id)
    row = report["rows"][0]

    assert row["handshakes"] == 4  # five segments, minus the creation event
    assert row["reopened"] is True
    assert row["status"] == "Closed"
    # Longest single non-closed stage: the 2h insurer leg, entirely inside the
    # shift so working time equals elapsed time here.
    assert row["max_stage_hours"] == pytest.approx(2.0, abs=0.01)
    assert row["stakeholder.kam"] == pytest.approx(2.0, abs=0.01)
    assert row["stakeholder.insurer"] == pytest.approx(2.0, abs=0.01)


@pytest.mark.asyncio
async def test_zero_breach_follows_the_clock_not_a_literal_48_hours(db_session: AsyncSession):
    """The breach basis is `breach_red_days` on the workspace's own clock.

    Two working days is 18 hours on a 09:30-18:30 shift, not 48 elapsed ones —
    and lowering the setting must move the answer, which is what proves the
    threshold is not a constant in the fold.
    """
    d = await _desk(db_session, "breach")
    # 20 working hours in one stage: over an 18h (2 x 9h) target.
    await _ticket(db_session, d, assignee=d.neha, stages=[("insurer", 60), ("closed", 0)])

    report = await ServiceDeskReporting(db_session).tat_report(d.ws.id)
    assert report["rows"][0]["zero_breach"] is False

    ws = await db_session.get(Workspace, d.ws.id)
    ws.settings = {**(ws.settings or {}), "service_desk": {"breach_red_days": 10}}
    await db_session.commit()

    report = await ServiceDeskReporting(db_session).tat_report(d.ws.id)
    assert report["rows"][0]["zero_breach"] is True


@pytest.mark.asyncio
async def test_overall_is_elapsed_but_stage_is_working_time(db_session: AsyncSession):
    """The split the module settled on, carried into the report.

    A ticket opened Friday inside the shift and closed Monday waited all
    weekend — the requester really did — but nobody owed it working attention
    over those days.
    """
    d = await _desk(db_session, "split")
    friday = datetime(2026, 7, 3, 5, 0, tzinfo=timezone.utc)  # Fri 10:30 IST
    await _ticket(
        db_session,
        d,
        assignee=d.neha,
        created_at=friday,
        stages=[("kam", 72), ("closed", 0)],  # closes Monday 10:30 IST
    )
    row = (await ServiceDeskReporting(db_session).tat_report(d.ws.id))["rows"][0]

    assert row["overall_hours"] == pytest.approx(72.0, abs=0.01)
    # Friday's remaining shift + Monday's opening stretch; the weekend does not
    # accrue, so this is far short of 72.
    assert 0 < row["stakeholder.kam"] < 20


# ---------------------------------------------------------------------------
# Scorecard configuration
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_config_is_seeded_from_the_template(db_session: AsyncSession):
    d = await _desk(db_session, "seed")
    config = await load_scorecard_config(db_session, d.ws.id)

    assert {k.metric_key for k in config.kpis} == {
        "productivity",
        "first_response",
        "handshake_efficiency",
        "owner_attributable_tat",
        "zero_breach",
        "not_reopened",
    }
    assert sum(k.weight for k in config.enabled_kpis) == pytest.approx(1.0)
    # Highest first, and reaching zero so no score is unrated.
    assert [b.rating for b in config.bands] == [5, 4, 3, 2, 1]
    assert config.bands[-1].min_score == 0

    # Idempotent: a second read must not double the rows.
    again = await load_scorecard_config(db_session, d.ws.id)
    assert len(again.kpis) == len(config.kpis)


def test_weights_must_total_one():
    """0.9 deflates every score by a tenth and looks like a working report."""
    kpis = [
        {"metric_key": "productivity", "label": "P", "weight": 0.5,
         "direction": "higher_is_better", "target": 1.0, "enabled": True},
        {"metric_key": "zero_breach", "label": "Z", "weight": 0.4,
         "direction": "higher_is_better", "target": 1.0, "enabled": True},
    ]
    bands = [{"rating": 1, "min_score": 0, "label": "Only"}]
    with pytest.raises(Exception) as excinfo:
        validate_config(kpis, bands)
    # The message names the actual sum — otherwise somebody re-adds six numbers
    # by hand to find out what is wrong.
    assert "0.9" in str(excinfo.value)

    kpis[1]["weight"] = 0.5
    validate_config(kpis, bands)


def test_lowest_band_must_reach_zero():
    kpis = [
        {"metric_key": "productivity", "label": "P", "weight": 1.0,
         "direction": "higher_is_better", "target": 1.0, "enabled": True}
    ]
    with pytest.raises(Exception):
        validate_config(kpis, [{"rating": 5, "min_score": 90, "label": "Outstanding"}])


def test_band_boundaries_are_inclusive():
    """Exactly 90 is Outstanding, a hair under is not."""
    from aexy.services.service_desk_scorecard_config import BandView, ScorecardConfig

    config = ScorecardConfig(
        kpis=(),
        bands=(
            BandView(5, 90.0, "Outstanding"),
            BandView(4, 75.0, "Exceeds"),
            BandView(1, 0.0, "Unsatisfactory"),
        ),
    )
    assert config.band_for(90.0).rating == 5
    assert config.band_for(89.99).rating == 4
    assert config.band_for(0.0).rating == 1
    # No score at all is no rating — not the bottom one.
    assert config.band_for(None) is None


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_changing_a_benchmark_changes_the_score(db_session: AsyncSession):
    """The proof that the curve is data. If this passes with the benchmark
    untouched, the number is coming from code."""
    d = await _desk(db_session, "bench")
    # A single ticket answered after 6 working hours.
    await _ticket(db_session, d, assignee=d.neha, stages=[("kam", 6), ("closed", 0)])

    svc = ServiceDeskScorecard(db_session)
    before = (await svc.scorecard(d.ws.id))["rows"][0]["scores"]["first_response"]
    # Default: benchmark 4h, penalty 10/hr -> 100 - (6-4)*10 = 80.
    assert before == pytest.approx(80.0, abs=0.5)

    config = await load_scorecard_config(db_session, d.ws.id)
    kpis = [
        {
            "metric_key": k.metric_key,
            "label": k.label,
            "weight": k.weight,
            "direction": k.direction,
            # Move the first-response target out to 6h: the same ticket is now
            # exactly on target and should score full marks.
            "benchmark": 6.0 if k.metric_key == "first_response" else k.benchmark,
            "penalty_per_unit": k.penalty_per_unit,
            "target": k.target,
            "enabled": k.enabled,
        }
        for k in config.kpis
    ]
    bands = [{"rating": b.rating, "min_score": b.min_score, "label": b.label} for b in config.bands]
    await replace_config(db_session, d.ws.id, kpis, bands)
    await db_session.commit()

    after = (await svc.scorecard(d.ws.id))["rows"][0]["scores"]["first_response"]
    assert after == pytest.approx(100.0, abs=0.5)


@pytest.mark.asyncio
async def test_no_data_scores_none_and_is_renormalised(db_session: AsyncSession):
    """An owner with only open tickets is graded on what applied.

    Scoring the three closed-ticket KPIs as zero would drop this person to
    Unsatisfactory for having closed nothing yet.
    """
    d = await _desk(db_session, "nodata")
    await _ticket(db_session, d, assignee=d.neha, stages=[("kam", 2)])  # still open

    row = (await ServiceDeskScorecard(db_session).scorecard(d.ws.id))["rows"][0]

    assert row["scores"]["handshake_efficiency"] is None
    assert row["scores"]["not_reopened"] is None
    assert row["scores"]["zero_breach"] is not None
    # Graded on the weight that had data behind it, and the reader can see how
    # much that was.
    assert 0 < row["weight_scored"] < 1.0
    assert row["sim_score"] is not None
    assert row["rating"] is not None


@pytest.mark.asyncio
async def test_productivity_is_measured_against_the_desk(db_session: AsyncSession):
    """Two owners, unequal volume: the cohort average is the comparison."""
    d = await _desk(db_session, "cohort")
    for _ in range(3):
        await _ticket(db_session, d, assignee=d.neha, stages=[("kam", 1), ("closed", 0)])
    await _ticket(db_session, d, assignee=d.nehal, stages=[("kam", 1), ("closed", 0)])

    report = await ServiceDeskScorecard(db_session).scorecard(d.ws.id)
    assert report["cohort"]["owners"] == 2
    assert report["cohort"]["average_closed"] == pytest.approx(2.0)

    by_owner = {r["owner"]: r for r in report["rows"]}
    # 3 closed against an average of 2 is 1.5x, capped at 100.
    assert by_owner["Dana"]["values"]["productivity"] == pytest.approx(1.5)
    assert by_owner["Dana"]["scores"]["productivity"] == 100.0
    # 1 against 2 is half the desk average.
    assert by_owner["Rowan"]["values"]["productivity"] == pytest.approx(0.5)
    assert by_owner["Rowan"]["scores"]["productivity"] == pytest.approx(50.0)


@pytest.mark.asyncio
async def test_own_row_only_still_compares_against_the_whole_desk(db_session: AsyncSession):
    """The point of restricting rows rather than restricting the query.

    Scoped to themselves, Rowan's Productivity must still be 0.5 — measured
    against both owners. Computing the cohort from their own tickets alone would
    divide one by one and read a perfect 100 forever.
    """
    d = await _desk(db_session, "self")
    for _ in range(3):
        await _ticket(db_session, d, assignee=d.neha, stages=[("kam", 1), ("closed", 0)])
    await _ticket(db_session, d, assignee=d.nehal, stages=[("kam", 1), ("closed", 0)])

    report = await ServiceDeskScorecard(db_session).scorecard(
        d.ws.id, viewer_id=d.nehal.id, restrict_to_owner_id=d.nehal.id
    )

    assert report["restricted_to_self"] is True
    assert len(report["rows"]) == 1
    assert report["rows"][0]["owner"] == "Rowan"
    # No peer row leaks, but the comparison is honest.
    assert report["cohort"]["owners"] == 2
    assert report["cohort"]["average_closed"] == pytest.approx(2.0)
    assert report["rows"][0]["values"]["productivity"] == pytest.approx(0.5)


@pytest.mark.asyncio
async def test_unassigned_tickets_are_not_a_scorecard_row(db_session: AsyncSession):
    """They belong in the TAT report, where the gap is meant to be visible."""
    d = await _desk(db_session, "unassigned")
    ticket = await _ticket(db_session, d, assignee=d.neha, stages=[("kam", 1)])
    ticket.assignee_id = None
    await db_session.commit()

    report = await ServiceDeskScorecard(db_session).scorecard(d.ws.id)
    assert report["rows"] == []
    tat = await ServiceDeskReporting(db_session).tat_report(d.ws.id)
    assert len(tat["rows"]) == 1


@pytest.mark.asyncio
async def test_export_matches_the_report(db_session: AsyncSession):
    """A CSV that disagreed with the screen would be a support ticket."""
    import csv
    import io

    d = await _desk(db_session, "export")
    await _ticket(db_session, d, assignee=d.neha, stages=[("kam", 1), ("insurer", 2), ("closed", 0)])

    svc = ServiceDeskReporting(db_session)
    report = await svc.tat_report(d.ws.id)
    csv_text, filename = await svc.export_tat_csv(d.ws.id)

    rows = list(csv.reader(io.StringIO(csv_text.lstrip("﻿"))))
    assert rows[0] == [c["label"] for c in report["columns"]]
    assert len(rows) == len(report["rows"]) + 1
    assert filename.endswith(".csv")


@pytest.mark.asyncio
async def test_handshake_limit_is_a_setting_not_a_constant(db_session: AsyncSession):
    """The "<=2 hand-offs" in the KPI's own title has to be tunable.

    It was `CLEAN_HANDSHAKE_LIMIT = 2` in the scorecard module — the one figure
    on this report a desk could not change. If this test passes without the
    threshold moving, the number is still coming from code.
    """
    d = await _desk(db_session, "threshold")
    # Three hand-offs: over the default limit of 2, under a limit of 3.
    await _ticket(
        db_session,
        d,
        assignee=d.neha,
        stages=[("kam", 1), ("insurer", 1), ("kam", 1), ("closed", 0)],
    )

    svc = ServiceDeskScorecard(db_session)
    before = (await svc.scorecard(d.ws.id))["rows"][0]["values"]["handshake_efficiency"]
    assert before == 0.0  # the ticket does not count as clean

    config = await load_scorecard_config(db_session, d.ws.id)
    await replace_config(
        db_session,
        d.ws.id,
        [
            {
                "metric_key": k.metric_key,
                "label": k.label,
                "weight": k.weight,
                "direction": k.direction,
                "benchmark": k.benchmark,
                "penalty_per_unit": k.penalty_per_unit,
                "target": k.target,
                "threshold": 3.0 if k.metric_key == "handshake_efficiency" else k.threshold,
                "enabled": k.enabled,
            }
            for k in config.kpis
        ],
        [{"rating": b.rating, "min_score": b.min_score, "label": b.label} for b in config.bands],
    )
    await db_session.commit()

    after = (await svc.scorecard(d.ws.id))["rows"][0]["values"]["handshake_efficiency"]
    assert after == 1.0


def test_every_metric_explains_itself():
    """Somebody setting a benchmark has to know what the KPI measures.

    This had nowhere to live until the catalogue carried it, and a KPI with a
    blank description is a number on a settings page with no way to find out
    what it means.
    """
    from aexy.services.service_desk_scorecard import metric_catalogue

    catalogue = metric_catalogue()
    assert catalogue
    for metric in catalogue:
        assert metric["description"], f"{metric['key']} has no description"
        assert metric["how_calculated"], f"{metric['key']} does not say how it is calculated"
        # A threshold box on a metric that ignores it looks set without doing
        # anything, so the two fields must agree.
        assert metric["uses_threshold"] == (metric["threshold_label"] is not None)
