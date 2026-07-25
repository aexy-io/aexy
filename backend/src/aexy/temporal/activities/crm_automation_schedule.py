"""Temporal scheduled runner for CRM time-based automation triggers.

Runs every minute and fires CRM automations whose trigger is time-based:
  - schedule.daily   : {time: "HH:MM", timezone}
  - schedule.weekly  : {time: "HH:MM", timezone, weekday}   (weekday: 0=Mon..6=Sun)
  - date.approaching : {attributeSlug, offsetDays}  (fires when a record's date is
                       exactly offsetDays away)
  - date.passed      : {attributeSlug}              (fires once a record's date is past)

Schedule triggers fire the automation once with no record. Date triggers fire once per
matching record. Dedup is by automation run history for the current local day, so the
tick never double-fires. Minute granularity; a schedule that is already past for
today fires on the next tick rather than being skipped.
"""

import logging
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)

_SCHEDULE_TRIGGERS = ("schedule.daily", "schedule.weekly")
_DATE_TRIGGERS = ("date.approaching", "date.passed")


@dataclass
class DispatchCRMSchedulesInput:
    pass


def _tz(name: str | None) -> ZoneInfo:
    if not name:
        return ZoneInfo("UTC")
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _config_time(cfg: dict) -> tuple[int, int] | None:
    """Parse the configured 'HH:MM' (or 'HH') into (hour, minute), or None."""
    raw = cfg.get("time")
    if raw is None:
        return None
    parts = str(raw).split(":")
    try:
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
    except (ValueError, IndexError):
        return None
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    return hour, minute


def _parse_date(value: Any) -> date | None:
    """Parse a record's stored date value (ISO string) into a date, or None."""
    if not value or not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


async def _ran_since(db, automation_id: str, record_id: str | None, since_utc: datetime) -> bool:
    """True if this automation already ran for this record since ``since_utc``."""
    from sqlalchemy import select, func
    from aexy.models.crm import CRMAutomationRun

    stmt = select(func.count(CRMAutomationRun.id)).where(
        CRMAutomationRun.automation_id == automation_id,
        CRMAutomationRun.created_at >= since_utc,
    )
    if record_id is None:
        stmt = stmt.where(CRMAutomationRun.record_id.is_(None))
    else:
        stmt = stmt.where(CRMAutomationRun.record_id == record_id)
    return ((await db.execute(stmt)).scalar() or 0) > 0


async def _start_of_local_day_utc(tz: ZoneInfo, now_utc: datetime) -> datetime:
    """UTC instant of midnight-today in the given timezone."""
    local = now_utc.astimezone(tz)
    local_midnight = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return local_midnight.astimezone(timezone.utc)


def _occurrence_start_utc(
    tz: ZoneInfo, now_utc: datetime, at: tuple[int, int]
) -> datetime:
    """UTC instant of today's configured time — the start of this occurrence.

    Deduping from this rather than from midnight means each scheduled time is
    its own occurrence: the per-minute tick still can't double-fire, but moving
    a schedule to a new time makes it due again straight away instead of being
    silently suppressed until tomorrow.
    """
    local = now_utc.astimezone(tz)
    occurrence = local.replace(hour=at[0], minute=at[1], second=0, microsecond=0)
    return occurrence.astimezone(timezone.utc)


@activity.defn
async def dispatch_crm_schedules(input: DispatchCRMSchedulesInput) -> dict[str, Any]:
    """Fire due CRM schedule/date automations. Runs every minute."""
    logger.info("Running dispatch_crm_schedules")

    from sqlalchemy import select
    from aexy.models.crm import CRMAutomation, CRMRecord
    from aexy.services.automation_service import AutomationService

    now_utc = datetime.now(timezone.utc)
    total = 0

    async with async_session_maker() as db:
        from aexy.temporal.activities.compliance_automation import _get_active_workspace_ids
        workspace_ids = await _get_active_workspace_ids(db)

        for ws_id in workspace_ids:
            autos = (await db.execute(
                select(CRMAutomation).where(
                    CRMAutomation.workspace_id == ws_id,
                    CRMAutomation.module == "crm",
                    CRMAutomation.is_active.is_(True),
                    CRMAutomation.trigger_type.in_(_SCHEDULE_TRIGGERS + _DATE_TRIGGERS),
                )
            )).scalars().all()

            if not autos:
                continue

            svc = AutomationService(db)

            for auto in autos:
                cfg = auto.trigger_config or {}
                tz = _tz(cfg.get("timezone"))
                now_local = now_utc.astimezone(tz)
                since_utc = await _start_of_local_day_utc(tz, now_utc)

                try:
                    # --- Schedule triggers: fire once, no record ---
                    if auto.trigger_type in _SCHEDULE_TRIGGERS:
                        at = _config_time(cfg)
                        if at is None:
                            continue
                        # Due-or-overdue for today rather than an exact match, so
                        # a late or skipped tick still fires; the run-history
                        # check below is what stops it firing twice.
                        if (now_local.hour, now_local.minute) < at:
                            continue
                        if auto.trigger_type == "schedule.weekly":
                            weekday = cfg.get("weekday", 0)
                            try:
                                if now_local.weekday() != int(weekday):
                                    continue
                            except (TypeError, ValueError):
                                continue
                        # Dedup from this occurrence's own time, not midnight.
                        if await _ran_since(
                            db, auto.id, None, _occurrence_start_utc(tz, now_utc, at)
                        ):
                            continue
                        await svc.trigger_automation(
                            automation_id=auto.id,
                            record_id=None,
                            trigger_data={
                                "trigger_type": auto.trigger_type,
                                "scheduled": True,
                                "fired_at": now_utc.isoformat(),
                            },
                        )
                        total += 1
                        continue

                    # --- Date triggers: fire per matching record ---
                    slug = cfg.get("attributeSlug") or cfg.get("attribute_slug")
                    if not slug or not auto.object_id:
                        continue
                    offset = cfg.get("offsetDays", cfg.get("offset_days", 0))
                    try:
                        offset = int(offset)
                    except (TypeError, ValueError):
                        offset = 0

                    today_local = now_local.date()
                    records = (await db.execute(
                        select(CRMRecord).where(
                            CRMRecord.workspace_id == ws_id,
                            CRMRecord.object_id == auto.object_id,
                            CRMRecord.is_archived.is_(False),
                        )
                    )).scalars().all()

                    for rec in records:
                        d = _parse_date((rec.values or {}).get(slug))
                        if d is None:
                            continue
                        days_until = (d - today_local).days
                        due = (
                            days_until == offset
                            if auto.trigger_type == "date.approaching"
                            else days_until < 0
                        )
                        if not due:
                            continue
                        if await _ran_since(db, auto.id, rec.id, since_utc):
                            continue
                        await svc.trigger_automation(
                            automation_id=auto.id,
                            record_id=rec.id,
                            trigger_data={
                                "trigger_type": auto.trigger_type,
                                "scheduled": True,
                                "attribute_slug": slug,
                                "date_value": str((rec.values or {}).get(slug)),
                                "days_until": days_until,
                                "fired_at": now_utc.isoformat(),
                            },
                        )
                        total += 1
                except Exception:
                    logger.exception("Failed dispatching CRM schedule automation %s", auto.id)

            await db.commit()

    logger.info("dispatch_crm_schedules fired %s automation(s)", total)
    return {"fired": total}
