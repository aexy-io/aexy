"""The workspace billing card must report the plan system's truth.

``GET /workspaces/{id}/billing`` used to hardcode ``"Free"``/``"Pro"`` and a
5-seat free tier, contradicting ``DEFAULT_PLANS`` (the real Free plan includes
10 seats). These tests pin the resolver those endpoints now delegate to.
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.plan import Plan, PlanTier
from aexy.models.workspace import Workspace, WorkspacePlanOverride
from aexy.services.limits_service import LimitsService

from tests.conftest import requires_postgres

# Plan rows use ARRAY columns, which SQLite can't bind — same gate as the
# other plan-tier tests. Run with TEST_DATABASE_URL pointing at Postgres.
pytestmark = requires_postgres


async def _ws(db: AsyncSession, slug: str, plan_id: str | None = None) -> Workspace:
    owner = Developer(email=f"o-{slug}@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    ws = Workspace(name=slug, slug=slug, owner_id=owner.id, plan_id=plan_id)
    db.add(ws)
    await db.commit()
    return ws


@pytest.mark.asyncio
async def test_workspace_without_plan_gets_the_real_free_plan(db_session: AsyncSession):
    ws = await _ws(db_session, "bill-free")

    plan = await LimitsService(db_session).get_workspace_plan(ws.id)

    assert plan.tier == PlanTier.FREE.value
    # The number the old endpoint hardcoded as 5.
    assert plan.included_seats == 10
    assert plan.plan_name == "Free"


@pytest.mark.asyncio
async def test_workspace_with_assigned_plan_reports_it(db_session: AsyncSession):
    pro = Plan(
        name="Pro",
        tier=PlanTier.PRO.value,
        included_seats=25,
        per_seat_price_monthly_cents=2900,
    )
    db_session.add(pro)
    await db_session.flush()
    ws = await _ws(db_session, "bill-pro", plan_id=pro.id)

    plan = await LimitsService(db_session).get_workspace_plan(ws.id)

    assert plan.plan_name == "Pro"
    assert plan.included_seats == 25
    assert plan.per_seat_price_monthly_cents == 2900


@pytest.mark.asyncio
async def test_workspace_override_beats_the_plan_row(db_session: AsyncSession):
    ws = await _ws(db_session, "bill-override")
    db_session.add(WorkspacePlanOverride(workspace_id=ws.id, included_seats=50))
    await db_session.commit()

    plan = await LimitsService(db_session).get_workspace_plan(ws.id)

    assert plan.included_seats == 50
    assert plan.has_overrides is True


@pytest.mark.asyncio
async def test_inactive_plan_falls_back_to_free(db_session: AsyncSession):
    dead = Plan(
        name="Retired",
        tier=PlanTier.PRO.value,
        included_seats=99,
        is_active=False,
    )
    db_session.add(dead)
    await db_session.flush()
    ws = await _ws(db_session, "bill-dead", plan_id=dead.id)

    plan = await LimitsService(db_session).get_workspace_plan(ws.id)

    assert plan.tier == PlanTier.FREE.value
    assert plan.included_seats == 10
