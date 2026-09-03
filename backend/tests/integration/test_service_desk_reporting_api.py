"""The reporting endpoints, over HTTP.

Two things are only true at the API boundary and so can only be tested here:

* **The TAT report is a ticket read** and takes the same visibility clause the
  list takes. A report that quietly returned more than the screen it sits next
  to would be a permissions bug with an export button on it.

* **The scorecard is not a ticket read.** It grades named colleagues, so it has
  its own rule: a manager sees every owner, anyone else sees their own row with
  the cohort still measured across the whole desk. The interesting case is the
  second one — a restriction that narrows rows without narrowing the arithmetic.
"""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.models.developer import Developer
from aexy.models.ticketing import Ticket
from aexy.models.workspace import Workspace, WorkspaceMember
from tests.conftest import seed_service_desk_taxonomy

settings = get_settings()


def _auth(developer_id: str) -> dict:
    payload = {
        "sub": developer_id,
        "type": "access",
        "exp": datetime.now(timezone.utc).timestamp() + 1800,
    }
    return {
        "Authorization": f"Bearer {jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)}"
    }


def _sd(ws_id: str) -> str:
    return f"/api/v1/workspaces/{ws_id}/service-desk"


@pytest_asyncio.fixture
async def desk(db_session: AsyncSession):
    """A workspace with an admin (full desk view) and a plain member.

    "member" maps to the developer role template, which holds neither
    can_manage_service_desk nor can_view_all_service_desk — so it is the role
    that exercises the restricted path.
    """
    admin = Developer(id=str(uuid4()), email=f"admin-{uuid4().hex[:6]}@x.example", name="Desk Admin")
    member = Developer(id=str(uuid4()), email=f"kam-{uuid4().hex[:6]}@x.example", name="Kam Member")
    db_session.add_all([admin, member])
    await db_session.flush()

    ws = Workspace(id=str(uuid4()), name="Desk", slug=f"d-{uuid4().hex[:6]}", owner_id=admin.id)
    db_session.add(ws)
    await db_session.flush()
    db_session.add_all(
        [
            WorkspaceMember(
                workspace_id=ws.id, developer_id=admin.id, role="admin", status="active"
            ),
            WorkspaceMember(
                workspace_id=ws.id, developer_id=member.id, role="member", status="active"
            ),
        ]
    )
    await seed_service_desk_taxonomy(db_session, ws.id)
    await db_session.commit()
    return {
        "ws": ws.id,
        "admin": _auth(admin.id),
        "admin_id": admin.id,
        "member": _auth(member.id),
        "member_id": member.id,
    }


async def _manual_ticket(client, ws, headers, subject, assignee_id=None):
    r = await client.post(
        _sd(ws) + "/tickets/manual",
        headers=headers,
        json={"subject": subject, "body": "please help", "request_type": "query"},
    )
    assert r.status_code == 201, r.text
    return r.json()["ticket_id"]


@pytest.mark.asyncio
async def test_tat_report_serves_its_own_columns(client, desk):
    ws, h = desk["ws"], desk["admin"]
    await _manual_ticket(client, ws, h, "Policy status please")

    r = await client.get(_sd(ws) + "/reports/tat", headers=h)
    assert r.status_code == 200, r.text
    body = r.json()

    keys = {c["key"] for c in body["columns"]}
    # A stakeholder column per open bucket, from the seeded insurance taxonomy.
    assert {"stakeholder.kam", "stakeholder.insurer", "stakeholder.partner"} <= keys
    assert "stakeholder.closed" not in keys
    # And the measures a desk would otherwise derive by hand.
    assert {"handshakes", "reopened", "zero_breach", "max_stage_hours"} <= keys

    assert body["total"] == 1
    row = body["rows"][0]
    assert set(row) >= keys
    # So a reader knows what "days" means without opening the settings page.
    assert body["working_day_hours"] > 0
    assert body["breach_red_days"] > 0


