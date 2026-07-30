"""The breach clock: 2 business days of WORKING HOURS, IST (BRD §13 answer).

Fixed dates throughout — the whole point of these tests is that the answer must
not depend on which day the suite happens to run.

2026-07-01 is a Wednesday, 07-03 a Friday, 07-04/05 the weekend, 07-06 the
Monday. The default shift is 09:30–18:30 IST, so one working day is 9 hours and
the 2-business-day target is 18 working hours.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.leave import Holiday
from aexy.models.workspace import Workspace
from aexy.services.service_desk_clock import Clock, load_clock

IST = ZoneInfo("Asia/Kolkata")
HOUR = 3600
CLOCK = Clock()  # default 09:30–18:30, no holidays


def ist(y: int, m: int, d: int, hh: int = 0, mm: int = 0) -> datetime:
    return datetime(y, m, d, hh, mm, tzinfo=IST)


def test_one_working_day_is_the_shift_not_twenty_four_hours():
    assert CLOCK.working_day_seconds == 9 * HOUR
    assert CLOCK.to_days(9 * HOUR) == 1.0
    assert CLOCK.to_days(18 * HOUR) == 2.0


def test_time_inside_the_shift_is_just_elapsed():
    assert CLOCK.seconds_between(ist(2026, 7, 1, 10), ist(2026, 7, 1, 14)) == 4 * HOUR


def test_nothing_accrues_overnight():
    """18:00 to 09:00 next morning spends 30 minutes of Wednesday's shift."""
    assert CLOCK.seconds_between(ist(2026, 7, 1, 18), ist(2026, 7, 2, 9)) == 30 * 60


def test_nothing_accrues_outside_the_shift_at_all():
    assert CLOCK.seconds_between(ist(2026, 7, 1, 19), ist(2026, 7, 1, 23)) == 0
    assert CLOCK.seconds_between(ist(2026, 7, 2, 6), ist(2026, 7, 2, 9)) == 0


def test_a_full_day_caps_at_the_shift_length():
    """Midnight to midnight is 9 hours of work, not 24."""
    assert CLOCK.seconds_between(ist(2026, 7, 1), ist(2026, 7, 2)) == 9 * HOUR


def test_the_weekend_accrues_nothing():
    assert CLOCK.seconds_between(ist(2026, 7, 4), ist(2026, 7, 6)) == 0


def test_a_friday_evening_ticket_is_not_late_until_wednesday():
    """The case that motivated the change, now on working hours.

    Arriving at 17:30 on Friday leaves one hour of that day's shift. Two working
    days of allowance therefore does not run out until Wednesday morning.
    """
    entered = ist(2026, 7, 3, 17, 30)  # Friday, one hour of shift left

    # Monday close: 1h Friday + 9h Monday = 10h = 1.11 working days.
    monday = CLOCK.seconds_between(entered, ist(2026, 7, 6, 18, 30))
    assert monday == 10 * HOUR
    assert CLOCK.breach_level(monday) == "amber"
    assert not CLOCK.is_breaching(monday)

    # Tuesday close: + 9h = 19h > 18h, so breached during Tuesday.
    tuesday = CLOCK.seconds_between(entered, ist(2026, 7, 7, 18, 30))
    assert CLOCK.breach_level(tuesday) == "red"

    # The exact crossing: 18 working hours after 17:30 Friday is 17:30 Tuesday.
    assert CLOCK.to_days(CLOCK.seconds_between(entered, ist(2026, 7, 7, 17, 30))) == 2.0
    assert not CLOCK.is_breaching(CLOCK.seconds_between(entered, ist(2026, 7, 7, 17, 30)))
    assert CLOCK.is_breaching(CLOCK.seconds_between(entered, ist(2026, 7, 7, 17, 31)))

    # Wall clock would have called this four days by Tuesday evening.
    assert (ist(2026, 7, 7, 18, 30) - entered).total_seconds() / 86400 > 4


def test_exactly_two_working_days_is_the_target_not_past_it():
    entered = ist(2026, 7, 1, 9, 30)  # Wednesday, shift open
    two_days = CLOCK.seconds_between(entered, ist(2026, 7, 2, 18, 30))
    assert CLOCK.to_days(two_days) == 2.0
    assert CLOCK.breach_level(two_days) == "amber"
    assert not CLOCK.is_breaching(two_days)


def test_day_boundaries_are_ist_not_utc():
    """13:00 UTC is 18:30 IST — the shift has just closed."""
    assert datetime(2026, 7, 1, 13, 0, tzinfo=timezone.utc).astimezone(IST).time() == time(18, 30)
    after_close_utc = datetime(2026, 7, 1, 13, 0, tzinfo=timezone.utc)
    assert CLOCK.seconds_between(after_close_utc, after_close_utc + timedelta(hours=2)) == 0


