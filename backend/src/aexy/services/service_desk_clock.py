"""The Service Desk breach clock: working hours in the workspace's timezone.

A desk's turnaround target is stated in business days, and a business operates
in a timezone. Two things follow, and both are needed for the number to mean
anything:

* The clock only runs during **working hours** on a working day. A ticket that
  lands at 18:00 has not consumed a day's allowance by 09:30 the next morning,
  and nothing accrues overnight, at the weekend, or on a holiday.
* A "2 business day" target is therefore ``2 × WORKING_DAY_SECONDS`` of working
  time — 18 hours on a 09:30–18:30 day, not 48 hours of wall clock. ``to_days``
  divides by the working day, so a figure of ``1.0`` means one full working day
  of attention was available and went by.

Day boundaries and the working window resolve in the **workspace's own
timezone**, because whether an instant falls inside Tuesday's shift depends on
the timezone you ask in. Getting that wrong is not a rounding difference — it is
a different answer.

The window, the timezone and both breach thresholds are per workspace
(``Workspace.settings["service_desk"]``) and fall back to the defaults below.
Everything breach-related lives here so the threshold cannot drift: it was
previously written as a bare ``> 2`` in the ticket service, again in the digest
service, and a third time in the digest email copy.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Default timezone, and the value existing deployments were hardcoded to. The
# timezone is now per workspace: a desk in another country would otherwise have
# had its "2 business days" measured against Indian day boundaries, which is a
# different answer, not a rounding difference.
DEFAULT_TIMEZONE = "Asia/Kolkata"
IST = ZoneInfo(DEFAULT_TIMEZONE)

# Default working window. Override per workspace via settings.
DEFAULT_WORK_START = time(9, 30)
DEFAULT_WORK_END = time(18, 30)

# Default thresholds for the CURRENT STAGE age, in working days. Also per
# workspace — a 2-business-day target is one company's SLA, not everyone's.
BREACH_RED_DAYS = 2.0
BREACH_AMBER_DAYS = 1.0

# Local hours at which the open-ticket digest goes out. Per workspace, in its own
# `timezone`: this was a single deployment-wide cron pinned to Asia/Kolkata, so a
# desk in another country was paged in the middle of its night.
DEFAULT_DIGEST_HOURS = (9, 13, 17)


def _aware(dt: datetime) -> datetime:
    """Treat naive datetimes (SQLite) as UTC so arithmetic is safe."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _parse_hhmm(value: object, fallback: time) -> time:
    """Lenient on purpose: a malformed setting must not break the dashboard."""
    if isinstance(value, str):
        try:
            hh, mm = value.split(":")[:2]
            return time(int(hh), int(mm))
        except (ValueError, TypeError):
            pass
    return fallback


def _parse_zone(value: object) -> ZoneInfo:
    """Lenient like ``_parse_hhmm``: a bad tz must not break the dashboard."""
    if isinstance(value, str) and value.strip():
        try:
            return ZoneInfo(value.strip())
        except Exception:  # noqa: BLE001 — unknown/absent tzdata key
            pass
    return IST


def _parse_threshold(value: object, fallback: float) -> float:
    if isinstance(value, (int, float)) and value > 0:
        return float(value)
    return fallback


@dataclass(frozen=True)
class Clock:
    """A workspace's working calendar: the shift, plus the days it doesn't run."""

    work_start: time = DEFAULT_WORK_START
    work_end: time = DEFAULT_WORK_END
    holidays: frozenset[date] = field(default_factory=frozenset)
    # Day boundaries and the working window resolve here. Whether an instant
    # falls inside Tuesday's shift depends on the timezone you ask in.
    tz: ZoneInfo = IST
    breach_red_days: float = BREACH_RED_DAYS
    breach_amber_days: float = BREACH_AMBER_DAYS

    @property
    def working_day_seconds(self) -> float:
        start = self.work_start.hour * 3600 + self.work_start.minute * 60
        end = self.work_end.hour * 3600 + self.work_end.minute * 60
        # A nonsensical window would make every ticket instantly breach (or never
        # breach); fall back to a 9h day rather than divide by zero.
        return float(end - start) if end > start else 9 * 3600.0

    def is_working_day(self, day: date) -> bool:
        return day.weekday() < 5 and day not in self.holidays

    def seconds_between(self, start: datetime, end: datetime) -> int:
        """Working seconds between two instants — the SLA clock."""
        if end <= start:
            return 0
        begin = _aware(start).astimezone(self.tz)
        finish = _aware(end).astimezone(self.tz)

        total = 0.0
        day = begin.date()
        last = finish.date()
        # One iteration per calendar day. Deliberately not short-circuited past
        # the breach threshold: the figure is rendered to Ops and to requesters
        # ("3.0 working days in stage"), so capping it would report a number that
        # is simply wrong for the oldest tickets — the ones people most want the
        # truth about. A year-old segment is ~365 cheap comparisons.
        while day <= last:
            if self.is_working_day(day):
                shift_open = datetime.combine(day, self.work_start, tzinfo=self.tz)
                shift_close = datetime.combine(day, self.work_end, tzinfo=self.tz)
                lo = max(begin, shift_open)
                hi = min(finish, shift_close)
                if hi > lo:
                    total += (hi - lo).total_seconds()
            day += timedelta(days=1)
        return int(total)

    def to_days(self, working_seconds: int) -> float:
        """Working seconds as working days — 1.0 means one full shift went by."""
        return round(working_seconds / self.working_day_seconds, 2)

    def breach_level(self, stage_working_seconds: int) -> str:
        days = stage_working_seconds / self.working_day_seconds
        if days > self.breach_red_days:
            return "red"
        if days >= self.breach_amber_days:
            return "amber"
        return "green"

    def is_breaching(self, stage_working_seconds: int) -> bool:
        return stage_working_seconds / self.working_day_seconds > self.breach_red_days


async def load_clock(db: AsyncSession, workspace_id: str) -> Clock:
    """Build the workspace's clock: its working window and its holidays.

    Holidays reuse the Leave module's ``holidays`` table (whose own docstring
    says it is for business-day calculations) rather than a hardcoded calendar.
    Optional holidays are excluded because they are not days off for everyone,
    and team-scoped ones are excluded because an SLA that changes depending on
    which team you ask about is not an SLA.
    """
    from aexy.models.leave import Holiday
    from aexy.models.workspace import Workspace

    rows = (
        await db.execute(
            select(Holiday.date, Holiday.is_optional, Holiday.applicable_team_ids).where(
                Holiday.workspace_id == workspace_id
            )
        )
    ).all()
    holidays = frozenset(
        day for day, is_optional, team_ids in rows if not is_optional and not (team_ids or [])
    )

    ws = await db.get(Workspace, workspace_id)
    sd = ((ws.settings or {}).get("service_desk") or {}) if ws else {}
    hours = sd.get("working_hours") or {}
    return Clock(
        work_start=_parse_hhmm(hours.get("start"), DEFAULT_WORK_START),
        work_end=_parse_hhmm(hours.get("end"), DEFAULT_WORK_END),
        holidays=holidays,
        tz=_parse_zone(sd.get("timezone")),
        breach_red_days=_parse_threshold(sd.get("breach_red_days"), BREACH_RED_DAYS),
        breach_amber_days=_parse_threshold(sd.get("breach_amber_days"), BREACH_AMBER_DAYS),
    )