@pytest.mark.asyncio
async def test_tat_export_is_the_report_in_a_file(client, desk):
    ws, h = desk["ws"], desk["admin"]
    await _manual_ticket(client, ws, h, "Export me")

    report = (await client.get(_sd(ws) + "/reports/tat", headers=h)).json()
    r = await client.get(_sd(ws) + "/reports/tat/export", headers=h)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]

    lines = r.text.lstrip("﻿").strip().splitlines()
    assert len(lines) == len(report["rows"]) + 1
    for column in report["columns"]:
        assert column["label"] in lines[0]


@pytest.mark.asyncio
async def test_scorecard_config_is_readable_by_the_person_being_graded(client, desk):
    """An owner should be able to see what they are graded on — and not edit it."""
    ws = desk["ws"]

    r = await client.get(_sd(ws) + "/reports/scorecard/config", headers=desk["member"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["can_manage"] is False
    assert len(body["kpis"]) == 6
    assert abs(sum(k["weight"] for k in body["kpis"] if k["enabled"]) - 1.0) < 1e-6
    # The settings page gets the real metric list rather than hardcoding one.
    assert {m["key"] for m in body["available_metrics"]} >= {k["metric_key"] for k in body["kpis"]}

    admin_view = await client.get(_sd(ws) + "/reports/scorecard/config", headers=desk["admin"])
    assert admin_view.json()["can_manage"] is True


@pytest.mark.asyncio
async def test_only_a_manager_may_change_the_config(client, desk):
    ws = desk["ws"]
    config = (await client.get(_sd(ws) + "/reports/scorecard/config", headers=desk["admin"])).json()
    payload = {
        "kpis": [{k: v for k, v in kpi.items() if k != "unit"} for kpi in config["kpis"]],
        "bands": config["bands"],
    }

    denied = await client.put(
        _sd(ws) + "/reports/scorecard/config", headers=desk["member"], json=payload
    )
    assert denied.status_code == 403

    allowed = await client.put(
        _sd(ws) + "/reports/scorecard/config", headers=desk["admin"], json=payload
    )
    assert allowed.status_code == 200, allowed.text


@pytest.mark.asyncio
async def test_config_rejects_weights_that_do_not_total_one(client, desk):
    ws = desk["ws"]
    config = (await client.get(_sd(ws) + "/reports/scorecard/config", headers=desk["admin"])).json()
    kpis = [{k: v for k, v in kpi.items() if k != "unit"} for kpi in config["kpis"]]
    kpis[0]["weight"] = 0.05  # was 0.20

    r = await client.put(
        _sd(ws) + "/reports/scorecard/config",
        headers=desk["admin"],
        json={"kpis": kpis, "bands": config["bands"]},
    )
    assert r.status_code == 422
    # The message names the sum, so nobody has to add six numbers up by hand.
    assert "0.85" in r.text


@pytest.mark.asyncio
async def test_a_non_manager_sees_only_their_own_row(client, desk, db_session):
    """Rows narrowed, arithmetic not — the whole point of the restriction."""
    ws = desk["ws"]
    # Three tickets logged by the admin (a plain member may not log one — see
    # the manual-ticket gate), then one handed over, which is how an owner ends
    # up holding work they did not create.
    await _manual_ticket(client, ws, desk["admin"], "Admin one")
    await _manual_ticket(client, ws, desk["admin"], "Admin two")
    handed_over = await _manual_ticket(client, ws, desk["admin"], "Member one")
    ticket = await db_session.get(Ticket, handed_over)
    ticket.assignee_id = desk["member_id"]
    await db_session.commit()

    full = (await client.get(_sd(ws) + "/reports/scorecard", headers=desk["admin"])).json()
    assert full["restricted_to_self"] is False
    assert len(full["rows"]) >= 2

    own = await client.get(_sd(ws) + "/reports/scorecard", headers=desk["member"])
    assert own.status_code == 200, own.text
    body = own.json()

    assert body["restricted_to_self"] is True
    assert len(body["rows"]) == 1
    assert body["rows"][0]["owner_id"] == desk["member_id"]
    # No peer's name or figures come back...
    assert desk["admin_id"] not in own.text
    # ...but the cohort is still the whole desk, which is what makes their own
    # number mean anything.
    assert body["cohort"]["owners"] == full["cohort"]["owners"]


def _as_input(kpi: dict) -> dict:
    """A config response row as the update/preview endpoints take it back."""
    return {k: v for k, v in kpi.items() if k not in ("unit", "definition_version")}


@pytest.mark.asyncio
async def test_vocabulary_is_served_in_the_desks_own_nouns(client, desk):
    """The builder's palette comes off the wire, not out of the client.

    A frontend holding its own field list would be right for one desk and wrong
    for every other — the same property the TAT report's columns have.
    """
    ws = desk["ws"]
    r = await client.get(_sd(ws) + "/reports/scorecard/vocabulary", headers=desk["admin"])
    assert r.status_code == 200, r.text
    vocab = r.json()

    keys = {f["key"] for f in vocab["fields"]}
    # One duration field per open stakeholder, plus the pseudo-field that
    # resolves to whichever bucket this desk works out of.
    assert {"stakeholder:insurer", "stakeholder:kam", "own_queue"} <= keys
    assert "stakeholder:closed" not in keys
    # Live settings a filter may point at instead of a number that goes stale.
    assert {s["key"] for s in vocab["settings"]} == {"breach_target_hours", "working_day_hours"}
    # And real category options, so the builder is not a free-text box.
    assert vocab["options"]["request_type"]

    # Manager-only: it is the builder's palette, and only a manager can build.
    denied = await client.get(_sd(ws) + "/reports/scorecard/vocabulary", headers=desk["member"])
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_preview_scores_an_unsaved_config_and_shows_the_impact(client, desk):
    """The call the whole builder rests on.

    Adding a KPI rescales every other weight and re-grades named people. The
    screen has to be able to say so before anyone saves, which means scoring a
    config that does not exist yet — against real tickets, next to the live one.
    """
    ws, h = desk["ws"], desk["admin"]
    await _manual_ticket(client, ws, h, "One")
    await _manual_ticket(client, ws, h, "Two")

    config = (await client.get(_sd(ws) + "/reports/scorecard/config", headers=h)).json()
    kpis = [_as_input(k) for k in config["kpis"]]
    # Halve one built-in's weight and spend it on a custom KPI, so the totals
    # still make 1.0 and every score necessarily moves.
    kpis[0]["weight"] = 0.1
    # "Share of tickets still open", scored lower-is-better with no tolerance.
    # Chosen so it actually bites: the seeded tickets are all open, so it scores
    # 0 where the built-ins score 100 — a KPI that agreed with them would leave
    # the weighted total unmoved and the test would prove nothing.
    kpis.append(
        {
            "metric_key": "open_backlog_share",
            "label": "Open backlog share",
            "weight": 0.1,
            "direction": "lower_is_better",
            "benchmark": 0,
            "penalty_per_unit": 100,
            "target": None,
            "threshold": None,
            "enabled": True,
            "source": "custom",
            "status": "published",
            "definition": {
                "aggregation": "share",
                "condition": [{"field": "is_closed", "op": "eq", "value": False}],
            },
        }
    )

    r = await client.post(
        _sd(ws) + "/reports/scorecard/preview",
        headers=h,
        json={"kpis": kpis, "bands": config["bands"]},
    )
    assert r.status_code == 200, r.text
    body = r.json()

    assert "open_backlog_share" in {k["metric_key"] for k in body["kpis"]}
    assert body["rows"], "the preview must score real owners, not an empty shape"
    row = body["rows"][0]
    # The custom KPI produced a figure...
    assert row["values"]["open_backlog_share"] == 1.0
    assert row["scores"]["open_backlog_share"] == 0.0
    # ...and the blast radius is reported per person, against the live config.
    assert "previous_score" in row
    assert row["previous_score"] > row["sim_score"], "the impact diff must show the drop"

    # Nothing was written: preview is a read with a body.
    after = (await client.get(_sd(ws) + "/reports/scorecard/config", headers=h)).json()
    assert len(after["kpis"]) == len(config["kpis"])


@pytest.mark.asyncio
async def test_preview_rejects_a_definition_the_builder_would_not_offer(client, desk):
    ws, h = desk["ws"], desk["admin"]
    config = (await client.get(_sd(ws) + "/reports/scorecard/config", headers=h)).json()
    kpis = [_as_input(k) for k in config["kpis"]]
    kpis.append(
        {
            "metric_key": "bogus", "label": "Bogus", "weight": 0.0,
            "direction": "higher_is_better", "benchmark": None, "penalty_per_unit": None,
            "target": 1, "threshold": None, "enabled": False, "source": "custom",
            "status": "published",
            "definition": {"aggregation": "average", "field": "__class__"},
        }
    )
    r = await client.post(
        _sd(ws) + "/reports/scorecard/preview",
        headers=h,
        json={"kpis": kpis, "bands": config["bands"]},
    )
    assert r.status_code == 422
    assert "__class__" in r.text


@pytest.mark.asyncio
async def test_a_draft_is_saved_but_never_scored(client, desk):
    """A half-built KPI must not move anybody's rating."""
    ws, h = desk["ws"], desk["admin"]
    await _manual_ticket(client, ws, h, "One")

    config = (await client.get(_sd(ws) + "/reports/scorecard/config", headers=h)).json()
    kpis = [_as_input(k) for k in config["kpis"]]
    kpis.append(
        {
            "metric_key": "wip", "label": "Work in progress", "weight": 0.5,
            "direction": "higher_is_better", "benchmark": None, "penalty_per_unit": None,
            "target": 1, "threshold": None, "enabled": True, "source": "custom",
            # A draft, so its 0.5 weight must not count toward the total —
            # otherwise this save would be rejected for summing to 1.5.
            "status": "draft",
            "definition": {"aggregation": "count"},
        }
    )
    saved = await client.put(
        _sd(ws) + "/reports/scorecard/config", headers=h,
        json={"kpis": kpis, "bands": config["bands"]},
    )
    assert saved.status_code == 200, saved.text
    assert "wip" in {k["metric_key"] for k in saved.json()["kpis"]}

    scored = (await client.get(_sd(ws) + "/reports/scorecard", headers=h)).json()
    assert "wip" not in {k["metric_key"] for k in scored["kpis"]}


@pytest.mark.asyncio
async def test_definition_version_bumps_only_on_a_real_change(client, desk):
    """A version that ticks on every save tells a reader nothing."""
    ws, h = desk["ws"], desk["admin"]
    config = (await client.get(_sd(ws) + "/reports/scorecard/config", headers=h)).json()
    kpis = [_as_input(k) for k in config["kpis"]]
    custom = {
        "metric_key": "reopen_watch", "label": "Reopen watch", "weight": 0.0,
        "direction": "higher_is_better", "benchmark": None, "penalty_per_unit": None,
        "target": 1, "threshold": None, "enabled": False, "source": "custom",
        "status": "published",
        "definition": {"aggregation": "count", "population": [
            {"field": "reopened", "op": "eq", "value": True}
        ]},
    }
    kpis.append(custom)
    body = {"kpis": kpis, "bands": config["bands"]}

    first = (await client.put(_sd(ws) + "/reports/scorecard/config", headers=h, json=body)).json()
    version = next(k["definition_version"] for k in first["kpis"] if k["metric_key"] == "reopen_watch")

    # A rename is not a new definition.
    kpis[-1] = {**custom, "label": "Reopen watch (renamed)"}
    same = (await client.put(_sd(ws) + "/reports/scorecard/config", headers=h,
                             json={"kpis": kpis, "bands": config["bands"]})).json()
    assert next(k["definition_version"] for k in same["kpis"] if k["metric_key"] == "reopen_watch") == version

    # Changing what it measures is.
    kpis[-1] = {**custom, "definition": {"aggregation": "count"}}
    changed = (await client.put(_sd(ws) + "/reports/scorecard/config", headers=h,
                                json={"kpis": kpis, "bands": config["bands"]})).json()
    assert next(k["definition_version"] for k in changed["kpis"] if k["metric_key"] == "reopen_watch") == version + 1


# ---------------------------------------------------------------------------
# The builder's own sequence
#
# The tests above each exercise one endpoint with a fixture that had already
# sidestepped the problem: the preview test rebalanced the weights by hand, and
# the browser spec mocked the response away. Both 422s below were live on the
# primary path and neither suite saw them. These drive the sequence a person
# actually performs instead.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_preview_works_on_the_untouched_add_a_kpi_flow(client, desk):
    """Open the builder, describe a KPI, hit preview — nothing rebalanced.

    The dialog sends every existing KPI untouched plus the new one at its
    default weight, so the set totals 1.1. That is the normal state of a config
    mid-edit, and the preview exists precisely to help at that moment.
    """
    ws, h = desk["ws"], desk["admin"]
    await _manual_ticket(client, ws, h, "One")

    config = (await client.get(_sd(ws) + "/reports/scorecard/config", headers=h)).json()
    kpis = [_as_input(k) for k in config["kpis"]]
    kpis.append(
        {
            "metric_key": "still_open", "label": "Still open", "weight": 0.1,
            "direction": "lower_is_better", "benchmark": 0, "penalty_per_unit": 100,
            "target": None, "threshold": None, "enabled": True, "source": "custom",
            "status": "published",
            "definition": {
                "aggregation": "share",
                "condition": [{"field": "is_closed", "op": "eq", "value": False}],
            },
        }
    )

    r = await client.post(
        _sd(ws) + "/reports/scorecard/preview", headers=h,
        json={"kpis": kpis, "bands": config["bands"]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["rows"][0]["values"]["still_open"] == 1.0

    # Saving still demands the sum: it is a save-time invariant, and a stored
    # config that does not add up would deflate every score on every screen.
    save = await client.put(
        _sd(ws) + "/reports/scorecard/config", headers=h,
        json={"kpis": kpis, "bands": config["bands"]},
    )
    assert save.status_code == 422
    assert "1.1" in save.text


@pytest.mark.asyncio
async def test_a_blank_category_filter_is_refused(client, desk):
    """It passes every other check and then matches no ticket at all.

    Unlike a blank number, which fails the type check, a blank string is a
    string — so the KPI would save, score None for everybody, and say nothing
    about why.
    """
    ws, h = desk["ws"], desk["admin"]
    config = (await client.get(_sd(ws) + "/reports/scorecard/config", headers=h)).json()
    kpis = [_as_input(k) for k in config["kpis"]]
    kpis[0]["weight"] = 0.1
    kpis.append(
        {
            "metric_key": "blank", "label": "Blank", "weight": 0.1,
            "direction": "higher_is_better", "benchmark": None, "penalty_per_unit": None,
            "target": 1, "threshold": None, "enabled": True, "source": "custom",
            "status": "published",
            "definition": {
                "aggregation": "share",
                "condition": [{"field": "request_type", "op": "eq", "value": "  "}],
            },
        }
    )
    r = await client.put(
        _sd(ws) + "/reports/scorecard/config", headers=h,
        json={"kpis": kpis, "bands": config["bands"]},
    )
    assert r.status_code == 422
    assert "needs a value" in r.text


@pytest.mark.asyncio
async def test_an_unreadable_definition_costs_its_column_not_the_report(
    client, desk, db_session
):
    """One malformed row must not 422 the scorecard for everyone who opens it."""
    from aexy.models.service_desk import ServiceDeskScorecardKPI

    ws, h = desk["ws"], desk["admin"]
    await _manual_ticket(client, ws, h, "One")
    await client.get(_sd(ws) + "/reports/scorecard/config", headers=h)  # seed

    # What a hand-edit or a partial restore leaves behind: source flipped to
    # custom with nothing to evaluate.
    db_session.add(
        ServiceDeskScorecardKPI(
            id=str(uuid4()), workspace_id=ws, metric_key="broken", label="Broken",
            weight=0.0, direction="higher_is_better", target=1.0, enabled=True,
            source="custom", definition=None, position=99,
        )
    )
    await db_session.commit()

    r = await client.get(_sd(ws) + "/reports/scorecard", headers=h)
    assert r.status_code == 200, r.text
    row = r.json()["rows"][0]
    # The broken KPI scores nothing; every other KPI still does.
    assert row["values"]["broken"] is None
    assert row["values"]["zero_breach"] is not None