def test_naive_datetimes_are_treated_as_utc():
    """SQLite hands back naive values; the clock must not crash or drift."""
    naive = datetime(2026, 7, 1, 5, 0)  # 10:30 IST
    assert CLOCK.seconds_between(naive, naive + timedelta(hours=2)) == 2 * HOUR


def test_a_holiday_is_skipped():
    clock = Clock(holidays=frozenset({date(2026, 7, 6)}))  # the Monday
    # Friday 17:30 → Tuesday 17:30 would be 2 working days without the holiday.
    seconds = clock.seconds_between(ist(2026, 7, 3, 17, 30), ist(2026, 7, 7, 17, 30))
    assert clock.to_days(seconds) == 1.0  # 1h Friday + 8h of Tuesday


def test_a_custom_shift_changes_what_a_day_means():
    clock = Clock(work_start=time(10, 0), work_end=time(19, 0))
    assert clock.seconds_between(ist(2026, 7, 1, 9), ist(2026, 7, 1, 11)) == HOUR  # 10:00–11:00
    assert clock.working_day_seconds == 9 * HOUR


def test_a_nonsensical_shift_falls_back_instead_of_dividing_by_zero():
    clock = Clock(work_start=time(18, 0), work_end=time(9, 0))
    assert clock.working_day_seconds == 9 * HOUR
    assert clock.to_days(0) == 0.0


def test_end_before_start_is_zero():
    assert CLOCK.seconds_between(ist(2026, 7, 7), ist(2026, 7, 3)) == 0


@pytest.mark.asyncio
async def test_load_clock_takes_only_mandatory_workspace_wide_holidays(db_session: AsyncSession):
    """An optional or team-scoped holiday must not move a workspace-wide SLA."""
    owner = Developer(email=f"o-{uuid4().hex[:6]}@bimaplan.co", name="Owner")
    db_session.add(owner)
    await db_session.flush()
    ws = Workspace(name="Clock", slug=f"clock-{uuid4().hex[:6]}", owner_id=owner.id)
    other = Workspace(name="Other", slug=f"other-{uuid4().hex[:6]}", owner_id=owner.id)
    db_session.add_all([ws, other])
    await db_session.flush()

    db_session.add_all([
        Holiday(id=str(uuid4()), workspace_id=ws.id, name="Independence Day",
                date=date(2026, 8, 15), is_optional=False, applicable_team_ids=[]),
        Holiday(id=str(uuid4()), workspace_id=ws.id, name="Optional festival",
                date=date(2026, 9, 1), is_optional=True, applicable_team_ids=[]),
        Holiday(id=str(uuid4()), workspace_id=ws.id, name="Sales offsite",
                date=date(2026, 9, 2), is_optional=False, applicable_team_ids=["team-1"]),
        Holiday(id=str(uuid4()), workspace_id=other.id, name="Elsewhere",
                date=date(2026, 9, 3), is_optional=False, applicable_team_ids=[]),
    ])
    await db_session.commit()

    clock = await load_clock(db_session, ws.id)
    assert clock.holidays == frozenset({date(2026, 8, 15)})
    # No override set, so the default shift applies.
    assert (clock.work_start, clock.work_end) == (time(9, 30), time(18, 30))


@pytest.mark.asyncio
async def test_load_clock_honours_a_per_workspace_shift(db_session: AsyncSession):
    owner = Developer(email=f"o-{uuid4().hex[:6]}@bimaplan.co", name="Owner")
    db_session.add(owner)
    await db_session.flush()
    ws = Workspace(
        name="Shift", slug=f"shift-{uuid4().hex[:6]}", owner_id=owner.id,
        settings={"service_desk": {"working_hours": {"start": "10:00", "end": "19:00"}}},
    )
    db_session.add(ws)
    await db_session.commit()

    clock = await load_clock(db_session, ws.id)
    assert (clock.work_start, clock.work_end) == (time(10, 0), time(19, 0))


@pytest.mark.asyncio
async def test_load_clock_survives_a_malformed_shift_setting(db_session: AsyncSession):
    """A bad setting must not take the dashboard down with it."""
    owner = Developer(email=f"o-{uuid4().hex[:6]}@bimaplan.co", name="Owner")
    db_session.add(owner)
    await db_session.flush()
    ws = Workspace(
        name="Bad", slug=f"bad-{uuid4().hex[:6]}", owner_id=owner.id,
        settings={"service_desk": {"working_hours": {"start": "not-a-time", "end": None}}},
    )
    db_session.add(ws)
    await db_session.commit()

    clock = await load_clock(db_session, ws.id)
    assert (clock.work_start, clock.work_end) == (time(9, 30), time(18, 30))
